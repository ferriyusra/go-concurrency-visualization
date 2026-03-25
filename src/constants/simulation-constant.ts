import type { SimulationConfig, CodeStep } from '@/types/simulation';

export const SIMULATIONS: SimulationConfig[] = [
	{
		id: 'booking-rush',
		name: 'Ticket Booking Rush',
		description:
			'Hundreds of users fight for the same seats. Watch race conditions happen in real-time.',
		scenario:
			'A blockbuster premiere opens for booking. 500 users simultaneously try to book 150 seats.',
		patterns: ['sync.Mutex', 'goroutines', 'atomic', 'optimistic locking'],
		difficulty: 'beginner',
		icon: '🎫',
		defaultParams: {
			rows: 10,
			cols: 15,
			concurrentUsers: 200,
			bookingDelayMs: 50,
			strategy: 'all',
		},
		concepts: [
			{
				name: 'Race Condition',
				what: 'A bug where two or more goroutines access shared data at the same time, and at least one writes to it. The result depends on execution order, which is unpredictable.',
				why: 'Without synchronization, concurrent seat bookings can read stale data. Two users both see a seat as available, both write their ID — one booking is silently lost.',
				goSyntax: 'if seats[r][c] == 0 { seats[r][c] = userID }',
				strategies: ['no-lock'],
			},
			{
				name: 'sync.Mutex',
				what: 'A mutual exclusion lock. Only one goroutine can hold it at a time. Others block on Lock() until it is released via Unlock().',
				why: 'Wrapping the read-check-write in mu.Lock()/mu.Unlock() guarantees only one goroutine touches the seat at a time. Safe but creates a bottleneck under high contention.',
				goSyntax: 'mu.Lock()\ndefer mu.Unlock()',
				strategies: ['mutex'],
			},
			{
				name: 'Goroutines',
				what: 'Lightweight threads managed by the Go runtime. Launched with the go keyword, they run concurrently and are multiplexed onto OS threads.',
				why: 'Each simulated user runs in its own goroutine, allowing hundreds of concurrent booking attempts — just like real traffic hitting a server.',
				goSyntax: 'go func(userID int) { /* book seat */ }(i)',
				strategies: ['no-lock', 'mutex', 'optimistic'],
			},
			{
				name: 'sync/atomic (CAS)',
				what: 'Compare-And-Swap is a CPU-level atomic operation. It checks if a value equals an expected value and, only if true, replaces it — all in one indivisible step.',
				why: 'Optimistic locking reads a version number, does work, then uses CAS to commit. If another goroutine changed the version, CAS fails and the goroutine retries. No lock held during work — higher throughput.',
				goSyntax: 'atomic.CompareAndSwapInt64(&ver, old, old+1)',
				strategies: ['optimistic'],
			},
			{
				name: 'sync.WaitGroup',
				what: 'A counter that lets you wait for a collection of goroutines to finish. Add(1) before launching, Done() when finished, Wait() to block until the counter hits zero.',
				why: 'After fanning out one goroutine per user, the main function calls wg.Wait() to block until every booking attempt completes before moving to the next strategy.',
				goSyntax: 'wg.Add(1)\ngo func() { defer wg.Done(); /* work */ }()\nwg.Wait()',
				strategies: ['no-lock', 'mutex', 'optimistic'],
			},
			{
				name: 'Optimistic Locking',
				what: 'A concurrency strategy that assumes conflicts are rare. Read a version, do work without locking, then verify the version has not changed before committing. Retry if it has.',
				why: 'Unlike a mutex, no lock is held during the "thinking" phase, so other goroutines are not blocked. This gives much better throughput when contention is low, at the cost of occasional retries.',
				goSyntax: 'ver := read()\n// do work\nif CAS(&ver, old, new) { commit } else { retry }',
				strategies: ['optimistic'],
			},
		],
		visualTriggers: {
			seat_locking: 'Yellow cell — mutex acquired',
			seat_booked: 'Green cell — successfully booked',
			seat_retry: 'Orange flash — optimistic lock retry',
			seat_conflict: 'Red cell — race condition detected',
			comparison_result: 'Bar chart — strategy comparison',
		},
		goSnippet: `// 🎫 Ticket Booking Rush — Race Condition vs Mutex vs Optimistic Locking
func BookingRush(ctx context.Context, cfg BookingRushConfig, events chan<- event.Event) {
    // Run all three strategies sequentially, each using real goroutines
    runNoLock(ctx, cfg, emit)
    runMutex(ctx, cfg, emit)
    runOptimistic(ctx, cfg, emit)
    emit(event.ComparisonDone, map[string]any{})
}

// ❌ Strategy 1: No Lock — real race conditions from real goroutines
func runNoLock(ctx context.Context, cfg BookingRushConfig, emit emitFn) {
    seats := makeGrid[int](cfg.Rows, cfg.Cols)  // shared, NO protection
    owners := makeGrid[int](cfg.Rows, cfg.Cols)  // also racy!
    var booked, conflicts, overwrites atomic.Int64

    var wg sync.WaitGroup
    for i := 0; i < cfg.Users; i++ {
        wg.Add(1)
        go func(userID int) {
            defer wg.Done()
            row := rng.Intn(cfg.Rows)
            col := rng.Intn(cfg.Cols)

            // Step 1: Read seat — no lock!
            if seats[row][col] == 0 {
                sleepCtx(ctx, delay) // other goroutines read same seat here

                // Step 2: Check again — catches SOME conflicts but not all
                if seats[row][col] != 0 {
                    conflicts.Add(1) // detected conflict
                    return
                }

                // Step 3: Write — no lock! DANGEROUS: multiple goroutines write
                prev := seats[row][col]
                seats[row][col] = userID
                owners[row][col] = userID

                if prev != 0 && prev != userID {
                    overwrites.Add(1) // SILENT OVERWRITE — booking lost!
                    // → Frontend: purple cell
                } else {
                    booked.Add(1)
                    // → Frontend: green cell (looks fine, but data may be corrupt)
                }
            }
        }(i + 1)
    }
    wg.Wait()

    // Post-check: detect lost bookings (owner ≠ seat value)
    for r := 0; r < cfg.Rows; r++ {
        for c := 0; c < cfg.Cols; c++ {
            if owners[r][c] != 0 && seats[r][c] != owners[r][c] {
                lostBookings++
            }
        }
    }
}

// ✅ Strategy 2: Mutex — safe but creates a bottleneck
func runMutex(ctx context.Context, cfg BookingRushConfig, emit emitFn) {
    seats := makeGrid[int](cfg.Rows, cfg.Cols)
    var mu sync.Mutex

    var wg sync.WaitGroup
    for i := 0; i < cfg.Users; i++ {
        wg.Add(1)
        go func(userID int) {
            defer wg.Done()
            row := rng.Intn(cfg.Rows)
            col := rng.Intn(cfg.Cols)

            // → Frontend: yellow "locking" flash
            emit(event.SeatLocking, ...)

            mu.Lock()
            sleepCtx(ctx, delay) // holds lock during entire delay!
            if seats[row][col] == 0 {
                seats[row][col] = userID
                booked++
                // → Frontend: green cell (correct, zero conflicts)
            }
            mu.Unlock()
        }(i + 1)
    }
    wg.Wait()
}

// ⚡ Strategy 3: Optimistic locking via atomic CAS
func runOptimistic(ctx context.Context, cfg BookingRushConfig, emit emitFn) {
    seats := makeAtomicGrid(cfg.Rows, cfg.Cols)
    versions := makeAtomicGrid(cfg.Rows, cfg.Cols)
    var booked, retries atomic.Int64

    var wg sync.WaitGroup
    for i := 0; i < cfg.Users; i++ {
        wg.Add(1)
        go func(userID int) {
            defer wg.Done()
            row := rng.Intn(cfg.Rows)
            col := rng.Intn(cfg.Cols)

            for attempt := 0; attempt < cfg.MaxRetries; attempt++ {
                ver := versions[row][col].Load() // read version
                sleepCtx(ctx, delay)             // no lock held!

                // CAS: only commit if version hasn't changed
                if versions[row][col].CompareAndSwap(ver, ver+1) {
                    if seats[row][col].Load() == 0 {
                        seats[row][col].Store(int64(userID))
                        booked.Add(1)
                        // → Frontend: green cell (fast + correct)
                    }
                    return
                }
                // CAS failed — another goroutine changed the version
                retries.Add(1)
                // → Frontend: orange "retry" flash
            }
        }(i + 1)
    }
    wg.Wait()
}`,
	},
];

