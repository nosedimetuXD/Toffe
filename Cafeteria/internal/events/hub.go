package events

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
)

type Event struct {
	Type string      `json:"type"` // "sale_created", "inventory_updated", "task_created", etc.
	Data interface{} `json:"data"`
}

type Hub struct {
	mu      sync.Mutex
	clients map[chan Event]bool
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[chan Event]bool),
	}
}

func (h *Hub) Subscribe() chan Event {
	ch := make(chan Event, 10) // buffer para no bloquear si un cliente va lento
	h.mu.Lock()
	h.clients[ch] = true
	h.mu.Unlock()
	return ch
}

func (h *Hub) Unsubscribe(ch chan Event) {
	h.mu.Lock()
	delete(h.clients, ch)
	close(ch)
	h.mu.Unlock()
}

func (h *Hub) Publish(eventType string, data interface{}) {
	h.mu.Lock()
	defer h.mu.Unlock()

	event := Event{Type: eventType, Data: data}
	for ch := range h.clients {
		select {
		case ch <- event:
		default:
			// el cliente está lento y su buffer está lleno; se salta este evento
			// para no bloquear a los demás clientes
			log.Printf("evento %s descartado: el buffer del cliente está lleno", eventType)
		}
	}
}

// ToSSE serializa el evento al formato SSE. Devuelve error si el payload no es
// serializable, para que el llamador no envíe un evento corrupto en silencio.
func (e Event) ToSSE() ([]byte, error) {
	payload, err := json.Marshal(e.Data)
	if err != nil {
		return nil, fmt.Errorf("no se pudo serializar el evento %s: %w", e.Type, err)
	}
	return []byte("event: " + e.Type + "\ndata: " + string(payload) + "\n\n"), nil
}
