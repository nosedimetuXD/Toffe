package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

const bogotaTZ = "America/Bogota"

// timeFilter representa el rango temporal pedido por query string:
// ?period=today|week|month|prev_month|year|all, ?start_date=&end_date= o ?year=&month_num=
type timeFilter struct {
	period    string
	startDate string
	endDate   string
	year      int
	month     int
}

// parseTimeFilter lee los parámetros de rango temporal de la petición. Si se envía un
// rango start/end con formato inválido responde 400 y devuelve false; los años/meses
// fuera de rango se descartan y caen en el filtro por período.
func parseTimeFilter(w http.ResponseWriter, r *http.Request) (timeFilter, bool) {
	query := r.URL.Query()
	f := timeFilter{period: query.Get("period")}

	startRaw := strings.TrimSpace(query.Get("start_date"))
	endRaw := strings.TrimSpace(query.Get("end_date"))
	if startRaw != "" && endRaw != "" {
		start, end, ok := normalizeDateRange(startRaw, endRaw)
		if !ok {
			http.Error(w, "start_date y end_date deben tener formato YYYY-MM-DD", http.StatusBadRequest)
			return f, false
		}
		f.startDate, f.endDate = start, end
		return f, true
	}

	year, _ := strconv.Atoi(strings.TrimSpace(query.Get("year")))
	month, _ := strconv.Atoi(strings.TrimSpace(query.Get("month_num")))
	if year > 2000 && month >= 1 && month <= 12 {
		f.year, f.month = year, month
	}

	return f, true
}

// Condition devuelve la expresión booleana SQL del rango, donde prefix es el alias
// de la tabla ("" para consultas sin alias, "s." para sales, etc.). Devuelve "1=1"
// cuando el filtro abarca todo el histórico.
func (f timeFilter) Condition(prefix string) string {
	col := prefix + "created_at"

	if f.startDate != "" && f.endDate != "" {
		return fmt.Sprintf("%s >= '%s 00:00:00' AND %s <= '%s 23:59:59'", col, f.startDate, col, f.endDate)
	}
	if f.year > 0 && f.month > 0 {
		return fmt.Sprintf("EXTRACT(YEAR FROM %s) = %d AND EXTRACT(MONTH FROM %s) = %d", col, f.year, col, f.month)
	}

	switch f.period {
	case "today":
		return fmt.Sprintf("(%s AT TIME ZONE '%s')::date = (now() AT TIME ZONE '%s')::date", col, bogotaTZ, bogotaTZ)
	case "week":
		return fmt.Sprintf("%s >= (now() - INTERVAL '7 days')", col)
	case "month":
		return fmt.Sprintf("%s >= date_trunc('month', now())", col)
	case "prev_month":
		return fmt.Sprintf("%s >= date_trunc('month', now() - INTERVAL '1 month') AND %s < date_trunc('month', now())", col, col)
	case "year":
		return fmt.Sprintf("%s >= date_trunc('year', now())", col)
	default: // "all"
		return "1=1"
	}
}

// recentPeriodWhere devuelve la cláusula WHERE de los listados simples
// (?period=today|week|month), donde prefix es el alias de la tabla. Devuelve ""
// para cualquier otro valor, es decir, todo el histórico.
func recentPeriodWhere(prefix, period string) string {
	col := prefix + "created_at"

	switch period {
	case "today":
		return fmt.Sprintf("WHERE %s >= ((now() AT TIME ZONE '%s')::date AT TIME ZONE '%s')", col, bogotaTZ, bogotaTZ)
	case "week":
		return fmt.Sprintf("WHERE %s >= (now() - INTERVAL '7 days')", col)
	case "month":
		return fmt.Sprintf("WHERE %s >= (now() - INTERVAL '30 days')", col)
	default:
		return ""
	}
}

// WhereClause devuelve la cláusula WHERE completa del rango, o "" si abarca todo el histórico.
func (f timeFilter) WhereClause(prefix string) string {
	condition := f.Condition(prefix)
	if condition == "1=1" {
		return ""
	}
	return "WHERE " + condition
}
