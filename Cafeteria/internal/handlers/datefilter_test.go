package handlers

import "testing"

func TestNormalizeDate(t *testing.T) {
	cases := []struct {
		input string
		want  string
		ok    bool
	}{
		{"2026-08-18", "2026-08-18", true},
		{"2026-8-18", "", false},
		{"", "", false},
		{"2026-08-18' OR '1'='1", "", false},
		{"2026-08-18 00:00:00'; DROP TABLE sales; --", "", false},
		{"2026-13-01", "", false},
	}

	for _, c := range cases {
		got, ok := normalizeDate(c.input)
		if ok != c.ok || got != c.want {
			t.Errorf("normalizeDate(%q) = (%q, %v), se esperaba (%q, %v)", c.input, got, ok, c.want, c.ok)
		}
	}
}

func TestNormalizeDateRange(t *testing.T) {
	if _, _, ok := normalizeDateRange("2026-08-01", "2026-08-18"); !ok {
		t.Error("un rango válido debería aceptarse")
	}
	if _, _, ok := normalizeDateRange("2026-08-01", "hoy"); ok {
		t.Error("un rango con fecha inválida debería rechazarse")
	}
}
