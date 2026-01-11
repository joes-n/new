# Software Specification (Code-Generation Ready)

## 1) Purpose

Build an MVP **global-lobby** messaging web app that can A/B test whether a **visual-novel (VN) chat UI** improves retention vs a standard chat UI.

This document is written to be **LLM-friendly**: it defines exact ports, environment variables, schemas, event payloads, and acceptance criteria so a code generator can create a compiling scaffold with minimal invention.

## 2) Goals

- VN-style presentation for **TREATMENT** users (background + dialogue box + character avatar + expression changes).
- CONTROL users see a normal chat list UI.
- Deterministic A/B assignment per user.
- Store messages and basic analytics in a DB (SQLite via Prisma).
- Async mood classification pipeline (Node server + Python sidecar).
- Deployable on **Oracle Always Free ARM (Ampere A1)**; stable under low concurrency (max ~4 concurrent users).

## 3) Non-goals (explicitly out of scope)

- Authentication, DMs, rooms, file uploads, push notifications, E2E encryption, moderation.
- Perfect emotion classification. UI variation can be approximate.
- Multi-region scaling, message ordering under high contention, HA.

## 4) Hard Constraints

- **Global lobby only** (no rooms).
- **No user-toggle** for VN mode (assignment decides).
- Must run on Linux/arm64 (Docker) and locally (dev).
- Must not crash if VN assets/audio are missing (graceful fallback UI).

---

## 5) Tech Stack & Versions (pinned for consistency)

- Monorepo: npm workspaces (or pnpm; choose one and stick to it) — **recommended: npm workspaces**
- Client: React + Vite + TypeScript + Tailwind
- Server: Node.js (Express) + Socket.IO + Prisma + SQLite
- Python sidecar: FastAPI + Uvicorn + Transformers (DistilRoBERTa)
- Optional charts: Chart.js in `/client`

---

## 6) Repo Layout (must match exactly)

```
repo-root/
  package.json
  README.md
  .env.example
  docker-compose.yml

  client/
    package.json
    vite.config.ts
    src/
      main.tsx
      App.tsx
      lib/
        api.ts
        socket.ts
        types.ts
      pages/
        ChatPage.tsx
        AdminPage.tsx
      components/
        NicknameModal.tsx
        PresenceList.tsx
        ChatList.tsx
        VNChatView.tsx
        VNScene.tsx
    public/
      assets/
        backgrounds/   (empty OK)
        avatars/       (empty OK)
        audio/         (empty OK)

  server/
    package.json
    src/
      index.ts
      http.ts
      socket.ts
      config.ts
      rateLimit.ts
      abAssign.ts
      analytics.ts
      inferenceWorker.ts
      prisma.ts
      routes/
        health.ts
        admin.ts
    prisma/
      schema.prisma
      migrations/   (generated)

  python/
    requirements.txt
    app/
      main.py
      models.py
    README.md
```

---

## 7) Runtime Configuration

### 7.1 Ports (fixed defaults)

- Client dev server: **5173**
- Node server: **3000**
- Python sidecar: **8000**

### 7.2 Environment Variables (names are part of the contract)

Create `.env.example` at repo root and load per package as needed.

Required:
- `DATABASE_URL="file:./dev.db"` (server)
- `SERVER_PORT=3000` (server)
- `PY_INFER_URL="http://127.0.0.1:8000"` (server in dev)
- `CLIENT_ORIGIN="http://127.0.0.1:5173"` (server CORS)

Optional (defaults must be implemented):
- `MESSAGE_HISTORY_LIMIT=200`
- `RATE_LIMIT_MAX=10` (messages, **per-user**)
- `RATE_LIMIT_WINDOW_MS=10000` (10s)
- `INFER_POLL_MS=500`
- `INFER_TIMEOUT_MS=1500`
- `ADMIN_TOKEN=""` (empty = no protection; if set, require header `x-admin-token`)
- `ENABLE_MODEL=1` (python; 0 uses stub mood, 1 uses DistilRoBERTa)
- `SQLITE_WAL_MODE=1` (recommended; enables WAL mode for better concurrent reads)

Docker (compose) must override:
- `PY_INFER_URL="http://python:8000"`

---

## 8) Data Model (Prisma + SQLite)

