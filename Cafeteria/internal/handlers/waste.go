package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NosedimetuXD/cafeteria/internal/events"
	"github.com/NosedimetuXD/cafeteria/internal/models"
)

type WasteHandler struct {
	DB  *pgxpool.Pool
	Hub *events.Hub
}

func NewWasteHandler(db *pgxpool.Pool, hub *events.Hub) *WasteHandler {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, _ = db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS waste_reports (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
			quantity_lost NUMERIC NOT NULL,
			unit_cost NUMERIC DEFAULT 0,
			estimated_loss NUMERIC DEFAULT 0,
			reason TEXT NOT NULL,
			reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
		)
	`)
	_, _ = db.Exec(ctx, `ALTER TABLE waste_reports ADD COLUMN IF NOT EXISTS unit_cost NUMERIC DEFAULT 0`)
	_, _ = db.Exec(ctx, `ALTER TABLE waste_reports ADD COLUMN IF NOT EXISTS estimated_loss NUMERIC DEFAULT 0`)

	return &WasteHandler{DB: db, Hub: hub}
}

// GET /waste — lista todos los reportes de mermas/daños
func (h *WasteHandler) List(w http.ResponseWriter, r *http.Request) {
	_, _ = h.DB.Exec(r.Context(), `ALTER TABLE waste_reports ADD COLUMN IF NOT EXISTS unit_cost NUMERIC DEFAULT 0`)
	_, _ = h.DB.Exec(r.Context(), `ALTER TABLE waste_reports ADD COLUMN IF NOT EXISTS estimated_loss NUMERIC DEFAULT 0`)

	query := `SELECT w.id, w.ingredient_id, COALESCE(i.name, 'Insumo Eliminado'), COALESCE(i.unit, 'unidades'), 
	                 w.quantity_lost, COALESCE(w.unit_cost, 0), COALESCE(w.estimated_loss, 0), w.reason, w.reported_by, COALESCE(u.username, 'Personal'), w.created_at
	          FROM waste_reports w
	          LEFT JOIN ingredients i ON w.ingredient_id = i.id
	          LEFT JOIN users u ON w.reported_by = u.id
	          ORDER BY w.created_at DESC`

	rows, err := h.DB.Query(r.Context(), query)
	if err != nil {
		serverError(w, "error consultando reporte de daños", err)
		return
	}
	defer rows.Close()

	var list []models.WasteReport
	for rows.Next() {
		var item models.WasteReport
		if err := rows.Scan(&item.ID, &item.IngredientID, &item.IngredientName, &item.Unit,
			&item.QuantityLost, &item.UnitCost, &item.EstimatedLoss, &item.Reason, &item.ReportedBy, &item.ReporterName, &item.CreatedAt); err != nil {
			serverError(w, "error leyendo reporte de daños", err)
			return
		}
		list = append(list, item)
	}

	writeJSON(w, http.StatusOK, list)
}

// POST /waste — registra daño/pérdida de insumo y descuenta la cantidad del inventario
type createWasteRequest struct {
	IngredientID uuid.UUID `json:"ingredient_id"`
	QuantityLost float64   `json:"quantity_lost"`
	Reason       string    `json:"reason"`
}

func (h *WasteHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createWasteRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	reason := strings.TrimSpace(req.Reason)
	if req.IngredientID == uuid.Nil || req.QuantityLost <= 0 || reason == "" {
		http.Error(w, "insumo, cantidad perdida > 0 y motivo son obligatorios", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	reportedBy := userIDFromContext(ctx)

	var unitCost float64
	_ = h.DB.QueryRow(ctx, `SELECT COALESCE(unit_cost, 0) FROM ingredients WHERE id = $1`, req.IngredientID).Scan(&unitCost)

	estimatedLoss := req.QuantityLost * unitCost

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		serverError(w, "error interno", err)
		return
	}
	defer tx.Rollback(ctx)

	// 1. Descontar la cantidad del inventario (sin dejarlo menor a 0)
	tag, err := tx.Exec(ctx,
		`UPDATE ingredients SET quantity = GREATEST(0, quantity - $1), updated_at = now() WHERE id = $2`,
		req.QuantityLost, req.IngredientID)
	if err != nil {
		serverError(w, "error descontando insumo", err)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "el insumo especificado no existe", http.StatusBadRequest)
		return
	}

	// 2. Insertar el reporte de merma/daño con costo unitario y pérdida estimada
	var wasteID uuid.UUID
	var createdAt time.Time
	err = tx.QueryRow(ctx,
		`INSERT INTO waste_reports (ingredient_id, quantity_lost, unit_cost, estimated_loss, reason, reported_by)
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
		req.IngredientID, req.QuantityLost, unitCost, estimatedLoss, reason, nullableUUID(reportedBy),
	).Scan(&wasteID, &createdAt)
	if err != nil {
		serverError(w, "error registrando reporte de daños", err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		serverError(w, "error interno", err)
		return
	}

	h.Hub.Publish("inventory_updated", map[string]interface{}{
		"ingredient_id":  req.IngredientID,
		"quantity_lost":  req.QuantityLost,
		"unit_cost":      unitCost,
		"estimated_loss": estimatedLoss,
		"reason":         reason,
	})

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"id":             wasteID,
		"unit_cost":      unitCost,
		"estimated_loss": estimatedLoss,
		"created_at":     createdAt,
		"message":        fmt.Sprintf("Se descontaron %.2f unidades del inventario (pérdida est.: $%.2f)", req.QuantityLost, estimatedLoss),
	})
}
