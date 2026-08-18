package handlers

import (
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NosedimetuXD/cafeteria/internal/models"
)

type RecipeHandler struct {
	DB *pgxpool.Pool
}

func NewRecipeHandler(db *pgxpool.Pool) *RecipeHandler {
	return &RecipeHandler{DB: db}
}

// GET /products/{id}/recipe
func (h *RecipeHandler) Get(w http.ResponseWriter, r *http.Request) {
	productID, ok := parseIDParam(w, r)
	if !ok {
		return
	}

	rows, err := h.DB.Query(r.Context(),
		`SELECT pi.ingredient_id, i.name, pi.quantity_used
		 FROM product_ingredients pi
		 JOIN ingredients i ON i.id = pi.ingredient_id
		 WHERE pi.product_id = $1
		 ORDER BY i.name`, productID)
	if err != nil {
		serverError(w, "error consultando receta", err)
		return
	}
	defer rows.Close()

	recipe := []models.RecipeLine{}
	for rows.Next() {
		var rl models.RecipeLine
		if err := rows.Scan(&rl.IngredientID, &rl.IngredientName, &rl.QuantityUsed); err != nil {
			serverError(w, "error leyendo receta", err)
			return
		}
		recipe = append(recipe, rl)
	}

	writeJSON(w, http.StatusOK, recipe)
}

// PUT /products/{id}/recipe — reemplaza toda la receta del producto
type setRecipeRequest struct {
	Items []struct {
		IngredientID uuid.UUID `json:"ingredient_id"`
		QuantityUsed float64   `json:"quantity_used"`
	} `json:"items"`
}

func (h *RecipeHandler) Set(w http.ResponseWriter, r *http.Request) {
	productID, ok := parseIDParam(w, r)
	if !ok {
		return
	}

	var req setRecipeRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	for _, item := range req.Items {
		if item.QuantityUsed <= 0 {
			http.Error(w, "la cantidad usada debe ser mayor a cero", http.StatusBadRequest)
			return
		}
	}

	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		serverError(w, "error interno", err)
		return
	}
	defer tx.Rollback(ctx)

	// Verificar que el producto existe
	var exists bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)`, productID).Scan(&exists)
	if err != nil {
		serverError(w, "error interno", err)
		return
	}
	if !exists {
		http.Error(w, "producto no encontrado", http.StatusNotFound)
		return
	}

	// Borra la receta anterior y crea la nueva — más simple y seguro que
	// tratar de calcular diffs (qué se agregó, qué se quitó, qué cambió)
	_, err = tx.Exec(ctx, `DELETE FROM product_ingredients WHERE product_id = $1`, productID)
	if err != nil {
		serverError(w, "error interno", err)
		return
	}

	for _, item := range req.Items {
		_, err = tx.Exec(ctx,
			`INSERT INTO product_ingredients (product_id, ingredient_id, quantity_used)
			 VALUES ($1, $2, $3)`,
			productID, item.IngredientID, item.QuantityUsed)
		if err != nil {
			log.Printf("error insertando receta: %v", err)
			http.Error(w, "error creando la receta — revisa que los insumos existan", http.StatusBadRequest)
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		serverError(w, "error interno", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
