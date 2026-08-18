package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NosedimetuXD/cafeteria/internal/events"
	"github.com/NosedimetuXD/cafeteria/internal/models"
)

type IngredientHandler struct {
	DB  *pgxpool.Pool
	Hub *events.Hub
}

func NewIngredientHandler(db *pgxpool.Pool, hub *events.Hub) *IngredientHandler {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, _ = db.Exec(ctx, `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS unit_cost NUMERIC DEFAULT 0`)
	_, _ = db.Exec(ctx, `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS min_quantity NUMERIC DEFAULT 5`)

	return &IngredientHandler{DB: db, Hub: hub}
}

// GET /ingredients
func (h *IngredientHandler) List(w http.ResponseWriter, r *http.Request) {
	_, _ = h.DB.Exec(r.Context(), `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS unit_cost NUMERIC DEFAULT 0`)

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, name, unit, quantity, COALESCE(min_quantity, 5), COALESCE(unit_cost, 0), created_at, updated_at
		 FROM ingredients ORDER BY name`)
	if err != nil {
		serverError(w, "error consultando insumos", err)
		return
	}
	defer rows.Close()

	var ingredients []models.Ingredient
	for rows.Next() {
		var i models.Ingredient
		if err := rows.Scan(&i.ID, &i.Name, &i.Unit, &i.Quantity, &i.MinQuantity, &i.UnitCost, &i.CreatedAt, &i.UpdatedAt); err != nil {
			serverError(w, "error leyendo insumos", err)
			return
		}
		ingredients = append(ingredients, i)
	}

	writeJSON(w, http.StatusOK, ingredients)
}

// GET /ingredients/{id}
func (h *IngredientHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(w, r)
	if !ok {
		return
	}

	var i models.Ingredient
	err := h.DB.QueryRow(r.Context(),
		`SELECT id, name, unit, quantity, COALESCE(min_quantity, 5), COALESCE(unit_cost, 0), created_at, updated_at
		 FROM ingredients WHERE id = $1`, id,
	).Scan(&i.ID, &i.Name, &i.Unit, &i.Quantity, &i.MinQuantity, &i.UnitCost, &i.CreatedAt, &i.UpdatedAt)
	if err != nil {
		queryError(w, err, "insumo no encontrado", "error consultando insumo")
		return
	}

	writeJSON(w, http.StatusOK, i)
}

// POST /ingredients
type createIngredientRequest struct {
	Name        string  `json:"name"`
	Unit        string  `json:"unit"`
	Quantity    float64 `json:"quantity"`
	MinQuantity float64 `json:"min_quantity"`
	UnitCost    float64 `json:"unit_cost"`
}

func (h *IngredientHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createIngredientRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Name == "" || req.Unit == "" || req.Quantity < 0 {
		http.Error(w, "nombre, unidad y cantidad son obligatorios", http.StatusBadRequest)
		return
	}

	var i models.Ingredient
	err := h.DB.QueryRow(r.Context(),
		`INSERT INTO ingredients (name, unit, quantity, min_quantity, unit_cost)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, name, unit, quantity, COALESCE(min_quantity, 5), COALESCE(unit_cost, 0), created_at, updated_at`,
		req.Name, req.Unit, req.Quantity, req.MinQuantity, req.UnitCost,
	).Scan(&i.ID, &i.Name, &i.Unit, &i.Quantity, &i.MinQuantity, &i.UnitCost, &i.CreatedAt, &i.UpdatedAt)
	if err != nil {
		serverError(w, "error creando insumo", err)
		return
	}

	writeJSON(w, http.StatusCreated, i)
}

// PUT /ingredients/{id}
type updateIngredientRequest struct {
	Name        string  `json:"name"`
	Unit        string  `json:"unit"`
	Quantity    float64 `json:"quantity"`
	MinQuantity float64 `json:"min_quantity"`
	UnitCost    float64 `json:"unit_cost"`
}

func (h *IngredientHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(w, r)
	if !ok {
		return
	}

	var req updateIngredientRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Name == "" || req.Unit == "" || req.Quantity < 0 {
		http.Error(w, "nombre, unidad y cantidad son obligatorios", http.StatusBadRequest)
		return
	}

	var i models.Ingredient
	err := h.DB.QueryRow(r.Context(),
		`UPDATE ingredients
		 SET name = $1, unit = $2, quantity = $3, min_quantity = $4, unit_cost = $5, updated_at = now()
		 WHERE id = $6
		 RETURNING id, name, unit, quantity, COALESCE(min_quantity, 5), COALESCE(unit_cost, 0), created_at, updated_at`,
		req.Name, req.Unit, req.Quantity, req.MinQuantity, req.UnitCost, id,
	).Scan(&i.ID, &i.Name, &i.Unit, &i.Quantity, &i.MinQuantity, &i.UnitCost, &i.CreatedAt, &i.UpdatedAt)
	if err != nil {
		queryError(w, err, "insumo no encontrado", "error actualizando insumo")
		return
	}

	h.Hub.Publish("inventory_updated", i)

	writeJSON(w, http.StatusOK, i)
}

// DELETE /ingredients/{id}
func (h *IngredientHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(w, r)
	if !ok {
		return
	}

	_, _ = h.DB.Exec(r.Context(), `DELETE FROM recipe_items WHERE ingredient_id = $1`, id)
	_, _ = h.DB.Exec(r.Context(), `DELETE FROM waste_reports WHERE ingredient_id = $1`, id)

	tag, err := h.DB.Exec(r.Context(), `DELETE FROM ingredients WHERE id = $1`, id)
	if err != nil {
		serverError(w, "error borrando insumo", err)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "insumo no encontrado", http.StatusNotFound)
		return
	}

	h.Hub.Publish("inventory_deleted", map[string]string{"id": id.String()})

	w.WriteHeader(http.StatusNoContent)
}
