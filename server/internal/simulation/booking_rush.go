package simulation

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ferri/cinema-simulator/internal/event"
)

// BookingRushConfig holds tunable parameters for the simulation.
type BookingRushConfig struct {
	Rows       int `json:"rows"`
	Cols       int `json:"cols"`
	Users      int `json:"users"`
	DelayMs    int `json:"delayMs"`
	MaxRetries int `json:"maxRetries"`
}

// DefaultBookingRushConfig returns sensible defaults.
func DefaultBookingRushConfig() BookingRushConfig {
	return BookingRushConfig{
		Rows:       8,
		Cols:       12,
		Users:      150,
		DelayMs:    10,
		MaxRetries: 3,
	}
}

// Validate checks that the config has sane values.
func (c BookingRushConfig) Validate() error {
	if c.Rows < 1 || c.Rows > 100 {
		return fmt.Errorf("rows must be between 1 and 100, got %d", c.Rows)
	}
	if c.Cols < 1 || c.Cols > 100 {
		return fmt.Errorf("cols must be between 1 and 100, got %d", c.Cols)
	}
	if c.Users < 1 {
		return fmt.Errorf("users must be at least 1, got %d", c.Users)
	}
	if c.DelayMs < 0 {
		return fmt.Errorf("delayMs must be non-negative, got %d", c.DelayMs)
	}
	if c.MaxRetries < 1 {
		return fmt.Errorf("maxRetries must be at least 1, got %d", c.MaxRetries)
	}
	return nil
}

// BookingRush runs all three strategies sequentially, each using real
// goroutines. Events are streamed to the provided channel.
func BookingRush(ctx context.Context, cfg BookingRushConfig, events chan<- event.Event) {
	start := time.Now()

	emit := func(t event.Type, data map[string]any) {
		ms := time.Since(start).Milliseconds()
		data["_ms"] = ms
		evt := event.Event{
			Type:      t,
			Timestamp: ms,
			Data:      data,
		}
		select {
		case events <- evt:
		case <-ctx.Done():
		}
	}

	if err := cfg.Validate(); err != nil {
		emit(event.SimulationError, map[string]any{"error": err.Error()})
		return
	}

	// --- Strategy 1: No Lock (UNSAFE) ---
	runNoLock(ctx, cfg, emit)

	// --- Strategy 2: Mutex (SAFE, slow) ---
	runMutex(ctx, cfg, emit)

	// --- Strategy 3: Optimistic / CAS (SAFE, fast) ---
	runOptimistic(ctx, cfg, emit)

	emit(event.ComparisonDone, map[string]any{})
	emit(event.SimulationDone, map[string]any{
		"totalElapsedMs": time.Since(start).Milliseconds(),
	})
}

// sleepCtx sleeps for d or returns false early if ctx is cancelled.
func sleepCtx(ctx context.Context, d time.Duration) bool {
	select {
	case <-time.After(d):
		return true
	case <-ctx.Done():
		return false
	}
}

// ---------------------------------------------------------------------------
// Strategy 1: No Lock — real race conditions from real goroutines
// ---------------------------------------------------------------------------

