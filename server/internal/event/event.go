package event

// Type identifies the kind of simulation event streamed to the frontend.
type Type string

const (
	StrategyStart   Type = "strategy_start"
	SeatLocking      Type = "seat_locking"
	SeatLockAcquired Type = "seat_lock_acquired"
	SeatBooked       Type = "seat_booked"
	SeatConflict    Type = "seat_conflict"    // detected: seat changed during sleep
	SeatOverwrite   Type = "seat_overwrite"   // silent: two goroutines both wrote (data corruption)
	SeatRetry       Type = "seat_retry"
	StrategyDone    Type = "strategy_complete"
	ComparisonDone  Type = "comparison_result"
	SimulationDone  Type = "simulation_done"
	SimulationError Type = "simulation_error"
)

// Event is a single simulation event sent over SSE.
type Event struct {
	Type      Type           `json:"type"`
	Timestamp int64          `json:"timestamp"` // ms since simulation start
	Data      map[string]any `json:"data"`
}

