# HILO Node — Lessons Learned

## 2026-02-27

### L1: Docker WORKDIR and Python import paths must match

**Pattern:** When a FastAPI app's Dockerfile uses `WORKDIR /app` and `COPY . .` from `./api`, all files land at `/app/` root — there is no `api` package in the container. Imports like `from api.config import settings` will fail with `ModuleNotFoundError`.

**Rule:** Use top-level imports in the API source: `from config import settings`, `from models.events import EventCreate`, `from services import graphdb`. Match the import root to the `WORKDIR` in the Dockerfile, not the host directory name.

**Detection:** Search for `from api.` in `api/` source files before building. If found, strip the `api.` prefix.