func runNoLock(ctx context.Context, cfg BookingRushConfig, emit func(event.Type, map[string]any)) {
	seats := makeGrid[int](cfg.Rows, cfg.Cols) // shared, NO protection
	// owners tracks who FIRST wrote each seat, using CAS so only the
	// initial writer is recorded. This lets the post-check detect when
	// the final seat value differs from the first claimant — proof of
	// a silent overwrite.
	owners := makeAtomicGrid(cfg.Rows, cfg.Cols)

	var booked, conflicts, overwrites atomic.Int64
	start := time.Now()

	emit(event.StrategyStart, map[string]any{"strategy": "no-lock"})

	baseDelay := time.Duration(cfg.DelayMs) * time.Millisecond

	var wg sync.WaitGroup
	for i := 0; i < cfg.Users; i++ {
		wg.Add(1)
		go func(userID int) {
			defer wg.Done()
			if ctx.Err() != nil {
				return
			}

			rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(userID)))
			row := rng.Intn(cfg.Rows)
			col := rng.Intn(cfg.Cols)

			// Jitter: ±50% of baseDelay so goroutines wake at staggered times.
			// Without jitter, all goroutines sleep for the exact same duration,
			// synchronizing their wakeups and shrinking the race window to
			// near-zero — hiding the very bugs this demo exists to show.
			jitter := time.Duration(rng.Int63n(int64(baseDelay)))
			delay := baseDelay/2 + jitter

			// Step 1: Read seat — no lock!
			if seats[row][col] == 0 {
				// Step 2: Simulate work (DB call, network, etc.)
				// During this sleep, other goroutines can also read the same
				// seat as "available" and proceed to write.
				if !sleepCtx(ctx, delay) {
					return
				}

				// Step 3: Check again — catches SOME conflicts but not all.
				if seats[row][col] != 0 {
					// Detected conflict: someone wrote while we slept.
					conflicts.Add(1)
					emit(event.SeatConflict, map[string]any{
						"row": row, "col": col, "user": userID, "strategy": "no-lock",
					})
					return
				}

				// Step 4: Write — no lock! This is the dangerous part.
				// Multiple goroutines can pass the check above and ALL write.
				// The last writer silently overwrites previous bookings.
				prev := seats[row][col]
				seats[row][col] = userID
				// CAS: only record the FIRST writer so the post-check can
				// detect when a later goroutine silently overwrites.
				owners[row][col].CompareAndSwap(0, int64(userID))

				if prev != 0 && prev != userID {
					// SILENT OVERWRITE: another goroutine wrote between our
					// check and our write. The previous booking is lost.
					// This is the truly dangerous race — it looks correct
					// but data is corrupt.
					overwrites.Add(1)
					emit(event.SeatOverwrite, map[string]any{
						"row": row, "col": col, "user": userID,
						"prevUser": prev, "strategy": "no-lock",
					})
				} else {
					booked.Add(1)
					emit(event.SeatBooked, map[string]any{
						"row": row, "col": col, "user": userID, "strategy": "no-lock",
					})
				}
			}
		}(i + 1)
	}

	wg.Wait()

	// Post-check: count how many seats have a DIFFERENT owner than who
	// "thinks" they booked it. This catches overwrites the goroutines
	// themselves can't detect. Note: owners is also racy, so this count
	// is approximate.
	var lostBookings int64
	for r := 0; r < cfg.Rows; r++ {
		for c := 0; c < cfg.Cols; c++ {
			owner := owners[r][c].Load()
			if owner != 0 && int64(seats[r][c]) != owner {
				lostBookings++
			}
		}
	}

	emit(event.StrategyDone, map[string]any{
		"strategy":     "no-lock",
		"booked":       booked.Load(),
		"conflicts":    conflicts.Load(),
		"overwrites":   overwrites.Load(),
		"lostBookings": lostBookings,
		"retries":      0,
		"elapsedMs":    time.Since(start).Milliseconds(),
	})
}

// ---------------------------------------------------------------------------
// Strategy 2: Mutex — safe but creates a bottleneck
// ---------------------------------------------------------------------------

