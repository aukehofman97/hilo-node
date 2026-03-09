# Review: Plan — Cloudflare Tunnel

**Date:** 2026-03-09
**Artifacts:** `tasks/user-stories-cloudflare.md`, `tasks/todo.md` (cloudflare-tunnel section)
**Reviewer:** Claude Code

---

## Checklist

### Story Quality
- [x] Every story traces back to architecture
- [x] Every story has ≥2 testable acceptance criteria
- [x] No vague criteria
- [x] Stories prioritized (all Must — correct given scope)
- [ ] Two gaps found — see Critical below

### Task Quality
- [x] Every task references a parent user story — no orphans
- [x] Tasks ordered by dependency (branch → secrets → config → docker → env → auth → UI → docs → verify)
- [x] Each task achievable in ≤1 session
- [ ] Missing tasks — see Critical below

### Edge Cases
- [ ] cloudflared restart-loop not addressed (see Concern W1)
- [x] Auth failure cases covered in US-6, US-7
- [x] UI key fallback to "dev" covered in US-8

### Cross-Check
- [x] Architecture and plan consistent on core goal
- [ ] VITE_API_URL inconsistency between architecture and scope (see Critical C1)
- [x] Scope matches architecture — nothing added beyond what was defined

---

## Findings

### Critical (must fix)

**C1 — VITE_API_URL in env files is incorrect for this branch**

The architecture doc adds `VITE_API_URL=https://node-a.hilosemantics.com` to both env files, and tasks T-54/T-55 implement this. But the UI stays on localhost in this branch — it calls its local API at `http://localhost:8000`, not the public Cloudflare URL. Adding `VITE_API_URL` to the env files would:
- Only take effect if `docker-compose.yml` UI service is also updated to use `${VITE_API_URL:-...}` (currently hardcoded)
- If it does take effect, the local UI would route all API calls through Cloudflare — unnecessary round-trip, slower, and breaks offline dev

Fix: **Remove `VITE_API_URL` from T-54 and T-55.** The UI stays on localhost with the existing `VITE_API_URL: http://localhost:${API_PORT:-8000}` in docker-compose.yml. `VITE_API_URL` is V3 scope (when the UI gets a public subdomain). Also update the architecture doc to remove it from the ENV changes section.

**C2 — No task to update API tests after auth is added to POST /events and GET /events**

T-56 adds `Depends(require_jwt)` to `POST /events` and T-57 adds it to `GET /events`. Both routes currently have tests that call them without auth headers. After these tasks, those tests will return 401 and fail. There is no task to update the tests.

Fix: Add task **T-56b** — update `api/tests/test_events.py`: add `Authorization: Bearer dev` header to all `POST /events` and `GET /events` test calls; add explicit 401 test cases for both routes without auth.

---

### Concerns (should address)

**W1 — cloudflared will restart-loop if credentials file is absent**

Task T-53 adds `restart: unless-stopped` to cloudflared. If a developer runs `docker-compose up` before placing their credentials JSON (i.e., before completing the Cloudflare dashboard setup), the container will exit and restart indefinitely. This is noisy and confusing.

Suggestion: change cloudflared to `restart: on-failure` with a short max count, or add a note in T-53 that this is expected until credentials are placed. The verification tasks (T-60 onwards) implicitly require credentials to be in place — make this explicit.

**W2 — No placeholder/example credentials file**

There is no committed example showing the expected format of `cloudflared/credentials.node-a.json`. Operators setting up for the first time have no reference.

Suggestion: add task to commit `cloudflared/credentials.node-a.json.example` with the Cloudflare credentials JSON schema (tunnel ID, account tag, secret). This is safe to commit since it's clearly an example with placeholder values.

**W3 — T-60 implicitly requires operator setup to be complete**

T-60 ("start Node A, confirm all 6 containers healthy including cloudflared") only works if the operator has already: created the tunnel in the dashboard, downloaded credentials, placed the file, and set the tunnel ID in the config YAML. There is no task that checks these prerequisites before T-60.

Suggestion: add a pre-verify task — T-59b: "confirm `cloudflared/credentials.node-a.json` exists and contains a valid tunnel ID; confirm tunnel ID in `cloudflared/config.node-a.yml` matches; confirm public hostname is configured in Cloudflare dashboard."

---

### Suggestions

**S1 — Docker Compose `profiles` for cloudflared (opt-in)**

Developers who haven't set up Cloudflare can't run the stack cleanly because cloudflared will restart-loop. A Docker Compose `profile` (`--profile tunnel`) would make cloudflared opt-in — the stack starts fine without it, and adding `--profile tunnel` enables the tunnel. Low overhead, high usability.

**S2 — Explicit note that two tunnels must be created**

The todo list and README task (T-59) don't explicitly state that the operator must repeat the entire dashboard setup for Node B. Worth a one-liner to prevent confusion.

---

## What's Solid

- **Story ordering is correct.** Natural dependency chain — secrets before config, config before Docker, Docker before env, auth before verify.
- **No orphan tasks.** Every T- references a US-.
- **Auth tasks are minimal and targeted.** T-56, T-57, T-58 are one-line changes each. No over-engineering.
- **E2E verification (US-10 / T-60–T-65) is thorough.** Covers the exact failure mode that prompted this feature (the "load failed" fetch).
- **Secrets handling is correct.** .gitignore before config files, credentials files never in env vars.

---

## Verdict

**Status: Approved with changes**

**Blocking issues:**
- C1: Remove `VITE_API_URL` from T-54/T-55 and architecture ENV section — not needed this branch
- C2: Add T-56b to update API tests after auth is added to POST /events and GET /events

**Recommended action:** Fix C1 and C2, address W1–W3 if time permits, then proceed to implementation on `feature/cloudflare-tunnel`.