export const BOOKING_RUSH_STEPS: CodeStep[] = [
	{
		id: 1,
		strategy: 'setup',
		lineRange: [1, 7],
		title: 'BookingRush orchestrator',
		explanation:
			'The main function runs all three strategies sequentially. Each strategy spawns real goroutines internally. Events are streamed to the frontend via SSE.',
	},
	{
		id: 2,
		strategy: 'no-lock',
		lineRange: [10, 14],
		title: 'No-lock: shared grid with NO protection',
		explanation:
			'Both seats and owners grids are plain slices — no mutex, no atomics. Multiple goroutines read and write these concurrently, creating real data races.',
	},
	{
		id: 3,
		strategy: 'no-lock',
		lineRange: [16, 22],
		title: 'Fan-out: one goroutine per user',
		explanation:
			'A WaitGroup tracks N goroutines, one per simulated user. Each picks a random seat and attempts to book it without any synchronization.',
	},
	{
		id: 4,
		strategy: 'no-lock',
		lineRange: [24, 26],
		title: 'Read seat — no lock!',
		explanation:
			'The goroutine checks if the seat is available. Without a lock, multiple goroutines can read the same seat as "available" simultaneously.',
		visualEffect: { cellState: 'available', row: 3, col: 5 },
	},
	{
		id: 5,
		strategy: 'no-lock',
		lineRange: [27, 31],
		title: 'Sleep then re-check — catches SOME races',
		explanation:
			'After the delay, a second check catches conflicts where someone wrote during the sleep. But this is not atomic — two goroutines can both pass this check.',
		visualEffect: { cellState: 'conflict', row: 3, col: 5 },
	},
	{
		id: 6,
		strategy: 'no-lock',
		lineRange: [33, 41],
		title: 'Write without lock — SILENT OVERWRITE danger',
		explanation:
			'Multiple goroutines can pass the check and ALL write. The last writer silently overwrites previous bookings. The purple "overwrite" cell shows this truly dangerous race — no error is raised.',
		visualEffect: { cellState: 'overwrite', row: 3, col: 5 },
	},
	{
		id: 7,
		strategy: 'no-lock',
		lineRange: [42, 44],
		title: 'Success path — looks correct but may be corrupt',
		explanation:
			'The frontend shows a green cell, but the underlying data may be corrupt. This is why race conditions are dangerous: they often appear correct.',
		visualEffect: { cellState: 'booked', row: 3, col: 5 },
	},
	{
		id: 8,
		strategy: 'no-lock',
		lineRange: [49, 55],
		title: 'Post-check: detect lost bookings',
		explanation:
			'After all goroutines finish, scan the grid for seats where the owner differs from the seat value. This catches overwrites the goroutines themselves cannot detect. Note: owners is also racy, so this count is approximate.',
	},
	{
		id: 9,
		strategy: 'mutex',
		lineRange: [58, 63],
		title: 'Mutex strategy: setup with sync.Mutex',
		explanation:
			'A single mutex protects the entire seat grid. This is safe but creates a serial bottleneck — every goroutine must wait in line.',
	},
	{
		id: 10,
		strategy: 'mutex',
		lineRange: [72, 73],
		title: 'Emit locking intent, then acquire lock',
		explanation:
			'The yellow "locking" flash appears before mu.Lock(). The goroutine then blocks until no other goroutine holds the mutex.',
		visualEffect: { cellState: 'locking', row: 4, col: 7 },
	},
	{
		id: 11,
		strategy: 'mutex',
		lineRange: [74, 78],
		title: 'Sleep while holding the lock',
		explanation:
			'The goroutine holds the mutex during the entire delay. All other goroutines trying to book ANY seat must wait — safe but slow under high contention.',
		visualEffect: { cellState: 'locking', row: 4, col: 7 },
	},
	{
		id: 12,
		strategy: 'mutex',
		lineRange: [75, 80],
		title: 'Check and write inside critical section',
		explanation:
			'Because the mutex is held, no other goroutine can read or write seats concurrently. The check-then-write is atomic — zero conflicts guaranteed. The emit happens after mu.Unlock() to avoid channel-blocking while holding the lock.',
		visualEffect: { cellState: 'booked', row: 4, col: 7 },
	},
	{
		id: 13,
		strategy: 'optimistic',
		lineRange: [84, 88],
		title: 'Optimistic: atomic grids for lock-free access',
		explanation:
			'Instead of a mutex, seats and versions are atomic.Int64 grids. Multiple goroutines can read and write concurrently using atomic operations — no blocking.',
	},
	{
		id: 14,
		strategy: 'optimistic',
		lineRange: [97, 99],
		title: 'Read version, then do work — no lock held',
		explanation:
			'Load the current version atomically, then sleep (simulating work). No lock is held during this time — other goroutines proceed freely in parallel.',
		visualEffect: { cellState: 'available', row: 2, col: 9 },
	},
	{
		id: 15,
		strategy: 'optimistic',
		lineRange: [101, 107],
		title: 'CompareAndSwap (CAS) — atomic commit',
		explanation:
			'Atomically check: "is the version still what I read?" If yes, swap to version+1 and book the seat. If another goroutine changed the version, CAS returns false — no corruption possible.',
		visualEffect: { cellState: 'booked', row: 2, col: 9 },
	},
	{
		id: 16,
		strategy: 'optimistic',
		lineRange: [110, 114],
		title: 'CAS failed — retry loop',
		explanation:
			'The version changed since we read it, meaning another goroutine committed first. The goroutine retries up to MaxRetries times. The orange "retry" flash shows this in action.',
		visualEffect: { cellState: 'retry', row: 2, col: 9 },
	},
	{
		id: 17,
		strategy: 'fanout',
		lineRange: [3, 6],
		title: 'Sequential strategy execution & comparison',
		explanation:
			'All three strategies run sequentially. After they complete, a ComparisonDone event triggers the frontend bar chart showing conflicts, overwrites, speed, and correctness side by side.',
	},
];

export const DIFFICULTY_COLORS: Record<string, string> = {
	beginner: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
	intermediate:
		'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
	advanced: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export const PATTERN_COLORS = [
	'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
	'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
	'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
	'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
	'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
];
