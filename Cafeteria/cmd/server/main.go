package main

import (
	"context"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/cors"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"

	"github.com/NosedimetuXD/cafeteria/internal/db"
	"github.com/NosedimetuXD/cafeteria/internal/events"
	"github.com/NosedimetuXD/cafeteria/internal/handlers"
	custommw "github.com/NosedimetuXD/cafeteria/internal/middleware"
	"github.com/NosedimetuXD/cafeteria/internal/models"
)

func main() {

	if err := godotenv.Load(); err != nil {
		log.Println("no se encontró .env, usando variables de entorno del sistema")
	}

	ctx := context.Background()

	pool, err := db.Connect(ctx)
	if err != nil {
		log.Fatalf("no se pudo conectar a la base de datos: %v", err)
	}
	defer pool.Close()

	hub := events.NewHub()

	r := chi.NewRouter()
	r.Use(middleware.Logger)

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "Authorization"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		if _, err := w.Write([]byte("ok")); err != nil {
			log.Printf("error escribiendo respuesta de /health: %v", err)
		}
	})

	authHandler := handlers.NewAuthHandler(pool)
	r.Post("/login", authHandler.Login)

	productHandler := handlers.NewProductHandler(pool)
	ingredientHandler := handlers.NewIngredientHandler(pool, hub)
	saleHandler := handlers.NewSaleHandler(pool, hub)
	taskHandler := handlers.NewTaskHandler(pool, hub)
	recipeHandler := handlers.NewRecipeHandler(pool)
	eventHandler := handlers.NewEventHandler(hub)
	userHandler := handlers.NewUserHandler(pool)
	comandaHandler := handlers.NewComandaHandler(pool, hub)
	accountingHandler := handlers.NewAccountingHandler(pool, hub)

	wasteHandler := handlers.NewWasteHandler(pool, hub)

	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireAuthSSE)
		r.Get("/events", eventHandler.Stream)
	})

	// Lectura & Operación común: cualquier usuario logueado, sin importar el rol
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireAuth)
		r.Get("/products", productHandler.List)
		r.Get("/products/{id}", productHandler.Get)
		r.Get("/ingredients", ingredientHandler.List)
		r.Get("/ingredients/{id}", ingredientHandler.Get)
		r.Get("/products/{id}/recipe", recipeHandler.Get)
		r.Get("/users", userHandler.List)
		r.Put("/users/me", userHandler.UpdateSelf)
		r.Get("/waste", wasteHandler.List)
		r.Post("/waste", wasteHandler.Create)
	})

	// Crear/editar/borrar productos y recetas: solo owner y admin
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireAuth)
		r.Use(custommw.RequireRole(models.RoleOwner, models.RoleAdmin))
		r.Post("/products", productHandler.Create)
		r.Put("/products/{id}", productHandler.Update)
		r.Delete("/products/{id}", productHandler.Delete)
		r.Put("/products/{id}/recipe", recipeHandler.Set)
	})

	// Gestión de usuarios: solo el Dueño (Owner)
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireAuth)
		r.Use(custommw.RequireRole(models.RoleOwner))
		r.Post("/users", userHandler.Create)
		r.Put("/users/{id}", userHandler.Update)
		r.Delete("/users/{id}", userHandler.Delete)
	})

	// Modificar inventario directamente: solo dueño y admin (empleados ya NO pueden editar inventario libremente)
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireAuth)
		r.Use(custommw.RequireRole(models.RoleOwner, models.RoleAdmin))
		r.Post("/ingredients", ingredientHandler.Create)
		r.Put("/ingredients/{id}", ingredientHandler.Update)
		r.Delete("/ingredients/{id}", ingredientHandler.Delete)
	})

	// Comandas: cualquier usuario logueado puede verlas y actualizar su estado
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireAuth)
		r.Get("/comandas", comandaHandler.List)
		r.Patch("/comandas/{id}/status", comandaHandler.UpdateStatus)
	})

	// Ver tareas y cambiar su propio estado: cualquier usuario logueado
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireAuth)
		r.Get("/tasks", taskHandler.List)
		r.Patch("/tasks/{id}/status", taskHandler.UpdateStatus)
	})

	// Crear, editar y borrar tareas: solo owner y admin
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireAuth)
		r.Use(custommw.RequireRole(models.RoleOwner, models.RoleAdmin))
		r.Post("/tasks", taskHandler.Create)
		r.Put("/tasks/{id}", taskHandler.Update)
		r.Delete("/tasks/{id}", taskHandler.Delete)
	})

	// Ventas: cualquier rol puede vender
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireAuth)
		r.Use(custommw.RequireRole(models.RoleOwner, models.RoleAdmin, models.RoleEmployee))
		r.Get("/sales", saleHandler.List)
		r.Get("/sales/{id}", saleHandler.Get)
		r.Post("/sales", saleHandler.Create)
	})

	// Contabilidad y Gastos: solo Owner y Admin
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireAuth)
		r.Use(custommw.RequireRole(models.RoleOwner, models.RoleAdmin))
		r.Get("/accounting/summary", accountingHandler.GetSummary)
		r.Get("/expenses", accountingHandler.ListExpenses)
		r.Post("/expenses", accountingHandler.CreateExpense)
	})

	log.Println("servidor corriendo en :8080")
	if err := http.ListenAndServe(":8080", r); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("el servidor se detuvo: %v", err)
	}
}