**SQLite Configuration**: For concurrent access, enable WAL mode on startup:
```ts
await prisma.$executeRaw`PRAGMA journal_mode=WAL`;
```

### 8.1 Prisma schema (authoritative)

```prisma
// server/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

enum Assignment {
  CONTROL
  TREATMENT
}

enum Mood {
  ADMIRATION
  AMUSEMENT
  ANGER
  ANNOYANCE
  APPROVAL
  CARING
  CONFUSION
  CURIOSITY
  DESIRE
  DISAPPOINTMENT
  DISAPPROVAL
  DISGUST
  EMBARRASSMENT
  EXCITEMENT
  FEAR
  GRATITUDE
  GRIEF
  JOY
  LOVE
  NERVOUSNESS
  OPTIMISM
  PRIDE
  REALIZATION
  RELIEF
  REMORSE
  SADNESS
  SURPRISE
  NEUTRAL
}

enum JobStatus {
  PENDING
  PROCESSING
  DONE
  FAILED
}

model User {
  id         String     @id // uuid from client
  nickname   String
  assignment Assignment
  createdAt  DateTime   @default(now())
  lastSeenAt DateTime?
  sessions   Session[]
  messages   Message[]

  @@index([createdAt])
  @@index([lastSeenAt])
}

model Session {
  id          Int      @id @default(autoincrement())
  userId      String
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  durationSec Int?

  user User @relation(fields: [userId], references: [id])

  @@index([userId, startedAt])
  @@index([startedAt])
}

model Message {
  id               String     @id // uuid
  userId           String
  nicknameSnapshot String
  text             String
  createdAt        DateTime   @default(now())

  // mood fields
  mood        Mood      @default(NEUTRAL)
  intensity   Float     @default(0)
  seed        String?   // for deterministic VN variations
  moodUpdatedAt DateTime?

  user User @relation(fields: [userId], references: [id])
  job  InferenceJob?

  @@index([createdAt])
  @@index([userId, createdAt])
}

model AnalyticsEvent {
  id        Int      @id @default(autoincrement())
  timestamp DateTime @default(now())
  userId    String?
  eventName String
  metadata  Json?

  @@index([timestamp])
  @@index([eventName, timestamp])
}

model InferenceJob {
  id        Int      @id @default(autoincrement())
  messageId String   @unique
  status    JobStatus @default(PENDING)
  attempts  Int      @default(0)
  lastError String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  message Message @relation(fields: [messageId], references: [id])

  @@index([status, createdAt])
}
```

---

## 9) Contracts (Shared Types)

Define these TypeScript types in both client and server (either shared package or duplicated identically).

### 9.1 Core DTOs

```ts
export type Assignment = "CONTROL" | "TREATMENT";

export type OnlineUser = {
  userId: string;
  nickname: string;
  assignment: Assignment;
};

export type Mood =
  | "ADMIRATION"
  | "AMUSEMENT"
  | "ANGER"
  | "ANNOYANCE"
  | "APPROVAL"
  | "CARING"
  | "CONFUSION"
  | "CURIOSITY"
  | "DESIRE"
  | "DISAPPOINTMENT"
  | "DISAPPROVAL"
  | "DISGUST"
  | "EMBARRASSMENT"
  | "EXCITEMENT"
  | "FEAR"
  | "GRATITUDE"
  | "GRIEF"
  | "JOY"
  | "LOVE"
  | "NERVOUSNESS"
  | "OPTIMISM"
  | "PRIDE"
  | "REALIZATION"
  | "RELIEF"
  | "REMORSE"
  | "SADNESS"
  | "SURPRISE"
  | "NEUTRAL";

export type MessageDTO = {
  id: string;
  userId: string;
  nicknameSnapshot: string;
  text: string;
  createdAt: string; // ISO
  mood: Mood;
  intensity: number;
  seed?: string | null;
  moodUpdatedAt?: string | null; // ISO
};
```

### 9.2 Session payloads

```ts
export type SessionStartPayload = { userId: string; nickname: string };

export type SessionAckPayload = {
  userId: string;
  nickname: string;
  assignment: Assignment;
  onlineUsers: OnlineUser[];
  lastMessages: MessageDTO[];
};

export type SceneChangedPayload = {
  userId: string;
  messageId?: string | null;
  bgKey: string;
  characterKey?: string | null;
  expressionKey?: string | null;
  reason: "mood_change" | "intensity_jump" | "initial" | "manual" | "other";
  mood?: Mood;
  intensity?: number;
  at: string; // ISO
};
```

