# Git Templates Reference

## .gitignore — Python + Node.js + Docker

Use this as a starting point. Remove sections that don't apply to your project.

```gitignore
# Python
__pycache__/
*.py[cod]
*.egg-info/
dist/
build/
.venv/
venv/
*.egg

# Node.js
node_modules/
.next/
dist/
build/
*.tgz

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Docker
docker-compose.override.yml

# Logs
*.log
logs/

# Test / coverage
.coverage
htmlcov/
.pytest_cache/
coverage/

# Secrets — never commit these
*.pem
*.key
*.crt
```

## Pull Request Template

Save as `.github/pull_request_template.md` in your repo:

```markdown
## What

Brief description of what this PR does.

## Why

Why is this change needed? Link to issue or task if applicable.

## How

Key implementation decisions or trade-offs worth noting.

## Testing

How was this tested? What should the reviewer check?

- [ ] Tests pass locally
- [ ] No new warnings or errors
- [ ] Tested manually (describe how)
```

## Commit Message Examples

Good:
```
feat: add POST /events endpoint

Accepts RDF triples in Turtle syntax, stores in GraphDB,
and publishes to the event queue.
```

```
fix: handle GraphDB connection timeout

Wrapped SPARQL calls in try/except with 503 response.
Previously the API returned a 500 with a stack trace.
```

```
refactor: extract queue publishing to service layer

Moved pika logic out of route handler into
services/queue.py for consistency with other services.
```

```
docs: add API endpoint documentation to README
```

```
test: add tests for event validation edge cases
```

```
chore: update dependencies in requirements.txt
```

Bad:
```
fixed stuff          ← vague, no type
WIP                  ← never commit work in progress
add endpoint and fix bug and update docs  ← multiple changes
Updated events.py    ← describes file, not change
```

## Branch Naming Examples

Good:
```
feature/add-events-endpoint
feature/graphdb-health-check
fix/queue-retry-timeout
refactor/extract-sparql-service
docs/update-readme
```

Bad:
```
my-branch            ← meaningless
Feature/Events       ← capitals
fix_bug              ← underscores
feature/add-the-new-post-events-endpoint-for-creating-events  ← too long
```

## Useful Git Aliases

Add to `~/.gitconfig` for faster workflow:

```ini
[alias]
    co = checkout
    br = branch
    ci = commit
    st = status
    lg = log --oneline --graph --decorate --all -20
    undo = reset --soft HEAD~1
    amend = commit --amend --no-edit
    prune-merged = !git branch --merged develop | grep -v 'develop\\|main' | xargs -r git branch -d
```

## Branch Protection Rules (GitHub)

Recommended settings for `main`:
- Require pull request before merging
- Require at least 1 approval (skip for solo projects)
- Require status checks to pass (when CI is set up)
- Do not allow force pushes
- Do not allow deletions

Recommended settings for `develop`:
- Require pull request before merging
- No approval required (for speed during solo development)
- Require status checks to pass (when CI is set up)
