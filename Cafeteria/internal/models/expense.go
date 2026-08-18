package models

import (
	"time"

	"github.com/google/uuid"
)

type Expense struct {
	ID             uuid.UUID  `json:"id"`
	Description    string     `json:"description"`
	Amount         float64    `json:"amount"`
	Category       string     `json:"category"`
	PaymentMethod  string     `json:"payment_method"`
	RegisteredBy   uuid.UUID  `json:"registered_by"`
	RegistererName string     `json:"registerer_name,omitempty"`
	IngredientID   *uuid.UUID `json:"ingredient_id,omitempty"`
	IngredientName string     `json:"ingredient_name,omitempty"`
	QuantityAdded  float64    `json:"quantity_added,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

type CustomerStat struct {
	CustomerName string  `json:"customer_name"`
	TotalSpent   float64 `json:"total_spent"`
	OrdersCount  int     `json:"orders_count"`
}

type TopSellerStat struct {
	Username    string  `json:"username"`
	Role        string  `json:"role"`
	TotalAmount float64 `json:"total_amount"`
	SalesCount  int     `json:"sales_count"`
}

type TopProductStat struct {
	ProductName string  `json:"product_name"`
	TotalQty    int     `json:"total_qty"`
	TotalAmount float64 `json:"total_amount"`
}

type Income struct {
	ID             uuid.UUID `json:"id"`
	Description    string    `json:"description"`
	Amount         float64   `json:"amount"`
	Category       string    `json:"category"`
	PaymentMethod  string    `json:"payment_method"`
	RegisteredBy   uuid.UUID `json:"registered_by"`
	RegistererName string    `json:"registerer_name,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

type MonthlyStats struct {
	MonthlyIncome      float64          `json:"monthly_income"`
	MonthlyExpenses    float64          `json:"monthly_expenses"`
	NetProfit          float64          `json:"net_profit"`
	AvgPrepTimeMinutes float64          `json:"avg_prep_time_minutes"`
	TopSeller          *TopSellerStat   `json:"top_seller"`
	TopProduct         *TopProductStat  `json:"top_product"`
	TopProducts        []TopProductStat `json:"top_products"`
	TopCustomers       []CustomerStat   `json:"top_customers"`
}

type AccountingSummary struct {
	TotalIncome           float64            `json:"total_income"`
	ManualIncome          float64            `json:"manual_income"`
	ManualIncomeCount     int                `json:"manual_income_count"`
	TotalExpenses         float64            `json:"total_expenses"`
	NetBalance            float64            `json:"net_balance"`
	IncomeByPaymentMethod map[string]float64 `json:"income_by_payment_method"`
	ExpensesByCategory    map[string]float64 `json:"expenses_by_category"`
	SalesCount            int                `json:"sales_count"`
	ExpensesCount         int                `json:"expenses_count"`
	MonthlyStats          *MonthlyStats      `json:"monthly_stats,omitempty"`
}
