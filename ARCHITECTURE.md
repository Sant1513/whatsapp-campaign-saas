# WhatsApp Campaign Management SaaS — Architecture & Design

> This document is the **design phase** required by spec §78. It is written **before** the
> code so that correctness, safety, and tenant isolation drive the implementation — not
> the other way around. Read this first; the code follows it.

Priority order (spec §78, non-negotiable):
**Correctness → Safety → Tenant isolation → Reliable sending → Data integrity → Usability → Visual polish.**

---

## 1. Product summary

A multi-tenant SaaS that replaces the manual "download CSV → upload to Serri → configure →
send" workflow with a **reusable, auditable campaign pipeline**:

```
Template → Campaign → Audience → Auto-Mapping → Validation → Preview → Test → Preflight → Send/Schedule → Track → Report → History
```

The product deliberately separates three entities that must never be conflated (spec §2):

| Entity | Meaning | Example |
| --- | --- | --- |
| **Serri API Definition** (`campaign_definitions`) | The technical payload contract Serri needs | `zaza1_clone2_1767876912` |
| **Platform Template** (`templates` + `template_versions`) | Business-friendly, versioned message the user picks | `Placement Reminder` |
| **Campaign** (`campaigns`) | One execution of a template version against one audience | `September Placement Reminder – Batch 1` |

---

## 2. Technology stack

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 15 (App Router), TypeScript** | Single codebase for UI + API (route handlers + server actions) |
| DB | **PostgreSQL** via **Prisma** | Relational integrity for multi-tenant data; strong migrations |
| Auth | **Auth.js (NextAuth v5)** credentials + bcrypt | Session security, CSRF baked in |
| Authorization | Custom **RBAC + tenant-guard** layer | Every query scoped by `organizationId`, enforced server-side |
| Queue / workers | **BullMQ + Redis** | Backend send workers, scheduler, CSV validation jobs (never the browser) |
| Validation | **Zod** everywhere (API input + payload) | Input validation, output typing |
| Files | Pluggable storage (`local` dev → S3-compatible prod) | CSV/media/report artifacts outside the DB |
| Realtime | **SSE** for campaign progress | No page refresh; simple, proxy-friendly |
| Secrets | **AES-256-GCM** field encryption for API keys | Encrypted at rest, never sent to client |
| CSV/Excel | `papaparse` (stream) + `xlsx` | Chunked/streamed large files |
| UI | **Tailwind CSS** + headless components | Clean operational dashboard, responsive |

### Runtime topology

```
Browser (React)
  │  HTTPS, session cookie
  ▼
Next.js App  ──────────────┐
  ├─ Route Handlers / Server Actions (Application API)
  ├─ Services: Campaign, Template, Validation, Variable, Import, Report
  ├─ MessagingProvider abstraction  ──► SerriProvider (adapter)
  └─ enqueue jobs ──► Redis (BullMQ)
                          │
                          ▼
              Worker process (separate)
                ├─ send-worker      → SerriProvider.sendMessage()
                ├─ validate-worker  → Validation Service (large CSV)
                └─ scheduler        → promotes Scheduled → Sending at fire time
```

**Rule (spec §8, §47, §70-R8):** the browser never calls Serri and never runs the send loop.
All provider calls go through the backend; execution is owned by workers.

---

## 3. Multi-tenancy & security model

### 3.1 Isolation strategy — shared schema, mandatory tenant column

Every tenant-owned row carries `organizationId`. Isolation is enforced by a single
choke point: **all data access goes through a repository/`prisma` wrapper that injects
`organizationId` from the authenticated session** — never from a client-supplied value
(spec §44: "Never trust organization/user IDs supplied by the frontend").

```ts
// pseudo
const ctx = await requireTenant();           // from session, server-side only
const campaigns = await db(ctx).campaign.findMany();  // WHERE organizationId = ctx.orgId always
```

A defense-in-depth option (documented, optional to enable) is Postgres **Row-Level
Security** keyed on a `SET app.current_org` GUC per request.

### 3.2 RBAC

Roles (spec §4): `SUPER_ADMIN` (platform), `ORG_ADMIN`, `CAMPAIGN_MANAGER`, `VIEWER`.
Permissions are checked server-side on every mutation via a capability map:

| Capability | ORG_ADMIN | CAMPAIGN_MANAGER | VIEWER |
| --- | :-: | :-: | :-: |
| manage org users | ✓ | | |
| configure Serri | ✓ | | |
| template CRUD | ✓ | | |
| create/edit campaign | ✓ | ✓ | |
| upload audience / map / validate | ✓ | ✓ | |
| send test | ✓ | ✓ | |
| launch / schedule | ✓ | ✓ | |
| pause / cancel | ✓ | ✓ | |
| view campaigns/contacts/reports/history | ✓ | ✓ | ✓ |
| export reports | ✓ | ✓ | ✓ (view) |

