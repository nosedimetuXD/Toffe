package handlers

import (
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/NosedimetuXD/cafeteria/internal/events"
)

func newProductHandler() *ProductHandler {
	return &ProductHandler{DB: nil}
}

func newIngredientHandler() *IngredientHandler {
	return &IngredientHandler{DB: nil, Hub: events.NewHub()}
}

func newRecipeHandler() *RecipeHandler {
	return &RecipeHandler{DB: nil}
}

func TestProductCreateValidatesBody(t *testing.T) {
	cases := map[string]struct {
		body string
		want string
	}{
		"cuerpo inválido": {"{", "cuerpo inválido"},
		"sin nombre":      {`{"price":1500}`, "nombre y precio son obligatorios"},
		"precio negativo": {`{"name":"Latte","price":-1}`, "nombre y precio son obligatorios"},
	}

	for name, tc := range cases {
		rec := run(newProductHandler().Create, newRequest(http.MethodPost, "/products", tc.body))
		if got := assertStatus(t, rec, http.StatusBadRequest); got != tc.want {
			t.Errorf("%s: mensaje = %q, se esperaba %q", name, got, tc.want)
		}
	}
}

func TestProductHandlersRejectInvalidID(t *testing.T) {
	handler := newProductHandler()

	cases := map[string]struct {
		fn     http.HandlerFunc
		method string
		body   string
	}{
		"Get":    {handler.Get, http.MethodGet, ""},
		"Update": {handler.Update, http.MethodPut, `{"name":"Latte","price":1500}`},
		"Delete": {handler.Delete, http.MethodDelete, ""},
	}

	for name, tc := range cases {
		req := withURLParam(newRequest(tc.method, "/products/no-uuid", tc.body), "id", "no-uuid")
		rec := run(tc.fn, req)
		if got := assertStatus(t, rec, http.StatusBadRequest); got != "id inválido" {
			t.Errorf("%s: mensaje = %q", name, got)
		}
	}
}

func TestProductUpdateRejectsInvalidBody(t *testing.T) {
	id := uuid.New().String()
	req := withURLParam(newRequest(http.MethodPut, "/products/"+id, "{"), "id", id)

	rec := run(newProductHandler().Update, req)

	if got := assertStatus(t, rec, http.StatusBadRequest); got != "cuerpo inválido" {
		t.Errorf("mensaje = %q", got)
	}
}

func TestIngredientCreateValidatesBody(t *testing.T) {
	cases := map[string]struct {
		body string
		want string
	}{
		"cuerpo inválido":   {"[", "cuerpo inválido"},
		"sin nombre":        {`{"unit":"l","quantity":3}`, "nombre, unidad y cantidad son obligatorios"},
		"sin unidad":        {`{"name":"Leche","quantity":3}`, "nombre, unidad y cantidad son obligatorios"},
		"cantidad negativa": {`{"name":"Leche","unit":"l","quantity":-2}`, "nombre, unidad y cantidad son obligatorios"},
	}

	for name, tc := range cases {
		rec := run(newIngredientHandler().Create, newRequest(http.MethodPost, "/ingredients", tc.body))
		if got := assertStatus(t, rec, http.StatusBadRequest); got != tc.want {
			t.Errorf("%s: mensaje = %q, se esperaba %q", name, got, tc.want)
		}
	}
}

func TestIngredientHandlersRejectInvalidID(t *testing.T) {
	handler := newIngredientHandler()

	cases := map[string]struct {
		fn     http.HandlerFunc
		method string
		body   string
	}{
		"Get":    {handler.Get, http.MethodGet, ""},
		"Update": {handler.Update, http.MethodPut, `{"name":"Leche","unit":"l","quantity":1}`},
		"Delete": {handler.Delete, http.MethodDelete, ""},
	}

	for name, tc := range cases {
		req := withURLParam(newRequest(tc.method, "/ingredients/no-uuid", tc.body), "id", "no-uuid")
		rec := run(tc.fn, req)
		if got := assertStatus(t, rec, http.StatusBadRequest); got != "id inválido" {
			t.Errorf("%s: mensaje = %q", name, got)
		}
	}
}

func TestRecipeGetRejectsInvalidProductID(t *testing.T) {
	req := withURLParam(newRequest(http.MethodGet, "/products/no-uuid/recipe", ""), "id", "no-uuid")

	rec := run(newRecipeHandler().Get, req)

	if got := assertStatus(t, rec, http.StatusBadRequest); got != "id inválido" {
		t.Errorf("mensaje = %q", got)
	}
}

func TestRecipeSetValidatesRequest(t *testing.T) {
	productID := uuid.New().String()
	ingredientID := uuid.New().String()

	cases := map[string]struct {
		id   string
		body string
		want string
	}{
		"producto inválido": {"no-uuid", `{"items":[]}`, "id inválido"},
		"cuerpo inválido":   {productID, "{", "cuerpo inválido"},
		"cantidad cero": {
			productID,
			`{"items":[{"ingredient_id":"` + ingredientID + `","quantity_used":0}]}`,
			"la cantidad usada debe ser mayor a cero",
		},
		"cantidad negativa": {
			productID,
			`{"items":[{"ingredient_id":"` + ingredientID + `","quantity_used":-0.5}]}`,
			"la cantidad usada debe ser mayor a cero",
		},
	}

	for name, tc := range cases {
		req := withURLParam(newRequest(http.MethodPut, "/products/"+tc.id+"/recipe", tc.body), "id", tc.id)
		rec := run(newRecipeHandler().Set, req)
		if got := assertStatus(t, rec, http.StatusBadRequest); got != tc.want {
			t.Errorf("%s: mensaje = %q, se esperaba %q", name, got, tc.want)
		}
	}
}
