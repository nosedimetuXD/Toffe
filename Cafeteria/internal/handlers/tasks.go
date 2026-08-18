package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/NosedimetuXD/cafeteria/internal/events"
	custommw "github.com/NosedimetuXD/cafeteria/internal/middleware"
	"github.com/NosedimetuXD/cafeteria/internal/models"
)

type TaskHandler struct {
	DB  *pgxpool.Pool
	Hub *events.Hub
}

func NewTaskHandler(db *pgxpool.Pool, hub *events.Hub) *TaskHandler {
	return &TaskHandler{DB: db, Hub: hub}
}

// GET /tasks — cualquier usuario logueado ve todas las tareas
func (h *TaskHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.DB.Query(r.Context(),
		`SELECT t.id, t.title, COALESCE(t.description, ''), t.assigned_to, COALESCE(ua.username, ''), 
		        t.created_by, COALESCE(uc.username, 'Admin'), t.status, t.due_date, t.created_at, t.updated_at
		 FROM tasks t
		 LEFT JOIN users ua ON t.assigned_to = ua.id
		 LEFT JOIN users uc ON t.created_by = uc.id
		 ORDER BY t.due_date NULLS LAST, t.created_at DESC`)
	if err != nil {
		log.Printf("error consultando tareas: %v", err)
		http.Error(w, "error consultando tareas", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tasks []models.Task
	for rows.Next() {
		var t models.Task
		if err := rows.Scan(&t.ID, &t.Title, &t.Description, &t.AssignedTo, &t.AssignedToName, &t.CreatedBy, &t.CreatedByName, &t.Status, &t.DueDate, &t.CreatedAt, &t.UpdatedAt); err != nil {
			log.Printf("error leyendo tareas: %v", err)
			http.Error(w, "error leyendo tareas", http.StatusInternalServerError)
			return
		}
		tasks = append(tasks, t)
	}
	if err := rows.Err(); err != nil {
		log.Printf("error recorriendo tareas: %v", err)
		http.Error(w, "error leyendo tareas", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, tasks)
}

// POST /tasks — solo owner y admin
type createTaskRequest struct {
	Title       string     `json:"title"`
	Description string     `json:"description"`
	AssignedTo  *uuid.UUID `json:"assigned_to"`
	DueDate     *string    `json:"due_date"` // formato "2026-08-20"
}

func (h *TaskHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
		return
	}
	if req.Title == "" {
		http.Error(w, "el título es obligatorio", http.StatusBadRequest)
		return
	}

	createdBy, err := userIDFromContext(r.Context())
	if err != nil {
		log.Printf("no se pudo identificar al creador de la tarea: %v", err)
		http.Error(w, "no autenticado", http.StatusUnauthorized)
		return
	}

	var t models.Task
	err = h.DB.QueryRow(r.Context(),
		`INSERT INTO tasks (title, description, assigned_to, created_by, due_date)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, title, description, assigned_to, created_by, status, due_date, created_at, updated_at`,
		req.Title, req.Description, req.AssignedTo, createdBy, req.DueDate,
	).Scan(&t.ID, &t.Title, &t.Description, &t.AssignedTo, &t.CreatedBy, &t.Status, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		log.Printf("error creando tarea: %v", err)
		http.Error(w, "error creando tarea", http.StatusInternalServerError)
		return
	}

	h.Hub.Publish("task created", t)

	writeJSON(w, http.StatusCreated, t)
}

// PUT /tasks/{id} — editar título/descripción/asignación: solo owner y admin
type updateTaskRequest struct {
	Title       string     `json:"title"`
	Description string     `json:"description"`
	AssignedTo  *uuid.UUID `json:"assigned_to"`
	DueDate     *string    `json:"due_date"`
}

func (h *TaskHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}

	var req updateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
		return
	}
	if req.Title == "" {
		http.Error(w, "el título es obligatorio", http.StatusBadRequest)
		return
	}

	var t models.Task
	err = h.DB.QueryRow(r.Context(),
		`UPDATE tasks
		 SET title = $1, description = $2, assigned_to = $3, due_date = $4
		 WHERE id = $5
		 RETURNING id, title, description, assigned_to, created_by, status, due_date, created_at, updated_at`,
		req.Title, req.Description, req.AssignedTo, req.DueDate, id,
	).Scan(&t.ID, &t.Title, &t.Description, &t.AssignedTo, &t.CreatedBy, &t.Status, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "tarea no encontrada", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("error actualizando tarea: %v", err)
		http.Error(w, "error actualizando tarea", http.StatusInternalServerError)
		return
	}

	h.Hub.Publish("task status updated", t)

	writeJSON(w, http.StatusOK, t)
}

// PATCH /tasks/{id}/status — cambio de estado con validación de asignado
type updateStatusRequest struct {
	Status models.TaskStatus `json:"status"`
}

func (h *TaskHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}

	var req updateStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "cuerpo inválido", http.StatusBadRequest)
		return
	}

	statusStr := string(req.Status)
	if statusStr == "completed" {
		req.Status = models.TaskDone
	}

	switch req.Status {
	case models.TaskPending, models.TaskInProgress, models.TaskDone:
		// válido
	default:
		http.Error(w, "estado inválido", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	var currentTask models.Task
	err = h.DB.QueryRow(ctx, `SELECT id, assigned_to, created_by, status FROM tasks WHERE id = $1`, id).Scan(&currentTask.ID, &currentTask.AssignedTo, &currentTask.CreatedBy, &currentTask.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "tarea no encontrada", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("error consultando la tarea %s: %v", id, err)
		http.Error(w, "error consultando tarea", http.StatusInternalServerError)
		return
	}

	roleVal := ctx.Value(custommw.ContextRole)

	currentUserID, err := userIDFromContext(ctx)
	if err != nil {
		log.Printf("no se pudo identificar al usuario autenticado: %v", err)
		http.Error(w, "no autenticado", http.StatusUnauthorized)
		return
	}

	userRole := ""
	if roleVal != nil {
		userRole = fmt.Sprintf("%v", roleVal)
	}

	if currentTask.AssignedTo != nil && *currentTask.AssignedTo != currentUserID && userRole != "owner" && userRole != "admin" && currentTask.CreatedBy != currentUserID {
		http.Error(w, "Solo el usuario asignado o un administrador pueden modificar el estado de esta tarea", http.StatusForbidden)
		return
	}

	var t models.Task
	err = h.DB.QueryRow(ctx,
		`UPDATE tasks SET status = $1 WHERE id = $2
		 RETURNING id, title, description, assigned_to, created_by, status, due_date, created_at, updated_at`,
		req.Status, id,
	).Scan(&t.ID, &t.Title, &t.Description, &t.AssignedTo, &t.CreatedBy, &t.Status, &t.DueDate, &t.CreatedAt, &t.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "tarea no encontrada", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("error actualizando estado: %v", err)
		http.Error(w, "error actualizando estado", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, t)
}

// DELETE /tasks/{id} — solo owner y admin
func (h *TaskHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "id inválido", http.StatusBadRequest)
		return
	}

	tag, err := h.DB.Exec(r.Context(), `DELETE FROM tasks WHERE id = $1`, id)
	if err != nil {
		log.Printf("error borrando tarea: %v", err)
		http.Error(w, "error borrando tarea", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "tarea no encontrada", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
