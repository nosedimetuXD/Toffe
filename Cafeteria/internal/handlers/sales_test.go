package handlers

import (
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/NosedimetuXD/cafeteria/internal/events"
)

func newSaleHandler() *SaleHandler {
	return &SaleHandler{DB: nil, Hub: events.NewHub()}
}

func TestSaleCreateRejectsInvalidBody(t *testing.T) {
	rec := run(newSaleHandler().Create, newRequest(http.MethodPost, "/sales", "{no-json"))

	if body := assertStatus(t, rec, http.StatusBadRequest); body != "cuerpo inválido" {
		t.Errorf("mensaje = %q, se esperaba \"cuerpo inválido\"", body)
	}
}

func TestSaleCreateRequiresAtLeastOneItem(t *testing.T) {
	for name, body := range map[string]string{
		"items ausente": `{"payment_method":"efectivo"}`,
		"items vacío":   `{"payment_method":"efectivo","items":[]}`,
	} {
		rec := run(newSaleHandler().Create, newRequest(http.MethodPost, "/sales", body))
		if got := assertStatus(t, rec, http.StatusBadRequest); got != "la venta debe tener al menos un producto" {
			t.Errorf("%s: mensaje = %q", name, got)
		}
	}
}

func TestSaleCreateRejectsNonPositiveQuantity(t *testing.T) {
	productID := uuid.New().String()

	for name, quantity := range map[string]string{"cero": "0", "negativa": "-3"} {
		body := `{"payment_method":"efectivo","items":[{"product_id":"` + productID + `","quantity":` + quantity + `}]}`
		rec := run(newSaleHandler().Create, newRequest(http.MethodPost, "/sales", body))
		if got := assertStatus(t, rec, http.StatusBadRequest); got != "la cantidad debe ser mayor a cero" {
			t.Errorf("%s: mensaje = %q", name, got)
		}
	}
}

func TestSaleCreateRejectsQuantityInAnyItem(t *testing.T) {
	body := `{"payment_method":"efectivo","items":[
		{"product_id":"` + uuid.New().String() + `","quantity":2},
		{"product_id":"` + uuid.New().String() + `","quantity":0}]}`

	rec := run(newSaleHandler().Create, newRequest(http.MethodPost, "/sales", body))

	if got := assertStatus(t, rec, http.StatusBadRequest); got != "la cantidad debe ser mayor a cero" {
		t.Errorf("mensaje = %q", got)
	}
}

func TestSaleCreateRejectsUnknownPaymentMethod(t *testing.T) {
	body := `{"payment_method":"bitcoin","items":[{"product_id":"` + uuid.New().String() + `","quantity":1}]}`

	rec := run(newSaleHandler().Create, newRequest(http.MethodPost, "/sales", body))

	if got := assertStatus(t, rec, http.StatusBadRequest); got != "método de pago inválido" {
		t.Errorf("mensaje = %q", got)
	}
}

func TestSaleGetRejectsInvalidID(t *testing.T) {
	req := withURLParam(newRequest(http.MethodGet, "/sales/abc", ""), "id", "abc")

	rec := run(newSaleHandler().Get, req)

	assertStatus(t, rec, http.StatusBadRequest)
}
