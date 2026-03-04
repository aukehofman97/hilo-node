# HILO Node — Lessons Learned

## 2026-03-04

### L3: Use `import.meta.env.VITE_*` in Vite projects — never `process.env.REACT_APP_*`

**Pattern:** The UI was scaffolded with Vite but env vars were written using the CRA convention (`process.env.REACT_APP_*`). This caused TypeScript errors (TS2580: `process` unknown) because Vite does not declare `process` as a global. A partial workaround was added in `vite.config.ts` via the `define` block, which papered over the issue for one variable but left others broken and introduced technical debt.

**Rule:** In Vite projects, always use `import.meta.env.VITE_*` for environment variables. Types are declared in `src/vite-env.d.ts` using `/// <reference types="vite/client" />` and a custom `ImportMetaEnv` interface. Never use `process.env.*` or the `define` shim to emulate CRA patterns.

**PNG / asset imports:** TypeScript requires a module declaration for non-JS imports. Add `declare module "*.png"` (and `*.svg`) to `src/vite-env.d.ts`. This file is the single place for all Vite-specific type declarations.

**Detection:** Grep for `process\.env` in `ui/src` before merging any frontend PR. If found, migrate to `import.meta.env.VITE_*`.

**Corollary — always audit infrastructure files too:** When renaming any env var, grep `docker-compose.yml` (and any `.env.*` files) for the old name and update them in the same commit. Env var renames that only touch `src/` are incomplete — the container that injects the value is just as important as the code that reads it. Missing this breaks running deployments silently (no error, wrong default used instead).

---

## 2026-03-01

### L2: Always run the four gates before implementation

**Pattern:** On the dashboard redesign and Events/Queue page builds, all four workflow gates (architecture → review → planning → review) were skipped entirely. The user handed a written plan for the first task, and the second task was treated as "continuation" — both were used as rationalization to jump straight to code.

**Rule:** The four gates are hard stops, not suggestions:
1. `architecture` skill → artifact
2. `review` skill → **wait for user approval**
3. `planning` skill → task breakdown
4. `review` skill → **wait for user approval**

"The user gave me a plan" satisfies Gate 1 only. Gates 2 and 4 (review + human approval) always run. If tempted to skip a gate, stop, name it, explain why, and wait for explicit permission.

**Detection:** Before writing any implementation code, check: have all four gates been completed and approved? If not, stop.

---

## 2026-02-27

### L1: Docker WORKDIR and Python import paths must match

**Pattern:** When a FastAPI app's Dockerfile uses `WORKDIR /app` and `COPY . .` from `./api`, all files land at `/app/` root — there is no `api` package in the container. Imports like `from api.config import settings` will fail with `ModuleNotFoundError`.

**Rule:** Use top-level imports in the API source: `from config import settings`, `from models.events import EventCreate`, `from services import graphdb`. Match the import root to the `WORKDIR` in the Dockerfile, not the host directory name.

**Detection:** Search for `from api.` in `api/` source files before building. If found, strip the `api.` prefix.
