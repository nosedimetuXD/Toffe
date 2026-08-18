package handlers

import (
	"net/http"
	"testing"

	"github.com/google/uuid"
)

func newUserHandler() *UserHandler {
	return &UserHandler{DB: nil}
}

func TestUserCreateRejectsInvalidBody(t *testing.T) {
	rec := run(newUserHandler().Create, newRequest(http.MethodPost, "/users", "["))

	if got := assertStatus(t, rec, http.StatusBadRequest); got != "cuerpo inválido" {
		t.Errorf("mensaje = %q", got)
	}
}

func TestUserCreateRequiresUsernameAndPassword(t *testing.T) {
	for name, body := range map[string]string{
		"sin usuario":    `{"password":"contrasena1","role":"admin"}`,
		"sin contraseña": `{"username":"ana","role":"admin"}`,
		"ambos vacíos":   `{"username":"","password":"","role":"admin"}`,
	} {
		rec := run(newUserHandler().Create, newRequest(http.MethodPost, "/users", body))
		if got := assertStatus(t, rec, http.StatusBadRequest); got != "usuario y contraseña son obligatorios" {
			t.Errorf("%s: mensaje = %q", name, got)
		}
	}
}

func TestUserCreateRejectsShortPassword(t *testing.T) {
	rec := run(newUserHandler().Create, newRequest(http.MethodPost, "/users", `{"username":"ana","password":"1234567","role":"admin"}`))

	if got := assertStatus(t, rec, http.StatusBadRequest); got != "la contraseña debe tener al menos 8 caracteres" {
		t.Errorf("mensaje = %q", got)
	}
}

func TestUserCreateRejectsInvalidRole(t *testing.T) {
	for name, role := range map[string]string{"vacío": "", "desconocido": "gerente"} {
		body := `{"username":"ana","password":"contrasena1","role":"` + role + `"}`
		rec := run(newUserHandler().Create, newRequest(http.MethodPost, "/users", body))
		if got := assertStatus(t, rec, http.StatusBadRequest); got != "rol inválido, debe ser owner, admin o employee" {
			t.Errorf("%s: mensaje = %q", name, got)
		}
	}
}

func TestUserUpdateRejectsInvalidID(t *testing.T) {
	req := withURLParam(newRequest(http.MethodPut, "/users/xyz", `{"username":"ana","role":"admin"}`), "id", "xyz")

	rec := run(newUserHandler().Update, req)

	if got := assertStatus(t, rec, http.StatusBadRequest); got != "id de usuario inválido" {
		t.Errorf("mensaje = %q", got)
	}
}

func TestUserUpdateValidatesBody(t *testing.T) {
	id := uuid.New().String()

	cases := map[string]struct {
		body string
		want string
	}{
		"cuerpo inválido": {"{", "cuerpo inválido"},
		"sin usuario":     {`{"username":"   ","role":"admin"}`, "el nombre de usuario es obligatorio"},
		"rol inválido":    {`{"username":"ana","role":"gerente"}`, "rol inválido, debe ser owner, admin o employee"},
	}

	for name, tc := range cases {
		req := withURLParam(newRequest(http.MethodPut, "/users/"+id, tc.body), "id", id)
		rec := run(newUserHandler().Update, req)
		if got := assertStatus(t, rec, http.StatusBadRequest); got != tc.want {
			t.Errorf("%s: mensaje = %q, se esperaba %q", name, got, tc.want)
		}
	}
}

func TestUserDeleteRejectsInvalidID(t *testing.T) {
	req := withURLParam(newRequest(http.MethodDelete, "/users/xyz", ""), "id", "xyz")

	rec := run(newUserHandler().Delete, req)

	if got := assertStatus(t, rec, http.StatusBadRequest); got != "id de usuario inválido" {
		t.Errorf("mensaje = %q", got)
	}
}

func TestUserUpdateSelfRequiresAuthenticatedUser(t *testing.T) {
	rec := run(newUserHandler().UpdateSelf, newRequest(http.MethodPut, "/users/me", `{"username":"ana"}`))

	if got := assertStatus(t, rec, http.StatusUnauthorized); got != "no autenticado" {
		t.Errorf("mensaje = %q", got)
	}
}

func TestUserUpdateSelfValidatesBody(t *testing.T) {
	cases := map[string]struct {
		body string
		want string
	}{
		"cuerpo inválido":  {"{", "cuerpo inválido"},
		"usuario vacío":    {`{"username":"  "}`, "el nombre de usuario es obligatorio"},
		"contraseña corta": {`{"username":"ana","password":"corta"}`, "la contraseña debe tener al menos 8 caracteres"},
	}

	for name, tc := range cases {
		req := withUser(newRequest(http.MethodPut, "/users/me", tc.body), uuid.New())
		rec := run(newUserHandler().UpdateSelf, req)
		if got := assertStatus(t, rec, http.StatusBadRequest); got != tc.want {
			t.Errorf("%s: mensaje = %q, se esperaba %q", name, got, tc.want)
		}
	}
}
