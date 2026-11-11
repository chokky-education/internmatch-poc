# LINE-Primary / Web-Fallback Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real backend so 4 team members can chat with "พี่ฝึกงาน" in LINE OA, and do everything equally on the web (email-OTP login) when LINE is down, on one shared dataset.

**Architecture:** One Cloudflare Worker (`worker/`) holds all logic: auth, domain store (D1), Gemini assistant with tools, Paxa OCR, LINE webhook, reminder cron. LINE webhook and the web JSON API are two thin adapters calling the same core functions with a `channel` of `'line'|'web'`. `index.html` (GitHub Pages) becomes a client of the Worker API.

**Tech Stack:** Cloudflare Workers (plain JS ES modules), D1, Wrangler, Vitest + `@cloudflare/vitest-pool-workers`, Gemini REST, Paxa REST, LINE Messaging API, Brevo transactional email API.

**Spec:** `docs/superpowers/specs/2026-11-11-line-primary-web-fallback-design.md`

## Global Constraints
- No secrets or the email allowlist in Git. Secrets via `wrangler secret put`: `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `GEMINI_API_KEY`, `PAXA_API_KEY`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `ALLOWED_EMAILS` (comma-separated, lowercase-compared).
- Non-secret vars in `wrangler.toml [vars]`: `GEMINI_MODEL = "gemini-3.8-flash"`, `PAXA_MODEL = "paxa-doc-extract-v1"`, `WEB_ORIGIN = "https://chokky-education.github.io"`.
- Every persisted user-visible row has `truth_level` ∈ `SYSTEM_VERIFIED|USER_REPORTED|AI_EXTRACTED`; every mutation writes an `audit_log` row with `channel`.
- AI_EXTRACTED data is never saved to the board without an explicit user confirm (LINE postback or web button).
- No admin/teacher role, no `pipeline` screen.
- All dates shown/parsed in Asia/Bangkok; stored as UTC ISO strings.
- Bot copy is Thai, friendly "พี่" tone, matching existing `index.html` system prompt.
- Existing `AGENTS.md` pre-success checks still apply to `index.html`.

## Review Focus
1. LINE user not linked / email not in allowlist → bot replies with link instructions or "ยังไม่เปิดให้ใช้", never calls Gemini/Paxa. (Task 7 test)
2. OTP wrong 5 times or older than 10 minutes → rejected; resend limited to 1 per 60s per email. (Task 2 test)
3. LINE redelivers the same `webhookEventId` → processed once. (Task 7 test)
4. Gemini/Paxa error or timeout → user gets a Thai error message on both channels, nothing half-saved. (Tasks 4, 5 tests)
5. Reminder datetime given in Thai local time "2026-11-19T20:00" → fires at 13:00Z, not 20:00Z. (Task 8 test)

---

### Task 1: Worker scaffold, schema, test harness

**Files:**
- Create: `worker/package.json`, `worker/wrangler.toml`, `worker/vitest.config.js`, `worker/migrations/0001_init.sql`, `worker/src/index.js`, `worker/src/http.js`, `worker/test/health.test.js`
- Modify: `.gitignore` (add `worker/node_modules`, `worker/.wrangler`, `worker/.dev.vars`)

**Interfaces:**
- Produces: `export default { fetch(req, env, ctx), scheduled(evt, env, ctx) }` in `src/index.js`; `json(data, status=200, env)`, `corsHeaders(env)`, `readJson(req)` in `src/http.js`.
- Schema tables (all with `id TEXT PRIMARY KEY` uuid unless noted): `users(email UNIQUE, line_user_id UNIQUE NULL, profile_json, created_at)`, `sessions(token PK, user_id, expires_at)`, `otps(email PK, code_hash, expires_at, attempts, last_sent_at, purpose, line_user_id NULL)`, `applications(user_id, company, role, status, next_step, url, truth_level, history_json, updated_at)`, `tasks(user_id, title, detail, done, truth_level, sort)`, `documents(user_id, kind, title, status, note, fields_json, truth_level, created_at)`, `reminders(user_id, text, due_at, sent_at NULL, delivery TEXT NULL /*'line'|'failed'*/, seen_at NULL)`, `messages(user_id, channel, role, content, created_at)`, `extractions(user_id, doc_type, fields_json, status /*pending|confirmed|discarded*/, channel, created_at)`, `audit_log(user_id, entity, entity_id, change_json, channel, truth_level, at)`, `line_events(webhook_event_id PK, at)`.

- [ ] **Step 1:** Write `test/health.test.js`: `GET /api/health` → 200 `{ok:true}`; `OPTIONS /api/health` with `Origin: https://chokky-education.github.io` → `Access-Control-Allow-Origin` equals that origin and `Access-Control-Allow-Credentials: true`.
- [ ] **Step 2:** `cd worker && npm i -D wrangler vitest @cloudflare/vitest-pool-workers && npx vitest run` → FAIL.
- [ ] **Step 3:** Implement scaffold; vitest config applies migrations to the test D1 binding `DB`.
- [ ] **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5:** Commit `feat(worker): scaffold worker, D1 schema, test harness`.

