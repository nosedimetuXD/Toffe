package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	custommw "github.com/NosedimetuXD/cafeteria/internal/middleware"
)

// Los handlers validan la petición antes de tocar la base de datos, así que estas
// pruebas usan un pool nil: si un caso llegara a la consulta, fallaría de forma visible.

// newRequest arma una petición POST/PUT con el cuerpo dado.
func newRequest(method, target, body string) *http.Request {
	return httptest.NewRequest(method, target, strings.NewReader(body))
}

// withURLParam inyecta parámetros de ruta de chi (ej. {id}) en la petición.
func withURLParam(r *http.Request, key, value string) *http.Request {
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add(key, value)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, routeCtx))
}

// withUser inyecta el user_id que normalmente pone el middleware de autenticación.
func withUser(r *http.Request, id uuid.UUID) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), custommw.ContextUserID, id))
}

// assertStatus verifica el código de respuesta y devuelve el cuerpo.
func assertStatus(t *testing.T, rec *httptest.ResponseRecorder, want int) string {
	t.Helper()
	if rec.Code != want {
		t.Errorf("código = %d, se esperaba %d (cuerpo: %s)", rec.Code, want, strings.TrimSpace(rec.Body.String()))
	}
	return strings.TrimSpace(rec.Body.String())
}

// run ejecuta el handler y devuelve el recorder.
func run(h http.HandlerFunc, r *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h(rec, r)
	return rec
}
