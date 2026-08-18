package db

import (
	"context"
	"testing"
)

func TestConnectFailsWithMalformedURL(t *testing.T) {
	t.Setenv("DB_URL", "esto-no-es-una-url-de-postgres")

	pool, err := Connect(context.Background())
	if err == nil {
		if pool != nil {
			pool.Close()
		}
		t.Fatal("se esperaba error al conectar con un DB_URL malformado")
	}
	if pool != nil {
		t.Error("se esperaba un pool nil cuando la conexión falla")
	}
}

func TestConnectFailsWhenServerUnreachable(t *testing.T) {
	// Puerto reservado por la IANA como "descarte": no hay Postgres escuchando ahí.
	t.Setenv("DB_URL", "postgres://usuario:clave@127.0.0.1:9/inexistente?sslmode=disable&connect_timeout=2")

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // contexto ya cancelado: Ping debe fallar sin esperar la red

	pool, err := Connect(ctx)
	if err == nil {
		if pool != nil {
			pool.Close()
		}
		t.Fatal("se esperaba error al hacer Ping contra un servidor inalcanzable")
	}
	if pool != nil {
		t.Error("se esperaba un pool nil cuando el Ping falla")
	}
}
