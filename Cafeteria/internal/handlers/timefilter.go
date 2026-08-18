package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
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

// parseTimeFilter lee los parámetros de rango temporal de la petición. Las fechas
// que no cumplan el formato AAAA-MM-DD y los años/meses fuera de rango se descartan.
func parseTimeFilter(r *http.Request) timeFilter {
	f := timeFilter{period: r.URL.Query().Get("period")}

	start := parseDateParam(r.URL.Query().Get("start_date"))
	end := parseDateParam(r.URL.Query().Get("end_date"))
	if start != "" && end != "" {
		f.startDate, f.endDate = start, end
		return f
	}

	year, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("year")))
	month, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("month_num")))
	if year > 2000 && month >= 1 && month <= 12 {
		f.year, f.month = year, month
	}

	return f
}

// parseDateParam valida una fecha AAAA-MM-DD y devuelve "" si no lo es.
func parseDateParam(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	if _, err := time.Parse(time.DateOnly, value); err != nil {
		return ""
	}
	return value
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

// WhereClause devuelve la cláusula WHERE completa del rango, o "" si abarca todo el histórico.
func (f timeFilter) WhereClause(prefix string) string {
	condition := f.Condition(prefix)
	if condition == "1=1" {
		return ""
	}
	return "WHERE " + condition
}
