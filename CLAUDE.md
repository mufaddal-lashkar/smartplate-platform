# SmartPlate — project instructions

## Before every commit — no exceptions, no reminder needed

Invoke the **`coding-rules`** skill and run its Review Checklist as a self-review pass over the
staged changes. Fix every violation, then commit. This is automatic — never wait to be asked.

`coding-rules` is the single source of truth for how code is written here: comment and type bans,
file reuse, per-service conventions, architectural invariants, and git discipline. Rules are cited
by number (`violates R15`).

Design documents are the source of truth for *what* to build:

- `docs/architecture/` — six design docs (architecture, data model, API contract, agent contracts,
  seed generator, frontend IA)
- `docs/plans/` — the implementation roadmap and per-phase plans

## Local-only, never pushed

`docs/` and `.claude/` are git-ignored. Design docs, plans, and the `coding-rules` skill stay on
this machine.
