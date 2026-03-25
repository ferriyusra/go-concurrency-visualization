package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/ferri/cinema-simulator/internal/event"
	"github.com/ferri/cinema-simulator/internal/simulation"
)

// BookingRushSSE handles GET /api/simulate/booking-rush and streams
// simulation events as Server-Sent Events.
func BookingRushSSE(w http.ResponseWriter, r *http.Request) {
	// Parse optional query params (fall back to defaults).
	cfg := simulation.DefaultBookingRushConfig()
	if v := r.URL.Query().Get("rows"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 4 && n <= 20 {
			cfg.Rows = n
		}
	}
	if v := r.URL.Query().Get("cols"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 4 && n <= 20 {
			cfg.Cols = n
		}
	}
	if v := r.URL.Query().Get("users"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 1 && n <= 1000 {
			cfg.Users = n
		}
	}
	if v := r.URL.Query().Get("delayMs"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 1 && n <= 200 {
			cfg.DelayMs = n
		}
	}
	if v := r.URL.Query().Get("maxRetries"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 1 && n <= 10 {
			cfg.MaxRetries = n
		}
	}

	// SSE headers.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	events := make(chan event.Event, 256)

	// Run simulation in a goroutine.
	go func() {
		defer close(events)
		simulation.BookingRush(ctx, cfg, events)
	}()

	// Stream events to the client.
	for evt := range events {
		if ctx.Err() != nil {
			// Client disconnected — drain remaining events so the
			// simulation goroutine can finish and close the channel.
			for range events {
			}
			return
		}
		data, err := json.Marshal(evt)
		if err != nil {
			continue
		}
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}
}
