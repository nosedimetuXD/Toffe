package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/NosedimetuXD/cafeteria/internal/auth"
	"github.com/NosedimetuXD/cafeteria/internal/models"
)

func contextWithValue(r *http.Request, key contextKey, value any) context.Context {
	return context.WithValue(r.Context(), key, value)
}

func contextWithRole(r *http.Request, role models.UserRole) context.Context {
	return contextWithValue(r, ContextRole, role)
}

// okHandler registra si fue invocado y qué valores llegaron en el contexto.
type okHandler struct {
	called bool
	userID any
	role   any
}

func (h *okHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.called = true
	h.userID = r.Context().Value(ContextUserID)
	h.role = r.Context().Value(ContextRole)
	w.WriteHeader(http.StatusOK)
}

func TestRequireAuthRejectsMissingOrMalformedHeader(t *testing.T) {
	t.Setenv("JWT_SECRET", "clave-de-prueba")

	cases := map[string]string{
		"sin header":       "",
		"sin esquema":      "algun-token",
		"esquema distinto": "Basic dXNlcjpwYXNz",
		"minúsculas":       "bearer algun-token",
	}

	for name, header := range cases {
		next := &okHandler{}
		req := httptest.NewRequest(http.MethodGet, "/sales", nil)
		if header != "" {
			req.Header.Set("Authorization", header)
		}
		rec := httptest.NewRecorder()

		RequireAuth(next).ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s: código = %d, se esperaba 401", name, rec.Code)
		}
		if next.called {
			t.Errorf("%s: el handler siguiente no debía ejecutarse", name)
		}
	}
}

func TestRequireAuthRejectsInvalidToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "clave-de-prueba")

	next := &okHandler{}
	req := httptest.NewRequest(http.MethodGet, "/sales", nil)
	req.Header.Set("Authorization", "Bearer token-invalido")
	rec := httptest.NewRecorder()

	RequireAuth(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("código = %d, se esperaba 401", rec.Code)
	}
	if next.called {
		t.Error("el handler siguiente no debía ejecutarse")
	}
}

func TestRequireAuthInjectsClaimsInContext(t *testing.T) {
	t.Setenv("JWT_SECRET", "clave-de-prueba")

	userID := uuid.New()
	token, err := auth.GenerateToken(userID, models.RoleAdmin)
	if err != nil {
		t.Fatalf("GenerateToken devolvió error: %v", err)
	}

	next := &okHandler{}
	req := httptest.NewRequest(http.MethodGet, "/sales", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	RequireAuth(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("código = %d, se esperaba 200", rec.Code)
	}
	if !next.called {
		t.Fatal("el handler siguiente debía ejecutarse")
	}
	if next.userID != userID {
		t.Errorf("user_id en contexto = %v, se esperaba %v", next.userID, userID)
	}
	if next.role != models.RoleAdmin {
		t.Errorf("role en contexto = %v, se esperaba %v", next.role, models.RoleAdmin)
	}
}

func TestRequireRoleAllowsListedRoles(t *testing.T) {
	next := &okHandler{}
	req := httptest.NewRequest(http.MethodGet, "/accounting/summary", nil)
	req = req.WithContext(contextWithRole(req, models.RoleAdmin))
	rec := httptest.NewRecorder()

	RequireRole(models.RoleOwner, models.RoleAdmin)(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("código = %d, se esperaba 200", rec.Code)
	}
	if !next.called {
		t.Error("el handler siguiente debía ejecutarse para un rol permitido")
	}
}

func TestRequireRoleBlocksUnlistedRole(t *testing.T) {
	next := &okHandler{}
	req := httptest.NewRequest(http.MethodGet, "/stats", nil)
	req = req.WithContext(contextWithRole(req, models.RoleEmployee))
	rec := httptest.NewRecorder()

	RequireRole(models.RoleOwner)(next).ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("código = %d, se esperaba 403", rec.Code)
	}
	if next.called {
		t.Error("el handler siguiente no debía ejecutarse para un rol sin permiso")
	}
}

func TestRequireRoleBlocksWhenRoleMissingOrWrongType(t *testing.T) {
	for name, ctxValue := range map[string]any{"sin rol": nil, "tipo incorrecto": "owner"} {
		next := &okHandler{}
		req := httptest.NewRequest(http.MethodGet, "/stats", nil)
		if ctxValue != nil {
			req = req.WithContext(contextWithValue(req, ContextRole, ctxValue))
		}
		rec := httptest.NewRecorder()

		RequireRole(models.RoleOwner)(next).ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Errorf("%s: código = %d, se esperaba 403", name, rec.Code)
		}
		if next.called {
			t.Errorf("%s: el handler siguiente no debía ejecutarse", name)
		}
	}
}

func TestRequireAuthSSERejectsMissingOrInvalidToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "clave-de-prueba")

	for name, url := range map[string]string{
		"sin token":      "/events",
		"token vacio":    "/events?token=",
		"token invalido": "/events?token=xxx",
	} {
		next := &okHandler{}
		rec := httptest.NewRecorder()

		RequireAuthSSE(next).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, url, nil))

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s: código = %d, se esperaba 401", name, rec.Code)
		}
		if next.called {
			t.Errorf("%s: el handler siguiente no debía ejecutarse", name)
		}
	}
}

func TestRequireAuthSSEInjectsClaimsInContext(t *testing.T) {
	t.Setenv("JWT_SECRET", "clave-de-prueba")

	userID := uuid.New()
	token, err := auth.GenerateToken(userID, models.RoleEmployee)
	if err != nil {
		t.Fatalf("GenerateToken devolvió error: %v", err)
	}

	next := &okHandler{}
	rec := httptest.NewRecorder()

	RequireAuthSSE(next).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/events?token="+token, nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("código = %d, se esperaba 200", rec.Code)
	}
	if next.userID != userID {
		t.Errorf("user_id en contexto = %v, se esperaba %v", next.userID, userID)
	}
	if next.role != models.RoleEmployee {
		t.Errorf("role en contexto = %v, se esperaba %v", next.role, models.RoleEmployee)
	}
}
