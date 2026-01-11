# Implementation Plan (LLM-Friendly, Phase-Based)

This plan is written to minimize “LLM drift” and token-limit failures. Each phase is intended to be generated and reviewed independently.

## Global rules for all LLM outputs

- Do not invent new features beyond the phase scope.
- Output **complete file contents** for every changed/added file (no “...rest omitted”).
- Code must compile and run with the listed scripts.
- Prefer simple, explicit implementations over abstractions.
- Keep everything single-lobby; no rooms.

---

## Phase 0 — decisions & constraints (done)

- Global lobby only
- Deterministic per-user A/B assignment
- VN mode not user-toggleable
- Python FastAPI sidecar for inference
- No bundled art assets; graceful fallbacks (CSS placeholders)

---

## Phase 1 — barebones scaffold (LLM Output #1) ✅ Complete

### Scope
Create a compiling monorepo scaffold that boots all three services and proves the end-to-end handshake works.

### Deliverables (must exist)
- Root:
  - `package.json` with workspace scripts
  - `.env.example`
  - `README.md` with exact commands
- `server/`:
  - Express server with `GET /health`
  - Socket.IO server with events:
    - accepts `session:start`
    - emits `session:ack`
  - Prisma schema + `prisma migrate dev` works
  - Minimal in-memory presence list (self only is acceptable in Phase 1)
- `client/`:
  - React app boots and connects via Socket.IO
  - UI: nickname input + “connected” indicator
  - Basic message input and message list UI (can be minimal HTML)
- `python/`:
  - FastAPI app boots
  - `GET /health` returns `{status:"ok"}`
  - `POST /infer` returns neutral mood stub


### Acceptance checks
- `npm install` at repo root
- `npm run dev` starts:
  - client on :5173
  - server on :3000
  - python on :8000
- Open browser, set nickname, receive `session:ack`
- Send one message → appears locally and on second tab (if two tabs open)
- `npx prisma migrate dev` (or equivalent script) completes without errors

### Explicit non-goals (do not implement)
- Admin pages/metrics
- Inference jobs
- VN rendering
- Rate limiting and analytics (stub only ok)

---

## Phase 2 — realtime correctness + persistence (LLM Output #2) ✅ Complete

### Scope
Make presence and message persistence correct for multiple tabs/users.

### Deliverables
- Presence updates on connect/disconnect, broadcast `presence:update`
- Store each message in DB; load last `MESSAGE_HISTORY_LIMIT` on join
- Rate limiting (`error:rate_limited`)
- Payload validation (`error:invalid_payload`)

### Acceptance
- Two tabs show each other online
- Reload preserves last messages from DB
- Flooding messages triggers rate-limit error and ignores extra sends

---

## Phase 3 — VN UI (LLM Output #3) ✅ Complete

### Scope
Implement the VN renderer used only for TREATMENT users.

### Deliverables
- Deterministic A/B assignment and client UI switching:
  - CONTROL → normal chat list
  - TREATMENT → VN chat view
- VN scene selection from current mood + seed
- Background debounce + graceful asset fallback

### Acceptance
- Two users with different assignments see different UIs
- VN view does not crash with empty asset folders
- Background changes are debounced (no rapid flicker)

---

## Phase 4 — ML refinement pipeline (LLM Output #4)

### Scope
Add DB-backed inference job queue + background worker + sidecar call.

### Deliverables
- Create `InferenceJob(PENDING)` per message
- Worker loop (single-threaded, sufficient for ≤4 users):
  - claims jobs
  - calls `/infer`
  - updates message mood, emits `message:mood_updated`
  - retries up to 3 times then marks FAILED
- Seed generation: `seed = messageId.slice(0, 8)`
- Python stays stub by default (`ENABLE_MODEL=0`)

### Acceptance
- Messages first show neutral mood then receive mood update event later
- VN expression/background reacts to mood update

---

## Phase 5 — admin metrics + retention (LLM Output #5)

### Scope
Add server endpoints and basic client admin page.

### Deliverables
- `GET /admin/metrics/summary` per spec (including D1/D7 retention definition)
- `GET /admin/users`
- Client `/admin` route displays tables (charts optional)

### Acceptance
- Seed data produces correct aggregates
- Endpoints do not crash when DB is empty

---

## Phase 6 — tests + Docker (LLM Output #6)

### Deliverables
- Server unit tests:
  - per-user rate limiter
  - deterministic A/B hash
- inference job worker behavior (success/failure transitions)
- Minimal client test for VN component rendering (optional but preferred)
- `docker-compose.yml` for linux/arm64:
  - python + server + built client served by Express (default for MVP)
  - Enable SQLite WAL mode on startup
  - Graceful shutdown (SIGTERM handling, 5s drain)

### Acceptance
- `npm test` passes
- `docker compose up --build` runs health endpoints and socket connection works
- Graceful shutdown completes within 5 seconds