---

## 10) Realtime Protocol (Socket.IO)

All events must be implemented exactly as named.

### 10.1 Client → Server

- `session:start` payload: `SessionStartPayload`
- `message:send` payload: `{ userId: string; text: string }`
- `scene:changed` payload: `SceneChangedPayload`

Optional (can omit in scaffold):
- `typing` payload: `{ userId: string; isTyping: boolean }`

### 10.2 Server → Client

- `session:ack` payload: `SessionAckPayload`
- `presence:update` payload: `{ onlineUsers: OnlineUser[] }`
- `message:new` payload: `{ message: MessageDTO }`
- `message:mood_updated` payload:
  `{ messageId: string; mood: Mood; intensity: number; seed?: string | null }`

### 10.3 Error events (required)

- `error:invalid_payload` payload: `{ message: string }`
- `error:rate_limited` payload: `{ retryAfterMs: number }`
- `error:server` payload: `{ message: string }`

---

## 11) A/B Assignment

Deterministic, server-authoritative.

Rule:
- `assignment = (hash(userId) % 2 === 0) ? "CONTROL" : "TREATMENT"`

Implementation requirement:
- Use a deterministic string hash implemented in code (do not rely on JS engine object hashes).
- Persist assignment in `User.assignment` on first `session:start`.

---

## 12) Message Flow & Mood Pipeline

### 12.1 On `session:start`

Server must:
1. Validate nickname (trim, 1..20 chars). **If invalid, emit `error:invalid_payload` with message and disconnect.**
2. Upsert user by `userId`:
   - if new: compute assignment, create User with `lastSeenAt = now()`
   - if existing: update nickname and `lastSeenAt = now()`
3. Ensure a single active `Session` per user:
   - if no open session (`endedAt` is null), create one with `startedAt`
   - if an open session exists, reuse it
4. Add connection to in-memory presence.
5. Load last `MESSAGE_HISTORY_LIMIT` messages (descending by createdAt, then reverse for chronological).
6. Emit `session:ack`.
7. Broadcast `presence:update`.

### 12.2 On disconnect

Server must:
- Remove socket from presence map.
- If the user has no more active sockets, update their current Session `endedAt` and `durationSec`.
- Update `lastSeenAt = now()` when the last socket disconnects.
- Broadcast `presence:update`.

### 12.3 On `message:send`

Server must:
1. Validate payload and apply per-user rate limit.
2. Create `Message` with:
   - `id = uuid`
   - `nicknameSnapshot = current nickname`
   - `mood = "NEUTRAL"`
   - `intensity = 0`
   - `seed = messageId.slice(0, 8)` (first 8 chars of UUID)
3. Emit `message:new` immediately (with neutral mood).
4. Insert `AnalyticsEvent` `message_sent`.
5. Create `InferenceJob(PENDING)` for this message.

**Note**: `lastSeenAt` updates are handled only on `session:start` and `disconnect` to reduce DB writes.

### 12.4 Inference worker (server)

A single background loop:
- Every `INFER_POLL_MS`, claim one oldest `PENDING` job:
  - set to `PROCESSING`, increment attempts
- Call Python sidecar:
  - `POST {text}` with timeout `INFER_TIMEOUT_MS`
- On success:
  - update `Message.mood`, `intensity`, `moodUpdatedAt=now()`, optionally update `seed`
  - set job status `DONE`
  - emit `message:mood_updated`
  - log `message_mood_updated` analytics event
- On failure:
  - set job status `PENDING` again if attempts < 3 else `FAILED`
  - store `lastError`

### 12.5 On `scene:changed`

Server must:
1. Validate payload.
2. **Throttle**: Ignore if same user sent `scene:changed` within last 3 seconds (prevents spam).
3. Insert `AnalyticsEvent` with `eventName="scene_changed"` and `metadata = payload minus userId`.

---

## 13) Python Sidecar API (FastAPI)

### 13.1 Endpoints (authoritative)

- `GET /health` → `{ status: "ok" }`