`SUPER_ADMIN` operates cross-org for platform ops only (orgs, health, audit, platform users)
and does **not** implicitly gain access to a tenant's message content beyond audit metadata.

### 3.3 Security checklist (spec §44) → where handled

- Password hashing → bcrypt (`lib/auth`).
- Session security + CSRF → Auth.js.
- API key encryption at rest → `lib/crypto` AES-256-GCM; decrypted only in worker/service, never serialized to client; masked in UI/logs (spec §8, §65, §70-R4).
- Input validation → Zod schemas at every boundary.
- SQL injection → Prisma parameterization.
- Rate limiting → per-org + per-IP token bucket on auth + send endpoints.
- Secure file upload → extension+MIME allowlist, size cap, streamed to storage, never executed; parsed in worker.
- Audit logs → `audit_logs`, secrets never written (spec §42).

---

## 4. Database schema (logical)

Full Prisma schema lives in `prisma/schema.prisma`. Core entities (spec §45):

```
Organization 1─* OrganizationUser *─1 User
Organization 1─* SerriConnection
Organization 1─* CampaignDefinition        (Serri payload contract; extensible)
Organization 1─* Template 1─* TemplateVersion 1─* TemplateVariable
Organization 1─* Contact 1─* ContactCustomField
Organization 1─* Campaign
  Campaign  *─1 TemplateVersion
  Campaign  *─1 SerriConnection
  Campaign  1─* Import 1─* ImportRow 1─* ValidationError
  Campaign  1─* CampaignRecipient 1─* Message 1─* MessageAttempt
Organization 1─* MediaAsset
Organization 1─* ScheduledJob
Organization 1─* AuditLog
```

### 4.1 Message record (spec §46) — reconstructable history

Each `Message` stores an **immutable snapshot** so history never changes when a template is
later edited (spec §34, §70-R6):

```
organizationId, campaignId, campaignRecipientId, contactId,
templateId, templateVersionId,
destination, resolvedVariables(json), resolvedPayload(json), mediaSnapshot(json),
status, failureReason, attemptCount,
idempotencyKey (unique),
createdAt, queuedAt, sentAt, deliveredAt, readAt, failedAt
```

`resolvedPayload` is the exact Serri body (with the API key redacted to a reference, not the
secret) — enough to reconstruct what happened without leaking credentials.

### 4.2 Key indexes & constraints

- `@@unique([organizationId, phone])` on Contact (per-tenant dedupe).
- `@@unique([campaignId, destination])` **when** duplicate-send disabled (enforced in app + partial index) — dedupe scope is campaign/API definition (spec §19).
- `Message.idempotencyKey @unique` — global idempotency guard (spec §50).
- Composite indexes on `(organizationId, status, createdAt)` for list/report queries.

---

## 5. Serri adapter (provider abstraction, spec §48)

```ts
interface MessagingProvider {
  validateConfiguration(conn): Promise<Result>
  validatePayload(payload): Result
  sendMessage(payload, opts): Promise<SendResult>      // idempotent
  sendTestMessage(payload): Promise<SendResult>
  getMessageStatus(providerRef): Promise<StatusResult>
  processWebhook(body, headers): Promise<WebhookEvent[]>
}
class SerriProvider implements MessagingProvider { ... }
```

- The app is coupled to the **interface**, not to Serri.
- `SendResult` distinguishes `SENT | FAILED | UNKNOWN`. **A timeout or ambiguous response →
  `UNKNOWN`, never "delivered"** (spec §27, §49, §50, §70-R5).
- "Delivered"/"Read" are only set from a real Serri webhook/status call; if Serri does not
  provide them they stay unknown (spec §33, §70-R5).

### 5.1 Serri payload contract (spec §7, §71)

`POST https://backend.api-wa.co/campaign/serri-india/api/v2`, `Content-Type: application/json`:

```jsonc
{
  "apiKey": "<server-side secret>",         // injected in backend, never from client
  "campaignName": "<definition.serriCampaignName>",
  "destination": "<E.164 digits>",
  "userName": "<connection default>",
  "templateParams": ["$FirstName", ...],     // resolved per recipient
  "source": "<connection default source>",
  "media": {},          // {} | {url, filename}  — determined by definition
  "buttons": [],
  "carouselCards": [],
  "location": {},
  "attributes": {},
  "paramsFallbackValue": { "FirstName": "user" }
}
```

