package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NosedimetuXD/cafeteria/internal/events"
	custommw "github.com/NosedimetuXD/cafeteria/internal/middleware"
	"github.com/NosedimetuXD/cafeteria/internal/models"
)

type SaleHandler struct {
	DB  *pgxpool.Pool
	Hub *events.Hub
}

func NewSaleHandler(db *pgxpool.Pool, hub *events.Hub) *SaleHandler {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, _ = db.Exec(ctx, `ALTER TABLE sales ADD COLUMN IF NOT EXISTS bank_details TEXT DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE sales ADD COLUMN IF NOT EXISTS sold_by_name TEXT DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE sales ALTER COLUMN sold_by DROP NOT NULL`)

	_, _ = db.Exec(ctx, `ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS product_name TEXT DEFAULT ''`)
	_, _ = db.Exec(ctx, `UPDATE sale_items si SET product_name = p.name FROM products p WHERE si.product_id = p.id AND (si.product_name IS NULL OR si.product_name = '')`)

	_, _ = db.Exec(ctx, `
		DO $$ 
		BEGIN 
			IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'sales_sold_by_fkey') THEN
				ALTER TABLE sales DROP CONSTRAINT sales_sold_by_fkey;
			END IF;
			ALTER TABLE sales ADD CONSTRAINT sales_sold_by_fkey FOREIGN KEY (sold_by) REFERENCES users(id) ON DELETE SET NULL;
		END $$;
	`)

	return &SaleHandler{DB: db, Hub: hub}
}

