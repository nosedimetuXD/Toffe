package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NosedimetuXD/cafeteria/internal/events"
	"github.com/NosedimetuXD/cafeteria/internal/models"
)

type ComandaHandler struct {
	DB  *pgxpool.Pool
	Hub *events.Hub
}

func NewComandaHandler(db *pgxpool.Pool, hub *events.Hub) *ComandaHandler {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	execSchema(ctx, db, "comandas.ready_at", `ALTER TABLE comandas ADD COLUMN IF NOT EXISTS ready_at TIMESTAMP WITH TIME ZONE`)
	execSchema(ctx, db, "comandas.prepared_by", `ALTER TABLE comandas ADD COLUMN IF NOT EXISTS prepared_by UUID REFERENCES users(id)`)
	execSchema(ctx, db, "comandas.prepared_by_username", `ALTER TABLE comandas ADD COLUMN IF NOT EXISTS prepared_by_username VARCHAR(100)`)
	return &ComandaHandler{DB: db, Hub: hub}
}

// GET /comandas
func (h *ComandaHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(),
		`SELECT c.id, c.order_number, COALESCE(c.sale_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(c.customer_name, ''), c.status, COALESCE(c.notes, ''), c.created_at, c.updated_at, c.ready_at, c.prepared_by, COALESCE(NULLIF(c.prepared_by_username, ''), u.username, '') 
		 FROM comandas c
		 LEFT JOIN users u ON c.prepared_by = u.id
		 WHERE c.created_at >= (now() - INTERVAL '12 hours') OR c.status IN ('pendiente', 'en_preparacion', 'listo')
		 ORDER BY CASE c.status 
		    WHEN 'pendiente' THEN 1 
		    WHEN 'en_preparacion' THEN 2 
		    WHEN 'listo' THEN 3 
		    WHEN 'entregado' THEN 4 
		    WHEN 'cancelado' THEN 5 
		    ELSE 6 END, c.created_at DESC`)
	if err != nil {
		log.Printf("error consultando comandas: %v", err)
		http.Error(w, "error consultando comandas", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var comandas []models.Comanda
	for rows.Next() {
		var c models.Comanda
		if err := rows.Scan(&c.ID, &c.OrderNumber, &c.SaleID, &c.CustomerName, &c.Status, &c.Notes, &c.CreatedAt, &c.UpdatedAt, &c.ReadyAt, &c.PreparedBy, &c.PreparedByUsername); err != nil {
			log.Printf("error leyendo comanda: %v", err)
			http.Error(w, "error leyendo comanda", http.StatusInternalServerError)
			return
		}
		comandas = append(comandas, c)
	}
	if err := rows.Err(); err != nil {
		log.Printf("error recorriendo comandas: %v", err)
		http.Error(w, "error leyendo comandas", http.StatusInternalServerError)
		return
	}

	// Cargar los items de cada comanda
	for i := range comandas {
		itemRows, err := h.DB.Query(r.Context(),
			`SELECT product_id, product_name, quantity, COALESCE(notes, '') 
			 FROM comanda_items 
			 WHERE comanda_id = $1`, comandas[i].ID)
		if err != nil {
			log.Printf("error cargando items de comanda %s: %v", comandas[i].ID, err)
			http.Error(w, "error cargando items de comanda", http.StatusInternalServerError)
			return
		}

		var scanErr error
		for itemRows.Next() {
			var ci models.ComandaItem
			if scanErr = itemRows.Scan(&ci.ProductID, &ci.ProductName, &ci.Quantity, &ci.Notes); scanErr != nil {
				break
			}
			comandas[i].Items = append(comandas[i].Items, ci)
		}
		if scanErr == nil {
			scanErr = itemRows.Err()
		}
		itemRows.Close()
		if scanErr != nil {
			log.Printf("error leyendo items de comanda %s: %v", comandas[i].ID, scanErr)
			http.Error(w, "error leyendo items de comanda", http.StatusInternalServerError)
			return
		}
	}

	writeJSON(w, http.StatusOK, comandas)
}

// PATCH /comandas/{id}/status
type updateComandaStatusRequest struct {
	Status             string `json:"status"`
	PreparedByUsername string `json:"prepared_by_username"`
}

func (h *ComandaHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}

	var req updateComandaStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
		return
	}

	statusStr := strings.ToLower(strings.TrimSpace(req.Status))
	validStatuses := map[string]bool{
		"pendiente":      true,
		"en_preparacion": true,
		"listo":          true,
		"entregado":      true,
	}

	if !validStatuses[statusStr] {
		if statusStr == "cancelado" {
			http.Error(w, "para cancelar use POST /comandas/{id}/cancel", http.StatusBadRequest)
			return
		}
		http.Error(w, "estado de comanda inválido", http.StatusBadRequest)
		return
	}

	userID, err := userIDFromContext(r.Context())
	if err != nil {
		log.Printf("no se pudo identificar al usuario autenticado: %v", err)
		http.Error(w, "no autenticado", http.StatusUnauthorized)
		return
	}

	var preparedBy *uuid.UUID
	var preparedByName string
	var validID uuid.UUID
	switch err := h.DB.QueryRow(r.Context(), "SELECT id, username FROM users WHERE id = $1", userID).Scan(&validID, &preparedByName); {
	case err == nil:
		preparedBy = &validID
	case errors.Is(err, pgx.ErrNoRows):
		// el usuario de la sesión ya no existe; la comanda se actualiza sin responsable
		log.Printf("el usuario %s de la sesión ya no existe", userID)
	default:
		log.Printf("error consultando el usuario %s: %v", userID, err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}
	if preparedByName == "" {
		preparedByName = strings.TrimSpace(req.PreparedByUsername)
	}

	var c models.Comanda
	var updateErr error

	updateErr = h.DB.QueryRow(r.Context(),
		`UPDATE comandas 
		 SET status = $1::text, 
		     updated_at = now(), 
		     ready_at = COALESCE(ready_at, CASE WHEN $1::text IN ('listo', 'entregado') THEN now() ELSE NULL END),
		     prepared_by = COALESCE($3::uuid, prepared_by),
		     prepared_by_username = CASE 
		                              WHEN $4::text <> '' AND $4::text <> 'Por asignar' THEN $4::text 
		                              WHEN COALESCE(prepared_by_username, '') <> '' AND prepared_by_username <> 'Por asignar' THEN prepared_by_username 
		                              ELSE 'Por asignar' 
		                            END
		 WHERE id = $2::uuid AND status <> 'cancelado'
		 RETURNING id, order_number, COALESCE(sale_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(customer_name, ''), status, COALESCE(notes, ''), created_at, updated_at, ready_at, prepared_by, COALESCE(prepared_by_username, '')`,
		statusStr, id, preparedBy, preparedByName,
	).Scan(&c.ID, &c.OrderNumber, &c.SaleID, &c.CustomerName, &c.Status, &c.Notes, &c.CreatedAt, &c.UpdatedAt, &c.ReadyAt, &c.PreparedBy, &c.PreparedByUsername)

	if updateErr != nil {
		if errors.Is(updateErr, pgx.ErrNoRows) {
			http.Error(w, "comanda no encontrada o cancelada", http.StatusNotFound)
			return
		}
		log.Printf("error crítico actualizando comanda %s: %v", id, updateErr)
		http.Error(w, "error actualizando comanda", http.StatusInternalServerError)
		return
	}

	h.Hub.Publish("comanda_updated", map[string]interface{}{
		"id":           c.ID,
		"order_number": c.OrderNumber,
		"status":       c.Status,
		"updated_at":   c.UpdatedAt,
	})

	writeJSON(w, http.StatusOK, c)
}

