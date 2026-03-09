# Architecture: Cloudflare Tunnel — Public HTTPS for Local Nodes

**Date:** 2026-03-09
**Branch:** `feature/cloudflare-tunnel` off `main`
**Status:** Approved — proceeding to planning

---

## Problem

When running two nodes on one machine, Node A stamps `data_url` as:

```
http://host.docker.internal:8000/events/{id}
```

This URL is reachable by Node B's container (Docker bridge), but **not by the browser**. The browser sees a network error ("load failed") when it tries to fetch the full event. The only clean fix is for `data_url` to use a hostname both containers and browsers can resolve — i.e., a real public URL.

Additionally, with a public API URL, `POST /events` and `GET /events` (currently unauthenticated) become exposed to anyone on the internet. Per the architecture document, these are **legacy system → node** interfaces — internal only. They must require the internal key when the node is public-facing.

---

## Goal

Replace `host.docker.internal` with real public HTTPS URLs via Cloudflare Tunnel, so:

- `NODE_BASE_URL` = `https://node-a.hilosemantics.com`
- `data_url` = `https://node-a.hilosemantics.com/events/{id}`
- Browsers, Node B containers, and Node A containers all resolve it correctly
- No proxy code needed — fixes the root cause, not the symptom
- Docker Compose infrastructure unchanged

This is the V2.5 milestone: still local Docker, but production-equivalent HTTPS + DNS.

**UI is not exposed publicly in this branch.** The UI remains on localhost. Public UI with Cloudflare Access authentication is V3 scope (cloud hosting milestone).

---

## Scope

| In scope | Out of scope |
|---|---|
| Cloudflare Tunnel for Node A and Node B APIs | UI public subdomain (V3) |
| Public HTTPS API subdomains on hilosemantics.com | Cloudflare Access for UI (V3) |
| Auth on `POST /events` and `GET /events` (internal key) | Cloud hosting migration (V3) |
| `.env` updates for NODE_BASE_URL and VITE_API_URL | eIDAS 2.0 wallet auth (V4) |
| Cloudflare rate limiting (basic rule) | CI/CD pipeline |
| `docs/` folder with architecture reference materials | |

---

## Architecture

### Subdomains

| Subdomain | Routes to | Access |
|---|---|---|
| `node-a.hilosemantics.com` | API port 8000 | Public (per endpoint policy below) |
| `node-b.hilosemantics.com` | API port 9000 | Public (per endpoint policy below) |

UI remains on `localhost:3000` / `localhost:3002` — local access only.

### Endpoint access matrix

| Endpoint | Public | Auth required | Rationale |
|---|---|---|---|
| `GET /.well-known/hilo-node` | ✅ | None | Peer discovery |
| `GET /health` | ✅ | None | Monitoring |
| `POST /bridge/receive` | ✅ | None | Peer forwarding — notification only, no sensitive data |
| `POST /connections/request` | ✅ | None | Peer handshake |
| `POST /connections/accepted` | ✅ | None | Peer handshake callback |
| `GET /connections/{peer}/token` | ✅ | None | Token generation for peer fetch |
| `GET /events/{id}` | ✅ | ✅ RS256 JWT | Triples are sensitive — already implemented |
| `GET /events` (list) | ❌ | ✅ Internal key | Internal interface — subject URIs are sensitive |
| `POST /events` | ❌ | ✅ Internal key | Internal interface — legacy system only |
| `POST /events/{id}/import` | ❌ | ✅ Internal key | Already implemented |

> `GET /events` and `POST /events` currently have no auth. Adding the internal key guard is required before going public. The `require_jwt` dependency already supports the internal key — this is a one-line addition per route.

### cloudflared deployment

**Decision: Docker service inside each node's compose stack.**

- Stays within the "one command to start" philosophy
- Tunnel lifecycle tied to the node
- No host daemon dependency

Each node gets a `cloudflared` container. Authentication uses the **credentials JSON file** approach — not the `TUNNEL_TOKEN` env var. Reasons:
- Credentials JSON supports multiple hostname ingress rules in one tunnel
- Already planned as git-ignored (`cloudflared/credentials.*.json`)
- No secret in any committed file

### Tunnel configuration

```yaml
# cloudflared/config.node-a.yml  (committed — no secrets)
tunnel: <tunnel-id>
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: node-a.hilosemantics.com
    service: http://api:8000
  - service: http_status:404
```

