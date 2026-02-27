---
name: git-workflow
description: Manage Git version control and GitHub collaboration following best practices. Use when creating repositories, writing commits, managing branches, creating pull requests, resolving merge conflicts, setting up .gitignore, or structuring a release workflow. Use when user says "commit", "branch", "merge", "pull request", "PR", "push", "git init", "gitignore", "release", "tag", or "rebase". Do NOT use for CI/CD pipeline configuration or GitHub Actions — those are infrastructure concerns.
metadata:
  author: HILO Semantics
  version: 1.0.0
---

# Git Workflow

Standard Git practices for clean, traceable, and collaborative software development. This skill is project-agnostic and applies to any repository.

## Instructions

### Step 1: Repository setup

Every project starts with:

1. `git init` or clone from GitHub
2. A `.gitignore` tailored to the tech stack (see references for templates)
3. A `main` branch as the stable, production-ready branch
4. A `develop` branch as the integration branch for ongoing work

CRITICAL: Never commit directly to `main`. All changes go through branches and pull requests.

### Step 2: Branching strategy

Use short-lived feature branches off `develop`:

```
main          ← stable, deployable
  └── develop ← integration branch
        ├── feature/add-events-endpoint
        ├── feature/graphdb-connection
        └── fix/queue-retry-logic
```

Branch naming convention:
- `feature/<short-description>` — new functionality
- `fix/<short-description>` — bug fixes
- `refactor/<short-description>` — code restructuring without behavior change
- `docs/<short-description>` — documentation only

Keep branch names lowercase, use hyphens, no spaces. Max 50 characters.

### Step 3: Write good commits

Every commit message follows this format:

```
<type>: <short summary in imperative mood>

<optional body: why this change was made, not what>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

Rules:
- Summary line max 72 characters
- Use imperative mood: "add endpoint" not "added endpoint" or "adds endpoint"
- One logical change per commit. Never mix unrelated changes.
- If you need to say "and" in the summary, it should probably be two commits.

### Step 4: Pull requests

Every branch merges into `develop` via a pull request (PR). PRs should:

1. Have a clear title following the same commit convention
2. Include a short description of what changed and why
3. Reference any related issues or tasks
4. Be small enough to review in 15 minutes (under 400 lines changed)
5. Pass all tests before requesting review

When merging: use **squash and merge** for feature branches (keeps history clean). Use **merge commit** when merging `develop` into `main` (preserves the integration point).

### Step 5: Releases

When `develop` is stable and ready for release:

1. Merge `develop` into `main` via PR
2. Tag the merge commit: `git tag -a v1.0.0 -m "V1: single node in Docker"`
3. Push the tag: `git push origin v1.0.0`

Use semantic versioning: `v<major>.<minor>.<patch>`
- Major: breaking changes
- Minor: new functionality, backwards compatible
- Patch: bug fixes

### Step 6: Keep it clean

- Pull before you push: `git pull --rebase origin develop` before pushing
- Delete merged branches: locally and on GitHub
- Never commit secrets, credentials, or `.env` files
- Never commit large binary files (use `.gitignore`)
- Never force push to `main` or `develop`

## Examples

**Example 1: "Start a new feature"**

Actions:
1. `git checkout develop && git pull`
2. `git checkout -b feature/add-health-endpoint`
3. Make changes, commit incrementally
4. `git push -u origin feature/add-health-endpoint`
5. Open PR on GitHub targeting `develop`

**Example 2: "I made a mess of my commits"**

Actions:
1. Interactive rebase to clean up: `git rebase -i HEAD~<n>`
2. Squash related commits, reword unclear messages
3. Force push to your feature branch only: `git push --force-with-lease`

**Example 3: "Set up a new repository"**

Actions:
1. `git init`
2. Create `.gitignore` from references template
3. Initial commit: `chore: initial project setup`
4. Create GitHub repo and push
5. Create `develop` branch: `git checkout -b develop && git push -u origin develop`
6. Set `develop` as default branch on GitHub
7. Enable branch protection on `main` (require PR, no direct push)

## Troubleshooting

**Error: "Your branch has diverged"**
Cause: Someone else pushed to the same branch, or you rebased after pushing.
Solution: `git pull --rebase origin <branch>` to replay your commits on top. Resolve conflicts if any.

**Error: Accidentally committed to `main`**
Cause: Forgot to create a feature branch.
Solution: `git branch feature/my-work` (saves your commits), `git reset --hard origin/main` (resets main), `git checkout feature/my-work` (continue on branch).

**Error: Committed a secret or .env file**
Cause: Missing `.gitignore` entry.
Solution: Remove the file, add to `.gitignore`, commit. If already pushed: rotate the credential immediately, then use `git filter-branch` or BFG Repo-Cleaner to purge from history.

**Error: Merge conflicts**
Cause: Two branches modified the same lines.
Solution: Open the conflicting files, look for `<<<<<<<` markers. Choose the correct version, remove markers, stage and commit. Never blindly accept "theirs" or "ours".

## References

For `.gitignore` templates and PR description templates, see `references/git-templates.md`.
