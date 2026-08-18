package handlers

import (
	"log"
	"net/http"

	"github.com/NosedimetuXD/cafeteria/internal/events"
)

type EventHandler struct {
	Hub *events.Hub
}

func NewEventHandler(hub *events.Hub) *EventHandler {
	return &EventHandler{Hub: hub}
}

// GET /events
func (h *EventHandler) Stream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming no soportado", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := h.Hub.Subscribe()
	defer h.Hub.Unsubscribe(ch)

	for {
		select {
		case event := <-ch:
			payload, err := event.ToSSE()
			if err != nil {
				// un evento corrupto no debe cortar el stream del resto
				log.Printf("error serializando evento SSE: %v", err)
				continue
			}
			if _, err := w.Write(payload); err != nil {
				log.Printf("error escribiendo evento SSE, se cierra el stream: %v", err)
				return
			}
			flusher.Flush()
		case <-r.Context().Done():
			// el cliente cerró la conexión (cerró la pestaña, perdió señal, etc.)
			return
		}
	}
}
