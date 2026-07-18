# Call Monitor — Integration Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Environment Variables & Credentials](#2-environment-variables--credentials)
3. [RingCentral Integration](#3-ringcentral-integration)
4. [Monday.com Integration](#4-mondaycom-integration)
5. [Telegram Daily Report](#5-telegram-daily-report)
6. [Database (PostgreSQL / Neon)](#6-database-postgresql--neon)
7. [Data Flow Diagrams](#7-data-flow-diagrams)
8. [Key Files Reference](#8-key-files-reference)

---

## 1. Project Overview

**Stack:** Next.js (TypeScript + React), PostgreSQL (Neon), Vercel deployment

**Purpose:** HR recruiter call monitoring dashboard. Pulls voice call logs from two RingCentral accounts and lead data from Monday.com boards. Sends automated daily Telegram reports. Uses OpenAI to generate daily outcome summaries.

**Two RingCentral Accounts:**
- **Account 1 (BP)** — First set of recruiters (Ethan, Fred, Michael, Nick, Tony)
- **Account 2 (JDM)** — Second set of recruiters (Alex Chester, Winston, Jessica, Isaac, Alfred, Henry)

---

## 2. Environment Variables & Credentials

All credentials live in `.env.local` at the project root. This file is **never committed to git**.

### RingCentral

| Variable | Account | Purpose |
|---|---|---|
| `RC_CLIENT_ID` | Account 1 (BP) | OAuth app client ID |
| `RC_CLIENT_SECRET` | Account 1 (BP) | OAuth app client secret |
| `RC_JWT` | Account 1 (BP) | JWT assertion for token generation |
| `RC2_CLIENT_ID` | Account 2 (JDM) | OAuth app client ID |
| `RC2_CLIENT_SECRET` | Account 2 (JDM) | OAuth app client secret |
| `RC2_JWT` | Account 2 (JDM) | JWT assertion for token generation |
| `NEXT_PUBLIC_RC_CLIENT_ID` | Account 1 (BP) | Same as above — exposed to browser for client-side auth |
| `NEXT_PUBLIC_RC_CLIENT_SECRET` | Account 1 (BP) | Same as above — exposed to browser |
| `NEXT_PUBLIC_RC_JWT` | Account 1 (BP) | Same as above — exposed to browser |
| `RC_DEPLOY_ACCOUNT` | — | `account1` or `account2` — controls which account this deployment targets |
| `NEXT_PUBLIC_RC_DEPLOY_ACCOUNT` | — | Same value, exposed to browser |

> **Where are these from?** Each value comes from the RingCentral Developer Console under your app's OAuth credentials. The JWT is a long-lived token generated via the RingCentral portal for server-to-server auth.

### Monday.com

| Variable | Purpose |
|---|---|
| `MONDAY_API_TOKEN` | Personal API token from Monday.com account settings → Developers → API |

### Database

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (pooled) from Neon |
| `POSTGRES_URL` | Same connection string (used by some Neon adapters) |
| `POSTGRES_URL_NON_POOLING` | Direct (non-pooled) connection for migrations |

### Telegram

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Legacy fallback chat ID |
| `TELEGRAM_BP_TEAM_CHAT_ID` | BP team group chat (workers only) |
| `TELEGRAM_BP_HEAD_CHAT_ID` | BP admin/head group chat (all BP including managers) |
| `TELEGRAM_JM_TEAM_CHAT_ID` | JM team group chat (workers only) |
| `TELEGRAM_JM_HEAD_CHAT_ID` | JM admin/head group chat (all JM including managers) |

### OpenAI & Cron

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key for GPT-4o-mini daily report generation |
| `CRON_SECRET` | Random secret that Vercel sends as `Authorization: Bearer <secret>` to protect the cron endpoint |

---

## 3. RingCentral Integration

### 3.1 How Authentication Works

RingCentral uses **OAuth 2.0 with JWT Bearer grant**. There are no usernames or passwords — instead the JWT acts as a long-lived credential that is exchanged for a short-lived access token (valid ~1 hour).

**Endpoint:** `POST /api/token`

**How it works:**

```
clientId + clientSecret  →  Base64 encoded  →  Authorization: Basic <encoded>
JWT  →  assertion parameter

POST https://platform.ringcentral.com/restapi/oauth/token
  Authorization: Basic <base64(clientId:clientSecret)>
  Content-Type: application/x-www-form-urlencoded
  Body: grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<JWT>

Response: { access_token: "...", expires_in: 3600 }
```

**File:** [src/app/api/token/route.ts](src/app/api/token/route.ts)

The token is then stored in memory (server-side global state or client localStorage) and reused until it expires.

### 3.2 Fetching User Extensions

Before fetching call logs, the app needs to know which extension IDs belong to the monitored recruiters.

**Endpoint:** `GET /api/account2/users` (or similar for account1 via the RC proxy)

**What it does:**
1. Uses the access token to call `GET https://platform.ringcentral.com/restapi/v1.0/account/~/extension`
2. Filters the returned list against a hardcoded **whitelist** of recruiter names

**Whitelist file:** [src/lib/whitelist.ts](src/lib/whitelist.ts)

```
Account 1 (BP): Ethan Parker, Fred Royce, HR Michael, Nick Allen, Tony Safety Department
Account 2 (JDM): Alex Chester, Winston Smith, Jessica Miller, Isaac Taylor, Alfred Brooks, Henry Safety Department
```

Only extensions whose names match the whitelist are included in call log fetches.

### 3.3 Syncing Call Logs to the Database

**Endpoint:** `POST /api/sync`

This is the main sync job. It fetches call logs from RingCentral and stores them in PostgreSQL.

**Flow:**
1. Receives the access token and list of extension IDs from the client
2. For each extension, paginates through RingCentral's call-log API:
   ```
   GET https://platform.ringcentral.com/restapi/v1.0/account/~/extension/{extId}/call-log
     ?view=Detailed
     &type=Voice
     &perPage=100
     &page={n}
     &dateFrom={ISO8601}
     &dateTo={ISO8601}
   ```
3. Inserts each call into the `calls` table with deduplication:
   - Unique key: `{call_id}-{sessionId}` (handles multi-leg calls)
   - `ON CONFLICT DO NOTHING` prevents duplicates on re-sync

**Rate limiting:**
- 1,200ms delay between each API request to avoid hitting RingCentral's rate limits
- On HTTP 429: waits using the `Retry-After` header value (or exponential backoff)

**Pagination limits:**
- Up to 200 pages per extension (20,000 calls max)
- Stops early after 500 calls per extension by default

**File:** [src/app/api/sync/route.ts](src/app/api/sync/route.ts)

### 3.4 Reading Call Logs from the Database

Once synced, all call queries hit the local PostgreSQL database — not RingCentral directly.

**Endpoint:** `GET /api/calls`

```
?extensionIds=123,456,789
&range=daily|weekly|monthly|yearly|all
&dateFrom=YYYY-MM-DD
&dateTo=YYYY-MM-DD
&account=account1|account2
```

**File:** [src/app/api/calls/route.ts](src/app/api/calls/route.ts)

### 3.5 RingCentral API Proxy

For any other RingCentral API call (not covered by a dedicated endpoint), there is a catch-all proxy:

**Endpoint:** `GET /api/rc/[...path]`

This forwards the request to `https://platform.ringcentral.com/restapi/{path}` with the stored token. Used for fetching call recordings, extension details, etc.

**File:** [src/app/api/rc/[...path]/route.ts](src/app/api/rc/[...path]/route.ts)

---

## 4. Monday.com Integration

### 4.1 How Authentication Works

Monday.com uses a **personal API token** sent in the `Authorization` header of every request.

```
POST https://api.monday.com/v2
Authorization: <MONDAY_API_TOKEN>
Content-Type: application/json
Body: { "query": "...", "variables": { ... } }
```

All Monday.com communication goes through the GraphQL helper:

**File:** [src/lib/mondayGraphql.ts](src/lib/mondayGraphql.ts)

This wrapper handles the Authorization header, 30-second timeouts, and GraphQL error detection.

### 4.2 Board-to-User Mapping

Each recruiter has two dedicated Monday.com boards: **New Leads** and **Follow Up**.

**File:** [src/lib/mondayBoards.ts](src/lib/mondayBoards.ts)

```
Fred         → "New leads Fred",    "Follow up Fred"
Alex Chester → "New leads Alex",    "Follow up Alex"
Ethan        → "New leads Ethan",   "Follow up Ethan"
Winston      → "New leads Winston", "Follow up Winston"
Jessica      → "New leads Jessica", "Follow up Jessica"
```

When fetching leads for a user, the app looks up which boards belong to them and queries only those boards.

### 4.3 Fetching Leads

**File:** [src/lib/mondayWorkspaceLeads.ts](src/lib/mondayWorkspaceLeads.ts)

**Two-stage GraphQL query:**

**Stage 1 — Fetch items from a board:**
```graphql
query($boardId: ID!) {
  boards(ids: [$boardId]) {
    id
    name
    items_page(limit: 500) {
      cursor
      items {
        id
        name
        created_at
        column_values {
          id
          type
          text
          value
          column { id title }
        }
      }
    }
  }
}
```

**Stage 2 — Paginate with cursor:**
```graphql
query($cursor: String!) {
  next_items_page(limit: 500, cursor: $cursor) {
    cursor
    items { ... }
  }
}
```

Continues paginating until `cursor` is null (all items retrieved).

**Parsed fields per lead:**

| Field | Monday column title |
|---|---|
| `status` | "Status" or "Status 2" |
| `company` | "Company" |
| `date` | "Date" |
| `platform` | "Platform" |
| `position` | "Position" |
| `type` | "Type" |
| `state` | "State" |
| `number` | Phone number column |
| `email` | "Email" |
| `note` | "Note" |
| `dateContact` | "Date Contact" |
| `ownerLead` | "Owner_lead" |

**Timing calculation:**
- `On time` — lead was contacted by end of the same day it was created
- `Late` — contacted on a later day
- `Unknown` — no contact date

### 4.4 API Endpoints

**`GET /api/monday/leads`** — Leads for a single user

```
?user=Fred
&dateFrom=YYYY-MM-DD    (optional, defaults to start of current month)
&dateTo=YYYY-MM-DD      (optional, defaults to end of current month)
```

Returns `MondayLead[]` filtered by the user's boards and the date range.

**File:** [src/app/api/monday/leads/route.ts](src/app/api/monday/leads/route.ts)

---

**`GET /api/monday/main-dashboard`** — Aggregated data for the dashboard

```
?user=all               (or a specific user name)
&preset=today|week|month
&dateFrom=YYYY-MM-DD    (custom range, max 30 days)
&dateTo=YYYY-MM-DD
```

Fetches leads for all recruiters in parallel and returns status counts and trend data for the charts.

**File:** [src/app/api/monday/main-dashboard/route.ts](src/app/api/monday/main-dashboard/route.ts)

---

## 5. Telegram Daily Report

### 5.1 Trigger

A Vercel cron job fires at **23:00 UTC Monday–Saturday** (configured in `vercel.json`). This corresponds to approximately 4:00 AM Tashkent time (end of the US work day).

The cron calls:
```
GET /api/telegram/daily-report
Authorization: Bearer <CRON_SECRET>
```

**File:** [src/app/api/telegram/daily-report/route.ts](src/app/api/telegram/daily-report/route.ts)

### 5.2 Report Generation Flow

```
1. Generate RC tokens for Account 1 and Account 2 using JWT grant

2. Fetch whitelisted users from both RC accounts → get extension IDs

3. For each extension:
   - Fetch call log for shift window: 8:00 AM – 5:00 PM US Central time
   - Deduplicate calls by sessionId (RC returns multiple legs per call)

4. For each recruiter (Ethan, Fred, Winston, Alex, Jessica, etc.):
   - Fetch Monday.com leads for that calendar day (US Central)

5. Compute per-user stats:
   - Total talk time (seconds)
   - Calls connected vs missed
   - Leads: On time vs Late vs total

6. (Optional) Send stats to OpenAI gpt-4o-mini for a daily summary sentence

7. Format and send Telegram message to the relevant chat groups
```

### 5.3 Telegram Chat Routing

| Group | Env Variable | Who sees it |
|---|---|---|
| BP Team | `TELEGRAM_BP_TEAM_CHAT_ID` | BP workers (excludes admin-only info) |
| BP Admin/Head | `TELEGRAM_BP_HEAD_CHAT_ID` | All BP including managers |
| JM Team | `TELEGRAM_JM_TEAM_CHAT_ID` | JM workers |
| JM Admin/Head | `TELEGRAM_JM_HEAD_CHAT_ID` | All JM including managers |
| Legacy fallback | `TELEGRAM_CHAT_ID` | Used when the above are not set |

Messages are sent via `POST https://api.telegram.org/bot<TOKEN>/sendMessage`.

---

## 6. Database (PostgreSQL / Neon)

### Connection

Uses Neon's serverless PostgreSQL. The connection string is in `DATABASE_URL`. The `neon` package handles connection pooling automatically.

**File:** [src/lib/db.ts](src/lib/db.ts)

### Schema

**Table: `calls`**

| Column | Type | Description |
|---|---|---|
| `id` | TEXT (PK) | `"{call_id}-{sessionId}"` — unique per call leg |
| `call_id` | TEXT UNIQUE | RingCentral call ID |
| `from_number` | TEXT | Caller phone number |
| `to_number` | TEXT | Recipient phone number |
| `direction` | TEXT | `Inbound` or `Outbound` |
| `result` | TEXT | `Accepted`, `Missed`, `Voicemail`, etc. |
| `user_extension` | TEXT | Extension ID of the monitored user |
| `start_time` | TEXT | ISO 8601 timestamp |
| `duration` | INTEGER | Call duration in seconds |
| `recording_url` | TEXT | Link to the call recording (if any) |
| `account` | TEXT | `account1` or `account2` |
| `created_at` | TIMESTAMP | Row insertion time |

**Indexes:** `start_time`, `user_extension`

---

## 7. Data Flow Diagrams

### RingCentral Call Sync

```
User clicks "Sync" in Dashboard
        ↓
Browser: reads credentials from localStorage
        ↓
POST /api/token { clientId, clientSecret, jwt }
        ↓
RingCentral: POST /restapi/oauth/token  →  access_token
        ↓
POST /api/sync { token, extensionIds, account, dateFrom, dateTo }
        ↓
For each extension (with 1200ms delay between requests):
  GET https://platform.ringcentral.com/restapi/v1.0/account/~/extension/{id}/call-log
    ?view=Detailed&type=Voice&perPage=100&page=N&dateFrom=...&dateTo=...
        ↓
  Parse: from, to, direction, result, duration, sessionId, recording
        ↓
  INSERT INTO calls ... ON CONFLICT (id) DO NOTHING
        ↓
Return { totalInserted, perExtension: {...} }
```

### Monday.com Lead Fetch

```
GET /api/monday/leads?user=Fred&dateFrom=2026-06-01&dateTo=2026-06-30
        ↓
Look up Fred's boards: ["New leads Fred", "Follow up Fred"]
        ↓
Find board IDs by name from Monday.com workspace
        ↓
For each board:
  POST https://api.monday.com/v2
    Authorization: <MONDAY_API_TOKEN>
    Body: { query: boards(ids: [boardId]) { items_page(limit: 500) { ... } } }
        ↓
  While cursor != null:
    POST https://api.monday.com/v2
      Body: { query: next_items_page(cursor: "...") { ... } }
        ↓
  Parse column_values → extract status, date, company, phone, etc.
  Compute timing: On time | Late | Unknown
        ↓
Filter by dateFrom / dateTo
        ↓
Return MondayLead[]
```

### Telegram Daily Cron

```
Vercel Cron: 23:00 UTC (Mon–Sat)
        ↓
GET /api/telegram/daily-report
  Authorization: Bearer <CRON_SECRET>
        ↓
1. Generate RC tokens (Account 1 + Account 2) via JWT grant
2. Fetch whitelisted users → extension IDs
3. Fetch call logs (8am–5pm US Central) for each extension
4. Deduplicate calls by sessionId
5. Fetch Monday leads for each recruiter (same calendar day)
6. Compute stats per user (talk time, calls, leads)
7. POST to OpenAI gpt-4o-mini → daily summary (optional)
8. Format Telegram message
        ↓
POST https://api.telegram.org/bot<TOKEN>/sendMessage
  → TELEGRAM_BP_TEAM_CHAT_ID    (BP workers)
  → TELEGRAM_BP_HEAD_CHAT_ID    (BP all)
  → TELEGRAM_JM_TEAM_CHAT_ID    (JM workers)
  → TELEGRAM_JM_HEAD_CHAT_ID    (JM all)
```

---

## 8. Key Files Reference

### RingCentral

| File | Purpose |
|---|---|
| [src/app/api/token/route.ts](src/app/api/token/route.ts) | Exchange JWT for access token |
| [src/app/api/sync/route.ts](src/app/api/sync/route.ts) | Bulk sync calls to DB |
| [src/app/api/calls/route.ts](src/app/api/calls/route.ts) | Query calls from DB |
| [src/app/api/rc/[...path]/route.ts](src/app/api/rc/[...path]/route.ts) | Generic RC API proxy |
| [src/app/api/account2/call-log/route.ts](src/app/api/account2/call-log/route.ts) | Account 2 call log with token caching |
| [src/app/api/account2/users/route.ts](src/app/api/account2/users/route.ts) | Account 2 user list + whitelist filter |
| [src/lib/whitelist.ts](src/lib/whitelist.ts) | Recruiter name whitelists per account |
| [src/lib/deployAccount.ts](src/lib/deployAccount.ts) | Single-account vs dual-account logic |
| [src/lib/rcCredentialsStorage.ts](src/lib/rcCredentialsStorage.ts) | Browser localStorage credential management |
| [src/lib/syncService.ts](src/lib/syncService.ts) | Sync job queue and state management |

### Monday.com

| File | Purpose |
|---|---|
| [src/lib/mondayGraphql.ts](src/lib/mondayGraphql.ts) | Base GraphQL request wrapper |
| [src/lib/mondayWorkspaceLeads.ts](src/lib/mondayWorkspaceLeads.ts) | Fetch and parse all leads from a board |
| [src/lib/mondayBoards.ts](src/lib/mondayBoards.ts) | User-to-board mapping, status normalization |
| [src/lib/mondayDateRange.ts](src/lib/mondayDateRange.ts) | US Central timezone date range helpers |
| [src/lib/mondayCompanyFilter.ts](src/lib/mondayCompanyFilter.ts) | BP vs JDM company field filtering |
| [src/app/api/monday/leads/route.ts](src/app/api/monday/leads/route.ts) | User-scoped leads endpoint |
| [src/app/api/monday/main-dashboard/route.ts](src/app/api/monday/main-dashboard/route.ts) | Dashboard aggregation endpoint |

### Telegram & Reports

| File | Purpose |
|---|---|
| [src/app/api/telegram/daily-report/route.ts](src/app/api/telegram/daily-report/route.ts) | Main cron handler (~850 lines) |
| [src/lib/telegramReport.ts](src/lib/telegramReport.ts) | User roster & chat routing logic |

### Core

| File | Purpose |
|---|---|
| [src/lib/db.ts](src/lib/db.ts) | Neon PostgreSQL connection & schema init |
| [src/components/GlobalContext.tsx](src/components/GlobalContext.tsx) | Client-side state (tokens, users, sync status) |
| [vercel.json](vercel.json) | Cron schedule configuration |