// GET /sales?period=today|week|month|all&start_date=...&end_date=...&year=...&month_num=...
func (h *SaleHandler) List(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	startDate := strings.TrimSpace(r.URL.Query().Get("start_date"))
	endDate := strings.TrimSpace(r.URL.Query().Get("end_date"))
	yearParam := strings.TrimSpace(r.URL.Query().Get("year"))
	monthParam := strings.TrimSpace(r.URL.Query().Get("month_num"))

	var rawCond string

	if startDate != "" && endDate != "" {
		start, end, ok := normalizeDateRange(startDate, endDate)
		if !ok {
			http.Error(w, "start_date y end_date deben tener formato YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		rawCond = fmt.Sprintf("s.created_at >= '%s 00:00:00' AND s.created_at <= '%s 23:59:59'", start, end)
	} else if yearParam != "" && monthParam != "" {
		y, _ := strconv.Atoi(yearParam)
		m, _ := strconv.Atoi(monthParam)
		if y > 2000 && m >= 1 && m <= 12 {
			rawCond = fmt.Sprintf("EXTRACT(YEAR FROM s.created_at) = %d AND EXTRACT(MONTH FROM s.created_at) = %d", y, m)
		}
	}

	if rawCond == "" {
		switch period {
		case "today":
			rawCond = "(s.created_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date"
		case "week":
			rawCond = "s.created_at >= (now() - INTERVAL '7 days')"
		case "month":
			rawCond = "s.created_at >= date_trunc('month', now())"
		case "prev_month":
			rawCond = "s.created_at >= date_trunc('month', now() - INTERVAL '1 month') AND s.created_at < date_trunc('month', now())"
		case "year":
			rawCond = "s.created_at >= date_trunc('year', now())"
		default: // "all"
			rawCond = ""
		}
	}

	var timeCondition string
	if rawCond != "" {
		timeCondition = "WHERE " + rawCond
	}

	query := fmt.Sprintf(`SELECT s.id, s.sold_by, COALESCE(NULLIF(s.sold_by_name, ''), u.username, 'Personal'), COALESCE(s.customer_name, 'Cliente General'), 
		        COALESCE(s.payment_method, 'efectivo'), COALESCE(s.cash_amount, 0), COALESCE(s.transfer_amount, 0), 
		        COALESCE(s.bank_details, ''), s.total, s.created_at,
		        COALESCE(
		          (SELECT json_agg(json_build_object(
		             'product_id', si.product_id,
		             'product_name', COALESCE(NULLIF(si.product_name, ''), p.name, 'Producto Eliminado'),
		             'quantity', si.quantity,
		             'unit_price', si.unit_price))
		           FROM sale_items si
		           LEFT JOIN products p ON si.product_id = p.id
		           WHERE si.sale_id = s.id), '[]'::json) AS items
		 FROM sales s
		 LEFT JOIN users u ON s.sold_by = u.id
		 %s
		 ORDER BY s.created_at DESC`, timeCondition)

	rows, err := h.DB.Query(r.Context(), query)
	if err != nil {
		log.Printf("error consultando ventas: %v", err)
		http.Error(w, "error consultando ventas", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var sales []models.Sale
	for rows.Next() {
		var s models.Sale
		var itemsJSON []byte
		if err := rows.Scan(&s.ID, &s.SoldBy, &s.SoldByUsername, &s.CustomerName,
			&s.PaymentMethod, &s.CashAmount, &s.TransferAmount, &s.BankDetails, &s.Total, &s.CreatedAt, &itemsJSON); err != nil {
			log.Printf("error leyendo ventas: %v", err)
			http.Error(w, "error leyendo ventas", http.StatusInternalServerError)
			return
		}
		if len(itemsJSON) > 0 {
			_ = json.Unmarshal(itemsJSON, &s.Items)
		}
		sales = append(sales, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sales)
}

// GET /sales/{id} — incluye los items de esa venta con el nombre del producto
func (h *SaleHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}

	var s models.Sale
	err = h.DB.QueryRow(r.Context(),
		`SELECT s.id, s.sold_by, COALESCE(u.username, ''), COALESCE(s.customer_name, 'Cliente General'), 
		        COALESCE(s.payment_method, 'efectivo'), COALESCE(s.cash_amount, 0), COALESCE(s.transfer_amount, 0), 
		        COALESCE(s.bank_details, ''), s.total, s.created_at 
		 FROM sales s
		 LEFT JOIN users u ON s.sold_by = u.id
		 WHERE s.id = $1`, id,
	).Scan(&s.ID, &s.SoldBy, &s.SoldByUsername, &s.CustomerName,
		&s.PaymentMethod, &s.CashAmount, &s.TransferAmount, &s.BankDetails, &s.Total, &s.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "venta no encontrada", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("error consultando venta: %v", err)
		http.Error(w, "error consultando venta", http.StatusInternalServerError)
		return
	}

	rows, err := h.DB.Query(r.Context(),
		`SELECT si.product_id, COALESCE(NULLIF(si.product_name, ''), p.name, 'Producto Eliminado'), si.quantity, si.unit_price 
		 FROM sale_items si
		 LEFT JOIN products p ON si.product_id = p.id
		 WHERE si.sale_id = $1`, id)
	if err != nil {
		log.Printf("error consultando items: %v", err)
		http.Error(w, "error consultando items", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var item models.SaleItem
		if err := rows.Scan(&item.ProductID, &item.ProductName, &item.Quantity, &item.UnitPrice); err != nil {
			log.Printf("error leyendo items: %v", err)
			http.Error(w, "error leyendo items", http.StatusInternalServerError)
			return
		}
		s.Items = append(s.Items, item)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s)
}

// POST /sales — crea venta, descuenta insumos y genera comanda en tiempo real
type createSaleRequest struct {
	CustomerName   string  `json:"customer_name"`
	PaymentMethod  string  `json:"payment_method"`
	CashAmount     float64 `json:"cash_amount"`
	TransferAmount float64 `json:"transfer_amount"`
	BankDetails    string  `json:"bank_details"`
	Items          []struct {
		ProductID uuid.UUID `json:"product_id"`
		Quantity  int       `json:"quantity"`
		Notes     string    `json:"notes"`
	} `json:"items"`
}

func (h *SaleHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createSaleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
		return
	}
	if len(req.Items) == 0 {
		http.Error(w, "la venta debe tener al menos un producto", http.StatusBadRequest)
		return
	}
	for _, item := range req.Items {
		if item.Quantity <= 0 {
			http.Error(w, "la cantidad debe ser mayor a cero", http.StatusBadRequest)
			return
		}
	}

	customerName := strings.TrimSpace(req.CustomerName)
	if customerName == "" {
		customerName = "Cliente General"
	}

	paymentMethod := strings.ToLower(strings.TrimSpace(req.PaymentMethod))
	if paymentMethod == "" {
		paymentMethod = "efectivo"
	}
	if paymentMethod != "efectivo" && paymentMethod != "transferencia" && paymentMethod != "mixto" {
		http.Error(w, "método de pago inválido", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	soldByVal := ctx.Value(custommw.ContextUserID)
	var soldBy uuid.UUID
	if soldByVal != nil {
		if id, ok := soldByVal.(uuid.UUID); ok {
			soldBy = id
		} else if idStr, ok := soldByVal.(string); ok {
			soldBy, _ = uuid.Parse(idStr)
		}
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		log.Printf("error iniciando transacción: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	var total float64
	type resolvedItem struct {
		ProductID   uuid.UUID
		ProductName string
		Quantity    int
		UnitPrice   float64
		Notes       string
	}
	var resolved []resolvedItem

	// 1. Verificar que cada producto existe, está activo y calcular el total
	for _, item := range req.Items {
		var name string
		var price float64
		var active bool
		err := tx.QueryRow(ctx,
			`SELECT name, price, active FROM products WHERE id = $1`, item.ProductID,
		).Scan(&name, &price, &active)
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, fmt.Sprintf("producto %s no existe", item.ProductID), http.StatusBadRequest)
			return
		}
		if err != nil {
			log.Printf("error consultando producto: %v", err)
			http.Error(w, "error interno", http.StatusInternalServerError)
			return
		}
		if !active {
			http.Error(w, fmt.Sprintf("producto %s no está disponible", name), http.StatusBadRequest)
			return
		}

		total += price * float64(item.Quantity)
		resolved = append(resolved, resolvedItem{
			ProductID:   item.ProductID,
			ProductName: name,
			Quantity:    item.Quantity,
			UnitPrice:   price,
			Notes:       item.Notes,
		})
	}

	// Determinar montos abonados según forma de pago
	cashAmount := req.CashAmount
	transferAmount := req.TransferAmount
	if paymentMethod == "efectivo" {
		cashAmount = total
		transferAmount = 0
	} else if paymentMethod == "transferencia" {
		cashAmount = 0
		transferAmount = total
	} else if paymentMethod == "mixto" {
		if cashAmount+transferAmount < total {
			http.Error(w, "el pago total en mixto es inferior al monto de la venta", http.StatusBadRequest)
			return
		}
	}

	// 2. Descontar insumos del inventario según receta
	for _, item := range resolved {
		rows, err := tx.Query(ctx,
			`SELECT ingredient_id, quantity_used FROM product_ingredients WHERE product_id = $1`,
			item.ProductID)
		if err != nil {
			log.Printf("error consultando receta: %v", err)
			http.Error(w, "error interno", http.StatusInternalServerError)
			return
		}

		type recipeLine struct {
			IngredientID uuid.UUID
			QtyUsed      float64
		}
		var recipe []recipeLine
		for rows.Next() {
			var rl recipeLine
			if err := rows.Scan(&rl.IngredientID, &rl.QtyUsed); err != nil {
				rows.Close()
				log.Printf("error leyendo receta: %v", err)
				http.Error(w, "error interno", http.StatusInternalServerError)
				return
			}
			recipe = append(recipe, rl)
		}
		rows.Close()

		for _, rl := range recipe {
			needed := rl.QtyUsed * float64(item.Quantity)
			tag, err := tx.Exec(ctx,
				`UPDATE ingredients SET quantity = quantity - $1
				 WHERE id = $2 AND quantity >= $1`,
				needed, rl.IngredientID)
			if err != nil {
				log.Printf("error descontando insumo: %v", err)
				http.Error(w, "error interno", http.StatusInternalServerError)
				return
			}
			if tag.RowsAffected() == 0 {
				http.Error(w, "no hay suficiente inventario para completar la venta", http.StatusConflict)
				return
			}
		}
	}

	var soldByName string
	if soldBy != uuid.Nil {
		_ = tx.QueryRow(ctx, `SELECT COALESCE(username, '') FROM users WHERE id = $1`, soldBy).Scan(&soldByName)
	}

	// 3. Insertar la venta
	var saleID uuid.UUID
	err = tx.QueryRow(ctx,
		`INSERT INTO sales (sold_by, sold_by_name, total, customer_name, payment_method, cash_amount, transfer_amount, bank_details) 
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
		soldBy, soldByName, total, customerName, paymentMethod, cashAmount, transferAmount, strings.TrimSpace(req.BankDetails),
	).Scan(&saleID)
	if err != nil {
		log.Printf("error creando venta: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}

	// 4. Insertar los items de la venta
	for _, item := range resolved {
		_, err = tx.Exec(ctx,
			`INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price)
			 VALUES ($1, $2, $3, $4, $5)`,
			saleID, item.ProductID, item.ProductName, item.Quantity, item.UnitPrice)
		if err != nil {
			log.Printf("error creando item de venta: %v", err)
			http.Error(w, "error interno", http.StatusInternalServerError)
			return
		}
	}

	// 5. Crear la Comanda (Kitchen ticket) automáticamente
	var comandaID uuid.UUID
	var orderNumber int
	err = tx.QueryRow(ctx,
		`INSERT INTO comandas (sale_id, customer_name, status, notes) 
		 VALUES ($1, $2, 'pendiente', '') RETURNING id, order_number`,
		saleID, customerName,
	).Scan(&comandaID, &orderNumber)
	if err != nil {
		log.Printf("error generando comanda: %v", err)
		http.Error(w, "error interno generando comanda", http.StatusInternalServerError)
		return
	}

	var comandaItems []models.ComandaItem
	for _, item := range resolved {
		_, err = tx.Exec(ctx,
			`INSERT INTO comanda_items (comanda_id, product_id, product_name, quantity, notes)
			 VALUES ($1, $2, $3, $4, $5)`,
			comandaID, item.ProductID, item.ProductName, item.Quantity, item.Notes)
		if err != nil {
			log.Printf("error registrando item de comanda: %v", err)
			http.Error(w, "error interno registrando comanda", http.StatusInternalServerError)
			return
		}
		comandaItems = append(comandaItems, models.ComandaItem{
			ProductID:   item.ProductID,
			ProductName: item.ProductName,
			Quantity:    item.Quantity,
			Notes:       item.Notes,
		})
	}

	// 6. Confirmar la transacción
	if err := tx.Commit(ctx); err != nil {
		log.Printf("error confirmando venta y comanda: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}

	// Notificar vía eventos SSE
	h.Hub.Publish("sale_created", map[string]interface{}{
		"id":              saleID,
		"customer_name":   customerName,
		"payment_method":  paymentMethod,
		"total":           total,
	})

	h.Hub.Publish("comanda_created", map[string]interface{}{
		"id":            comandaID,
		"order_number":  orderNumber,
		"sale_id":       saleID,
		"customer_name": customerName,
		"status":        "pendiente",
		"items":         comandaItems,
	})

	// Publicar actualización de inventario también
	h.Hub.Publish("inventory_updated", map[string]interface{}{"action": "sale_deduction"})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":            saleID,
		"comanda_id":    comandaID,
		"order_number":  orderNumber,
		"customer_name": customerName,
		"total":         total,
	})
}