### Task 2: Allowlist + email OTP auth + sessions

**Files:**
- Create: `worker/src/auth.js`, `worker/src/email.js`, `worker/test/auth.test.js`
- Modify: `worker/src/index.js` (routes)

**Interfaces:**
- Produces: `isAllowed(env, email) -> boolean`; `requestOtp(env, email, {purpose:'web'|'line', lineUserId?}) -> {ok:true}|{ok:false, error:'not_allowed'|'too_soon'}`; `verifyOtp(env, email, code) -> {ok:true, user}|{ok:false, error:'invalid'|'expired'|'locked'}` (creates user + seeds data via `seedUser` from Task 3 on first verify; if purpose `line`, sets `users.line_user_id`); `createSession(env, userId) -> token`; `requireUser(req, env) -> user|null` (cookie `im_session`, `HttpOnly; Secure; SameSite=None`, 30 days); `sendOtpEmail(env, to, code)` (Brevo `POST https://api.brevo.com/v3/smtp/email`).
- Routes: `POST /api/auth/request {email}`, `POST /api/auth/verify {email, code}`, `GET /api/me`, `POST /api/auth/logout`.

- [ ] **Step 1:** Tests (mock `fetch` for Brevo): non-allowlisted email → `not_allowed`, no email sent; allowlisted (case-insensitive) → one Brevo call with a 6-digit code; second request within 60s → `too_soon`; correct code → session cookie set and `/api/me` returns email; code after 10 min → `expired`; 5 wrong attempts → `locked` even with correct code after.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; store SHA-256 of code, never plaintext.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(worker): allowlisted email OTP login`.

### Task 3: Domain store (single source of truth)

**Files:**
- Create: `worker/src/store.js`, `worker/src/seed.js`, `worker/test/store.test.js`

**Interfaces:**
- Produces (all take `(env, userId, ..., channel)` and write `audit_log`):
  `seedUser(env, userId)` — seed tasks/documents/applications copied from `index.html` `SEED` (`uni`, `myDocs`, a few `apps`), truth per the seed's `verified` flag;
  `getOverview(env, userId) -> {applications, university_checklist, my_documents, reminders}` (same field names as `TOOL_FN.get_overview` in `index.html:790`);
  `addApplication(env, userId, {company, role, status, next_step?, url?, truth_level}, channel) -> {ok, id}|{ok:false, error:'duplicate'}`;
  `updateApplicationStatus(env, userId, {company, status, next_step?}, channel) -> {ok}|{ok:false, error:'not_found'|'system_verified'}` (fuzzy company match same as `findApp` at `index.html:787`);
  `setTask(env, userId, {task_keyword, done}, channel)`; `addReminder(env, userId, {text, datetime}, channel)` (datetime without offset = Asia/Bangkok);
  `addDocument(env, userId, {kind, title, fields, truth_level}, channel)`.

- [ ] **Step 1:** Tests: seed creates rows; add then duplicate → `duplicate`; update SYSTEM_VERIFIED app → `system_verified`; every mutation adds an audit row with the given channel; `addReminder({datetime:'2026-11-19T20:00'})` stores `2026-11-19T13:00:00.000Z`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(worker): domain store with truth levels and audit`.

### Task 4: Assistant (Gemini + tools), shared by both channels

**Files:**
- Create: `worker/src/assistant.js`, `worker/src/prompt.js`, `worker/test/assistant.test.js`

