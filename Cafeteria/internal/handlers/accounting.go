package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NosedimetuXD/cafeteria/internal/events"
	"github.com/NosedimetuXD/cafeteria/internal/models"
)

type AccountingHandler struct {
	DB  *pgxpool.Pool
	Hub *events.Hub
}

func NewAccountingHandler(db *pgxpool.Pool, hub *events.Hub) *AccountingHandler {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _ = db.Exec(ctx, `CREATE TABLE IF NOT EXISTS incomes (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		description TEXT NOT NULL,
		amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
		category VARCHAR(50) NOT NULL DEFAULT 'otros',
		payment_method VARCHAR(100) NOT NULL DEFAULT 'efectivo',
		registered_by UUID REFERENCES users(id) ON DELETE SET NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`)
	return &AccountingHandler{DB: db, Hub: hub}
}

// GET /accounting/summary?period=today|week|month|all&start_date=...&end_date=...&year=...&month_num=...
func (h *AccountingHandler) GetSummary(w http.ResponseWriter, r *http.Request) {
	filter, ok := parseTimeFilter(w, r)
	if !ok {
		return
	}
	timeCondition := filter.Condition("")
	timeCondSales := filter.Condition("s.")
	timeCondComandas := filter.Condition("c.")

	summary := models.AccountingSummary{
		IncomeByPaymentMethod: make(map[string]float64),
		ExpensesByCategory:    make(map[string]float64),
	}

	// Excluir ventas canceladas de todos los cálculos de ingresos
	completedCond := timeCondition + " AND COALESCE(status, 'completada') != 'cancelada'"
	completedCondSales := timeCondSales + " AND COALESCE(s.status, 'completada') != 'cancelada'"

	// 1. Ingresos totales de ventas
	var cashIncome, transferIncome float64
	salesQuery := "SELECT COALESCE(SUM(total), 0), COUNT(id), COALESCE(SUM(cash_amount), 0), COALESCE(SUM(transfer_amount), 0) FROM sales WHERE " + completedCond
	err := h.DB.QueryRow(r.Context(), salesQuery).Scan(&summary.TotalIncome, &summary.SalesCount, &cashIncome, &transferIncome)
	if err != nil {
		serverError(w, "error calculando ingresos", err)
		return
	}
	summary.IncomeByPaymentMethod["efectivo"] = cashIncome
	summary.IncomeByPaymentMethod["transferencia"] = transferIncome

	// 1b. Ingresos manuales registrados en contabilidad
	incomesQuery := "SELECT COALESCE(SUM(amount), 0), COUNT(id) FROM incomes WHERE " + timeCondition
	if err := h.DB.QueryRow(r.Context(), incomesQuery).Scan(&summary.ManualIncome, &summary.ManualIncomeCount); err != nil {
		log.Printf("error calculando ingresos manuales: %v", err)
	}
	summary.TotalIncome += summary.ManualIncome

	// 2. Gastos totales
	expensesQuery := "SELECT COALESCE(SUM(amount), 0), COUNT(id) FROM expenses WHERE " + timeCondition
	err = h.DB.QueryRow(r.Context(), expensesQuery).Scan(&summary.TotalExpenses, &summary.ExpensesCount)
	if err != nil {
		serverError(w, "error calculando gastos", err)
		return
	}

	// 3. Gastos por categoría
	catQuery := "SELECT category, COALESCE(SUM(amount), 0) FROM expenses WHERE " + timeCondition + " GROUP BY category"
	rows, err := h.DB.Query(r.Context(), catQuery)
	if err == nil {
		for rows.Next() {
			var cat string
			var amount float64
			if err := rows.Scan(&cat, &amount); err == nil {
				summary.ExpensesByCategory[cat] = amount
			}
		}
		rows.Close()
	}

	summary.NetBalance = summary.TotalIncome - summary.TotalExpenses

	// 4. Estadísticas Ejecutivas (exclusivas para dueño)
	if userRoleFromContext(r.Context()) == models.RoleOwner {
		mStats := &models.MonthlyStats{
			TopCustomers: []models.CustomerStat{},
			TopProducts:  []models.TopProductStat{},
		}

		// Ventas del período
		_ = h.DB.QueryRow(r.Context(),
			"SELECT COALESCE(SUM(total), 0) FROM sales WHERE "+completedCond).Scan(&mStats.MonthlyIncome)
		mStats.MonthlyIncome += summary.ManualIncome

		// Gastos del período
		_ = h.DB.QueryRow(r.Context(),
			"SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE "+timeCondition).Scan(&mStats.MonthlyExpenses)

		mStats.NetProfit = mStats.MonthlyIncome - mStats.MonthlyExpenses

		// Tiempo Promedio de Salida de Comandas en minutos
		_ = h.DB.QueryRow(r.Context(),
			"SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(c.ready_at, c.updated_at) - c.created_at))/60), 0) FROM comandas c WHERE c.status IN ('listo', 'entregado') AND "+timeCondComandas).Scan(&mStats.AvgPrepTimeMinutes)

		// Mejor vendedor del período
		var topSeller models.TopSellerStat
		errSeller := h.DB.QueryRow(r.Context(),
			`SELECT u.username, u.role, COALESCE(SUM(s.total), 0) as total_amount, COUNT(s.id) as sales_count
			 FROM sales s
			 JOIN users u ON s.sold_by = u.id
			 WHERE `+completedCondSales+`
			 GROUP BY u.id, u.username, u.role
			 ORDER BY total_amount DESC
			 LIMIT 1`).Scan(&topSeller.Username, &topSeller.Role, &topSeller.TotalAmount, &topSeller.SalesCount)
		if errSeller == nil {
			mStats.TopSeller = &topSeller
		} else {
			log.Printf("error mejor vendedor query: %v", errSeller)
		}

		// Top 10 Productos más vendidos del período
		prodRows, errProdList := h.DB.Query(r.Context(),
			`SELECT COALESCE(NULLIF(si.product_name, ''), p.name, 'Producto Eliminado') as prod_name,
			        COALESCE(SUM(si.quantity), 0) as total_qty, 
			        COALESCE(SUM(si.quantity * si.unit_price), 0) as total_amount
			 FROM sale_items si
			 JOIN sales s ON si.sale_id = s.id
			 LEFT JOIN products p ON si.product_id = p.id
			 WHERE `+completedCondSales+`
			 GROUP BY COALESCE(NULLIF(si.product_name, ''), p.name, 'Producto Eliminado')
			 ORDER BY total_qty DESC
			 LIMIT 10`)
		if errProdList == nil {
			for prodRows.Next() {
				var tp models.TopProductStat
				if err := prodRows.Scan(&tp.ProductName, &tp.TotalQty, &tp.TotalAmount); err == nil {
					mStats.TopProducts = append(mStats.TopProducts, tp)
				}
			}
			prodRows.Close()
		} else {
			log.Printf("error top productos query: %v", errProdList)
		}
		if len(mStats.TopProducts) > 0 {
			mStats.TopProduct = &mStats.TopProducts[0]
		}

		// Top 10 Clientes del período
		custRows, errCust := h.DB.Query(r.Context(),
			`SELECT customer_name, COALESCE(SUM(total), 0) as total_spent, COUNT(id) as orders_count
			 FROM sales
			 WHERE `+completedCond+` AND TRIM(customer_name) != '' AND LOWER(customer_name) != 'cliente general'
			 GROUP BY customer_name
			 ORDER BY total_spent DESC
			 LIMIT 10`)
		if errCust == nil {
			for custRows.Next() {
				var cs models.CustomerStat
				if err := custRows.Scan(&cs.CustomerName, &cs.TotalSpent, &cs.OrdersCount); err == nil {
					mStats.TopCustomers = append(mStats.TopCustomers, cs)
				}
			}
			custRows.Close()
		}

		summary.MonthlyStats = mStats
	}

	writeJSON(w, http.StatusOK, summary)
}

