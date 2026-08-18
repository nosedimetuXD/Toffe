package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NosedimetuXD/cafeteria/internal/models"
)

type ProductHandler struct {
	DB *pgxpool.Pool
}

func NewProductHandler(db *pgxpool.Pool) *ProductHandler {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, _ = db.Exec(ctx, `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT ''`)
	_, _ = db.Exec(ctx, `ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Bebidas'`)

	_, _ = db.Exec(ctx, `ALTER TABLE sale_items ALTER COLUMN product_id DROP NOT NULL`)
	_, _ = db.Exec(ctx, `ALTER TABLE comanda_items ALTER COLUMN product_id DROP NOT NULL`)

	_, _ = db.Exec(ctx, `
		DO $$ 
		BEGIN 
			IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'sale_items_product_id_fkey') THEN
				ALTER TABLE sale_items DROP CONSTRAINT sale_items_product_id_fkey;
			END IF;
			ALTER TABLE sale_items ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

			IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'comanda_items_product_id_fkey') THEN
				ALTER TABLE comanda_items DROP CONSTRAINT comanda_items_product_id_fkey;
			END IF;
			ALTER TABLE comanda_items ADD CONSTRAINT comanda_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
		END $$;
	`)

	return &ProductHandler{DB: db}
}

// GET /products/{id}
func (h *ProductHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(w, r)
	if !ok {
		return
	}

	var p models.Product
	err := h.DB.QueryRow(r.Context(),
		`SELECT id, name, description, price, COALESCE(category, 'Bebidas'), COALESCE(image_url, ''), active, created_at, updated_at
		 FROM products WHERE id = $1`, id,
	).Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Category, &p.ImageURL, &p.Active, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		queryError(w, err, "producto no encontrado", "error consultando producto")
		return
	}

	writeJSON(w, http.StatusOK, p)
}

// PUT /products/{id}
type updateProductRequest struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
	Category    string  `json:"category"`
	ImageURL    string  `json:"image_url"`
	Active      bool    `json:"active"`
}

func (h *ProductHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(w, r)
	if !ok {
		return
	}

	var req updateProductRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Name == "" || req.Price < 0 {
		http.Error(w, "nombre y precio son obligatorios", http.StatusBadRequest)
		return
	}

	if req.Category == "" {
		req.Category = "Bebidas"
	}

	var p models.Product
	err := h.DB.QueryRow(r.Context(),
		`UPDATE products
		 SET name = $1, description = $2, price = $3, category = $4, image_url = $5, active = $6, updated_at = now()
		 WHERE id = $7
		 RETURNING id, name, description, price, COALESCE(category, 'Bebidas'), COALESCE(image_url, ''), active, created_at, updated_at`,
		req.Name, req.Description, req.Price, req.Category, req.ImageURL, req.Active, id,
	).Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Category, &p.ImageURL, &p.Active, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		queryError(w, err, "producto no encontrado", "error actualizando producto")
		return
	}

	writeJSON(w, http.StatusOK, p)
}

// DELETE /products/{id}
func (h *ProductHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(w, r)
	if !ok {
		return
	}

	// 1. Eliminar cualquier restricción foránea previa que intente hacer SET NULL
	_, _ = h.DB.Exec(r.Context(), `
		DO $$ 
		BEGIN 
			IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'sale_items_product_id_fkey') THEN
				ALTER TABLE sale_items DROP CONSTRAINT sale_items_product_id_fkey;
			END IF;
			IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'comanda_items_product_id_fkey') THEN
				ALTER TABLE comanda_items DROP CONSTRAINT comanda_items_product_id_fkey;
			END IF;
			IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'product_ingredients_product_id_fkey') THEN
				ALTER TABLE product_ingredients DROP CONSTRAINT product_ingredients_product_id_fkey;
			END IF;
		END $$;
	`)

	// 2. Desvincular tablas asociadas manteniendo intactas las ventas y comandas históricas
	_, _ = h.DB.Exec(r.Context(), `UPDATE sale_items SET product_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE product_id = $1`, id)
	_, _ = h.DB.Exec(r.Context(), `UPDATE comanda_items SET product_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE product_id = $1`, id)
	_, _ = h.DB.Exec(r.Context(), `DELETE FROM product_ingredients WHERE product_id = $1`, id)
	_, _ = h.DB.Exec(r.Context(), `DELETE FROM recipes WHERE product_id = $1`, id)
	_, _ = h.DB.Exec(r.Context(), `DELETE FROM product_recipes WHERE product_id = $1`, id)

	tag, err := h.DB.Exec(r.Context(), `DELETE FROM products WHERE id = $1`, id)
	if err != nil {
		log.Printf("error borrando producto %s: %v", id, err)
		http.Error(w, fmt.Sprintf("Error borrando producto: %v", err), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "producto no encontrado", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GET /products
func (h *ProductHandler) List(w http.ResponseWriter, r *http.Request) {
	_, _ = h.DB.Exec(r.Context(), `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT ''`)
	_, _ = h.DB.Exec(r.Context(), `ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Bebidas'`)

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, name, description, price, COALESCE(category, 'Bebidas'), COALESCE(image_url, ''), active, created_at, updated_at
		 FROM products
		 ORDER BY name`)
	if err != nil {
		http.Error(w, "error consultando productos", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var p models.Product
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Category, &p.ImageURL, &p.Active, &p.CreatedAt, &p.UpdatedAt); err != nil {
			http.Error(w, "error leyendo productos", http.StatusInternalServerError)
			return
		}
		products = append(products, p)
	}

	writeJSON(w, http.StatusOK, products)
}

// POST /products
type createProductRequest struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
	Category    string  `json:"category"`
	ImageURL    string  `json:"image_url"`
}

func (h *ProductHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createProductRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Name == "" || req.Price < 0 {
		http.Error(w, "nombre y precio son obligatorios", http.StatusBadRequest)
		return
	}

	if req.Category == "" {
		req.Category = "Bebidas"
	}

	var p models.Product
	err := h.DB.QueryRow(r.Context(),
		`INSERT INTO products (name, description, price, category, image_url)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, name, description, price, COALESCE(category, 'Bebidas'), COALESCE(image_url, ''), active, created_at, updated_at`,
		req.Name, req.Description, req.Price, req.Category, req.ImageURL,
	).Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Category, &p.ImageURL, &p.Active, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		serverError(w, "error creando producto", err)
		return
	}

	writeJSON(w, http.StatusCreated, p)
}
