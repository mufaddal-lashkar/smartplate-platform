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
  bot-service/    Bun + grammY + Elysia        → Telegram channel adapter
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

**Phase E — Telegram bot** is on the `phase-e-telegram-bot` branch, ready for
end-to-end testing against a running stack. Phases A (inventory + kitchen), B
(marketplace + NGO pickups), C (analytics + reports + charts), and D (org / team
/ admin / NGO verification / settings / auth extras) have merged to `main`.

- Seeded accounts (password `smartplate-demo-2026` for all):
  - **Platform** — `admin@smartplate.local` (super_admin)
  - **Spice Route / Anna Tiffin / Green Bowl** — owners + staff
  - **Akshaya Trust** — verified NGO (admin + volunteer)
  - **Helping Hands** — NGO pending verification (admin + volunteer)
- Try the admin queue at `/admin/verification` and the team/settings pages under each tenant.

---

## Telegram bot

Phase E exposes the same domain services through a Telegram bot. The bot is
a *channel adapter* — it does not re-implement any business logic. It calls
the same `/v1/...` routes on main-service, delegates free-form message
parsing to agent-service's `/v1/parse-intent`, and subscribes to the existing
`/v1/events` SSE stream for outbound notifications.

```
            ┌──────────────────────┐    SSE: GET /v1/events     ┌────────────────────┐
            │      bot-service     │ ◀────────────────────────── │   main-service     │
  Telegram  │  (Bun + grammY)      │                            │  (Elysia + Drizzle)│
 updates ─▶ │  - webhook / polling │  HTTPS (Bearer JWT)        │                    │
            │  - intent dispatcher │ ─────────────────────────▶ │  domain services   │
            │  - SSE subscriber    │                            │  event publisher   │
            │                      │  POST /v1/parse-intent     │  /v1/bot/session   │
            │  free-form ─────────▶│ ─────────────────────────▶ │                    │
            │                      │                            │  agent-service     │
            │  file upload         │                            │  (FastAPI + Gemini)│
            └──────────┬───────────┘                            └────────────────────┘
                       │
                       ▼
              api.telegram.org/bot<token>
```

### Binding

1. Create a bot via **@BotFather** and copy the token into `.env` as
   `TELEGRAM_BOT_TOKEN`.
2. Send `/start`. The bot replies with a persona picker — tap one:

   | Persona | Tenant | Why it exists |
   |---|---|---|
   | 🍛 **Asha** — owner | `spice-route` | The only tenant with 90 days of history and a full catalog. Every kitchen and analytics flow starts here. |
   | 🤝 **Ravi** — NGO admin | `akshaya-trust` | A verified NGO. Receives escalated donations, claims them, completes the pickup. |
   | 🍽 **Meera** — owner | `anna-tiffin` | A second restaurant, so someone can buy Spice Route's B2B surplus — a tenant cannot claim its own listing. |

3. `/start <tenant-code> <email>` still binds any other seeded account
   directly, and `/start logout` unlinks the chat.

The bot exchanges a one-time code for a bound refresh token, then issues
per-chat access tokens in the same JWT shape the browser uses. Every message
is processed as *that user in that tenant* — RBAC and RLS apply normally.

### How it decides what you meant

One declarative intent registry in `packages/contracts/src/intents.ts` is the
single source of truth: it drives `/menu` composition, slash-command
registration, callback routing, the missing-field prompt, and role visibility.
Adding an intent is one registry entry plus one handler.

Every inbound text message goes to agent-service `/v1/parse-intent` (Gemini).
If agent-service is unreachable, a small local keyword table covers the common
phrasings. There is **no multi-turn wizard**: a message missing a required
field comes back with a copy-pasteable example, and an action that needs an id
falls back to its own list — "claim something" renders the open listings, each
row carrying a `Claim` button.

Every list row carries an inline button addressed by a short Redis-backed
token, so `callback_data` stays inside Telegram's 64-byte cap and a stale
button refuses rather than acting on a listing someone else already took.
Irreversible actions (cancel, no-show, release, archive, unlink) confirm first.

### Notifications

bot-service subscribes to `/v1/events` per bound tenant and turns each event
into a card. main-service fans `listing.created` (donations) and
`listing.escalated` out to nearby eligible tenants, so an NGO is actually told
when surplus needs a home. Card buttons are gated by the *recipient's* role —
a seller sees the claim notice without a `Claim` button on her own listing.
The 5/hour cap and 24h dedup stay in main-service; bot-service listens on the
post-cap stream and never re-implements either.

Reports are async: `/report` queues one and the finished document is pushed
back to the chat that asked for it.

### Demo personas

| Persona | Try |
|---|---|
| Asha — owner | "what do i have in stock", "show me leftovers", tap **What should I do?**, tap **Commit this split**, "dashboard", "/report" |
| Ravi — NGO admin | "browse the market", tap **Claim**, "/pickups", tap **Picked it up** |
| Meera — owner | "browse the market" to buy Spice Route's B2B surplus |

Bot-side files: `apps/bot-service/` (`src/bot/` for the dispatcher and reply
shapes, `src/handlers/` for one module per domain, `src/sse-bridge.ts` for
the outbound event fan-out).
