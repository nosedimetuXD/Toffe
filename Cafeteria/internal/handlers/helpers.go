package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	custommw "github.com/NosedimetuXD/cafeteria/internal/middleware"
	"github.com/NosedimetuXD/cafeteria/internal/models"
)

// writeJSON responde con el status indicado y el cuerpo serializado en JSON.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("error serializando respuesta JSON: %v", err)
	}
}

// decodeJSON deserializa el cuerpo de la petición y responde 400 si es inválido.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
		return false
	}
	return true
}

// parseIDParam lee el parámetro de ruta "id" como UUID y responde 400 si es inválido.
func parseIDParam(w http.ResponseWriter, r *http.Request, invalidMsg ...string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		msg := "id inválido"
		if len(invalidMsg) > 0 {
			msg = invalidMsg[0]
		}
		http.Error(w, msg, http.StatusBadRequest)
		return uuid.Nil, false
	}
	return id, true
}

// serverError registra el error interno y responde 500 con el mensaje público.
func serverError(w http.ResponseWriter, msg string, err error) {
	log.Printf("%s: %v", msg, err)
	http.Error(w, msg, http.StatusInternalServerError)
}

// queryError responde 404 cuando la consulta no devolvió filas y 500 en cualquier otro error.
func queryError(w http.ResponseWriter, err error, notFoundMsg, internalMsg string) {
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, notFoundMsg, http.StatusNotFound)
		return
	}
	serverError(w, internalMsg, err)
}

// isUniqueViolation indica si el error viene de romper una restricción UNIQUE.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// nullableUUID convierte el id vacío en NULL para columnas opcionales.
func nullableUUID(id uuid.UUID) any {
	if id == uuid.Nil {
		return nil
	}
	return id
}

// userIDFromContext obtiene el id del usuario autenticado, que el middleware puede
// haber guardado como uuid.UUID o como string. Devuelve uuid.Nil si no hay sesión.
func userIDFromContext(ctx context.Context) uuid.UUID {
	switch val := ctx.Value(custommw.ContextUserID).(type) {
	case uuid.UUID:
		return val
	case string:
		id, err := uuid.Parse(val)
		if err != nil {
			return uuid.Nil
		}
		return id
	default:
		return uuid.Nil
	}
}

// userRoleFromContext obtiene el rol del usuario autenticado. Devuelve "" si no hay sesión.
func userRoleFromContext(ctx context.Context) models.UserRole {
	switch val := ctx.Value(custommw.ContextRole).(type) {
	case models.UserRole:
		return val
	case string:
		return models.UserRole(val)
	default:
		return ""
	}
}
