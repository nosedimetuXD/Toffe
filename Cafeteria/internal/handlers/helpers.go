package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	custommw "github.com/NosedimetuXD/cafeteria/internal/middleware"
)

// ErrNoUserInContext indica que la petición llegó sin usuario autenticado en el contexto.
var ErrNoUserInContext = errors.New("no hay usuario autenticado en el contexto")

type execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// execSchema corre sentencias de auto-migración de esquema. No aborta la petición,
// pero deja constancia en el log del motivo cuando fallan.
func execSchema(ctx context.Context, db execer, desc, sql string, args ...any) {
	if _, err := db.Exec(ctx, sql, args...); err != nil {
		log.Printf("no se pudo aplicar el ajuste de esquema (%s): %v", desc, err)
	}
}

// writeJSON escribe la respuesta y registra los fallos de serialización/escritura.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("error escribiendo respuesta JSON: %v", err)
	}
}

// userIDFromContext devuelve el usuario autenticado, distinguiendo un id ausente
// de uno presente pero corrupto.
func userIDFromContext(ctx context.Context) (uuid.UUID, error) {
	switch val := ctx.Value(custommw.ContextUserID).(type) {
	case uuid.UUID:
		return val, nil
	case string:
		id, err := uuid.Parse(val)
		if err != nil {
			return uuid.Nil, fmt.Errorf("user_id inválido en el contexto: %w", err)
		}
		return id, nil
	default:
		return uuid.Nil, ErrNoUserInContext
	}
}

// parseDateRange valida un rango start_date/end_date en formato YYYY-MM-DD y lo
// devuelve normalizado, de modo que nunca llegue texto arbitrario a la consulta.
func parseDateRange(startDate, endDate string) (string, string, error) {
	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return "", "", fmt.Errorf("start_date debe tener formato YYYY-MM-DD: %w", err)
	}
	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return "", "", fmt.Errorf("end_date debe tener formato YYYY-MM-DD: %w", err)
	}
	if end.Before(start) {
		return "", "", errors.New("end_date no puede ser anterior a start_date")
	}
	return start.Format("2006-01-02"), end.Format("2006-01-02"), nil
}

// parseYearMonth valida los parámetros year/month_num.
func parseYearMonth(yearParam, monthParam string) (int, int, error) {
	year, err := strconv.Atoi(yearParam)
	if err != nil {
		return 0, 0, fmt.Errorf("year debe ser un número: %w", err)
	}
	month, err := strconv.Atoi(monthParam)
	if err != nil {
		return 0, 0, fmt.Errorf("month_num debe ser un número: %w", err)
	}
	if year <= 2000 || month < 1 || month > 12 {
		return 0, 0, errors.New("year o month_num fuera de rango")
	}
	return year, month, nil
}
