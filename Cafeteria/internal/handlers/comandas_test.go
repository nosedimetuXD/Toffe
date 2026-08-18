package handlers

import (
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/NosedimetuXD/cafeteria/internal/events"
)

func newComandaHandler() *ComandaHandler {
	return &ComandaHandler{DB: nil, Hub: events.NewHub()}
}

func TestComandaUpdateStatusValidatesRequest(t *testing.T) {
	id := uuid.New().String()

	cases := map[string]struct {
		id   string
		body string
		want string
	}{
		"id inválido":     {"no-uuid", `{"status":"listo"}`, "id inválido"},
		"cuerpo inválido": {id, "{", "cuerpo inválido"},
		"estado inválido": {id, `{"status":"servido"}`, "estado de comanda inválido"},
		"estado vacío":    {id, `{"status":"   "}`, "estado de comanda inválido"},
	}

	for name, tc := range cases {
		req := withURLParam(newRequest(http.MethodPatch, "/comandas/"+tc.id+"/status", tc.body), "id", tc.id)
		rec := run(newComandaHandler().UpdateStatus, req)
		if got := assertStatus(t, rec, http.StatusBadRequest); got != tc.want {
			t.Errorf("%s: mensaje = %q, se esperaba %q", name, got, tc.want)
		}
	}
}
