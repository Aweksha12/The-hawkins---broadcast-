# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 + WebSocket (ws)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server + WebSocket sync
│   └── hawkins-broadcast/  # React frontend (Stranger Things UI)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Application: Hawkins Emergency Broadcast System

A synchronized media player with a retro Stranger Things aesthetic.

### Features
- **Broadcaster role**: Creates a session, controls play/pause/seek, shares a session code
- **Listener role**: Joins via session code, receives real-time sync of all playback actions
- **WebSocket-based sync**: Play, pause, seek actions broadcast to all listeners instantly
- **Drift correction**: Listeners auto-seek if drift > 0.5 seconds
- **Latency measurement**: Ping/pong messages measure one-way latency
- **Sync status**: SYNCHRONIZED / SYNCING / SIGNAL LOST indicators
- **Retro UI**: CRT scanlines, amber/red glow, VT323/Share Tech Mono fonts, 80s horror console aesthetic

### Architecture
- **Frontend** (`artifacts/hawkins-broadcast`): React + Vite, wouter routing, React Query for API calls, native WebSocket hook
- **Backend** (`artifacts/api-server`): Express 5 + `ws` WebSocket server, in-memory session store
- **Routes**: `POST /api/sessions`, `GET /api/sessions/:id`, `GET /api/sessions/:id/state`
- **WebSocket**: `/ws?sessionId=XXX&role=broadcaster|listener`

### WebSocket Protocol
Messages (JSON):
- `{type:"sync", isPlaying, currentTime, duration, timestamp, videoUrl}` — broadcaster sends, listeners receive
- `{type:"connected", role, state}` — server sends on connect with initial state
- `{type:"listener_count", count}` — server sends to broadcaster when listener count changes
- `{type:"ping/pong", timestamp}` — latency measurement
- `{type:"broadcaster_disconnected"}` — sent to listeners when broadcaster leaves

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — only emit `.d.ts` files during typecheck
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/hawkins-broadcast` (`@workspace/hawkins-broadcast`)

React + Vite frontend. Retro Stranger Things themed synchronized media player.

- Fonts: VT323 (display), Share Tech Mono (body)
- Key files: `src/pages/home.tsx`, `src/pages/broadcaster.tsx`, `src/pages/listener.tsx`
- Media player: `src/components/video/media-player.tsx`
- WebSocket hook: `src/hooks/use-websocket.ts`
- `vite.config.ts` proxies `/ws` and `/api` to the api-server (port 8080)

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server with WebSocket support. Routes live in `src/routes/` and `src/lib/`.

- Entry: `src/index.ts` — creates HTTP server + WebSocket server
- WebSocket handler: `src/lib/wsHandler.ts`
- Session manager: `src/lib/sessionManager.ts` (in-memory)
- Routes: `src/routes/sessions.ts`
- Dependencies: `express`, `ws`, `uuid`, `@workspace/api-zod`

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. (Currently unused by Hawkins app — sessions are in-memory.)

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec for REST endpoints. Run codegen: `pnpm --filter @workspace/api-spec run codegen`
