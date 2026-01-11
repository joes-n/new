# Possible issues in Specifications.md

## Feasibility Concerns
4. Single Background Worker Bottleneck (Lines 438-453)
- "A single background loop" for inference could become a bottleneck
- If users send 20 msgs/sec but inference takes 500ms each, queue grows infinitely
- Risk: High under even moderate load
- Recommendation: Either:
    - Add concurrency (process N jobs in parallel)
    - Add queue size limits with backpressure
    - Document max sustainable message rate
5. SQLite Concurrency Limitations (Line 37)
- SQLite with Socket.IO under concurrent writes is problematic
- "stable under low concurrency" (line 16) contradicts the need for realtime chat
- Multiple concurrent upsert operations will cause SQLITE_BUSY errors
- Recommendation:
    - Add explicit SQLite WAL mode configuration
    - Document expected max concurrent users (e.g., "stable up to 50 concurrent users")
    - Consider Postgres for production if targeting >100 concurrent users
6. Rate Limiting Per-User vs Global (Lines 126-127)
- Spec defines RATE_LIMIT_MAX=10 per 10s window but doesn't specify if this is per-user or global
- Implementation assumes per-user (line 426: "apply rate limit")
- Fix: Explicitly state "per-user rate limit"

## Optimization Opportunities
7. Message History Query Inefficiency (Line 411)
- "Load last MESSAGE_HISTORY_LIMIT messages (descending by createdAt, then reverse for chronological)"
- Requires fetching + reversing in memory
- Optimization: Use ORDER BY createdAt ASC LIMIT N OFFSET (SELECT COUNT(*) - N FROM messages) or similar pagination pattern
- Current approach is fine for 200 messages but clarify
8. Missing Index on User.assignment (Line 207)
- Admin queries likely filter by assignment (lines 551, 530)
- No index on User.assignment
- Add: @@index([assignment]) or composite @@index([assignment, createdAt])
9. Redundant lastSeenAt Updates (Lines 406, 420, 427)
- Updates lastSeenAt on:
    - Session start (406)
    - Disconnect (420)
    - Every message send (427)
- Impact: Excessive DB writes, potential lock contention
- Optimization: Debounce lastSeenAt updates (e.g., max once per 60s per user) or only update on disconnect
10. Scene Change Analytics Without Deduplication (Lines 454-459)
- Every scene:changed event inserts an analytics record
- No mention of deduplication or throttling
- If client misfires, could spam DB with identical events
- Recommendation: Either server-side debounce (e.g., max 1 per 3s per user) or document client responsibility

## Minor Issues
11. Missing Error Handling Spec for Session Validation (Lines 401-413)
- What happens if nickname validation fails (e.g., empty string, >20 chars)?
- Should emit error:invalid_payload but not explicitly stated
- Fix: Add explicit error case
12. Seed Generation Not Defined (Lines 232, 433)
- seed = stableSeed(messageId) mentioned but algorithm not specified
- LLM code generator might invent different implementations
- Fix: Specify algorithm (e.g., seed = messageId.slice(0, 8) or seed = hash(messageId).toString())
13. Docker Compose Missing Client Deployment Strategy (Lines 589-596)
- Says "Optional: Serve built client from server, OR add nginx"
- For code generation, this should be deterministic
- Fix: Pick one approach as the default implementation
14. Missing Graceful Shutdown (No Coverage)
- No mention of graceful shutdown for Docker containers
- Socket.IO connections should be closed cleanly
- Inference worker should finish pending jobs
- Recommendation: Add shutdown requirements