The **CampaignDefinition** describes required/optional fields, variables, media requirements,
and fallbacks so new Serri cURLs can be added as data, not code (spec §9, §77).

---

## 6. Variable engine (spec §11, §12, §13)

- Variables are `$Name` tokens usable in text, captions, URLs, media URLs, filenames,
  buttons, and any Serri-supported field. No assumption of only `$FirstName`.
- **Mapping** (spec §12): template variable → CSV column, with auto-match (normalized
  case/space/synonyms) and manual override.
- **Fallbacks** (spec §13): per-variable, org-admin toggles whether fallback is permitted.
  During validation, each variable shows `Source: CSV` and `Fallback: <value|not permitted>`.
  **If required and fallback not permitted and value missing → record excluded** (§13, §70-R1).

Resolution is pure and shared by CSV send, individual send, preview, and test — one engine,
one code path (spec §26, §53).

---

## 7. Validation engine (spec §17, §18, §23, §51)

Per-recipient checks, each producing an `ineligible` reason if failed:

| Check | Reason code | Action |
| --- | --- | --- |
| phone parses to valid E.164 | `INVALID_PHONE` | exclude |
| duplicate within campaign (unless allowed) | `DUPLICATE` | exclude extras |
| all required variables present/resolvable | `MISSING_PARAMETER` | exclude |
| required media URL syntactically valid | `INVALID_URL` | exclude |
| required media reachable/typed | `MISSING_MEDIA` | exclude |
| non-blank row | `BLANK_ROW` | exclude |
| assembled payload passes provider schema | `INVALID_PAYLOAD` | exclude |

Bad **file structure** stops preparation entirely (spec §18). URL validation checks format →
protocol → accessibility → response → media availability, per resolved URL (spec §51). The
URL resolver layer (spec §16) is pluggable; if a provider-specific "open/view" transform
can't be safely determined, the record is marked invalid rather than guessed.

**Hard pre-send gate (spec §23, §52, §70):** a recipient is `ELIGIBLE` only if every required
field is present, valid, media accessible, phone valid, not a disallowed duplicate, and the
payload validates. Otherwise `DO NOT SEND`, with the exact failing field surfaced.

---

## 8. Campaign state machine (spec §31)

```
DRAFT → VALIDATING → READY → SCHEDULED → PREPARING → SENDING → COMPLETED
                                   │           │          ├→ PARTIALLY_COMPLETED
                                   │           │          ├→ PAUSED → SENDING
                                   │           │          └→ FAILED
   any pre-send ─────────────────► CANCELLED   └────────► CANCELLED
```

Transitions are enforced centrally; invalid transitions throw. `PAUSE` stops **new** jobs
entering execution but lets in-flight jobs finish; `CANCEL` prevents any new send jobs
(spec §32).

Message states (spec §33): `PENDING, PROCESSING, SENT, DELIVERED, READ, FAILED, EXCLUDED,
CANCELLED, UNKNOWN`.

---

## 9. Send pipeline, idempotency & retries (spec §28, §29, §50)

```
Campaign(READY) ─launch→ PREPARING: materialize eligible CampaignRecipients + Messages(PENDING, idempotencyKey)
   → enqueue one job per Message (jobId = idempotencyKey)  ─────────► BullMQ
       send-worker: claim Message (PENDING→PROCESSING, guarded)
         → SerriProvider.sendMessage(payload, {idempotencyKey})
             ├ SENT     → Message.SENT, sentAt
             ├ FAILED(permanent) → Message.FAILED, reason
             ├ FAILED(transient 429/502/503/timeout) → retry w/ exp backoff (max N)
             └ UNKNOWN  → Message.UNKNOWN (never re-send blindly; reconcile via status/webhook)
```

**Idempotency (spec §50):** every Message has a unique `idempotencyKey`; the BullMQ `jobId`
equals it, so double-click / refresh / worker retry cannot create a second send. The
`PENDING→PROCESSING` claim is a guarded conditional update. A timeout is **never** assumed to
mean "not sent" → `UNKNOWN`.

Retries only for transient classes (`429, 500, 502, 503, timeout, network`) with exponential
backoff; permanent errors (`400, 401, 403, 404, 409, 422`) are not retried (spec §29, §49).
Retry policy is configurable per org/connection.

---

## 10. Scheduling (spec §30)

