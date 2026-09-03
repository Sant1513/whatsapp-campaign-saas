# WhatsApp Campaign Management SaaS

A multi-tenant platform that replaces the manual "CSV → Serri → configure → send" workflow with a
reusable, auditable pipeline: **Template → Campaign → Audience → Auto-Mapping → Validation →
Preview → Test → Preflight → Send/Schedule → Track → Report → History**.

Read **[ARCHITECTURE.md](./ARCHITECTURE.md)** first — it is the design phase (schema, API contracts,
state machines, Serri adapter, validation rules, UI IA) that the spec (§78) requires before code.

> **Serri sending defaults to dry-run.** Payloads are fully built and validated but **never
> transmitted** until you set `SERRI_MODE=live` and provide a real API key. This keeps development
> safe — no accidental WhatsApp messages.

## Stack

Next.js 15 (App Router, TS) · PostgreSQL + Prisma · Auth.js (credentials) · BullMQ + Redis workers ·
Zod · Tailwind. See ARCHITECTURE.md §2.

## Prerequisites

- Node 20+ (built on Node 24)
- PostgreSQL 14+
- Redis 6+ (for the send queue / scheduler)

## Setup

```bash
npm install
cp .env.example .env
# edit .env: set DATABASE_URL, REDIS_URL, and generate secrets:
#   AUTH_SECRET     -> openssl rand -base64 32
#   ENCRYPTION_KEY  -> openssl rand -base64 32   (must decode to 32 bytes)

npm run db:generate      # prisma client
npm run db:migrate       # or: npm run db:push   (create tables)
npm run db:seed          # demo orgs, users, connection, templates
```

## Run

Three processes (the frontend never runs the send loop — spec §8, §70-R8):

```bash
npm run dev          # web app on http://localhost:3000
npm run worker       # send + CSV-validate + schedule workers (BullMQ)
npm run scheduler    # scheduled-campaign safety-net poller (optional)
```

## Demo logins (all password `password123`)

| Email | Role |
| --- | --- |
| `admin@acme.test` | Org Admin (Acme) |
| `manager@acme.test` | Campaign Manager (Acme) |
| `viewer@acme.test` | Viewer (Acme) |
| `admin@globex.test` | Org Admin (Globex) — for tenant-isolation testing |
| `super@platform.test` | Super Admin |

## End-to-end acceptance flow (spec §75)

1. Log in as `admin@acme.test`.
2. **Campaigns → Create Campaign** → name it, pick **Placement Reminder**, pick **Admissions WhatsApp**.
3. On the campaign page, **Upload** `sample-data/placement.csv`.
4. See validation: **4 eligible, 4 excluded** (invalid phone, duplicate, missing parameter, blank row).
5. Review the **variable mapping** (auto-matched; editable).
6. **Preview** actual messages recipient-by-recipient; toggle the **generated Serri payload** (key masked).
7. **Test send** to a phone (dry-run: builds + validates, does not transmit).
8. **Run preflight** → CAMPAIGN READY.
9. **Send Now** (or Schedule). The worker processes jobs; watch **live progress**.
10. **View Report** → per-recipient statuses, filters, CSV export.
11. **Message History** and per-contact history reflect immutable snapshots.

## Tests

```bash
npm test
```

45 unit tests cover the safety-critical core (spec §74):

- Variable resolution + fallback rules (§11–§13)
- Phone validation / E.164 normalization (§18)
- Batch validation: invalid phone, duplicate, missing param, invalid media URL, blank row (§18–§20)
- Campaign state machine — valid/invalid transitions (§31)
- Serri adapter — payload building, error classification, **dry-run never transmits**, **timeout ⇒ UNKNOWN (never "sent")** (§27, §49, §50)
- Retry policy — transient-only, capped backoff (§29)
- API-key encryption round-trip + GCM tamper detection (§8, §44)

## Safety guarantees (spec §70) — where enforced

| Rule | Enforcement |
| --- | --- |
| No send with missing required params | validation engine + preflight gate |
| No invalid required media | URL validator + preflight |
| No duplicate sends unless allowed | dedupe + idempotency key + unique constraint |
| Never expose Serri creds | AES-256-GCM at rest, masked, never serialized to client |
| Never claim delivered/read unless confirmed | provider status/webhook only; UNKNOWN default |
| Templates change ≠ history change | version pinning + message snapshot |
| Never lose execution record | immutable Message + MessageAttempt |
| Never rely on browser for execution | BullMQ workers |
| Upload ≠ send | separate validate step; launch requires preflight |
| Must pass preflight before send | launch checks preflight snapshot |

## Tenant isolation

Every tenant-owned query flows through `tenantDb(orgId)` (`src/lib/db.ts`), a Prisma extension that
forces `organizationId` (from the authenticated session, never the client) into every read/write.
The active org comes from a cookie **validated against the user's memberships**.

## Implemented vs. next

**Implemented:** auth + multi-tenancy + RBAC, Serri connections (encrypted keys), campaign
definitions, templates + versions + variables, variable engine + auto-mapping, CSV/XLSX import +
validation + exclusion reporting, campaign builder (audience → map → preview → test → preflight →
launch/schedule), idempotent queue-based sending with retries, pause/resume/cancel, live progress
(SSE), reports + CSV export, message/contact history, audit logs, dashboard, seed + sample data.

**Documented next steps (architected for, not yet built):** template editor UI + versioning UI,
dedicated contact-import UI + custom-field editor, XLSX export, Serri webhook ingestion for
delivered/read, cross-org platform-admin console + system health (§66), media reachability check as
an async pre-send worker step, notifications (§69), retention jobs (§68). None require rework — they
extend the existing services and schema.
```

