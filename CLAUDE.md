# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server with Turbopack
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Run ESLint
```

No test runner is configured.

## Environment

Copy `.env.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public Supabase config
- `SUPABASE_SERVICE_ROLE_KEY` — server-only admin key

Environment variables are centralized in `src/configs/environment.ts`.

## Architecture

Next.js 15 App Router with Supabase auth, using TypeScript strict mode. Path alias `@/*` maps to `src/*`.

### Route groups
- `(auth)` — public routes (login)
- `(dashboard)` — protected routes, guarded by middleware that redirects unauthenticated users to `/login`

Private page components live in `_components/` folders within each route.

### Authentication flow
1. `src/middleware.ts` intercepts all non-static requests, calls `updateSession` to refresh the Supabase cookie-based session
2. Two Supabase clients: browser (`src/lib/supabase/client.ts`) and server (`src/lib/supabase/server.ts`). Server client accepts `{ isAdmin: true }` to use the service role key
3. Auth state synced to React via Zustand store (`src/stores/auth-store.ts`), initialized by `AuthStoreProvider`

### State management
- **Server state**: TanStack React Query (configured with no automatic refetching or retries)
- **Client state**: Zustand (auth store with user + profile)
- **Forms**: react-hook-form + zod validation schemas in `src/validations/`

### UI stack
- TailwindCSS v4 via PostCSS
- shadcn/ui (new-york style, RSC-enabled) — components go in `src/components/ui/`
- Lucide icons, sonner for toasts, cmdk for command palette, next-themes for dark/light mode

### Key conventions
- Constants: `src/constants/*-constant.ts`
- Validations: `src/validations/*-validation.ts`
- Hooks: `src/hooks/use-*.ts(x)`
- Types: `src/types/*.d.ts`
- Role-based sidebar navigation defined in `src/constants/sidebar-constant.ts` (admin vs user menus)

### Server actions
Server actions go in `src/actions/`. Server action body size limit is 10mb (configured in `next.config.ts`).

### Next.js image config
Remote images from `*.supabase.co` are allowed in `next.config.ts`.

### Data table pattern
`useDataTable` hook (`src/hooks/use-data-table.tsx`) manages pagination, search, and filtering with debounce. Default pagination constants are in `src/constants/data-table-constant.ts`.

### ESLint overrides
`react-hooks/exhaustive-deps`, `@typescript-eslint/no-explicit-any`, and `@typescript-eslint/no-unused-vars` are all turned off.
