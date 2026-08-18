package events

import (
	"encoding/json"
	"sync"
	"testing"
	"time"
)

func TestNewHubStartsWithoutClients(t *testing.T) {
	hub := NewHub()
	if hub.clients == nil {
		t.Fatal("NewHub debe inicializar el mapa de clientes")
	}
	if len(hub.clients) != 0 {
		t.Errorf("clientes iniciales = %d, se esperaba 0", len(hub.clients))
	}
}

func TestPublishDeliversToAllSubscribers(t *testing.T) {
	hub := NewHub()
	a := hub.Subscribe()
	b := hub.Subscribe()

	hub.Publish("sale_created", map[string]string{"id": "abc"})

	for name, ch := range map[string]chan Event{"a": a, "b": b} {
		select {
		case ev := <-ch:
			if ev.Type != "sale_created" {
				t.Errorf("%s: Type = %q, se esperaba \"sale_created\"", name, ev.Type)
			}
			data, ok := ev.Data.(map[string]string)
			if !ok || data["id"] != "abc" {
				t.Errorf("%s: Data = %#v, se esperaba map con id=abc", name, ev.Data)
			}
		case <-time.After(time.Second):
			t.Errorf("%s: no recibió el evento publicado", name)
		}
	}
}

func TestPublishWithoutSubscribersDoesNotPanic(t *testing.T) {
	hub := NewHub()
	hub.Publish("inventory_updated", nil)
}

func TestUnsubscribeClosesChannelAndStopsDelivery(t *testing.T) {
	hub := NewHub()
	ch := hub.Subscribe()
	hub.Unsubscribe(ch)

	if _, open := <-ch; open {
		t.Fatal("Unsubscribe debe cerrar el canal del cliente")
	}
	if len(hub.clients) != 0 {
		t.Errorf("clientes tras Unsubscribe = %d, se esperaba 0", len(hub.clients))
	}

	// Publicar tras darse de baja no debe escribir en el canal cerrado (pánico).
	hub.Publish("task_created", nil)
}

func TestPublishSkipsClientWithFullBuffer(t *testing.T) {
	hub := NewHub()
	slow := hub.Subscribe()
	fast := hub.Subscribe()

	// El buffer de cada cliente es de 10 eventos; el cliente lento no lee ninguno.
	for i := 0; i < 12; i++ {
		hub.Publish("task_created", i)
	}

	if got := len(slow); got != 10 {
		t.Errorf("eventos en buffer del cliente lento = %d, se esperaba 10", got)
	}

	// El cliente rápido sigue recibiendo aunque el lento esté saturado.
	for i := 0; i < 10; i++ {
		select {
		case <-fast:
		case <-time.After(time.Second):
			t.Fatalf("el cliente rápido dejó de recibir eventos en la posición %d", i)
		}
	}
}

func TestConcurrentSubscribePublishUnsubscribe(t *testing.T) {
	hub := NewHub()

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ch := hub.Subscribe()
			hub.Publish("sale_created", nil)
			<-ch
			hub.Unsubscribe(ch)
		}()
	}
	wg.Wait()

	if len(hub.clients) != 0 {
		t.Errorf("clientes al final = %d, se esperaba 0", len(hub.clients))
	}
}

func TestEventToSSE(t *testing.T) {
	ev := Event{Type: "comanda_updated", Data: map[string]any{"order_number": 7}}

	got := string(ev.ToSSE())
	want := "event: comanda_updated\ndata: {\"order_number\":7}\n\n"
	if got != want {
		t.Errorf("ToSSE() = %q, se esperaba %q", got, want)
	}
}

func TestEventToSSEWithNilData(t *testing.T) {
	if got := string(Event{Type: "ping"}.ToSSE()); got != "event: ping\ndata: null\n\n" {
		t.Errorf("ToSSE() = %q, se esperaba \"event: ping\\ndata: null\\n\\n\"", got)
	}
}

func TestEventToSSEWithUnserializableData(t *testing.T) {
	// json.Marshal falla con funciones: el payload queda vacío pero el frame se sigue emitiendo.
	got := string(Event{Type: "raro", Data: func() {}}.ToSSE())
	if got != "event: raro\ndata: \n\n" {
		t.Errorf("ToSSE() = %q, se esperaba un frame con data vacío", got)
	}
}

func TestEventJSONTags(t *testing.T) {
	raw, err := json.Marshal(Event{Type: "expense_created", Data: 1})
	if err != nil {
		t.Fatalf("json.Marshal devolvió error: %v", err)
	}
	if string(raw) != `{"type":"expense_created","data":1}` {
		t.Errorf("Event serializado = %s", raw)
	}
}
