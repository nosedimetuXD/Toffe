package handlers

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
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

	_, _ = db.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''`)

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
	if !decodeJSON(w, r, &req) {
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
		serverError(w, "error interno", err)
		return
	}

	var user models.User
	err = h.DB.QueryRow(r.Context(),
		`INSERT INTO users (username, password_hash, role, avatar_url, created_by)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, username, role, COALESCE(avatar_url, ''), created_by, created_at`,
		req.Username, string(hash), req.Role, req.AvatarURL, nullableUUID(userIDFromContext(r.Context())),
	).Scan(&user.ID, &user.Username, &user.Role, &user.AvatarURL, &user.CreatedBy, &user.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			http.Error(w, "ese nombre de usuario ya existe", http.StatusConflict)
			return
		}
		serverError(w, "error creando usuario", err)
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
	id, ok := parseIDParam(w, r, "id de usuario inválido")
	if !ok {
		return
	}

	var req updateUserRequest
	if !decodeJSON(w, r, &req) {
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

	var primaryOwnerID uuid.UUID
	_ = h.DB.QueryRow(r.Context(), `SELECT id FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1`).Scan(&primaryOwnerID)

	if id == primaryOwnerID && req.Role != models.RoleOwner {
		http.Error(w, "El rol del dueño principal está protegido y no se puede modificar", http.StatusForbidden)
		return
	}

	var user models.User
	var err error
	if strings.TrimSpace(req.Password) != "" {
		if len(req.Password) < 8 {
			http.Error(w, "la contraseña debe tener al menos 8 caracteres", http.StatusBadRequest)
			return
		}

		hash, hashErr := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if hashErr != nil {
			serverError(w, "error interno", hashErr)
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

	if err != nil {
		if isUniqueViolation(err) {
			http.Error(w, "ese nombre de usuario ya está en uso", http.StatusConflict)
			return
		}
		queryError(w, err, "usuario no encontrado", "error actualizando usuario")
		return
	}

	user.IsPrimary = (user.ID == primaryOwnerID)

	writeJSON(w, http.StatusOK, user)
}

// GET /users
func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	_, _ = h.DB.Exec(r.Context(), `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''`)

	rows, err := h.DB.Query(r.Context(),
		`SELECT id, username, role, COALESCE(avatar_url, ''), created_by, created_at,
		        (id = (SELECT id FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1)) AS is_primary
		 FROM users ORDER BY username`)
	if err != nil {
		serverError(w, "error consultando usuarios", err)
		return
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &u.AvatarURL, &u.CreatedBy, &u.CreatedAt, &u.IsPrimary); err != nil {
			serverError(w, "error leyendo usuarios", err)
			return
		}
		users = append(users, u)
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
	id := userIDFromContext(r.Context())
	if id == uuid.Nil {
		http.Error(w, "no autenticado", http.StatusUnauthorized)
		return
	}

	var req updateSelfRequest
	if !decodeJSON(w, r, &req) {
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
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			serverError(w, "error interno", err)
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

	if queryErr != nil {
		if isUniqueViolation(queryErr) {
			http.Error(w, "ese nombre de usuario ya está en uso", http.StatusConflict)
			return
		}
		queryError(w, queryErr, "usuario no encontrado", "error actualizando perfil")
		return
	}

	writeJSON(w, http.StatusOK, user)
}

// DELETE /users/{id}
func (h *UserHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseIDParam(w, r, "id de usuario inválido")
	if !ok {
		return
	}

	ctx := r.Context()
	var primaryOwnerID uuid.UUID
	_ = h.DB.QueryRow(ctx, `SELECT id FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1`).Scan(&primaryOwnerID)

	if id == primaryOwnerID {
		http.Error(w, "El dueño principal está protegido permanentemente y no se puede eliminar", http.StatusForbidden)
		return
	}

	if currentID := userIDFromContext(ctx); currentID != uuid.Nil && id == currentID {
		http.Error(w, "No puedes eliminar tu propio usuario activo", http.StatusBadRequest)
		return
	}

	// Desvincular restricción NOT NULL de sales.sold_by antes de iniciar la transacción
	_, _ = h.DB.Exec(ctx, `ALTER TABLE sales ALTER COLUMN sold_by DROP NOT NULL`)
	_, _ = h.DB.Exec(ctx, `
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
		serverError(w, "error interno", err)
		return
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `UPDATE sales SET sold_by = NULL WHERE sold_by = $1`, id); err != nil {
		log.Printf("aviso actualizando sales: %v", err)
		_, _ = tx.Exec(ctx, `UPDATE sales SET sold_by = $2 WHERE sold_by = $1`, id, primaryOwnerID)
	}
	if _, err := tx.Exec(ctx, `UPDATE expenses SET registered_by = $2 WHERE registered_by = $1`, id, primaryOwnerID); err != nil {
		log.Printf("aviso actualizando expenses: %v", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE tasks SET assigned_to = NULL WHERE assigned_to = $1`, id); err != nil {
		log.Printf("aviso actualizando tasks assigned_to: %v", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE tasks SET created_by = $2 WHERE created_by = $1`, id, primaryOwnerID); err != nil {
		log.Printf("aviso actualizando tasks created_by: %v", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET created_by = $2 WHERE created_by = $1`, id, primaryOwnerID); err != nil {
		log.Printf("aviso actualizando users created_by: %v", err)
	}

	tag, err := tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		log.Printf("error eliminando usuario: %v", err)
		http.Error(w, "no se pudo eliminar el usuario", http.StatusBadRequest)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "usuario no encontrado", http.StatusNotFound)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		serverError(w, "error interno", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
