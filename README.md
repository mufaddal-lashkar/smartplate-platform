# SmartPlate

An AI-powered food management platform for restaurants. It helps kitchens **prevent** waste rather
than just donate it — and when surplus is unavoidable, it routes that surplus down a waterfall that
protects the restaurant's margin first.

```
leftover: 10 kg cooked rice
   │
   ├─▶ ① SELF-REUSE      AI: "you historically turn ~5 kg into fried rice"  → no loss at all
   │
   └─▶ ② B2B OFFER       5 kg to nearby restaurants at a price the owner sets → cost recovered
              │
              └─▶ ③ NGO DONATION   no taker by (safe_until − 4h) → free, auto-escalated, still safe
                        │
                        └─▶ ④ WASTE   past safe_until, nobody took it
```

Donation is the **third-best** outcome, not the goal. A restaurant that donates 10 kg every day is a
restaurant losing money every day. The headline metric is **recovery rate** — the share of surplus
that avoided step ④.

---

## Quick start

**Prerequisites:** Docker (with Compose v2). That's it — Postgres, Redis, Bun, and Python all run in
containers. Nothing to install locally.

```bash
cp .env.example .env      # optional; every value has a working default
docker compose up --build
```

Then open **http://localhost:8080**. The page reports the health of every service, so you can see
the whole topology come up.

| Command | What it does |
|---|---|
| `docker compose up --build` | Production-shaped: nginx serves the built SPA |
| `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` | Dev: bind mounts + hot reload everywhere |
| `docker compose down` | Stop |
| `docker compose down -v` | Stop **and wipe the database** |
| `docker compose logs -f main-service` | Tail one service |

---

## Architecture

```
                       ┌─────────────┐
   browser ───:8080───▶│  frontend   │  React 19 + Vite + Tailwind + TanStack Query
                       │   (nginx)   │  static build; proxies /api
                       └──────┬──────┘
                              │                        edge network
                       ┌──────▼───────┐
                       │ main-service │  Bun + Elysia + TypeScript
                       │    (API)     │  ◀── SOLE owner of Postgres
                       └──┬────┬───┬──┘      auth · tenancy · all writes · SSE
                          │    │   │                        internal network
        ┌─────────────┐   │    │   │                    (no published ports)
        │   worker    │◀──┘    │   │   same image, command: bun run src/worker.ts
        │  (BullMQ)   │──┐     │   │
        └─────────────┘  │     │   │
       ┌─────────────┐   │  ┌──▼───▼────┐   ┌──────────┐
       │agent-service│◀──┘  │ postgres  │   │  redis   │
       │  FastAPI    │      │ 17+PostGIS│   │ queue +  │
       │  STATELESS  │      └───────────┘   │ pub/sub  │
       └──────┬──────┘                      └──────────┘
              └──────▶ Gemini API
```

**Four rules that define the system:**

1. The browser talks to **main-service only**.
2. main-service and worker talk to **agent-service only**.
3. agent-service talks to **Gemini only** — it has no database, no Redis, and never calls back.
4. Therefore **no call cycles exist**, by construction.

**One published port.** Postgres, Redis, agent-service, main-service and the worker are reachable
only on the internal Docker network.

**Tenant isolation is enforced by Postgres**, not by convention. Every request runs in a transaction
that sets `app.tenant_id`, and row-level security policies apply to every tenant-scoped table. A
handler that forgets a `WHERE` clause returns zero rows, not another restaurant's inventory.

---

## Repository layout

```
apps/
  frontend/       React 19 + Vite SPA          → nginx in production
  main-service/   Bun + Elysia + TypeScript    → API + BullMQ worker (same image)
  agent-service/  Python 3.12 + FastAPI        → stateless AI compute
packages/
  contracts/      shared TypeScript types (envelope, error codes)
db/
  migrations/     Drizzle migrations
  seed/           90-day synthetic history generator
```

Design documents live in `docs/` and are **kept local** — not tracked in this repository.

---

## Conventions

**TypeScript** — functional only, no classes for domain logic (`Error` subclasses excepted). Modules
are `<domain>.route.ts` / `.schema.ts` / `.service.ts`, kebab-case. Biome: tabs, double quotes,
100 columns. No barrel files. `dayjs`, never `new Date()`. Zod for runtime validation.

**Python** — classes are idiomatic here; the no-class rule is TypeScript-only.

Run `bun run lint` (or `bun run format` to fix).

---

## Status

**Phase D — org / team / admin / NGO verification / settings / auth extras** complete and
ready for UI testing on the `phase-d-org-admin` branch. Phases A (inventory + kitchen), B
(marketplace + NGO pickups), and C (analytics + reports + charts) have merged to `main`.

- Seeded accounts (password `smartplate-demo-2026` for all):
  - **Platform** — `admin@smartplate.local` (super_admin)
  - **Spice Route / Anna Tiffin / Green Bowl** — owners + staff
  - **Akshaya Trust** — verified NGO (admin + volunteer)
  - **Helping Hands** — NGO pending verification (admin + volunteer)
- Try the admin queue at `/admin/verification` and the team/settings pages under each tenant.
