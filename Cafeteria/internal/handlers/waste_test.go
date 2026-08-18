package handlers

import (
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/NosedimetuXD/cafeteria/internal/events"
)

func newWasteHandler() *WasteHandler {
	return &WasteHandler{DB: nil, Hub: events.NewHub()}
}

func TestWasteCreateRejectsInvalidBody(t *testing.T) {
	rec := run(newWasteHandler().Create, newRequest(http.MethodPost, "/waste", "no-json"))

	if got := assertStatus(t, rec, http.StatusBadRequest); got != "cuerpo inválido" {
		t.Errorf("mensaje = %q", got)
	}
}

func TestWasteCreateRequiresIngredientQuantityAndReason(t *testing.T) {
	const wantMsg = "insumo, cantidad perdida > 0 y motivo son obligatorios"
	ingredientID := uuid.New().String()

	cases := map[string]string{
		"sin insumo":        `{"quantity_lost":2,"reason":"se cayó"}`,
		"insumo nulo":       `{"ingredient_id":"00000000-0000-0000-0000-000000000000","quantity_lost":2,"reason":"se cayó"}`,
		"cantidad cero":     `{"ingredient_id":"` + ingredientID + `","quantity_lost":0,"reason":"se cayó"}`,
		"cantidad negativa": `{"ingredient_id":"` + ingredientID + `","quantity_lost":-1,"reason":"se cayó"}`,
		"motivo vacío":      `{"ingredient_id":"` + ingredientID + `","quantity_lost":2,"reason":"   "}`,
		"motivo ausente":    `{"ingredient_id":"` + ingredientID + `","quantity_lost":2}`,
	}

	for name, body := range cases {
		rec := run(newWasteHandler().Create, newRequest(http.MethodPost, "/waste", body))
		if got := assertStatus(t, rec, http.StatusBadRequest); got != wantMsg {
			t.Errorf("%s: mensaje = %q, se esperaba %q", name, got, wantMsg)
		}
	}
}
