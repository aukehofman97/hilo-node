# CLAUDE.md — HILO Node

## Project Context

HILO Node is a self-contained software system for semantic data sharing in logistics. It sits between a legacy system (TMS, WMS, ERP, CRM) and other nodes, translating internal data formats to RDF and exchanging events through a message queue.

This repository implements V1: a single locally hosted node running in Docker.

### Architecture (V1)

Four components, each in its own Docker container, orchestrated with docker-compose:

- **GraphDB**: Triple store (Ontotext GraphDB Free) for storing and querying RDF data via SPARQL
- **API**: FastAPI application handling POST/GET for events and data
- **Queue**: RabbitMQ (AMQP) for buffering and routing events between nodes
- **UI**: React web application for visualizing graph data and monitoring node activity

### Tech Stack

- **Backend**: Python 3.12, FastAPI, Pydantic, pika (RabbitMQ client)
- **Graph database**: Ontotext GraphDB Free, RDFLib, SHACL validation
- **Message broker**: RabbitMQ (AMQP protocol)
- **Frontend**: React, Tailwind CSS
- **Infrastructure**: Docker, docker-compose
- **Version control**: Git, GitHub

### Repo Structure

```
hilo-node/
├── CLAUDE.md
├── docker-compose.yml
├── api/                  # FastAPI application
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   ├── config.py         # Environment variables (pydantic-settings)
│   ├── models/           # Pydantic models
│   ├── routes/           # Route handlers
│   ├── services/         # Business logic (graphdb.py, queue.py)
│   └── tests/
├── ui/                   # React frontend (TypeScript, Tailwind)
│   ├── Dockerfile
│   ├── package.json
│   └── src/
├── queue/                # RabbitMQ consumer
│   ├── Dockerfile
│   ├── requirements.txt
│   └── consumer.py
├── graphdb/              # GraphDB config and sample data
│   ├── config/
│   ├── data/             # Sample RDF data (Turtle)
│   └── shapes/           # SHACL validation shapes
├── skills/               # Claude Code skill folders
│   ├── api-development/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── api-patterns.md
│   ├── docker/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── docker-templates.md
│   ├── rdf-transformation/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── rdf-patterns.md
│   ├── frontend-design/
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── brand-reference.md
│   │       ├── tailwind-theme.md
│   │       ├── design-patterns.md
│   │       └── node-ui-context.md
│   ├── async-messaging/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── messaging-patterns.md
│   └── git-workflow/
│       ├── SKILL.md
│       └── references/
│           └── git-templates.md
└── tasks/
    ├── todo.md
    └── lessons.md
```

## Skills

Each skill is a folder in `skills/` containing a `SKILL.md` with instructions and a `references/` directory with detailed code patterns. Read the relevant skill's `SKILL.md` before starting work on a component. Multiple skills may apply to a single task.

- `skills/api-development/` — FastAPI routes, Pydantic models, service layer, endpoint tests
- `skills/docker/` — Dockerfiles, docker-compose, multi-container setup, healthchecks
- `skills/rdf-transformation/` — RDF triples, SPARQL, SHACL validation, data transformation
- `skills/frontend-design/` — React/Next.js UI, HILO brand, modern dashboard design patterns
- `skills/async-messaging/` — RabbitMQ, publish/consume, retries, dead-letter, federation
- `skills/git-workflow/` — Branching, commits, PRs, releases, GitHub workflow

## Workflow

### 1. Plan First
- Enter plan mode for any non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Write plan to `tasks/todo.md` with checkable items
- Check in with the user before starting implementation

### 2. Use Subagents
- Use subagents to keep the main context window clean
- Offload research, exploration, and parallel work to subagents
- One task per subagent for focused execution

### 3. Learn From Mistakes
- After any correction: update `tasks/lessons.md` with the pattern
- Write rules that prevent the same mistake
- Review lessons at session start

### 4. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 5. Track and Explain Progress
- Mark items complete in `tasks/todo.md` as you go
- High-level summary at each step — explain what changed and why
- Add a review section to `tasks/todo.md` when a task is done
- Never mark a task complete without proving it works

### 6. Verify Before Done
- Run tests, check logs, demonstrate correctness
- Diff behavior between main and your changes when relevant
- Ask: "Would a senior developer approve this?"

### 7. Autonomous Bug Fixing
- When given a bug: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests, then resolve them
- Go fix failing tests without being told how

## Core Principles

- **Simplicity first**: Make every change as simple as possible. No over-engineering.
- **Find root causes**: No temporary fixes. Senior developer standards.
- **Minimal impact**: Changes only touch what's necessary.
- **Read the skill first**: Always check the relevant `skills/<name>/SKILL.md` before writing code. Check `references/` for detailed patterns.
- **One component at a time**: Get one component working before moving to the next.
