package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/NosedimetuXD/cafeteria/internal/events"
)

// nonFlusherWriter es un ResponseWriter que no implementa http.Flusher.
type nonFlusherWriter struct {
	header http.Header
	status int
	body   []byte
}

func (w *nonFlusherWriter) Header() http.Header {
	if w.header == nil {
		w.header = http.Header{}
	}
	return w.header
}

func (w *nonFlusherWriter) Write(p []byte) (int, error) {
	w.body = append(w.body, p...)
	return len(p), nil
}

func (w *nonFlusherWriter) WriteHeader(status int) { w.status = status }

// flushRecorder envuelve un recorder y avisa por un canal cada vez que se hace Flush.
type flushRecorder struct {
	mu      sync.Mutex
	header  http.Header
	body    []byte
	flushed chan struct{}
}

func newFlushRecorder() *flushRecorder {
	return &flushRecorder{header: http.Header{}, flushed: make(chan struct{}, 10)}
}

func (w *flushRecorder) Header() http.Header { return w.header }

func (w *flushRecorder) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.body = append(w.body, p...)
	return len(p), nil
}

func (w *flushRecorder) WriteHeader(int) {}

func (w *flushRecorder) Flush() {
	select {
	case w.flushed <- struct{}{}:
	default:
	}
}

func (w *flushRecorder) String() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return string(w.body)
}

func TestEventStreamRequiresFlusher(t *testing.T) {
	handler := NewEventHandler(events.NewHub())
	w := &nonFlusherWriter{}

	handler.Stream(w, httptest.NewRequest(http.MethodGet, "/events", nil))

	if w.status != http.StatusInternalServerError {
		t.Errorf("código = %d, se esperaba 500", w.status)
	}
}

func TestEventStreamSetsSSEHeadersAndForwardsEvents(t *testing.T) {
	hub := events.NewHub()
	handler := NewEventHandler(hub)

	req := httptest.NewRequest(http.MethodGet, "/events", nil)
	ctx, cancel := context.WithCancel(req.Context())
	defer cancel()
	req = req.WithContext(ctx)

	w := newFlushRecorder()
	done := make(chan struct{})
	go func() {
		handler.Stream(w, req)
		close(done)
	}()

	// El handler se suscribe al arrancar; se publica hasta que confirme el primer flush.
	deadline := time.After(5 * time.Second)
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()

waitForEvent:
	for {
		hub.Publish("sale_created", map[string]int{"total": 12000})
		select {
		case <-w.flushed:
			break waitForEvent
		case <-ticker.C:
		case <-deadline:
			t.Fatal("el stream no entregó ningún evento")
		}
	}

	cancel()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Stream no terminó al cancelarse la petición")
	}

	if got := w.Header().Get("Content-Type"); got != "text/event-stream" {
		t.Errorf("Content-Type = %q, se esperaba \"text/event-stream\"", got)
	}
	if got := w.Header().Get("Cache-Control"); got != "no-cache" {
		t.Errorf("Cache-Control = %q, se esperaba \"no-cache\"", got)
	}
	if got := w.Header().Get("Connection"); got != "keep-alive" {
		t.Errorf("Connection = %q, se esperaba \"keep-alive\"", got)
	}
	if body := w.String(); !strings.Contains(body, "event: sale_created\ndata: {\"total\":12000}\n\n") {
		t.Errorf("cuerpo del stream = %q", body)
	}
}

func TestEventStreamStopsWhenClientDisconnects(t *testing.T) {
	handler := NewEventHandler(events.NewHub())

	req := httptest.NewRequest(http.MethodGet, "/events", nil)
	ctx, cancel := context.WithCancel(req.Context())
	req = req.WithContext(ctx)
	cancel() // el cliente ya cerró la conexión

	done := make(chan struct{})
	go func() {
		handler.Stream(newFlushRecorder(), req)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Stream debía retornar de inmediato con el contexto cancelado")
	}
}
