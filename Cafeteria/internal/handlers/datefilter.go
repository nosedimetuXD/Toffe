package handlers

import "time"

const dateLayout = "2006-01-02"

// normalizeDate acepta solo fechas con formato YYYY-MM-DD y devuelve la fecha
// re-serializada, de forma que el valor nunca contenga texto arbitrario del
// cliente antes de usarse dentro de una consulta SQL.
func normalizeDate(value string) (string, bool) {
	t, err := time.Parse(dateLayout, value)
	if err != nil {
		return "", false
	}
	return t.Format(dateLayout), true
}

// normalizeDateRange valida un rango start/end completo.
func normalizeDateRange(startDate, endDate string) (string, string, bool) {
	start, okStart := normalizeDate(startDate)
	end, okEnd := normalizeDate(endDate)
	if !okStart || !okEnd {
		return "", "", false
	}
	return start, end, true
}
