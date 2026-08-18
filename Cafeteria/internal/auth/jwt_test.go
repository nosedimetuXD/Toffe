package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/NosedimetuXD/cafeteria/internal/models"
)

func TestGenerateAndParseToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "clave-de-prueba")

	userID := uuid.New()
	token, err := GenerateToken(userID, models.RoleOwner)
	if err != nil {
		t.Fatalf("GenerateToken devolvió error: %v", err)
	}
	if token == "" {
		t.Fatal("GenerateToken devolvió un token vacío")
	}

	claims, err := ParseToken(token)
	if err != nil {
		t.Fatalf("ParseToken devolvió error: %v", err)
	}
	if claims.UserID != userID {
		t.Errorf("UserID = %v, se esperaba %v", claims.UserID, userID)
	}
	if claims.Role != models.RoleOwner {
		t.Errorf("Role = %v, se esperaba %v", claims.Role, models.RoleOwner)
	}
	if claims.ExpiresAt == nil || claims.IssuedAt == nil {
		t.Fatal("se esperaban ExpiresAt e IssuedAt en el token")
	}
	if got := claims.ExpiresAt.Sub(claims.IssuedAt.Time); got != 12*time.Hour {
		t.Errorf("vigencia del token = %v, se esperaba 12h", got)
	}
}

func TestGenerateTokenPreservesEachRole(t *testing.T) {
	t.Setenv("JWT_SECRET", "clave-de-prueba")

	for _, role := range []models.UserRole{models.RoleOwner, models.RoleAdmin, models.RoleEmployee} {
		token, err := GenerateToken(uuid.New(), role)
		if err != nil {
			t.Fatalf("GenerateToken(%s) devolvió error: %v", role, err)
		}
		claims, err := ParseToken(token)
		if err != nil {
			t.Fatalf("ParseToken(%s) devolvió error: %v", role, err)
		}
		if claims.Role != role {
			t.Errorf("Role = %v, se esperaba %v", claims.Role, role)
		}
	}
}

func TestParseTokenRejectsOtherSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "secreto-original")
	token, err := GenerateToken(uuid.New(), models.RoleAdmin)
	if err != nil {
		t.Fatalf("GenerateToken devolvió error: %v", err)
	}

	t.Setenv("JWT_SECRET", "otro-secreto")
	if _, err := ParseToken(token); err == nil {
		t.Fatal("se esperaba error al validar un token firmado con otro secreto")
	}
}

func TestParseTokenRejectsMalformedToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "clave-de-prueba")

	for _, tokenString := range []string{"", "no-es-un-jwt", "a.b.c"} {
		claims, err := ParseToken(tokenString)
		if err == nil {
			t.Errorf("ParseToken(%q): se esperaba error", tokenString)
		}
		if claims != nil {
			t.Errorf("ParseToken(%q): se esperaban claims nil, se obtuvo %+v", tokenString, claims)
		}
	}
}

func TestParseTokenRejectsExpiredToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "clave-de-prueba")

	claims := Claims{
		UserID: uuid.New(),
		Role:   models.RoleEmployee,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-13 * time.Hour)),
		},
	}
	expired, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("clave-de-prueba"))
	if err != nil {
		t.Fatalf("no se pudo firmar el token de prueba: %v", err)
	}

	if _, err := ParseToken(expired); err == nil {
		t.Fatal("se esperaba error al validar un token expirado")
	}
}

func TestParseTokenRejectsUnsignedToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "clave-de-prueba")

	unsigned, err := jwt.NewWithClaims(jwt.SigningMethodNone, Claims{
		UserID: uuid.New(),
		Role:   models.RoleOwner,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}).SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("no se pudo firmar el token de prueba: %v", err)
	}

	if _, err := ParseToken(unsigned); err == nil {
		t.Fatal("se esperaba error al validar un token sin firma (alg=none)")
	}
}
