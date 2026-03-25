package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/ferri/cinema-simulator/internal/handler"
)

func main() {
	mux := http.NewServeMux()

	// SSE endpoint — the frontend connects here to stream real Go simulation events.
	mux.HandleFunc("GET /api/simulate/booking-rush", handler.BookingRushSSE)

	// Health check.
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ok")
	})

	addr := ":4000"
	log.Printf("Go simulation server listening on %s", addr)
	if err := http.ListenAndServe(addr, corsMiddleware(mux)); err != nil {
		log.Fatal(err)
	}
}

// corsMiddleware allows the Next.js dev server (port 3000) to call us.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
