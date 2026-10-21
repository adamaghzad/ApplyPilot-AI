# ApplyPilot AI

Autonomous AI agents that research companies, discover jobs, draft personalised
applications and send them **through your own mailbox** — with an approval gate you
control.

This is a real application, not a mock-up: every number on the dashboard comes from the
database, every draft is generated from your actual CV, and nothing is ever sent without
you approving it first.

```bash
git clone <your-fork> applypilot && cd applypilot
npm install
cp .env.example .env
npm run dev          # http://localhost:3000
```

No API key, no credit card and no database server are required to run it.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Free AI models](#free-ai-models)
3. [Safety model](#safety-model)
4. [Quick start](#quick-start)
5. [Configuration](#configuration)
6. [Connecting a mailbox](#connecting-a-mailbox)
7. [Architecture](#architecture)
8. [API surface](#api-surface)
9. [Testing](#testing)
10. [Demo mode](#demo-mode)
11. [Deployment](#deployment)
12. [Troubleshooting](#troubleshooting)

---

## What it does

| Surface | What happens for real |
|---|---|
| **Landing / auth** | Email + password sessions (Argon-style hashing, HttpOnly cookies) or Google sign-in |
| **Onboarding** | Six-step wizard capturing profile, targeting preferences and automation mode |
| **Dashboard** | Pipeline counters, status distribution, agent activity and a live feed — all queried from the DB |
| **Companies** | Research agent fetches public pages, stores every recruiter address **with the URL it came from**, a confidence score and a verification state |
| **Job discovery** | Greenhouse, Lever, Welcome to the Jungle and careers pages. Each run returns a **per-source report** (`ok` / `unavailable` / `blocked` / `rate-limited`) with the reason |
| **CV intelligence** | PDF (own dependency-free extractor), DOCX and TXT parsing → skills, experience, education, languages, certifications, gaps and recommendations |
| **Matching** | Explainable 0–100 score with a per-dimension breakdown (skills, experience, location, seniority, language, freshness) |
| **Email + cover letter** | Generated in English or French, four tones, fully editable, exportable to PDF / DOCX / Markdown / TXT |
| **Automation** | Manual / Assisted / Scheduled modes, editable rules, daily caps, sending windows, idempotent sending, emergency stop |
| **Applications CRM** | 11-stage Kanban with drag & drop, per-application detail (scoring, drafts, contacts, timeline) |
| **Agent command center** | Eight agents, animated orchestration graph, live SSE activity feed |
| **Settings** | Profile, targeting, rules, schedule, integrations, model backend, data export and account deletion |

---

## Free AI models

ApplyPilot ships a **deterministic local engine** that needs no model at all. It scores
matches, writes emails and letters, and drafts follow-ups from your real CV data. It works
offline, costs nothing, and never invents a fact.

If you want generative prose on top, pick **any** of these — several are free:

### Option 1 — Ollama (local, zero cost, nothing leaves your machine)

```bash
# 1. install: https://ollama.com/download
ollama pull llama3.2      # 2. download a model
ollama serve              # 3. run the daemon
```

```env
AI_PROVIDER="ollama"
```

### Option 2 — OpenRouter `:free` models

```bash
# 1. create a free account: https://openrouter.ai/keys
```

```env
OPENROUTER_API_KEY="sk-or-v1-…"
# default model: meta-llama/llama-3.3-70b-instruct:free
```

### Option 3 — Groq free tier

```env
GROQ_API_KEY="gsk_…"       # https://console.groq.com/keys
# default model: llama-3.3-70b-versatile
```

### Option 4 — Google Gemini free tier

```env
GEMINI_API_KEY="…"         # https://aistudio.google.com/apikey
# default model: gemini-2.5-flash
```

### Option 5 — OpenAI (paid, optional)

```env
OPENAI_API_KEY="sk-…"
OPENAI_MODEL="gpt-4o-mini"
```

### Any OpenAI-compatible server

```env
AI_PROVIDER="custom"
OPENAI_BASE_URL="http://localhost:1234/v1"   # LM Studio, vLLM, Together, Fireworks…
OPENAI_API_KEY="…"
```

**Resolution order with `AI_PROVIDER=auto` (the default):** OpenRouter → Groq → Gemini →
OpenAI, i.e. free tiers win. Ollama is only tried when you opt in
(`AI_PROVIDER=ollama` or an explicit `OLLAMA_BASE_URL`), so nothing ever blocks on a
localhost probe you did not ask for.

Whatever the backend, the numeric scores always come from the deterministic engine — a
model may only rewrite the prose explanation. If a provider call fails, the agent falls
back silently rather than fabricating output. `/api/ai/status` reports exactly which
backend is live.

**Testing the LLM path without any key:**

```bash
npm run mock:llm     # OpenAI-compatible stub on http://127.0.0.1:4010/v1
AI_PROVIDER=custom OPENAI_BASE_URL=http://127.0.0.1:4010/v1 OPENAI_API_KEY=mock npm run dev
```

---

## Safety model

These are product invariants, not aspirations:

- **Nothing is sent without approval.** An application only leaves the house after you
  approve it, and sending requires a mailbox you connected yourself. Without one, the API
  refuses with `No connected mailbox — connect Gmail or Outlook first` and the record
  stays untouched.
- **No invented contacts.** An address is stored only when it was observed on a public
  page, together with that page's URL, a source type, a confidence score and a
  verification state. Unreachable sites yield zero contacts and an explicit note — never a
  guess.
- **No invented CV content.** Skills, roles, dates and achievements come from your
  document. Missing requirements are shown as gaps.
- **No CAPTCHA, login or rate-limit bypass.** Anti-bot protections are respected; LinkedIn
  is supported only through an authorised partner API token.
- **No auto-submission to third-party forms.** Applications are emailed from your own
  mailbox unless you explicitly authorise an integration.
- **Demo data is labelled.** Demo records are created only by the explicit demo endpoint
  and are badged as demonstration data.
- **Missing credentials are stated, not hidden.** The UI shows the exact steps to configure
  each integration instead of pretending it works.

---

## Quick start

```bash
npm install
cp .env.example .env
npm run db:migrate     # applies drizzle/ migrations (creates .pgdata on first run)
npm run dev
```

Open <http://localhost:3000>, create an account, complete onboarding, upload a CV, then
**Settings → Data → seed demo data** (or `POST /api/demo`) to populate a realistic pipeline
for a tour.

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit suite |
| `npm run smoke` | End-to-end API walkthrough against a running server (41 checks) |
| `npm run mock:llm` | Local OpenAI-compatible stub for LLM-path testing |
| `npm run db:generate` | Generate a migration from `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:reset` | Delete `.pgdata` and re-migrate |

---

## Configuration

Copy `.env.example` to `.env`. Only `APP_URL` matters in development; everything else has
a safe default.

| Variable | Required | Notes |
|---|---|---|
| `APP_URL` | yes | Used for OAuth redirects |
| `DATABASE_URL` | no | `file:./.pgdata` (embedded Postgres) or a `postgresql://…` URL |
| `AUTH_SECRET` | **prod** | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | **prod** | 32-byte key, AES-256-GCM, encrypts OAuth tokens at rest |
| `AI_PROVIDER` | no | `auto` (default) \| `openai` \| `openrouter` \| `groq` \| `gemini` \| `ollama` \| `custom` |
| `AI_MODEL` | no | Overrides the provider default |
| `OPENROUTER_API_KEY` / `GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` | no | One is enough |
| `OLLAMA_BASE_URL` | no | Default `http://localhost:11434` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | to send | Gmail OAuth |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT_ID` | to send | Outlook OAuth |
| `REDIS_URL` | no | Enables BullMQ; without it queued jobs run inline |
| `STORAGE_DIR` | no | Where uploads and generated files land |
| `DEMO_MODE` | no | Marks demo records |

---

## Connecting a mailbox

### Gmail

1. Google Cloud Console → APIs & Services → Credentials → **Create credentials → OAuth client ID**, type *Web application*.
2. Add an authorised redirect URI: `http://localhost:3000/api/integrations/google/callback`
3. Enable the Gmail API.
4. Put the values in `.env`:

   ```env
   GOOGLE_CLIENT_ID="….apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="…"
   ```

5. Restart, then **Settings → Integrations → Connect Gmail**.

Scopes requested: `gmail.send`, `gmail.readonly`, `userinfo.email`, `userinfo.profile`.
The refresh token is encrypted with AES-256-GCM before it touches the database.

### Outlook

1. Azure / Entra portal → App registrations → New registration → Web.
2. Redirect URI: `http://localhost:3000/api/integrations/outlook/callback`
3. API permissions (delegated): `Mail.Send`, `Mail.ReadWrite`, `offline_access`, `User.Read`.
4. Set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` and `MICROSOFT_TENANT_ID` in `.env`.

Without either integration the product is fully usable — applications simply remain in the
approval queue until you connect a mailbox or send them yourself.

---

## Architecture

```
src/
├─ app/
│  ├─ (auth)/          login, signup
│  ├─ onboarding/      6-step wizard
│  ├─ (app)/           dashboard, companies, jobs, applications, agents, cv, settings
│  └─ api/             50+ route handlers (App Router)
├─ components/         ui primitives + feature views
├─ lib/
│  ├─ ai/
│  │  ├─ providers.ts  multi-provider resolution, free-tier catalogue
│  │  ├─ client.ts     chat-completions + Gemini adapters, JSON parsing, metering
│  │  ├─ agents/       research · discovery · cv · matching · email · cover letter · follow-up
│  │  └─ quality.ts    deterministic personalization / quality scoring
│  ├─ cv/parse.ts      PDF (own extractor) + DOCX + TXT parsing
│  ├─ db/              Drizzle schema + PGlite/Postgres driver + journal migrator
│  ├─ documents/       PDF / DOCX / Markdown export
│  ├─ integrations/    gmail, outlook, job boards, fetchers
│  ├─ jobs/            queue, handlers, scheduler (BullMQ or inline)
│  └─ services/        rules, companies, discovery, cv, applications, demo, …
└─ …/drizzle/          SQL migrations
```

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind · Framer Motion · Lucide ·
Recharts · TanStack Query · react-hook-form + Zod · Drizzle ORM · PGlite (embedded
Postgres) or any Postgres · BullMQ/Redis (optional) · SSE for realtime.

**Realtime:** `/api/events/stream` (SSE) publishes activity, agent, application, job,
company and notification events; the client invalidates the affected queries. Without SSE
support it degrades to polling.

**Jobs:** with `REDIS_URL` set, work runs on BullMQ. Without it the same handlers run
inline, so a single-user deployment needs no extra infrastructure.

---

## API surface

All routes return a stable `{ ok: true, data }` or `{ ok: false, error }` envelope.

| Area | Endpoints |
|---|---|
| Health | `GET /api/health`, `GET /api/ai/status` |
| Auth | `POST /api/auth/signup`, `/login`, `/logout`, `GET /api/auth/me`, `GET /api/auth/google` |
| Onboarding | `POST /api/onboarding` |
| Profile | `GET/PATCH /api/profile`, `PUT /api/profile/preferences`, `PUT /api/profile/automation` |
| CV | `GET/POST /api/cv`, `DELETE /api/cv/:id`, `POST /api/cv/:id/primary`, `GET /api/cv/:id/download` |
| Companies | `GET/POST /api/companies`, `POST /api/companies/bulk`, `GET/PATCH/DELETE /api/companies/:id`, `POST /api/companies/:id/research` |
| Jobs | `GET /api/jobs`, `POST /api/jobs/discover`, `GET /api/jobs/:id`, `POST /api/jobs/:id/prepare` |
| Applications | `GET/POST /api/applications`, `GET/PATCH /api/applications/:id`, `POST …/approve`, `POST …/send`, `POST …/email`, `POST …/cover-letter`, `GET …/cover-letter/export?format=pdf\|docx\|md\|txt`, `POST …/follow-up` |
| Automation | `GET/PUT /api/automation/rules`, `GET/PUT /api/automation/schedule`, `POST /api/automation/run`, `POST /api/automation/stop`, `GET/POST /api/automation/tasks` |
| Integrations | `GET /api/integrations/connections`, `GET /api/integrations/{google,outlook}/connect`, `…/callback`, `POST /api/integrations/sync` |
| Meta | `GET /api/stats`, `/api/activity`, `/api/agents`, `/api/notifications`, `GET /api/events/stream`, `POST /api/demo`, `GET/DELETE /api/account` |

Rate limits: signup 5/h · login 10/15 min · discovery 12/h · automation runs 6/10 min ·
mailbox sync 20/h · demo seed 5/h.

---

## Testing

```bash
npm test         # 40 unit tests (vitest, no DB, no network)
npm run smoke    # 41 end-to-end API checks against a running server
npm run typecheck
```

The unit suite covers the parts that must never regress:

- `src/lib/cv/parse.test.ts` — PDF extraction, word-boundary skill matching (no `Java` from
  `JavaScript`), language and certification parsing
- `src/lib/ai/providers.test.ts` — free-tier-first resolution, explicit overrides, status
  reporting
- `src/lib/ai/agents/matching.test.ts` — bounded scores, no fabricated matched skills,
  deterministic output, gaps surfaced, FR/EN explanations
- `src/lib/documents/export.test.ts` — PDF/DOCX/Markdown export, WinAnsi sanitisation,
  pagination

`npm run smoke` walks the full product: signup → onboarding → CV upload → research →
discovery → matching → drafting → approval → refused send → exports → automation → stats →
SSE. It asserts the safety invariants too (no contacts without sources, no fake delivery,
honest source reports).

---

## Demo mode

`POST /api/demo` (or **Settings → Data → seed demo data**) creates a realistic set of
companies, listings, applications and contacts for the signed-in user. Every demo record is
written to the same tables as real data and is flagged as demonstration content, so the UI
can badge it. Demo seeding is rate-limited and idempotent.

---

## Deployment

1. Provision a Postgres database and set `DATABASE_URL`.
2. Set `AUTH_SECRET` and `ENCRYPTION_KEY` to random 32-byte values.
3. Set `APP_URL` to the public origin and add the matching OAuth redirect URIs.
4. Optional but recommended: `REDIS_URL` for the queue.
5. `npm run build && npm start`.

Migrations are applied on boot from `drizzle/` (journal-based, idempotent). PGlite is used
only when `DATABASE_URL` starts with `file:`, which is convenient locally but is not
intended for multi-instance production deployments.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `next: not found` | Run `npm install` |
| `Invalid environment configuration` | `cp .env.example .env` and fill in at least `APP_URL` |
| Research returns 0 contacts | The site is unreachable or blocks crawlers — by design. Nothing is invented. |
| Discovery finds nothing | Read the per-source report in the UI: it names the failing source and why |
| Send fails with *No connected mailbox* | Connect Gmail or Outlook in Settings → Integrations |
| Gemini/OpenRouter errors | Check the key and that the model is enabled on your account |
| `column … does not exist` after a schema change | Run `npm run db:generate && npm run db:migrate` |
| Dev server rejects the preview host | `allowedDevOrigins` in `next.config.ts` must include your host |

---

## Licence

MIT — see [LICENSE](LICENSE) if present in your fork.