// POST /comandas/{id}/cancel
// Cancela la venta asociada a una comanda dentro de los 5 minutos posteriores a su creación.
// La venta no se elimina: queda marcada como 'cancelada' y deja de contar como ingreso.
func (h *ComandaHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}

	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		log.Printf("error iniciando transacción de cancelación: %v", err)
		http.Error(w, "error cancelando venta", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var saleID uuid.UUID
	var comandaStatus string
	err = tx.QueryRow(r.Context(),
		`SELECT sale_id, status FROM comandas WHERE id = $1 FOR UPDATE`, id,
	).Scan(&saleID, &comandaStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "comanda no encontrada", http.StatusNotFound)
			return
		}
		log.Printf("error buscando comanda %s: %v", id, err)
		http.Error(w, "error cancelando venta", http.StatusInternalServerError)
		return
	}

	if comandaStatus == "cancelado" {
		http.Error(w, "la venta ya fue cancelada", http.StatusConflict)
		return
	}

	var saleStatus string
	var saleCreatedAt time.Time
	err = tx.QueryRow(r.Context(),
		`SELECT COALESCE(status, 'completada'), created_at FROM sales WHERE id = $1 FOR UPDATE`, saleID,
	).Scan(&saleStatus, &saleCreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "venta asociada no encontrada", http.StatusNotFound)
			return
		}
		log.Printf("error buscando venta %s: %v", saleID, err)
		http.Error(w, "error cancelando venta", http.StatusInternalServerError)
		return
	}

	if saleStatus == "cancelada" {
		http.Error(w, "la venta ya fue cancelada", http.StatusConflict)
		return
	}

	if time.Since(saleCreatedAt) > 5*time.Minute {
		http.Error(w, "la venta solo puede cancelarse durante los 5 minutos posteriores a su creación", http.StatusForbidden)
		return
	}

	if _, err := tx.Exec(r.Context(),
		`UPDATE sales SET status = 'cancelada' WHERE id = $1`, saleID); err != nil {
		log.Printf("error cancelando venta %s: %v", saleID, err)
		http.Error(w, "error cancelando venta", http.StatusInternalServerError)
		return
	}

	var c models.Comanda
	err = tx.QueryRow(r.Context(),
		`UPDATE comandas SET status = 'cancelado', updated_at = now() WHERE id = $1
		 RETURNING id, order_number, COALESCE(sale_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(customer_name, ''), status, COALESCE(notes, ''), created_at, updated_at, ready_at, prepared_by, COALESCE(prepared_by_username, '')`,
		id,
	).Scan(&c.ID, &c.OrderNumber, &c.SaleID, &c.CustomerName, &c.Status, &c.Notes, &c.CreatedAt, &c.UpdatedAt, &c.ReadyAt, &c.PreparedBy, &c.PreparedByUsername)
	if err != nil {
		log.Printf("error actualizando comanda %s: %v", id, err)
		http.Error(w, "error cancelando venta", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Printf("error confirmando cancelación de venta %s: %v", saleID, err)
		http.Error(w, "error cancelando venta", http.StatusInternalServerError)
		return
	}

	h.Hub.Publish("comanda_updated", map[string]interface{}{
		"id":           c.ID,
		"order_number": c.OrderNumber,
		"status":       c.Status,
		"updated_at":   c.UpdatedAt,
	})
	h.Hub.Publish("sale_cancelled", map[string]interface{}{
		"sale_id":    saleID,
		"comanda_id": c.ID,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}