Node B uses the same pattern with its own tunnel ID and subdomain.

### docker-compose.yml addition

```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  container_name: hilo-${NODE_ID:-node-a}-cloudflared
  command: tunnel --config /etc/cloudflared/config.yml run
  volumes:
    - ./cloudflared/config.${NODE_ID:-node-a}.yml:/etc/cloudflared/config.yml:ro
    - ./cloudflared/credentials.${NODE_ID:-node-a}.json:/etc/cloudflared/credentials.json:ro
  networks:
    - hilo-net
  depends_on:
    api:
      condition: service_healthy
  restart: unless-stopped
```

### ENV changes

**.env.node-a**
```diff
-NODE_BASE_URL=http://host.docker.internal:8000
+NODE_BASE_URL=https://node-a.hilosemantics.com
```

**.env.node-b**
```diff
-NODE_BASE_URL=http://host.docker.internal:9000
+NODE_BASE_URL=https://node-b.hilosemantics.com
```

> `VITE_API_URL` is not changed here. The UI stays on localhost this branch and calls its local API directly. `VITE_API_URL` is V3 scope (when the UI gets a public subdomain).

> `--env-file` is now **required** for correct operation. Running bare `docker-compose up` without `--env-file` falls back to localhost defaults and breaks the public URL flow.

### Cloudflare rate limiting

One basic rate limiting rule per tunnel (free tier):
- Max 100 requests / minute / IP to the API
- Protects against naive abuse without impacting legitimate use

Configured in the Cloudflare dashboard — no code change.

---

## Files to create / modify

| File | Change |
|---|---|
| `cloudflared/config.node-a.yml` | Tunnel config for Node A (committed, no secrets) |
| `cloudflared/config.node-b.yml` | Tunnel config for Node B (committed, no secrets) |
| `cloudflared/credentials.node-a.json` | Tunnel credentials Node A (**git-ignored**) |
| `cloudflared/credentials.node-b.json` | Tunnel credentials Node B (**git-ignored**) |
| `docker-compose.yml` | Add `cloudflared` service |
| `.env.node-a` | Update NODE_BASE_URL, add VITE_API_URL |
| `.env.node-b` | Update NODE_BASE_URL, add VITE_API_URL |
| `.gitignore` | Add `cloudflared/credentials.*.json` |
| `api/routes/events.py` | Add `Depends(require_jwt)` to `GET /events` and `POST /events` |
| `docs/` | Architecture reference PDFs and diagrams (committed) |
| `README.md` | Add Cloudflare Tunnel setup section |

---

## One-time operator setup (per node)

1. Log in to Cloudflare dashboard → Zero Trust → Networks → Tunnels → Create tunnel
2. Name: `hilo-node-a` → download credentials JSON
3. Place at `cloudflared/credentials.node-a.json` (git-ignored)
4. Note the tunnel ID → add to `cloudflared/config.node-a.yml`
5. Add public hostname in dashboard: `node-a.hilosemantics.com` → `http://api:8000`
6. Repeat steps 1–5 for Node B
7. (Optional) Add Cloudflare rate limiting rule: 100 req/min/IP on `node-a.hilosemantics.com`
8. Start node: `docker-compose --env-file .env.node-a up --build`

---

## What this fixes

| Before | After |
|---|---|
| `data_url = http://host.docker.internal:8000/events/{id}` | `data_url = https://node-a.hilosemantics.com/events/{id}` |
| Browser: "load failed" | Browser fetches successfully |
| `POST /events` unauthenticated on public URL | Internal key required |
| `GET /events` unauthenticated on public URL | Internal key required |

---

## V3 transition note

When moving to cloud hosting:
- Remove `cloudflared` service from docker-compose
- Update `NODE_BASE_URL` to cloud provider hostname
- Add Cloudflare Access on UI subdomain (email OTP / org SSO) — zero code change
- V4: EU Business Wallet auth complements or replaces Cloudflare Access

---

## Skills required

| Task | Skill |
|---|---|
| docker-compose.yml + cloudflared config | `docker` |
| `GET /events` and `POST /events` auth guard | `api-development` |
| README update | none |

---

## Reference documents

- `docs/HILO-Node-Architecture.pdf` — primary architecture reference
- `docs/HILO-PoC.pdf` — proof of concept scope
- `docs/HILO_Architecture_Fase*.png` — phase diagrams
