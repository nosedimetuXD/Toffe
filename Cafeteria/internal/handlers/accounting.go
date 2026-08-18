package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NosedimetuXD/cafeteria/internal/events"
	custommw "github.com/NosedimetuXD/cafeteria/internal/middleware"
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
	period := r.URL.Query().Get("period")
	startDate := strings.TrimSpace(r.URL.Query().Get("start_date"))
	endDate := strings.TrimSpace(r.URL.Query().Get("end_date"))
	yearParam := strings.TrimSpace(r.URL.Query().Get("year"))
	monthParam := strings.TrimSpace(r.URL.Query().Get("month_num"))

	var timeCondition string
	var timeCondSales string
	var timeCondComandas string

	if startDate != "" && endDate != "" {
		start, end, err := parseDateRange(startDate, endDate)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		timeCondition = fmt.Sprintf("created_at >= '%s 00:00:00' AND created_at <= '%s 23:59:59'", start, end)
		timeCondSales = fmt.Sprintf("s.created_at >= '%s 00:00:00' AND s.created_at <= '%s 23:59:59'", start, end)
		timeCondComandas = fmt.Sprintf("c.created_at >= '%s 00:00:00' AND c.created_at <= '%s 23:59:59'", start, end)
	} else if yearParam != "" && monthParam != "" {
		y, m, err := parseYearMonth(yearParam, monthParam)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		timeCondition = fmt.Sprintf("EXTRACT(YEAR FROM created_at) = %d AND EXTRACT(MONTH FROM created_at) = %d", y, m)
		timeCondSales = fmt.Sprintf("EXTRACT(YEAR FROM s.created_at) = %d AND EXTRACT(MONTH FROM s.created_at) = %d", y, m)
		timeCondComandas = fmt.Sprintf("EXTRACT(YEAR FROM c.created_at) = %d AND EXTRACT(MONTH FROM c.created_at) = %d", y, m)
	}

	if timeCondition == "" {
		switch period {
		case "today":
			timeCondition = "(created_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date"
			timeCondSales = "(s.created_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date"
			timeCondComandas = "(c.created_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date"
		case "week":
			timeCondition = "created_at >= (now() - INTERVAL '7 days')"
			timeCondSales = "s.created_at >= (now() - INTERVAL '7 days')"
			timeCondComandas = "c.created_at >= (now() - INTERVAL '7 days')"
		case "month":
			timeCondition = "created_at >= date_trunc('month', now())"
			timeCondSales = "s.created_at >= date_trunc('month', now())"
			timeCondComandas = "c.created_at >= date_trunc('month', now())"
		case "prev_month":
			timeCondition = "created_at >= date_trunc('month', now() - INTERVAL '1 month') AND created_at < date_trunc('month', now())"
			timeCondSales = "s.created_at >= date_trunc('month', now() - INTERVAL '1 month') AND s.created_at < date_trunc('month', now())"
			timeCondComandas = "c.created_at >= date_trunc('month', now() - INTERVAL '1 month') AND c.created_at < date_trunc('month', now())"
		case "year":
			timeCondition = "created_at >= date_trunc('year', now())"
			timeCondSales = "s.created_at >= date_trunc('year', now())"
			timeCondComandas = "c.created_at >= date_trunc('year', now())"
		default: // "all"
			timeCondition = "1=1"
			timeCondSales = "1=1"
			timeCondComandas = "1=1"
		}
	}

	summary := models.AccountingSummary{
		IncomeByPaymentMethod: make(map[string]float64),
		ExpensesByCategory:    make(map[string]float64),
	}

	// 1. Ingresos totales de ventas
	var cashIncome, transferIncome float64
	salesQuery := "SELECT COALESCE(SUM(total), 0), COUNT(id), COALESCE(SUM(cash_amount), 0), COALESCE(SUM(transfer_amount), 0) FROM sales WHERE " + timeCondition
	err := h.DB.QueryRow(r.Context(), salesQuery).Scan(&summary.TotalIncome, &summary.SalesCount, &cashIncome, &transferIncome)
	if err != nil {
		log.Printf("error calculando ingresos: %v", err)
		http.Error(w, "error calculando ingresos", http.StatusInternalServerError)
		return
	}
	summary.IncomeByPaymentMethod["efectivo"] = cashIncome
	summary.IncomeByPaymentMethod["transferencia"] = transferIncome

	// 2. Gastos totales
	expensesQuery := "SELECT COALESCE(SUM(amount), 0), COUNT(id) FROM expenses WHERE " + timeCondition
	err = h.DB.QueryRow(r.Context(), expensesQuery).Scan(&summary.TotalExpenses, &summary.ExpensesCount)
	if err != nil {
		log.Printf("error calculando gastos: %v", err)
		http.Error(w, "error calculando gastos", http.StatusInternalServerError)
		return
	}

	// 3. Gastos por categoría
	catQuery := "SELECT category, COALESCE(SUM(amount), 0) FROM expenses WHERE " + timeCondition + " GROUP BY category"
	rows, err := h.DB.Query(r.Context(), catQuery)
	if err != nil {
		log.Printf("error calculando gastos por categoría: %v", err)
		http.Error(w, "error calculando gastos por categoría", http.StatusInternalServerError)
		return
	}
	catErr := func() error {
		defer rows.Close()
		for rows.Next() {
			var cat string
			var amount float64
			if err := rows.Scan(&cat, &amount); err != nil {
				return err
			}
			summary.ExpensesByCategory[cat] = amount
		}
		return rows.Err()
	}()
	if catErr != nil {
		log.Printf("error leyendo gastos por categoría: %v", catErr)
		http.Error(w, "error calculando gastos por categoría", http.StatusInternalServerError)
		return
	}

	summary.NetBalance = summary.TotalIncome - summary.TotalExpenses

	// 4. Estadísticas Ejecutivas (exclusivas para dueño)
	roleVal := r.Context().Value(custommw.ContextRole)
	var userRole models.UserRole
	if r, ok := roleVal.(models.UserRole); ok {
		userRole = r
	} else if rStr, ok := roleVal.(string); ok {
		userRole = models.UserRole(rStr)
	}

	if userRole == models.RoleOwner {
		mStats := &models.MonthlyStats{
			TopCustomers: []models.CustomerStat{},
			TopProducts:  []models.TopProductStat{},
			TopBanks:     []models.TopBankStat{},
		}

		// Ventas del período
		if err := h.DB.QueryRow(r.Context(),
			"SELECT COALESCE(SUM(total), 0) FROM sales WHERE "+timeCondition).Scan(&mStats.MonthlyIncome); err != nil {
			log.Printf("error calculando ingresos del período: %v", err)
			http.Error(w, "error calculando estadísticas", http.StatusInternalServerError)
			return
		}

		// Gastos del período
		if err := h.DB.QueryRow(r.Context(),
			"SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE "+timeCondition).Scan(&mStats.MonthlyExpenses); err != nil {
			log.Printf("error calculando gastos del período: %v", err)
			http.Error(w, "error calculando estadísticas", http.StatusInternalServerError)
			return
		}

		mStats.NetProfit = mStats.MonthlyIncome - mStats.MonthlyExpenses

		// Tiempo Promedio de Salida de Comandas en minutos
		if err := h.DB.QueryRow(r.Context(),
			"SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(c.ready_at, c.updated_at) - c.created_at))/60), 0) FROM comandas c WHERE c.status IN ('listo', 'entregado') AND "+timeCondComandas).Scan(&mStats.AvgPrepTimeMinutes); err != nil {
			log.Printf("error calculando el tiempo promedio de preparación: %v", err)
			http.Error(w, "error calculando estadísticas", http.StatusInternalServerError)
			return
		}

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
		switch {
		case errSeller == nil:
			mStats.TopSeller = &topSeller
		case errors.Is(errSeller, pgx.ErrNoRows):
			// sin ventas en el período, no hay mejor vendedor
		default:
			log.Printf("error consultando el mejor vendedor: %v", errSeller)
			http.Error(w, "error calculando estadísticas", http.StatusInternalServerError)
			return
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
		if errProdList != nil {
			log.Printf("error consultando los productos más vendidos: %v", errProdList)
			http.Error(w, "error calculando estadísticas", http.StatusInternalServerError)
			return
		}
		prodErr := func() error {
			defer prodRows.Close()
			for prodRows.Next() {
				var tp models.TopProductStat
				if err := prodRows.Scan(&tp.ProductName, &tp.TotalQty, &tp.TotalAmount); err != nil {
					return err
				}
				mStats.TopProducts = append(mStats.TopProducts, tp)
			}
			return prodRows.Err()
		}()
		if prodErr != nil {
			log.Printf("error leyendo los productos más vendidos: %v", prodErr)
			http.Error(w, "error calculando estadísticas", http.StatusInternalServerError)
			return
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
		if errCust != nil {
			log.Printf("error consultando los mejores clientes: %v", errCust)
			http.Error(w, "error calculando estadísticas", http.StatusInternalServerError)
			return
		}
		custErr := func() error {
			defer custRows.Close()
			for custRows.Next() {
				var cs models.CustomerStat
				if err := custRows.Scan(&cs.CustomerName, &cs.TotalSpent, &cs.OrdersCount); err != nil {
					return err
				}
				mStats.TopCustomers = append(mStats.TopCustomers, cs)
			}
			return custRows.Err()
		}()
		if custErr != nil {
			log.Printf("error leyendo los mejores clientes: %v", custErr)
			http.Error(w, "error calculando estadísticas", http.StatusInternalServerError)
			return
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
		if errBank != nil {
			log.Printf("error consultando los bancos más usados: %v", errBank)
			http.Error(w, "error calculando estadísticas", http.StatusInternalServerError)
			return
		}
		bankErr := func() error {
			defer bankRows.Close()
			for bankRows.Next() {
				var tb models.TopBankStat
				if err := bankRows.Scan(&tb.BankName, &tb.Count, &tb.TotalAmount); err != nil {
					return err
				}
				mStats.TopBanks = append(mStats.TopBanks, tb)
			}
			return bankRows.Err()
		}()
		if bankErr != nil {
			log.Printf("error leyendo los bancos más usados: %v", bankErr)
			http.Error(w, "error calculando estadísticas", http.StatusInternalServerError)
			return
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
		log.Printf("error consultando gastos: %v", err)
		http.Error(w, "error consultando gastos", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var expenses []models.Expense
	for rows.Next() {
		var e models.Expense
		if err := rows.Scan(&e.ID, &e.Description, &e.Amount, &e.Category, &e.PaymentMethod,
			&e.RegisteredBy, &e.RegistererName, &e.IngredientID, &e.IngredientName, &e.QuantityAdded, &e.CreatedAt); err != nil {
			log.Printf("error leyendo gastos: %v", err)
			http.Error(w, "error leyendo gastos", http.StatusInternalServerError)
			return
		}
		expenses = append(expenses, e)
	}
	if err := rows.Err(); err != nil {
		log.Printf("error recorriendo gastos: %v", err)
		http.Error(w, "error leyendo gastos", http.StatusInternalServerError)
		return
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
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
	registeredBy, err := userIDFromContext(ctx)
	if err != nil {
		log.Printf("no se pudo identificar a quien registra el gasto: %v", err)
		http.Error(w, "no autenticado", http.StatusUnauthorized)
		return
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		log.Printf("error iniciando transacción de gasto: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	// 1. Si incluye insumo, reabastecer inventario
	if req.IngredientID != nil && req.QuantityAdded > 0 {
		tag, err := tx.Exec(ctx,
			`UPDATE ingredients SET quantity = quantity + $1, updated_at = now() WHERE id = $2`,
			req.QuantityAdded, *req.IngredientID)
		if err != nil {
			log.Printf("error reabasteciendo inventario: %v", err)
			http.Error(w, "error reabasteciendo insumo", http.StatusInternalServerError)
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
		log.Printf("error creando gasto: %v", err)
		http.Error(w, "error registrando gasto", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("error confirmando transacción de gasto: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
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
