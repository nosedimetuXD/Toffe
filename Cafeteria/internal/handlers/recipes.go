package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
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
	productID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}

	rows, err := h.DB.Query(r.Context(),
		`SELECT pi.ingredient_id, i.name, pi.quantity_used
		 FROM product_ingredients pi
		 JOIN ingredients i ON i.id = pi.ingredient_id
		 WHERE pi.product_id = $1
		 ORDER BY i.name`, productID)
	if err != nil {
		log.Printf("error consultando receta: %v", err)
		http.Error(w, "error consultando receta", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	recipe := []models.RecipeLine{}
	for rows.Next() {
		var rl models.RecipeLine
		if err := rows.Scan(&rl.IngredientID, &rl.IngredientName, &rl.QuantityUsed); err != nil {
			log.Printf("error leyendo receta: %v", err)
			http.Error(w, "error leyendo receta", http.StatusInternalServerError)
			return
		}
		recipe = append(recipe, rl)
	}
	if err := rows.Err(); err != nil {
		log.Printf("error recorriendo receta: %v", err)
		http.Error(w, "error leyendo receta", http.StatusInternalServerError)
		return
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
	productID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}

	var req setRecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
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
		log.Printf("error iniciando transacción: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	// Verificar que el producto existe
	var exists bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)`, productID).Scan(&exists)
	if err != nil {
		log.Printf("error verificando producto: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
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
		log.Printf("error borrando receta anterior: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
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
		log.Printf("error confirmando receta: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
