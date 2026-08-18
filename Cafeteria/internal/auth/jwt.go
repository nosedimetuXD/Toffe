package auth

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/NosedimetuXD/cafeteria/internal/models"
)

// MinSecretLength es la longitud mínima recomendada para JWT_SECRET.
const MinSecretLength = 32

var ErrMissingSecret = errors.New("JWT_SECRET no está configurado")

type Claims struct {
	UserID uuid.UUID       `json:"user_id"`
	Role   models.UserRole `json:"role"`
	jwt.RegisteredClaims
}

func secret() ([]byte, error) {
	value := os.Getenv("JWT_SECRET")
	if value == "" {
		return nil, ErrMissingSecret
	}
	return []byte(value), nil
}

// CheckSecret permite validar la configuración al arrancar el servidor, en vez
// de firmar tokens con una clave vacía que cualquiera podría reproducir.
func CheckSecret() error {
	value, err := secret()
	if err != nil {
		return err
	}
	if len(value) < MinSecretLength {
		return errors.New("JWT_SECRET es demasiado corto")
	}
	return nil
}

func GenerateToken(userID uuid.UUID, role models.UserRole) (string, error) {
	key, err := secret()
	if err != nil {
		return "", err
	}

	claims := Claims{
		UserID: userID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(12 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(key)
}

func ParseToken(tokenString string) (*Claims, error) {
	key, err := secret()
	if err != nil {
		return nil, err
	}

	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		return key, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, jwt.ErrTokenUnverifiable
	}
	return claims, nil
}
