package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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

	execSchema(ctx, db, "ingredients.unit_cost", `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS unit_cost NUMERIC DEFAULT 0`)
	execSchema(ctx, db, "ingredients.min_quantity", `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS min_quantity NUMERIC DEFAULT 5`)

	return &IngredientHandler{DB: db, Hub: hub}
}

// GET /ingredients
func (h *IngredientHandler) List(w http.ResponseWriter, r *http.Request) {
	execSchema(r.Context(), h.DB, "ingredients.unit_cost", `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS unit_cost NUMERIC DEFAULT 0`)

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, name, unit, quantity, COALESCE(min_quantity, 5), COALESCE(unit_cost, 0), created_at, updated_at
		 FROM ingredients ORDER BY name`)
	if err != nil {
		log.Printf("error consultando insumos: %v", err)
		http.Error(w, "error consultando insumos", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var ingredients []models.Ingredient
	for rows.Next() {
		var i models.Ingredient
		if err := rows.Scan(&i.ID, &i.Name, &i.Unit, &i.Quantity, &i.MinQuantity, &i.UnitCost, &i.CreatedAt, &i.UpdatedAt); err != nil {
			log.Printf("error leyendo insumos: %v", err)
			http.Error(w, "error leyendo insumos", http.StatusInternalServerError)
			return
		}
		ingredients = append(ingredients, i)
	}
	if err := rows.Err(); err != nil {
		log.Printf("error recorriendo insumos: %v", err)
		http.Error(w, "error leyendo insumos", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, ingredients)
}

// GET /ingredients/{id}
func (h *IngredientHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}

	var i models.Ingredient
	err = h.DB.QueryRow(r.Context(),
		`SELECT id, name, unit, quantity, COALESCE(min_quantity, 5), COALESCE(unit_cost, 0), created_at, updated_at
		 FROM ingredients WHERE id = $1`, id,
	).Scan(&i.ID, &i.Name, &i.Unit, &i.Quantity, &i.MinQuantity, &i.UnitCost, &i.CreatedAt, &i.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "insumo no encontrado", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("error consultando insumo: %v", err)
		http.Error(w, "error consultando insumo", http.StatusInternalServerError)
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
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
		log.Printf("error creando insumo: %v", err)
		http.Error(w, "error creando insumo", http.StatusInternalServerError)
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
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}

	var req updateIngredientRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Unit == "" || req.Quantity < 0 {
		http.Error(w, "nombre, unidad y cantidad son obligatorios", http.StatusBadRequest)
		return
	}

	var i models.Ingredient
	err = h.DB.QueryRow(r.Context(),
		`UPDATE ingredients
		 SET name = $1, unit = $2, quantity = $3, min_quantity = $4, unit_cost = $5, updated_at = now()
		 WHERE id = $6
		 RETURNING id, name, unit, quantity, COALESCE(min_quantity, 5), COALESCE(unit_cost, 0), created_at, updated_at`,
		req.Name, req.Unit, req.Quantity, req.MinQuantity, req.UnitCost, id,
	).Scan(&i.ID, &i.Name, &i.Unit, &i.Quantity, &i.MinQuantity, &i.UnitCost, &i.CreatedAt, &i.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "insumo no encontrado", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("error actualizando insumo: %v", err)
		http.Error(w, "error actualizando insumo", http.StatusInternalServerError)
		return
	}

	h.Hub.Publish("inventory_updated", i)

	writeJSON(w, http.StatusOK, i)
}

// DELETE /ingredients/{id}
func (h *IngredientHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		log.Printf("error iniciando transacción de borrado de insumo: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM recipe_items WHERE ingredient_id = $1`, id); err != nil {
		log.Printf("error borrando items de receta del insumo %s: %v", id, err)
		http.Error(w, "error borrando insumo", http.StatusInternalServerError)
		return
	}
	if _, err := tx.Exec(ctx, `DELETE FROM waste_reports WHERE ingredient_id = $1`, id); err != nil {
		log.Printf("error borrando mermas del insumo %s: %v", id, err)
		http.Error(w, "error borrando insumo", http.StatusInternalServerError)
		return
	}

	tag, err := tx.Exec(ctx, `DELETE FROM ingredients WHERE id = $1`, id)
	if err != nil {
		log.Printf("error borrando insumo: %v", err)
		http.Error(w, "error borrando insumo", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "insumo no encontrado", http.StatusNotFound)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("error confirmando borrado de insumo %s: %v", id, err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}

	h.Hub.Publish("inventory_deleted", map[string]string{"id": id.String()})

	w.WriteHeader(http.StatusNoContent)
}