Scheduled campaigns persist `scheduledAt` + org timezone in `scheduled_jobs`. A backend
scheduler (BullMQ repeatable/delayed job) promotes `SCHEDULED → PREPARING` at fire time.
**No reliance on the browser being open.**

---

## 11. API surface (Application API contracts)

REST-ish route handlers under `/api`, all tenant- and role-guarded. Representative:

```
POST   /api/auth/[...]                     Auth.js
GET    /api/dashboard/stats
CRUD   /api/serri-connections              (ORG_ADMIN)  keys write-only, never returned
CRUD   /api/campaign-definitions
CRUD   /api/templates  /:id/versions  /:id/duplicate
CRUD   /api/contacts   /import
POST   /api/campaigns                      create (DRAFT)
POST   /api/campaigns/:id/import           upload CSV/XLSX (→ background validate)
GET    /api/campaigns/:id/validation       results + exclusion report
POST   /api/campaigns/:id/mapping          save variable mapping
GET    /api/campaigns/:id/preview?i=       WhatsApp-style preview for recipient i
GET    /api/campaigns/:id/payload-preview  masked Serri payload (advanced)
POST   /api/campaigns/:id/test             test send (real Serri, labeled TEST)
POST   /api/campaigns/:id/preflight        run full preflight → READY|NOT_READY
POST   /api/campaigns/:id/launch           Send Now (idempotent; requires preflight pass)
POST   /api/campaigns/:id/schedule
POST   /api/campaigns/:id/pause | /cancel
POST   /api/campaigns/:id/duplicate
GET    /api/campaigns/:id/report  /export?format=csv|xlsx
GET    /api/campaigns/:id/progress         SSE
POST   /api/send/individual                one-off (same engine)
GET    /api/contacts/:id/history
GET    /api/messages                       global history (filters)
GET    /api/audit-logs
POST   /api/webhooks/serri                 delivery/read/status ingestion
```

Every handler: `requireTenant()` → `requireRole(cap)` → Zod-validate → service → typed JSON.

---

## 12. UI information architecture (spec §5, §54–§62)

```
Dashboard        stats + recent campaigns + quick actions (§6)
Campaigns        list (§55) · Campaign Builder wizard (§22, 9 steps)
Templates        list (§56) · editor · versions (§43)
Contacts         list (§57) · contact profile + history (§34)
Message History  global searchable (§58)
Reports          campaign report · exclusion analytics · exports (§38–§41)
Integrations     Serri connections (§8) · campaign definitions (§9)
Users & Teams    org users + roles (§4)
Settings         org profile, timezone, retention, fallback policy
Audit Logs       (§42)
[Super Admin]    Organizations · System Health (§66)
```

UX target (spec §54): Stripe dashboard + HubSpot campaign builder + WhatsApp ops console —
simpler and focused. Progressive disclosure hides HTTP/JSON/cURL from normal users.
Empty states (§60), loading/skeletons & progress (§61), realtime send progress (§62).

---

## 13. Non-negotiable product rules (spec §70) → enforcement point

| Rule | Enforced at |
| --- | --- |
| R1 no send with missing required params | Validation engine + preflight gate |
| R2 no send with invalid required media | URL/media validator + preflight |
| R3 no duplicate sends unless allowed | dedupe + `@@unique(campaign,destination)` + idempotencyKey |
| R4 never expose Serri creds | crypto module, masking, no client serialization |
| R5 never claim delivered/read unless confirmed | provider status/webhook only; UNKNOWN default |
| R6 templates change ≠ history change | version pinning + message snapshot |
| R7 never lose execution record | immutable Message + MessageAttempt |
| R8 never rely on browser for execution | BullMQ workers |
| R9 upload ≠ send | separate validate step; launch requires preflight |
| R10 must pass preflight before send | launch checks preflight token/state |

---

## 14. Build sequence (spec §73) & this-session scope

Ordered foundation: **Auth → Multi-tenancy → DB → Orgs → Users/Roles → Serri integration →
Template system → Variable engine → CSV validation → Campaign builder → Preview → Test send →
Queue → Execution → History → Reports.**

**Delivered in the initial scaffold (this session):** project skeleton, full Prisma schema,
crypto/tenant/RBAC libs, Serri adapter (dry-run default), variable + validation + CSV engines,
core API routes + server actions, auth + multi-tenancy, dashboard + navigation shell, seed
data, and the campaign-builder happy path wired to the real backend. Remaining sections are
built incrementally on this foundation — **no mock data once the real path exists** (spec §73).

Serri sending defaults to **dry-run**: payloads are fully built and validated but not
transmitted until a real API key is supplied and live mode is explicitly enabled.