**Interfaces:**
- Consumes: Task 3 store functions.
- Produces: `runAssistant(env, userId, channel, text) -> {reply: string, actions: string[]}`. Loads last 20 `messages` as history, persists user + model messages, loops function calls (max 5) over the 5 tools (declarations moved from `index.html:772-781`; `add_application` maps to `truth_level:'USER_REPORTED'`). `prompt.js` exports `systemPrompt(overview, now)` ported from `index.html`.

- [ ] **Step 1:** Tests with mocked Gemini `fetch`: a response calling `add_application` then text → app row exists, reply returned, two messages persisted with channel; Gemini 500 → reply `'ขอโทษนะ ตอนนี้พี่ตอบไม่ได้ ลองใหม่อีกครั้งนะ'` and no app row.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(worker): shared Gemini assistant with tools`.

### Task 5: OCR extractions with confirm

**Files:**
- Create: `worker/src/ocr.js`, `worker/test/ocr.test.js`

**Interfaces:**
- Produces: `extractDocument(env, userId, channel, {bytes: ArrayBuffer, mime, docType?:'job_post'|'handbook'|'transcript'|'acceptance'}) -> {ok, extraction:{id, doc_type, fields}}|{ok:false, error}` (calls Paxa `POST https://api.paxalabs.com/v1/extract` with the schemas from `DOCTYPES` at `index.html:449`; default `job_post`; saves `extractions` row `pending`);
  `confirmExtraction(env, userId, extractionId, channel) -> {ok, created:'application'|'document'}` — `job_post` → `addApplication(... status:'Saved', truth_level:'AI_EXTRACTED')`; other types → `addDocument(... truth_level:'AI_EXTRACTED')`; second confirm → `{ok:false, error:'already_confirmed'}`;
  `discardExtraction(env, userId, id)`; `formatExtraction(extraction) -> string` (Thai summary with "🤖 อ่านโดย AI · กรุณาตรวจก่อนยืนยัน").

- [ ] **Step 1:** Tests (mock Paxa): extract → pending row, no application yet; confirm → application with AI_EXTRACTED; confirm twice → `already_confirmed`; Paxa error → `{ok:false}` and no row.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(worker): OCR extraction with explicit confirm`.

### Task 6: Web API

**Files:**
- Create: `worker/src/web-api.js`, `worker/test/web-api.test.js`
- Modify: `worker/src/index.js`

**Interfaces:**
- Consumes: Tasks 2–5. All routes require `requireUser`, else 401.
- Produces routes: `GET /api/state` (overview + `messages` last 50 both channels + `pending_extractions` + `unseen_reminders` where `delivery='failed'` or due and unseen); `POST /api/chat {text}` → `runAssistant(...,'web',...)`; `POST /api/ocr` (multipart `file`, optional `docType`); `POST /api/extractions/:id/confirm|discard`; `POST /api/applications {…}`; `PATCH /api/applications/:id {status, next_step}`; `PATCH /api/tasks/:id {done}`; `POST /api/reminders {text, datetime}`; `POST /api/reminders/:id/seen`.

- [ ] **Step 1:** Tests: unauthenticated → 401; message sent via `runAssistant(...,'line',...)` appears in `/api/state.messages` with `channel:'line'`; PATCH a SYSTEM_VERIFIED app → 403.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(worker): web JSON API`.

### Task 7: LINE webhook

**Files:**
- Create: `worker/src/line.js`, `worker/test/line.test.js`
- Modify: `worker/src/index.js` (`POST /line/webhook`)

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces: `verifySignature(body, signature, secret) -> boolean` (HMAC-SHA256 base64); `handleEvent(env, event)`; `reply(env, replyToken, messages)`; `push(env, lineUserId, messages) -> boolean`.
- Behavior: dedupe on `webhookEventId` in `line_events`; respond 200 immediately and process in `ctx.waitUntil`.
  - Unlinked user: text that looks like an email → `requestOtp(...,{purpose:'line', lineUserId})` and ask for code; 6 digits → `verifyOtp` then welcome; anything else → ask for university email. Not allowlisted → `'ตอนนี้ InternMatch เปิดให้ทีมทดลองใช้เท่านั้นนะ'`.
  - Linked, text → `runAssistant(...,'line',...)`, reply text.
  - Linked, image → fetch `https://api-data.line.me/v2/bot/message/{id}/content` → `extractDocument(...,'line',...)` → reply `formatExtraction` with Quick Reply postbacks `confirm:<id>` / `discard:<id>`.
  - Postback `confirm:<id>` → `confirmExtraction(...,'line')`, reply result.

