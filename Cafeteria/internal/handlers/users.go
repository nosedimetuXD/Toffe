package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/NosedimetuXD/cafeteria/internal/models"
)

type UserHandler struct {
	DB *pgxpool.Pool
}

func NewUserHandler(db *pgxpool.Pool) *UserHandler {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	execSchema(ctx, db, "users.avatar_url", `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''`)

	return &UserHandler{DB: db}
}

type createUserRequest struct {
	Username  string          `json:"username"`
	Password  string          `json:"password"`
	Role      models.UserRole `json:"role"`
	AvatarURL string          `json:"avatar_url"`
}

// POST /users
func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
		return
	}

	if req.Username == "" || req.Password == "" {
		http.Error(w, "usuario y contraseña son obligatorios", http.StatusBadRequest)
		return
	}
	if len(req.Password) < 8 {
		http.Error(w, "la contraseña debe tener al menos 8 caracteres", http.StatusBadRequest)
		return
	}

	switch req.Role {
	case models.RoleOwner, models.RoleAdmin, models.RoleEmployee:
		// rol válido, sigue
	default:
		http.Error(w, "rol inválido, debe ser owner, admin o employee", http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("error generando hash: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}

	createdBy, err := userIDFromContext(r.Context())
	if err != nil {
		log.Printf("no se pudo identificar al usuario creador: %v", err)
		http.Error(w, "no autenticado", http.StatusUnauthorized)
		return
	}

	var user models.User
	err = h.DB.QueryRow(r.Context(),
		`INSERT INTO users (username, password_hash, role, avatar_url, created_by)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, username, role, COALESCE(avatar_url, ''), created_by, created_at`,
		req.Username, string(hash), req.Role, req.AvatarURL, createdBy,
	).Scan(&user.ID, &user.Username, &user.Role, &user.AvatarURL, &user.CreatedBy, &user.CreatedAt)

	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			http.Error(w, "ese nombre de usuario ya existe", http.StatusConflict)
			return
		}
		log.Printf("error creando usuario: %v", err)
		http.Error(w, "error creando usuario", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, user)
}

type updateUserRequest struct {
	Username  string          `json:"username"`
	Password  string          `json:"password,omitempty"`
	Role      models.UserRole `json:"role"`
	AvatarURL string          `json:"avatar_url"`
}

// PUT /users/{id}
func (h *UserHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "id de usuario inválido", http.StatusBadRequest)
		return
	}

	var req updateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
		return
	}

	username := strings.TrimSpace(req.Username)
	if username == "" {
		http.Error(w, "el nombre de usuario es obligatorio", http.StatusBadRequest)
		return
	}

	switch req.Role {
	case models.RoleOwner, models.RoleAdmin, models.RoleEmployee:
		// rol válido
	default:
		http.Error(w, "rol inválido, debe ser owner, admin o employee", http.StatusBadRequest)
		return
	}

	primaryOwnerID, err := h.primaryOwnerID(r.Context())
	if err != nil {
		log.Printf("error consultando dueño principal: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}

	if id == primaryOwnerID && req.Role != models.RoleOwner {
		http.Error(w, "El rol del dueño principal está protegido y no se puede modificar", http.StatusForbidden)
		return
	}

	var user models.User
	if strings.TrimSpace(req.Password) != "" {
		if len(req.Password) < 8 {
			http.Error(w, "la contraseña debe tener al menos 8 caracteres", http.StatusBadRequest)
			return
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("error generando hash: %v", err)
			http.Error(w, "error interno", http.StatusInternalServerError)
			return
		}

		err = h.DB.QueryRow(r.Context(),
			`UPDATE users
			 SET username = $1, password_hash = $2, role = $3, avatar_url = $4
			 WHERE id = $5
			 RETURNING id, username, role, COALESCE(avatar_url, ''), created_by, created_at`,
			username, string(hash), req.Role, req.AvatarURL, id,
		).Scan(&user.ID, &user.Username, &user.Role, &user.AvatarURL, &user.CreatedBy, &user.CreatedAt)
	} else {
		err = h.DB.QueryRow(r.Context(),
			`UPDATE users
			 SET username = $1, role = $2, avatar_url = $3
			 WHERE id = $4
			 RETURNING id, username, role, COALESCE(avatar_url, ''), created_by, created_at`,
			username, req.Role, req.AvatarURL, id,
		).Scan(&user.ID, &user.Username, &user.Role, &user.AvatarURL, &user.CreatedBy, &user.CreatedAt)
	}

	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "usuario no encontrado", http.StatusNotFound)
		return
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			http.Error(w, "ese nombre de usuario ya está en uso", http.StatusConflict)
			return
		}
		log.Printf("error actualizando usuario: %v", err)
		http.Error(w, "error actualizando usuario", http.StatusInternalServerError)
		return
	}

	user.IsPrimary = (user.ID == primaryOwnerID)

	writeJSON(w, http.StatusOK, user)
}

