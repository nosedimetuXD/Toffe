package handlers

import (
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
	return &AccountingHandler{DB: db, Hub: hub}
}

// GET /accounting/summary?period=today|week|month|all&start_date=...&end_date=...&year=...&month_num=...
func (h *AccountingHandler) GetSummary(w http.ResponseWriter, r *http.Request) {
	filter := parseTimeFilter(r)
	timeCondition := filter.Condition("")
	timeCondSales := filter.Condition("s.")
	timeCondComandas := filter.Condition("c.")

	summary := models.AccountingSummary{
		IncomeByPaymentMethod: make(map[string]float64),
		ExpensesByCategory:    make(map[string]float64),
	}

	// 1. Ingresos totales de ventas
	var cashIncome, transferIncome float64
	salesQuery := "SELECT COALESCE(SUM(total), 0), COUNT(id), COALESCE(SUM(cash_amount), 0), COALESCE(SUM(transfer_amount), 0) FROM sales WHERE " + timeCondition
	err := h.DB.QueryRow(r.Context(), salesQuery).Scan(&summary.TotalIncome, &summary.SalesCount, &cashIncome, &transferIncome)
	if err != nil {
		serverError(w, "error calculando ingresos", err)
		return
	}
	summary.IncomeByPaymentMethod["efectivo"] = cashIncome
	summary.IncomeByPaymentMethod["transferencia"] = transferIncome

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
			TopBanks:     []models.TopBankStat{},
		}

		// Ventas del período
		_ = h.DB.QueryRow(r.Context(),
			"SELECT COALESCE(SUM(total), 0) FROM sales WHERE "+timeCondition).Scan(&mStats.MonthlyIncome)

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
			 WHERE `+timeCondSales+`
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
			 WHERE `+timeCondSales+`
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
			 WHERE `+timeCondition+` AND TRIM(customer_name) != '' AND LOWER(customer_name) != 'cliente general'
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

		// Top 5 Bancos del período
		bankRows, errBank := h.DB.Query(r.Context(),
			`SELECT 
				COALESCE(NULLIF(TRIM(bank_details), ''), 'Transferencia General') as bank_name,
				COUNT(id) as count,
				COALESCE(SUM(CASE WHEN transfer_amount > 0 THEN transfer_amount ELSE total END), 0) as total_amount
			 FROM sales
			 WHERE `+timeCondition+` 
			   AND (payment_method IN ('transferencia', 'mixto', 'multibanco') OR transfer_amount > 0)
			 GROUP BY bank_name
			 ORDER BY count DESC, total_amount DESC
			 LIMIT 5`)
		if errBank == nil {
			for bankRows.Next() {
				var tb models.TopBankStat
				if err := bankRows.Scan(&tb.BankName, &tb.Count, &tb.TotalAmount); err == nil {
					mStats.TopBanks = append(mStats.TopBanks, tb)
				}
			}
			bankRows.Close()
		}

		summary.MonthlyStats = mStats
	}

	writeJSON(w, http.StatusOK, summary)
}

// GET /expenses?period=today|week|month|all
func (h *AccountingHandler) ListExpenses(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	var timeCondition string

	switch period {
	case "today":
		timeCondition = "WHERE e.created_at >= ((now() AT TIME ZONE 'America/Bogota')::date AT TIME ZONE 'America/Bogota')"
	case "week":
		timeCondition = "WHERE e.created_at >= (now() - INTERVAL '7 days')"
	case "month":
		timeCondition = "WHERE e.created_at >= (now() - INTERVAL '30 days')"
	default:
		timeCondition = ""
	}

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