- `POST /infer`
  - Request JSON: `{ "text": "..." }`
  - Response JSON: `{ "mood": "NEUTRAL", "intensity": 0.0 }`

### 13.2 Logic & Model

- **Library**: `transformers` + `torch` (CPU only)
- **Model**: `j-hartmann/emotion-english-distilroberta-base`
- **Behavior**:
  - Load model on startup.
  - On `/infer`:
    - Run inference (softmax output).
    - Get label with max score.
    - Map label to `Mood` enum (same mapping as before).
    - Return mood and confidence score (intensity).

Rules:
- If `ENABLE_MODEL=0`, always return neutral (stub).
- If `ENABLE_MODEL=1`, run the actual model. Must handle concurrent requests (FastAPI threaded or async).


---

## 14) VN UI Rules (client, TREATMENT only)

Input: `MessageDTO.mood`, `intensity`, and `seed`.

- Single character avatar for all users:
  - `characterKey = "char-0"` (or another fixed key)
- Expression mapping (minimum set):
  - JOY/LOVE/EXCITEMENT → "happy"
  - SADNESS/GRIEF/REMORSE → "sad"
  - DISAPPROVAL/DISAPPOINTMENT → "angry"
  - SURPRISE/REALIZATION → "surprised"
  - FEAR/NERVOUSNESS → "worried"
  - default → "neutral"
- Background mapping:
  - positive moods → "bright"
  - negative moods → "dark"
  - neutral → "neutral"
  - Variation: `seed` chooses a variant index if assets exist.

Debounce:
- Minimum 3 seconds between background swaps.
- Only swap if mood changes OR `abs(intensity - lastIntensity) > 0.4`.

Assets:
- Must render even if all asset folders are empty (use CSS gradients/placeholders).

Audio:
- Optional. If file missing or load fails, disable audio gracefully (no console spam loop).

---

## 15) Analytics

All analytics are server-side inserts into `AnalyticsEvent`.

Minimum events:
- `session_start` metadata: `{ assignment }`
- `session_end` metadata: `{ durationSec, assignment }`
- `user_joined` metadata: `{ assignment }` (first seen)
- `message_sent` metadata: `{ assignment }`
- `message_mood_updated` metadata: `{ mood, intensity }`
- `scene_changed` (client emits to server only for TREATMENT) metadata: `SceneChangedPayload` minus `userId`

---

## 16) Admin REST API (server)

Base path: `/admin`

If `ADMIN_TOKEN` is non-empty, require request header `x-admin-token: <token>`.

Endpoints:

- `GET /admin/metrics/summary`
  - Returns:
    ```ts
    {
      days: Array<{ date: string; activeUsers: number; sessions: number; messages: number }>;
      avgMessagesPerUserPerDay: number;
      avgSessionDurationSec: number;
      treatmentShareActive: number; // 0..1
      retention: { d1: number; d7: number }; // 0..1
    }
    ```

Retention definition (must be implemented as written):
- Cohort by `User.createdAt` date (UTC date string).
- A user is **D1 retained** if their `lastSeenAt` >= cohortDate + 1 day.
- A user is **D7 retained** if their `lastSeenAt` >= cohortDate + 7 days.

- `GET /admin/users`
  - Returns array:
    ```ts
    Array<{
      userId: string;
      nickname: string;
      assignment: Assignment;
      createdAt: string;
      lastSeenAt: string | null;
      lastSessionDurationSec: number | null;
    }>
    ```

Client admin UI:
- Route: `/admin`
- Show tables; charts optional.

---

## 17) Dev & Deployment

### 17.1 Dev

Root scripts must include:
- `npm run dev` → runs client + server + python concurrently
- `npm run build` → builds client + server (if needed)
- `npm run lint` (optional)

### 17.2 Production (Docker Compose, linux/arm64)

Compose services:
- `python` (FastAPI on 8000)
- `server` (Node on 3000, uses `PY_INFER_URL=http://python:8000`)
- **Default**: Serve built client as static files from Express server (simplest for MVP).

Health checks:
- server: `GET /health`
- python: `GET /health`

### 17.3 Graceful Shutdown

Both server and python must handle `SIGTERM`:
- Close new connections gracefully.
- Allow in-flight requests/sockets 5 seconds to complete.
- Inference worker: finish current job if processing, skip queue.