// GET /incomes?period=today|week|month|all
func (h *AccountingHandler) ListIncomes(w http.ResponseWriter, r *http.Request) {
	timeCondition := recentPeriodWhere("i.", r.URL.Query().Get("period"))

	query := fmt.Sprintf(`SELECT i.id, i.description, i.amount, i.category, i.payment_method, i.registered_by, 
		        COALESCE(u.username, ''), i.created_at 
		 FROM incomes i
		 LEFT JOIN users u ON i.registered_by = u.id
		 %s
		 ORDER BY i.created_at DESC`, timeCondition)

	rows, err := h.DB.Query(r.Context(), query)
	if err != nil {
		serverError(w, "error consultando ingresos manuales", err)
		return
	}
	defer rows.Close()

	var incomes []models.Income
	for rows.Next() {
		var inc models.Income
		if err := rows.Scan(&inc.ID, &inc.Description, &inc.Amount, &inc.Category, &inc.PaymentMethod,
			&inc.RegisteredBy, &inc.RegistererName, &inc.CreatedAt); err != nil {
			serverError(w, "error leyendo ingresos manuales", err)
			return
		}
		incomes = append(incomes, inc)
	}

	writeJSON(w, http.StatusOK, incomes)
}

// POST /incomes — registro manual de un ingreso extra (no proveniente del POS)
type createIncomeRequest struct {
	Description   string  `json:"description"`
	Amount        float64 `json:"amount"`
	Category      string  `json:"category"`
	PaymentMethod string  `json:"payment_method"`
}

