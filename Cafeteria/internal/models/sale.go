package models

import (
	"time"

	"github.com/google/uuid"
)

type SaleItem struct {
	ProductID   uuid.UUID `json:"product_id"`
	ProductName string    `json:"product_name,omitempty"`
	Quantity    int       `json:"quantity"`
	UnitPrice   float64   `json:"unit_price"`
}

type Sale struct {
	ID             uuid.UUID  `json:"id"`
	SoldBy         uuid.UUID  `json:"sold_by"`
	SoldByUsername string     `json:"sold_by_username,omitempty"`
	CustomerName   string     `json:"customer_name"`
	PaymentMethod  string     `json:"payment_method"`
	CashAmount     float64    `json:"cash_amount"`
	TransferAmount float64    `json:"transfer_amount"`
	BankDetails    string     `json:"bank_details,omitempty"`
	Status         string     `json:"status"`
	Total          float64    `json:"total"`
	CreatedAt      time.Time  `json:"created_at"`
	Items          []SaleItem `json:"items,omitempty"`
}
