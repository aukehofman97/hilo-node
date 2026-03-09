# Pre-Production Checklist

Items that MUST be resolved before HILO Node goes into production or becomes a public/shared repository.

---

## 🔴 Critical — Security

### ENV-1: Gitignore real env files and purge from history
**Priority:** P0 — do before any new collaborator is added or repo goes public
**Why:** `INTERNAL_KEY` and any future secrets added to `.env.node-a` / `.env.node-b` are currently committed and in git history. Even if the repo stays private, this is a bad pattern.
**What to do:**
1. Flip `.gitignore`: remove `!.env.node-*`, add `.env.node-*.example` allowlist
2. Create `.env.node-a.example` and `.env.node-b.example` with placeholder values
3. Purge real env files from git history (`git filter-repo --path .env.node-a --invert-paths`)
4. Force-push cleaned history
5. Rotate `INTERNAL_KEY` after purge (assume it was exposed)

### ENV-2: Rotate INTERNAL_KEY if repo is ever shared
**Priority:** P0 (conditional)
**Why:** The current key is in git history. Rotating it is cheap.
**What to do:** Generate new key (`openssl rand -hex 32`), update `.env.node-a` and `.env.node-b`, restart API containers.

---

## 🟠 High — Hardening

### SEC-1: Restrict CORS origins
**Priority:** P1
**Why:** `docker-compose.yml` sets `allow_origins=["*"]` — any website can call the API.
**What to do:** Set `HILO_CORS_ORIGINS` env var and restrict to known UI origins (e.g. `https://node-a.hilosemantics.com`).

### SEC-2: Replace internal key auth with proper JWT on all endpoints
**Priority:** P1
**Why:** The `Bearer dev` / internal key is a shared secret — no per-user identity, no expiry per request.
**What to do:** V3/V4 scope — Cloudflare Access for UI, eIDAS 2.0 wallet for peers.

### SEC-3: Set `HILO_JWT_EXPIRY_MINUTES` to a short value
**Priority:** P1
**Why:** Default is 5 minutes — verify this is enforced in production and not overridden to something long.

---

## 🟡 Medium — Ops

### OPS-1: Health check on cloudflared container
**Priority:** P2
**Why:** `cloudflared` has no healthcheck — if the tunnel drops, Docker won't restart it automatically.
**What to do:** Add a healthcheck that curls the metrics endpoint (`localhost:20241/metrics`).

### OPS-2: Log rotation / centralised logging
**Priority:** P2
**Why:** Container logs are unbounded — will fill disk over time.
**What to do:** Add `logging` config to docker-compose services, or ship to a log aggregator.

### OPS-3: GraphDB repository backup
**Priority:** P2
**Why:** Event data lives in GraphDB — no backup strategy means data loss on volume failure.
**What to do:** Scheduled export of the `hilo` repository to a Turtle dump, stored off-machine.

---

## 🟢 Nice to Have — Before V3

### UI-1: Remove `|| "dev"` fallback from `events.ts`
**Priority:** P3
**Why:** Once ENV-1 is done and secrets are properly managed, the `"dev"` fallback in `fetchEvents` / `fetchEvent` / `importEvent` is dead code and could mask a misconfiguration.
**What to do:** Remove fallback, let it fail loudly if `VITE_INTERNAL_KEY` is missing.

---

*Last updated: 2026-03-09*
