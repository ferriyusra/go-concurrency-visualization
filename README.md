# Go Concurrency Cinema Simulator — Technical Documentation

An interactive educational platform that teaches Go concurrency patterns through real-time cinema ticket booking simulations. Users watch hundreds of goroutines compete for seats, comparing unsafe (no-lock), mutex-based, and lock-free (atomic/CAS) strategies side by side.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [How It Works](#how-it-works)
- [Go Concurrency Patterns Demonstrated](#go-concurrency-patterns-demonstrated)
- [Backend (Go Server)](#backend-go-server)
- [Frontend (Next.js)](#frontend-nextjs)
- [Event System](#event-system)
- [Running the Project](#running-the-project)
- [Project Structure](#project-structure)

---

## Architecture Overview

```
┌─────────────────────┐       SSE (EventSource)       ┌──────────────────────┐
│   Next.js 15 App    │◄──────────────────────────────►│    Go HTTP Server    │
│   (Port 3000)       │   GET /api/simulate/booking-   │    (Port 4000)       │
│                     │            rush                │                      │
│  - React UI         │                                │  - Goroutine pool    │
│  - Seat grid viz    │                                │  - Mutex / Atomic    │
│  - Code stepper     │                                │  - Event channel     │
│  - Metrics panel    │                                │  - SSE streaming     │
└─────────────────────┘                                └──────────────────────┘
```

The frontend sends simulation parameters (grid size, user count, delay) to the Go server. The server spawns real goroutines that compete for seats, streaming every event back via Server-Sent Events. The frontend renders these events as an animated cinema seat grid with live metrics.

---

## How It Works

### Execution Flow

1. **User configures** simulation parameters: rows, columns, number of concurrent users, and delay per booking
2. **Frontend opens** an `EventSource` connection to the Go backend (`useGoSimulation` hook)
3. **Go server** creates seat grids and spawns N goroutines (one per simulated user)
4. **Each goroutine** picks a random seat and attempts to book it using the current strategy
5. **Events stream** through a buffered channel → SSE handler → HTTP response → browser
6. **Frontend visualizes** each event: cells change color, metrics update, event log scrolls
7. **All three strategies** run sequentially so users can compare behavior and outcomes

### The Three Strategies

| Strategy | Primitive | Safe? | Performance | What It Demonstrates |
|----------|-----------|-------|-------------|---------------------|
| No-Lock | None | No — data corruption | Fast (no sync overhead) | Race conditions, silent overwrites, lost updates |
| Mutex | `sync.Mutex` | Yes | Slow under contention | Serialization bottleneck, lock wait times |
| Optimistic (CAS) | `sync/atomic` | Yes | Fast & correct | Compare-and-swap, retry loops, lock-free concurrency |

---

## Go Concurrency Patterns Demonstrated

### Goroutines

Each simulated user is a goroutine. With 500 users, the server spawns 500 goroutines per strategy (1,500 total). Go's runtime multiplexes these onto a small number of OS threads.

```go
for i := 0; i < users; i++ {
    wg.Add(1)
    go func(userID int) {
        defer wg.Done()
        // attempt booking...
    }(i)
}
wg.Wait()
```

### sync.WaitGroup

Coordinates goroutine lifecycle — the simulation waits for all users to finish before reporting results and moving to the next strategy.

### sync.Mutex

The mutex strategy wraps the entire read-check-write sequence in a lock:

```go
var mu sync.Mutex
mu.Lock()
if grid[row][col] == 0 {
    grid[row][col] = userID
}
mu.Unlock()
```

This is safe but creates a serial bottleneck — only one goroutine accesses the grid at a time.

### sync/atomic with Compare-And-Swap

The optimistic strategy uses atomic operations for lock-free concurrency:

```go
var seat atomic.Int64
for {
    current := seat.Load()
    if current != 0 {
        break // already booked
    }
    if seat.CompareAndSwap(0, int64(userID)) {
        break // success
    }
    // CAS failed — another goroutine won, retry
}
```

No locks, no blocking. Failed CAS triggers a retry loop, enabling high throughput under contention.

### Channels

A buffered channel (`chan event.Event`, capacity 256) connects simulation goroutines to the SSE handler. Events flow from goroutines → channel → HTTP stream → browser.

### Context

`context.Context` propagates cancellation. If the client disconnects, the context cancels, and goroutines exit early.

---

## Backend (Go Server)

### Structure

```
server/
├── cmd/
│   └── main.go                    # HTTP server, CORS, routing
├── internal/
│   ├── handler/
│   │   └── sse.go                 # SSE endpoint, reads channel → writes HTTP
│   ├── simulation/
│   │   └── booking_rush.go        # Core simulation logic (3 strategies)
│   └── event/
│       └── event.go               # Event type definitions
└── go.mod                         # Go 1.25.3
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/simulate/booking-rush` | Run simulation, stream events via SSE |

### Query Parameters (booking-rush)

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `rows` | int | 4–20 | 5 | Seat grid rows |
| `cols` | int | 4–20 | 5 | Seat grid columns |
| `users` | int | 1–1000 | 100 | Concurrent goroutines |
| `delayMs` | int | 1–200 | 10 | Simulated processing delay per booking (ms) |

### Event Types Emitted

| Event | Description |
|-------|-------------|
| `strategy_start` | A strategy begins execution |
| `seat_locking` | Goroutine attempting to acquire mutex |
| `seat_lock_acquired` | Mutex acquired (includes wait duration) |
| `seat_booked` | Seat successfully booked |
| `seat_conflict` | Booking conflict detected |
| `seat_overwrite` | Silent data corruption (no-lock only) |
| `seat_retry` | CAS failed, retrying (optimistic only) |
| `strategy_complete` | Strategy finished, includes metrics |
| `comparison_result` | All strategies complete |
| `simulation_done` | Full simulation finished |

---

## Frontend (Next.js)

### Tech Stack

- **Framework**: Next.js 15 (App Router, Turbopack)
- **Language**: TypeScript (strict mode)
- **Styling**: TailwindCSS v4, shadcn/ui (new-york style)
- **Animations**: Framer Motion
- **Server state**: TanStack React Query
- **Client state**: Zustand (auth store)
- **Forms**: react-hook-form + Zod
- **Auth**: Supabase (cookie-based sessions)

### Key Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with project intro |
| `/simulations` | Grid of available simulations with difficulty badges |
| `/simulations/[id]` | Interactive simulation page (visualization + controls) |

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `BookingRushSim` | `src/app/(dashboard)/simulations/[id]/_components/` | Main simulation orchestrator — grid, metrics, controls |
| `ControlPanel` | `src/components/simulation/` | Parameter inputs (rows, cols, users, delay) + presets |
| `CodeStepper` | `src/components/simulation/` | Step-through Go source code with auto-play |
| `CodeViewer` | `src/components/simulation/` | Syntax-highlighted Go code display |
| `CellStoryPanel` | `src/components/simulation/` | Per-seat event trace (click a seat to inspect) |
| `MutexQueueViz` | `src/components/simulation/` | Visual mutex wait queue |
| `EventLog` | `src/components/simulation/` | Scrolling real-time event feed |
| `ReplayControls` | `src/components/simulation/` | Timeline seek + speed control for replays |
| `MetricCard` | `src/components/simulation/` | Statistics display (booked, conflicts, retries, time) |

### Key Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useGoSimulation` | `src/hooks/use-go-simulation.ts` | Manages EventSource connection to Go server, parses SSE events |
| `useSimulationEngine` | `src/hooks/use-simulation-engine.ts` | Generic simulation runner with speed control |
| `useCodeStepper` | `src/hooks/use-code-stepper.ts` | Code step navigation with 2.5s auto-play intervals |
| `useReplayMode` | `src/hooks/use-replay-mode.ts` | Replay recorded events with timeline + speed |

### Visualization Color Scheme

| Color | Meaning |
|-------|---------|
| Gray | Available seat |
| Yellow | Locking (mutex being acquired) |
| Green | Successfully booked |
| Red | Conflict detected |
| Purple | Silent overwrite (data corruption) |
| Orange | Retry (CAS failed) |

### Presets

Pre-configured scenarios to demonstrate specific concurrency behaviors:

- **Silent Corruption**: 4×4 grid, 200 users, 5ms delay — maximizes race condition visibility
- **Mutex Bottleneck**: 4×4 grid, 100 users, 30ms delay — shows lock contention
- **High Contention**: Various configs to stress-test each strategy

---

## Event System

### Data Flow

```
Goroutine → Channel (buffered, 256) → SSE Handler → HTTP Stream → EventSource → React State → UI
```

### Event Format (SSE)

```
data: {"type":"seat_booked","strategy":"no-lock","userId":42,"row":2,"col":3,"timestamp":1234567890}
```

### Frontend Event Processing

The `useGoSimulation` hook:
1. Opens `EventSource` to `${GO_SERVER_URL}/api/simulate/booking-rush?rows=...`
2. Parses each SSE `data:` line as JSON
3. Dispatches events to the simulation component
4. Updates grid state, metrics, and event log in real time

---

## Running the Project

### Prerequisites

- Node.js 18+
- Go 1.25+
- Supabase project (for auth — optional for simulation-only use)

### Setup

```bash
# Install frontend dependencies
npm install

# Copy environment template
cp .env.example .env.local
# Fill in Supabase keys in .env.local (optional)
```

### Development

Run both servers simultaneously:

```bash
# Terminal 1 — Frontend (port 3000)
npm run dev

# Terminal 2 — Go server (port 4000)
cd server && go run ./cmd/main.go
```

### Production

```bash
npm run build
npm run start
```

---

## Project Structure

```
go-concurrency-cinema-simulator/
├── server/                              # Go backend
│   ├── cmd/main.go                     # HTTP server entry point
│   └── internal/
│       ├── handler/sse.go              # SSE streaming handler
│       ├── simulation/booking_rush.go  # Three concurrency strategies
│       └── event/event.go              # Event type definitions
├── src/                                 # Next.js frontend
│   ├── app/
│   │   ├── (auth)/                     # Auth routes (login, signup)
│   │   ├── (dashboard)/
│   │   │   └── simulations/            # Simulation pages
│   │   ├── layout.tsx                  # Root layout
│   │   └── page.tsx                    # Landing page
│   ├── components/
│   │   ├── simulation/                 # Simulation visualization components
│   │   └── ui/                         # shadcn/ui primitives
│   ├── hooks/                          # Custom React hooks
│   ├── types/                          # TypeScript type definitions
│   ├── constants/                      # Simulation configs & constants
│   ├── lib/                            # Supabase clients, utilities
│   ├── stores/                         # Zustand stores
│   ├── providers/                      # React context providers
│   ├── configs/                        # Environment config
│   ├── actions/                        # Next.js server actions
│   └── validations/                    # Zod schemas
├── package.json
├── next.config.ts
├── tsconfig.json
├── CLAUDE.md                           # AI assistant instructions
└── .env.example                        # Environment template
```
