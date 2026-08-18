package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NosedimetuXD/cafeteria/internal/models"
)

type ProductHandler struct {
	DB *pgxpool.Pool
}

func NewProductHandler(db *pgxpool.Pool) *ProductHandler {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	execSchema(ctx, db, "products.image_url", `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT ''`)
	execSchema(ctx, db, "products.category", `ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Bebidas'`)

	execSchema(ctx, db, "sale_items.product_id nullable", `ALTER TABLE sale_items ALTER COLUMN product_id DROP NOT NULL`)
	execSchema(ctx, db, "comanda_items.product_id nullable", `ALTER TABLE comanda_items ALTER COLUMN product_id DROP NOT NULL`)

	execSchema(ctx, db, "claves foráneas de product_id", `
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
	idParam := chi.URLParam(r, "id")
	id, err := uuid.Parse(idParam)
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}

	var p models.Product
	err = h.DB.QueryRow(r.Context(),
		`SELECT id, name, description, price, COALESCE(category, 'Bebidas'), COALESCE(image_url, ''), active, created_at, updated_at
		 FROM products WHERE id = $1`, id,
	).Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Category, &p.ImageURL, &p.Active, &p.CreatedAt, &p.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "producto no encontrado", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("error consultando producto: %v", err)
		http.Error(w, "error consultando producto", http.StatusInternalServerError)
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
	idParam := chi.URLParam(r, "id")
	id, err := uuid.Parse(idParam)
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}

	var req updateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
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
	err = h.DB.QueryRow(r.Context(),
		`UPDATE products
		 SET name = $1, description = $2, price = $3, category = $4, image_url = $5, active = $6, updated_at = now()
		 WHERE id = $7
		 RETURNING id, name, description, price, COALESCE(category, 'Bebidas'), COALESCE(image_url, ''), active, created_at, updated_at`,
		req.Name, req.Description, req.Price, req.Category, req.ImageURL, req.Active, id,
	).Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Category, &p.ImageURL, &p.Active, &p.CreatedAt, &p.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "producto no encontrado", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("error actualizando producto: %v", err)
		http.Error(w, "error actualizando producto", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, p)
}

// DELETE /products/{id}
func (h *ProductHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idParam := chi.URLParam(r, "id")
	id, err := uuid.Parse(idParam)
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}

	// 1. Eliminar cualquier restricción foránea previa que intente hacer SET NULL
	execSchema(r.Context(), h.DB, "claves foráneas de product_id", `
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

	ctx := r.Context()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		log.Printf("error iniciando transacción de borrado de producto: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	// 2. Desvincular tablas asociadas manteniendo intactas las ventas y comandas históricas
	cleanup := []struct {
		desc string
		sql  string
	}{
		{"desvinculando items de venta", `UPDATE sale_items SET product_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE product_id = $1`},
		{"desvinculando items de comanda", `UPDATE comanda_items SET product_id = '00000000-0000-0000-0000-000000000000'::uuid WHERE product_id = $1`},
		{"borrando insumos del producto", `DELETE FROM product_ingredients WHERE product_id = $1`},
		{"borrando recetas", `DELETE FROM recipes WHERE product_id = $1`},
		{"borrando recetas de producto", `DELETE FROM product_recipes WHERE product_id = $1`},
	}
	for _, step := range cleanup {
		if _, err := tx.Exec(ctx, step.sql, id); err != nil {
			log.Printf("error %s del producto %s: %v", step.desc, id, err)
			http.Error(w, fmt.Sprintf("error %s", step.desc), http.StatusInternalServerError)
			return
		}
	}

	tag, err := tx.Exec(ctx, `DELETE FROM products WHERE id = $1`, id)
	if err != nil {
		log.Printf("error borrando producto %s: %v", id, err)
		http.Error(w, "error borrando producto", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "producto no encontrado", http.StatusNotFound)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("error confirmando borrado de producto %s: %v", id, err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GET /products
func (h *ProductHandler) List(w http.ResponseWriter, r *http.Request) {
	execSchema(r.Context(), h.DB, "products.image_url", `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT ''`)
	execSchema(r.Context(), h.DB, "products.category", `ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Bebidas'`)

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, name, description, price, COALESCE(category, 'Bebidas'), COALESCE(image_url, ''), active, created_at, updated_at
		 FROM products
		 ORDER BY name`)
	if err != nil {
		log.Printf("error consultando productos: %v", err)
		http.Error(w, "error consultando productos", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var p models.Product
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Category, &p.ImageURL, &p.Active, &p.CreatedAt, &p.UpdatedAt); err != nil {
			log.Printf("error leyendo productos: %v", err)
			http.Error(w, "error leyendo productos", http.StatusInternalServerError)
			return
		}
		products = append(products, p)
	}
	if err := rows.Err(); err != nil {
		log.Printf("error recorriendo productos: %v", err)
		http.Error(w, "error leyendo productos", http.StatusInternalServerError)
		return
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
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
		log.Printf("error insertando producto: %v", err)
		http.Error(w, "error creando producto", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, p)
}
