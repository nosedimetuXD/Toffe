package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// RateLimit limita la cantidad de peticiones por IP dentro de una ventana de
// tiempo. Se usa sobre /login para frenar ataques de fuerza bruta.
func RateLimit(maxRequests int, window time.Duration) func(http.Handler) http.Handler {
	var (
		mu      sync.Mutex
		hits    = make(map[string][]time.Time)
		lastGC  time.Time
		gcEvery = window
	)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			now := time.Now()

			mu.Lock()
			if now.Sub(lastGC) > gcEvery {
				for key, times := range hits {
					if len(recent(times, now, window)) == 0 {
						delete(hits, key)
					}
				}
				lastGC = now
			}

			times := recent(hits[ip], now, window)
			if len(times) >= maxRequests {
				mu.Unlock()
				w.Header().Set("Retry-After", "60")
				http.Error(w, "demasiados intentos, espera unos minutos", http.StatusTooManyRequests)
				return
			}
			hits[ip] = append(times, now)
			mu.Unlock()

			next.ServeHTTP(w, r)
		})
	}
}

func recent(times []time.Time, now time.Time, window time.Duration) []time.Time {
	kept := make([]time.Time, 0, len(times))
	for _, t := range times {
		if now.Sub(t) < window {
			kept = append(kept, t)
		}
	}
	return kept
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