func (h *AccountingHandler) CreateIncome(w http.ResponseWriter, r *http.Request) {
	var req createIncomeRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	desc := strings.TrimSpace(req.Description)
	if desc == "" || req.Amount <= 0 {
		http.Error(w, "descripción y monto válido son requeridos", http.StatusBadRequest)
		return
	}

	category := strings.ToLower(strings.TrimSpace(req.Category))
	if category == "" {
		category = "otros"
	}

	paymentMethod := strings.TrimSpace(req.PaymentMethod)
	if paymentMethod == "" {
		paymentMethod = "efectivo"
	}

	ctx := r.Context()
	registeredBy := userIDFromContext(ctx)

	var incID uuid.UUID
	var createdAt time.Time
	err := h.DB.QueryRow(ctx,
		`INSERT INTO incomes (description, amount, category, payment_method, registered_by)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
		desc, req.Amount, category, paymentMethod, registeredBy,
	).Scan(&incID, &createdAt)
	if err != nil {
		serverError(w, "error registrando ingreso", err)
		return
	}

	h.Hub.Publish("income_created", map[string]interface{}{
		"id":          incID,
		"description": desc,
		"amount":      req.Amount,
		"category":    category,
	})

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"id":         incID,
		"created_at": createdAt,
	})
}

// GET /expenses?period=today|week|month|all
func (h *AccountingHandler) ListExpenses(w http.ResponseWriter, r *http.Request) {
	timeCondition := recentPeriodWhere("e.", r.URL.Query().Get("period"))

	query := fmt.Sprintf(`SELECT e.id, e.description, e.amount, e.category, e.payment_method, e.registered_by, 
		        COALESCE(u.username, ''), e.ingredient_id, COALESCE(i.name, ''), e.quantity_added, e.created_at 
		 FROM expenses e
		 LEFT JOIN users u ON e.registered_by = u.id
		 LEFT JOIN ingredients i ON e.ingredient_id = i.id
		 %s
		 ORDER BY e.created_at DESC`, timeCondition)

	rows, err := h.DB.Query(r.Context(), query)
	if err != nil {
		serverError(w, "error consultando gastos", err)
		return
	}
	defer rows.Close()

	var expenses []models.Expense
	for rows.Next() {
		var e models.Expense
		if err := rows.Scan(&e.ID, &e.Description, &e.Amount, &e.Category, &e.PaymentMethod,
			&e.RegisteredBy, &e.RegistererName, &e.IngredientID, &e.IngredientName, &e.QuantityAdded, &e.CreatedAt); err != nil {
			serverError(w, "error leyendo gastos", err)
			return
		}
		expenses = append(expenses, e)
	}

	writeJSON(w, http.StatusOK, expenses)
}

// POST /expenses — si se especifica un ingredient_id y quantity_added > 0, reabastece el inventario
type createExpenseRequest struct {
	Description   string     `json:"description"`
	Amount        float64    `json:"amount"`
	Category      string     `json:"category"`
	PaymentMethod string     `json:"payment_method"`
	IngredientID  *uuid.UUID `json:"ingredient_id,omitempty"`
	QuantityAdded float64    `json:"quantity_added,omitempty"`
}

func (h *AccountingHandler) CreateExpense(w http.ResponseWriter, r *http.Request) {
	var req createExpenseRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	desc := strings.TrimSpace(req.Description)
	if desc == "" || req.Amount <= 0 {
		http.Error(w, "descripción y monto válido son requeridos", http.StatusBadRequest)
		return
	}

	category := strings.ToLower(strings.TrimSpace(req.Category))
	if category == "" {
		category = "otros"
	}

	paymentMethod := strings.ToLower(strings.TrimSpace(req.PaymentMethod))
	if paymentMethod == "" {
		paymentMethod = "efectivo"
	}

	ctx := r.Context()
	registeredBy := userIDFromContext(ctx)

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		serverError(w, "error interno", err)
		return
	}
	defer tx.Rollback(ctx)

	// 1. Si incluye insumo, reabastecer inventario
	if req.IngredientID != nil && req.QuantityAdded > 0 {
		tag, err := tx.Exec(ctx,
			`UPDATE ingredients SET quantity = quantity + $1, updated_at = now() WHERE id = $2`,
			req.QuantityAdded, *req.IngredientID)
		if err != nil {
			serverError(w, "error reabasteciendo insumo", err)
			return
		}
		if tag.RowsAffected() == 0 {
			http.Error(w, "el insumo especificado no existe", http.StatusBadRequest)
			return
		}
	}

	// 2. Registrar el gasto
	var expID uuid.UUID
	var createdAt time.Time
	err = tx.QueryRow(ctx,
		`INSERT INTO expenses (description, amount, category, payment_method, registered_by, ingredient_id, quantity_added)
		 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
		desc, req.Amount, category, paymentMethod, registeredBy, req.IngredientID, req.QuantityAdded,
	).Scan(&expID, &createdAt)
	if err != nil {
		serverError(w, "error registrando gasto", err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		serverError(w, "error interno", err)
		return
	}

	h.Hub.Publish("expense_created", map[string]interface{}{
		"id":          expID,
		"description": desc,
		"amount":      req.Amount,
		"category":    category,
	})

	if req.IngredientID != nil && req.QuantityAdded > 0 {
		h.Hub.Publish("inventory_updated", map[string]interface{}{
			"ingredient_id":  *req.IngredientID,
			"quantity_added": req.QuantityAdded,
		})
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"id":         expID,
		"created_at": createdAt,
	})
}
