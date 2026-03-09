# User Stories: Cloudflare Tunnel

**Feature branch:** `feature/cloudflare-tunnel`
**Architecture ref:** `tasks/architecture-cloudflare-tunnel.md`

---

### US-1: Feature branch setup

**As a** developer
**I want** a clean feature branch off `main`
**So that** all tunnel work is isolated and reviewable as a single PR

**Acceptance criteria:**
- [ ] Branch `feature/cloudflare-tunnel` exists off `main`
- [ ] Branch is pushed to remote

**Linked tasks:** T-01
**Architecture ref:** Branch section
**Priority:** Must

---

### US-2: Secrets never committed

**As a** node operator
**I want** Cloudflare credentials files git-ignored
**So that** tunnel secrets are never accidentally committed to the repository

**Acceptance criteria:**
- [ ] `cloudflared/credentials.node-a.json` is listed in `.gitignore`
- [ ] `cloudflared/credentials.node-b.json` is listed in `.gitignore`
- [ ] `git status` does not show credential files as untracked after they are placed

**Linked tasks:** T-02
**Architecture ref:** Secrets management section
**Priority:** Must

---

### US-3: Committed tunnel config files

**As a** node operator
**I want** tunnel ingress config files committed to the repo (without secrets)
**So that** the routing rules are version-controlled and reproducible

**Acceptance criteria:**
- [ ] `cloudflared/config.node-a.yml` exists with correct ingress rule for `node-a.hilosemantics.com → http://api:8000`
- [ ] `cloudflared/config.node-b.yml` exists with correct ingress rule for `node-b.hilosemantics.com → http://api:8000`
- [ ] Both files contain a `tunnel` placeholder comment and `credentials-file` path
- [ ] Neither file contains any secret values

**Linked tasks:** T-03, T-04
**Architecture ref:** Tunnel configuration section
**Priority:** Must

---

### US-4: cloudflared runs as a Docker service

**As a** node operator
**I want** cloudflared to start automatically as part of `docker-compose up`
**So that** the tunnel is always running when the node is running, with no separate process to manage

**Acceptance criteria:**
- [ ] `docker-compose.yml` has a `cloudflared` service using `cloudflare/cloudflared:latest`
- [ ] Container name follows `hilo-${NODE_ID}-cloudflared` pattern
- [ ] Service depends on `api` being healthy before starting
- [ ] Config and credentials files are mounted read-only
- [ ] `restart: unless-stopped` is set
- [ ] `docker-compose --env-file .env.node-a up --build` starts all 6 services including cloudflared

**Linked tasks:** T-05
**Architecture ref:** cloudflared deployment section, docker-compose addition
**Priority:** Must

---

### US-5: Public HTTPS NODE_BASE_URL

**As a** node operator
**I want** `NODE_BASE_URL` set to the public HTTPS subdomain
**So that** `data_url` in event notifications resolves correctly in both browsers and peer node containers

**Acceptance criteria:**
- [ ] `.env.node-a` has `NODE_BASE_URL=https://node-a.hilosemantics.com`
- [ ] `.env.node-b` has `NODE_BASE_URL=https://node-b.hilosemantics.com`
- [ ] After `POST /events`, the returned `data_url` field equals `https://node-a.hilosemantics.com/events/{id}`
- [ ] Node B's browser UI can fetch that URL and receives the full event (after providing a valid JWT)

**Linked tasks:** T-06
**Architecture ref:** ENV changes section
**Priority:** Must

---

### US-6: POST /events requires internal key when public

**As a** node operator
**I want** `POST /events` to require the internal Bearer key
**So that** the legacy system interface is not open to arbitrary internet traffic

**Acceptance criteria:**
- [ ] `POST /events` without `Authorization` header returns `401`
- [ ] `POST /events` with `Authorization: Bearer dev` returns `201` (existing behaviour preserved)
- [ ] `POST /events` with an invalid token returns `401`
- [ ] Existing event creation tests still pass (they use the internal key)

**Linked tasks:** T-07
**Architecture ref:** Endpoint access matrix — POST /events
**Priority:** Must

---

### US-7: GET /events requires internal key when public

**As a** node operator
**I want** `GET /events` to require the internal Bearer key
**So that** event metadata (including subject URIs) is not publicly readable

**Acceptance criteria:**
- [ ] `GET /events` without `Authorization` header returns `401`
- [ ] `GET /events` with `Authorization: Bearer dev` returns `200` with event list
- [ ] `GET /events` with an invalid token returns `401`
- [ ] The UI (running on localhost) continues to work — it uses `Bearer dev` via `VITE_INTERNAL_KEY`

**Linked tasks:** T-08
**Architecture ref:** Endpoint access matrix — GET /events
**Priority:** Must

---

### US-8: UI sends internal key for event list

**As a** developer
**I want** the UI's `fetchEvents` call to include the internal key header
**So that** the Events Monitor continues to load after `GET /events` is auth-gated

**Acceptance criteria:**
- [ ] `fetchEvents` in `ui/src/api/events.ts` includes `Authorization: Bearer ${internalKey}` header
- [ ] Events Monitor page loads without errors when running locally
- [ ] No hardcoded key — uses `VITE_INTERNAL_KEY` env var (defaulting to `"dev"`)

**Linked tasks:** T-09
**Architecture ref:** Endpoint access matrix — GET /events
**Priority:** Must

---

### US-9: README documents Cloudflare Tunnel setup

**As a** node operator setting up a new node
**I want** step-by-step Cloudflare Tunnel setup instructions in the README
**So that** I can configure the tunnel without reverse-engineering the config files

**Acceptance criteria:**
- [ ] README has a "Cloudflare Tunnel setup" section
- [ ] Steps cover: create tunnel in dashboard, download credentials, place file, set tunnel ID in config, add public hostname, start node with `--env-file`
- [ ] README notes that `--env-file` is required for public URL operation
- [ ] README notes that credentials files are git-ignored and must be created per operator

**Linked tasks:** T-10
**Architecture ref:** One-time operator setup section
**Priority:** Must

---

### US-10: End-to-end verification

**As a** developer
**I want** to verify the full flow works with public URLs
**So that** I can confirm the `data_url` problem is resolved before merging

**Acceptance criteria:**
- [ ] Node A and Node B both start with all 6 containers healthy including cloudflared
- [ ] `POST /events` on Node A (with internal key) returns `data_url` = `https://node-a.hilosemantics.com/events/{id}`
- [ ] Node B receives the notification via `/bridge/receive`
- [ ] Node B's UI "Fetch full event" resolves the `data_url` and returns triples — no "load failed"
- [ ] `POST /events` without auth returns `401`
- [ ] `GET /events` without auth returns `401`

**Linked tasks:** T-11
**Architecture ref:** What this fixes section
**Priority:** Must
