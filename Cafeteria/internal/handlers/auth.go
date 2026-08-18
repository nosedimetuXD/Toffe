package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/NosedimetuXD/cafeteria/internal/auth"
	"github.com/NosedimetuXD/cafeteria/internal/models"
)

type AuthHandler struct {
	DB *pgxpool.Pool
}

func NewAuthHandler(db *pgxpool.Pool) *AuthHandler {
	return &AuthHandler{DB: db}
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token string      `json:"token"`
	User  models.User `json:"user"`
}

// POST /login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
		return
	}

	execSchema(r.Context(), h.DB, "users.avatar_url", `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''`)

	var user models.User
	var passwordHash string
	err := h.DB.QueryRow(r.Context(),
		`SELECT id, username, role, COALESCE(avatar_url, ''), password_hash, created_at
		 FROM users WHERE username = $1`, req.Username,
	).Scan(&user.ID, &user.Username, &user.Role, &user.AvatarURL, &passwordHash, &user.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "usuario o contraseña incorrectos", http.StatusUnauthorized)
		return
	}
	if err != nil {
		log.Printf("error consultando usuario: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		http.Error(w, "usuario o contraseña incorrectos", http.StatusUnauthorized)
		return
	}

	token, err := auth.GenerateToken(user.ID, user.Role)
	if err != nil {
		log.Printf("error generando token: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, loginResponse{Token: token, User: user})
}
