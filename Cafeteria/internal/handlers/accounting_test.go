package handlers

import (
	"net/http"
	"testing"

	"github.com/NosedimetuXD/cafeteria/internal/events"
)

func newAccountingHandler() *AccountingHandler {
	return &AccountingHandler{DB: nil, Hub: events.NewHub()}
}

func TestCreateExpenseValidatesBody(t *testing.T) {
	cases := map[string]struct {
		body string
		want string
	}{
		"cuerpo inválido":   {"no-json", "cuerpo inválido"},
		"sin descripción":   {`{"amount":5000}`, "descripción y monto válido son requeridos"},
		"descripción vacía": {`{"description":"   ","amount":5000}`, "descripción y monto válido son requeridos"},
		"monto cero":        {`{"description":"Servilletas","amount":0}`, "descripción y monto válido son requeridos"},
		"monto negativo":    {`{"description":"Servilletas","amount":-100}`, "descripción y monto válido son requeridos"},
	}

	for name, tc := range cases {
		rec := run(newAccountingHandler().CreateExpense, newRequest(http.MethodPost, "/expenses", tc.body))
		if got := assertStatus(t, rec, http.StatusBadRequest); got != tc.want {
			t.Errorf("%s: mensaje = %q, se esperaba %q", name, got, tc.want)
		}
	}
}
