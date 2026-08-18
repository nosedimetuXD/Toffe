package handlers

import (
	"net/http"
	"testing"
)

func TestLoginRejectsInvalidBody(t *testing.T) {
	handler := &AuthHandler{DB: nil}

	rec := run(handler.Login, newRequest(http.MethodPost, "/login", "usuario=ana"))

	if got := assertStatus(t, rec, http.StatusBadRequest); got != "cuerpo inválido" {
		t.Errorf("mensaje = %q", got)
	}
}
