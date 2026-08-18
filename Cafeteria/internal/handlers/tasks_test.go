package handlers

import (
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/NosedimetuXD/cafeteria/internal/events"
)

func newTaskHandler() *TaskHandler {
	return &TaskHandler{DB: nil, Hub: events.NewHub()}
}

func TestTaskCreateValidatesBody(t *testing.T) {
	cases := map[string]struct {
		body string
		want string
	}{
		"cuerpo inválido": {"{", "cuerpo inválido"},
		"sin título":      {`{"description":"limpiar la máquina"}`, "el título es obligatorio"},
	}

	for name, tc := range cases {
		rec := run(newTaskHandler().Create, newRequest(http.MethodPost, "/tasks", tc.body))
		if got := assertStatus(t, rec, http.StatusBadRequest); got != tc.want {
			t.Errorf("%s: mensaje = %q, se esperaba %q", name, got, tc.want)
		}
	}
}

func TestTaskUpdateValidatesRequest(t *testing.T) {
	id := uuid.New().String()

	cases := map[string]struct {
		id   string
		body string
		want string
	}{
		"id inválido":     {"no-uuid", `{"title":"Limpiar"}`, "id inválido"},
		"cuerpo inválido": {id, "{", "cuerpo inválido"},
	}

	for name, tc := range cases {
		req := withURLParam(newRequest(http.MethodPut, "/tasks/"+tc.id, tc.body), "id", tc.id)
		rec := run(newTaskHandler().Update, req)
		if got := assertStatus(t, rec, http.StatusBadRequest); got != tc.want {
			t.Errorf("%s: mensaje = %q, se esperaba %q", name, got, tc.want)
		}
	}
}

func TestTaskUpdateStatusValidatesRequest(t *testing.T) {
	id := uuid.New().String()

	cases := map[string]struct {
		id   string
		body string
		want string
	}{
		"id inválido":     {"no-uuid", `{"status":"pending"}`, "id inválido"},
		"cuerpo inválido": {id, "{", "cuerpo inválido"},
		"estado inválido": {id, `{"status":"pausada"}`, "estado inválido"},
		"estado vacío":    {id, `{}`, "estado inválido"},
	}

	for name, tc := range cases {
		req := withURLParam(newRequest(http.MethodPatch, "/tasks/"+tc.id+"/status", tc.body), "id", tc.id)
		rec := run(newTaskHandler().UpdateStatus, req)
		if got := assertStatus(t, rec, http.StatusBadRequest); got != tc.want {
			t.Errorf("%s: mensaje = %q, se esperaba %q", name, got, tc.want)
		}
	}
}

func TestTaskDeleteRejectsInvalidID(t *testing.T) {
	req := withURLParam(newRequest(http.MethodDelete, "/tasks/no-uuid", ""), "id", "no-uuid")

	rec := run(newTaskHandler().Delete, req)

	if got := assertStatus(t, rec, http.StatusBadRequest); got != "id inválido" {
		t.Errorf("mensaje = %q", got)
	}
}