- [ ] **Step 1:** Tests: bad signature → 401; same event id twice → assistant mocked called once; unlinked user text → no Gemini call, reply asks for email; non-allowlisted email → trial-only message; image → reply contains "🤖 อ่านโดย AI" and quickReply with `confirm:`; postback confirm → application created with channel `line`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(worker): LINE webhook adapter`.

### Task 8: Reminder cron

**Files:**
- Create: `worker/src/reminders.js`, `worker/test/reminders.test.js`
- Modify: `worker/wrangler.toml` (`[triggers] crons = ["*/15 * * * *"]`), `worker/src/index.js` (`scheduled`)

**Interfaces:**
- Produces: `sendDueReminders(env, now: Date) -> {sent, failed}` — due & unsent: linked user → `push`; success → `delivery='line'`; failure or no LINE link → `delivery='failed'` (shows on web via `/api/state.unseen_reminders`). Sets `sent_at` either way.

- [ ] **Step 1:** Tests: reminder at `2026-11-19T20:00` Bangkok not sent at `12:59Z`, sent at `13:00Z`; push failure → `delivery='failed'` and present in `/api/state.unseen_reminders`; not resent next run.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(worker): reminder cron with web fallback`.

### Task 9: Web client on the Worker API

**Files:**
- Modify: `index.html`
- Create: `config.js` (`window.IM_API = 'https://internmatch-api.<account>.workers.dev'`, no secrets)

**Interfaces:**
- Consumes: Task 6 routes.
- Changes:
  - Login gate before app: email → code (with "ถ้าไม่เห็นอีเมล ลองดูในโฟลเดอร์ Spam").
  - `loadState()` fetches `/api/state` and maps into existing globals (`apps`, `uni`, `myDocs`, `reminders`) so current render functions keep working; every mutation (kanban move, task tick, reminder, OCR save) calls the API then `loadState()`.
  - AI drawer and `chat` screen use `POST /api/chat`; `chat` screen shows real merged history with a "💬 LINE" / "🌐 เว็บ" tag per message.
  - OCR screen posts the file to `/api/ocr`, confirm/discard via API.
  - Remove all API-key inputs, `localStorage` keys `pxKey/gmKey/gmModel`, `#key=` URL param, client-side Gemini/Paxa `fetch`, the `pipeline` screen and Admin portal, and their nav items.
  - Top banner: "LINE ใช้ไม่ได้? ทำทุกอย่างที่นี่ได้เหมือนกัน" plus unseen reminders list.
  - Truth badges rendered from `truth_level`.

- [ ] **Step 1:** Run the AGENTS.md syntax check → `OK`; `grep -nE "pxKey|gmKey|generativelanguage|paxalabs|renderPipeline" index.html` → no output.
- [ ] **Step 2:** `cd worker && npx wrangler dev` + serve repo root locally; manual: log in, add app via chat, see card; tick task; upload job-post image, confirm, see AI_EXTRACTED card.
- [ ] **Step 3:** Commit `feat(web): use Worker API, add login, remove admin and client keys`.

### Task 10: Deploy, owner setup, docs

**Files:**
- Create: `docs/line-setup.md` (owner checklist, Thai)
- Modify: `AGENTS.md`, `INDEX.md`, `PRD.md` (LINE primary, web parity fallback, no admin, Worker architecture, new screen list)

- [ ] **Step 1:** Write `docs/line-setup.md`: LINE Console (Messaging API, secret, token, webhook URL `https://<worker>/line/webhook`, Use webhook ON, auto-reply OFF, greeting off); Brevo signup + verify sender Gmail + API key; Gemini & Paxa keys; exact `wrangler secret put` commands; `wrangler d1 create internmatch` + `wrangler d1 migrations apply internmatch --remote`.
- [ ] **Step 2:** After owner supplies secrets: `npx wrangler deploy` → URL; set it in `config.js`; LINE Console "Verify" webhook → success.
- [ ] **Step 3:** Run spec §8 acceptance end-to-end (incl. disabling webhook to simulate outage); `git grep -nE "pxa_|AIza|@gmail.com"` excluding docs → nothing.
- [ ] **Step 4:** Update docs; `node scripts/index.mjs refresh`; commit and `git push origin main`.