func runMutex(ctx context.Context, cfg BookingRushConfig, emit func(event.Type, map[string]any)) {
	seats := makeGrid[int](cfg.Rows, cfg.Cols)
	var mu sync.Mutex
	var booked int64
	start := time.Now()

	emit(event.StrategyStart, map[string]any{"strategy": "mutex"})

	delay := time.Duration(cfg.DelayMs) * time.Millisecond

	var wg sync.WaitGroup
	for i := 0; i < cfg.Users; i++ {
		wg.Add(1)
		go func(userID int) {
			defer wg.Done()
			if ctx.Err() != nil {
				return
			}

			rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(userID)))
			row := rng.Intn(cfg.Rows)
			col := rng.Intn(cfg.Cols)

			// Emit locking intent before acquiring the lock.
			emit(event.SeatLocking, map[string]any{
				"row": row, "col": col, "user": userID, "strategy": "mutex",
			})

			mu.Lock()

			// Emit after acquiring — the gap between SeatLocking and
			// SeatLockAcquired is how long this goroutine waited in the queue.
			emit(event.SeatLockAcquired, map[string]any{
				"row": row, "col": col, "user": userID, "strategy": "mutex",
			})
			if !sleepCtx(ctx, delay) {
				mu.Unlock()
				return
			}

			var bookedEvt map[string]any
			if seats[row][col] == 0 {
				seats[row][col] = userID
				booked++ // plain increment, protected by mutex
				bookedEvt = map[string]any{
					"row": row, "col": col, "user": userID, "strategy": "mutex",
				}
			}
			mu.Unlock()

			// Emit after releasing the lock to avoid channel-blocking
			// while holding the mutex.
			if bookedEvt != nil {
				emit(event.SeatBooked, bookedEvt)
			}
		}(i + 1)
	}

	wg.Wait()
	emit(event.StrategyDone, map[string]any{
		"strategy":  "mutex",
		"booked":    booked,
		"conflicts": 0,
		"retries":   0,
		"elapsedMs": time.Since(start).Milliseconds(),
	})
}

// ---------------------------------------------------------------------------
// Strategy 3: Optimistic locking via atomic CAS
// ---------------------------------------------------------------------------

func runOptimistic(ctx context.Context, cfg BookingRushConfig, emit func(event.Type, map[string]any)) {
	seats := makeAtomicGrid(cfg.Rows, cfg.Cols)
	versions := makeAtomicGrid(cfg.Rows, cfg.Cols)
	var booked, retries atomic.Int64
	start := time.Now()

	emit(event.StrategyStart, map[string]any{"strategy": "optimistic"})

	delay := time.Duration(cfg.DelayMs) * time.Millisecond

	var wg sync.WaitGroup
	for i := 0; i < cfg.Users; i++ {
		wg.Add(1)
		go func(userID int) {
			defer wg.Done()
			if ctx.Err() != nil {
				return
			}

			rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(userID)))
			row := rng.Intn(cfg.Rows)
			col := rng.Intn(cfg.Cols)

			for attempt := 0; attempt < cfg.MaxRetries; attempt++ {
				// Read current version
				ver := versions[row][col].Load()

				// Simulate work — no lock held
				if !sleepCtx(ctx, delay) {
					return
				}

				// CAS: only commit if version hasn't changed
				if versions[row][col].CompareAndSwap(ver, ver+1) {
					if seats[row][col].Load() == 0 {
						seats[row][col].Store(int64(userID))
						booked.Add(1)
						emit(event.SeatBooked, map[string]any{
							"row": row, "col": col, "user": userID,
							"strategy": "optimistic", "retries": attempt,
						})
					}
					return // success or seat was taken — either way, done
				}

				// CAS failed — another goroutine changed the version
				retries.Add(1)
				emit(event.SeatRetry, map[string]any{
					"row": row, "col": col, "user": userID,
					"strategy": "optimistic", "retry": attempt,
				})
			}
		}(i + 1)
	}

	wg.Wait()
	emit(event.StrategyDone, map[string]any{
		"strategy":  "optimistic",
		"booked":    booked.Load(),
		"conflicts": 0,
		"retries":   retries.Load(),
		"elapsedMs": time.Since(start).Milliseconds(),
	})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func makeGrid[T any](rows, cols int) [][]T {
	grid := make([][]T, rows)
	for i := range grid {
		grid[i] = make([]T, cols)
	}
	return grid
}

// makeAtomicGrid allocates a 2D grid of atomic.Int64. This is separate from
// makeGrid because atomic.Int64 must not be copied.
func makeAtomicGrid(rows, cols int) [][]atomic.Int64 {
	grid := make([][]atomic.Int64, rows)
	for i := range grid {
		grid[i] = make([]atomic.Int64, cols)
	}
	return grid
}