// GET /users
func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	execSchema(r.Context(), h.DB, "users.avatar_url", `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''`)

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, username, role, COALESCE(avatar_url, ''), created_by, created_at,
		        (id = (SELECT id FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1)) AS is_primary
		 FROM users ORDER BY username`)
	if err != nil {
		log.Printf("error consultando usuarios: %v", err)
		http.Error(w, "error consultando usuarios", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &u.AvatarURL, &u.CreatedBy, &u.CreatedAt, &u.IsPrimary); err != nil {
			log.Printf("error leyendo usuarios: %v", err)
			http.Error(w, "error leyendo usuarios", http.StatusInternalServerError)
			return
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		log.Printf("error recorriendo usuarios: %v", err)
		http.Error(w, "error leyendo usuarios", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, users)
}

type updateSelfRequest struct {
	Username  string `json:"username"`
	Password  string `json:"password,omitempty"`
	AvatarURL string `json:"avatar_url,omitempty"`
}

// PUT /users/me - Permite a cualquier usuario autenticado actualizar su propio nombre, contraseña y avatar
func (h *UserHandler) UpdateSelf(w http.ResponseWriter, r *http.Request) {
	id, err := userIDFromContext(r.Context())
	if err != nil {
		log.Printf("no se pudo identificar al usuario autenticado: %v", err)
		http.Error(w, "no autenticado", http.StatusUnauthorized)
		return
	}

	var req updateSelfRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
		return
	}

	username := strings.TrimSpace(req.Username)
	if username == "" {
		http.Error(w, "el nombre de usuario es obligatorio", http.StatusBadRequest)
		return
	}

	var user models.User
	var queryErr error

	if strings.TrimSpace(req.Password) != "" {
		if len(req.Password) < 8 {
			http.Error(w, "la contraseña debe tener al menos 8 caracteres", http.StatusBadRequest)
			return
		}
		hash, hashErr := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if hashErr != nil {
			log.Printf("error generando hash: %v", hashErr)
			http.Error(w, "error interno", http.StatusInternalServerError)
			return
		}

		queryErr = h.DB.QueryRow(r.Context(),
			`UPDATE users SET username = $1, password_hash = $2, avatar_url = $3 WHERE id = $4 RETURNING id, username, role, COALESCE(avatar_url, ''), created_by, created_at`,
			username, string(hash), req.AvatarURL, id,
		).Scan(&user.ID, &user.Username, &user.Role, &user.AvatarURL, &user.CreatedBy, &user.CreatedAt)
	} else {
		queryErr = h.DB.QueryRow(r.Context(),
			`UPDATE users SET username = $1, avatar_url = $2 WHERE id = $3 RETURNING id, username, role, COALESCE(avatar_url, ''), created_by, created_at`,
			username, req.AvatarURL, id,
		).Scan(&user.ID, &user.Username, &user.Role, &user.AvatarURL, &user.CreatedBy, &user.CreatedAt)
	}

	if errors.Is(queryErr, pgx.ErrNoRows) {
		http.Error(w, "usuario no encontrado", http.StatusNotFound)
		return
	}
	if queryErr != nil {
		var pgErr *pgconn.PgError
		if errors.As(queryErr, &pgErr) && pgErr.Code == "23505" {
			http.Error(w, "ese nombre de usuario ya está en uso", http.StatusConflict)
			return
		}
		log.Printf("error actualizando perfil: %v", queryErr)
		http.Error(w, "error actualizando perfil", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, user)
}

// primaryOwnerID devuelve el dueño principal (el owner más antiguo). Devuelve
// uuid.Nil sin error cuando todavía no existe ningún owner.
func (h *UserHandler) primaryOwnerID(ctx context.Context) (uuid.UUID, error) {
	var id uuid.UUID
	err := h.DB.QueryRow(ctx, `SELECT id FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1`).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, nil
	}
	if err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

// DELETE /users/{id}
func (h *UserHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "id de usuario inválido", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	primaryOwnerID, err := h.primaryOwnerID(ctx)
	if err != nil {
		log.Printf("error consultando dueño principal: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}
	if primaryOwnerID == uuid.Nil {
		// Sin dueño principal no hay a quién reasignar el historial del usuario borrado
		http.Error(w, "no existe un dueño principal al que reasignar el historial", http.StatusConflict)
		return
	}

	if id == primaryOwnerID {
		http.Error(w, "El dueño principal está protegido permanentemente y no se puede eliminar", http.StatusForbidden)
		return
	}

	currentID, err := userIDFromContext(ctx)
	if err != nil {
		log.Printf("no se pudo identificar al usuario autenticado: %v", err)
		http.Error(w, "no autenticado", http.StatusUnauthorized)
		return
	}
	if id == currentID {
		http.Error(w, "No puedes eliminar tu propio usuario activo", http.StatusBadRequest)
		return
	}

	// Desvincular restricción NOT NULL de sales.sold_by antes de iniciar la transacción
	execSchema(ctx, h.DB, "sales.sold_by nullable", `ALTER TABLE sales ALTER COLUMN sold_by DROP NOT NULL`)
	execSchema(ctx, h.DB, "clave foránea sales.sold_by", `
		DO $$ 
		BEGIN 
			IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'sales_sold_by_fkey') THEN
				ALTER TABLE sales DROP CONSTRAINT sales_sold_by_fkey;
			END IF;
			ALTER TABLE sales ADD CONSTRAINT sales_sold_by_fkey FOREIGN KEY (sold_by) REFERENCES users(id) ON DELETE SET NULL;
		END $$;
	`)

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		log.Printf("error iniciando transacción de borrado de usuario: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	// El historial contable se preserva reasignándolo antes de borrar el usuario. Si
	// alguna reasignación falla la transacción queda abortada, así que se corta aquí.
	reassignments := []struct {
		desc string
		sql  string
		args []any
	}{
		{"ventas", `UPDATE sales SET sold_by = NULL WHERE sold_by = $1`, []any{id}},
		{"gastos", `UPDATE expenses SET registered_by = $2 WHERE registered_by = $1`, []any{id, primaryOwnerID}},
		{"tareas asignadas", `UPDATE tasks SET assigned_to = NULL WHERE assigned_to = $1`, []any{id}},
		{"tareas creadas", `UPDATE tasks SET created_by = $2 WHERE created_by = $1`, []any{id, primaryOwnerID}},
		{"usuarios creados", `UPDATE users SET created_by = $2 WHERE created_by = $1`, []any{id, primaryOwnerID}},
	}
	for _, step := range reassignments {
		if _, err := tx.Exec(ctx, step.sql, step.args...); err != nil {
			log.Printf("error reasignando %s del usuario %s: %v", step.desc, id, err)
			http.Error(w, fmt.Sprintf("no se pudo reasignar el historial de %s", step.desc), http.StatusInternalServerError)
			return
		}
	}

	tag, err := tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		log.Printf("error eliminando usuario: %v", err)
		http.Error(w, "no se pudo eliminar el usuario", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "usuario no encontrado", http.StatusNotFound)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("error confirmando eliminación de usuario: %v", err)
		http.Error(w, "error interno", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
