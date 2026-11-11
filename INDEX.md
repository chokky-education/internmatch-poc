# Project Map & Index: InternMatch

Hand-maintained map. Update it in the same commit whenever you add, move or retire a file or module.
**Where work stands right now:** [`docs/STATUS.md`](docs/STATUS.md) (read it before starting).

## Search before reading raw files

```bash
node scripts/index.mjs search "คำค้น" [--kind doc|spec|code|schema] [--path worker/src]
node scripts/index.mjs files "ชื่อไฟล์" [--path worker/]
node scripts/index.mjs show <chunk-id> [--around "คำค้น"] [--context 3]
node scripts/index.mjs status      # chunk counts per kind
```

- Local SQLite FTS5 (trigram, works for Thai) in `.local-index/` (git-ignored). Every command auto-refreshes changed files, so it never goes stale.
- Output capped at 2,500 chars (`--max-chars` up to 16,000).
- Kinds: `spec` = PRD, UI/UX spec, `docs/superpowers/*` · `doc` = other `.md`/`.csv` · `schema` = `.json`, `.sql`, `.toml` · `code` = everything else.

## Architecture in one breath

One backend, two front doors. `worker/` (Cloudflare Worker + D1) holds all logic. LINE OA (primary) and the web page `index.html` (fallback, GitHub Pages) call the same functions. Every reply that needs a tap is a channel-neutral **card** (`cards.js`) → LINE Flex (`flex.js`) or web `renderCard()`. Every card button goes through `runCardAction` (`actions.js`).

## File & Module Map

### Front end (GitHub Pages)

| Path | What it is |
| --- | --- |
| `index.html` | Whole web app (single file). 5 menu pages + settings, grouped by `GROUPS`; `go('<screen id>')` scrolls to a section. Chat drawer `#aiFab`, `renderCard()` |
| `config.js` | Worker API base URL for the web page |

### Backend: `worker/` (Cloudflare Worker `internmatch-api`)

| Path | What it is |
| --- | --- |
| `worker/src/index.js` | Entry: health, auth (`/api/auth/*`, `/api/me`), `/line/webhook`, hands other `/api/*` to web-api, runs cron `*/15` reminders |
| `worker/src/web-api.js` | Web REST API (`/api/state`, `/api/chat`, `/api/actions`, `/api/ocr`, `/api/applications`, `/api/reminders`), `channel='web'` |
| `worker/src/line.js` | LINE webhook: text → assistant, images → OCR, postbacks → `runCardAction`, `push()` |
| `worker/src/actions.js` | `runCardAction(env, userId, channel, data)`: one dispatcher for all card buttons |
| `worker/src/cards.js` | Channel-neutral card objects (application saved/status, reminder, OCR result) |
| `worker/src/flex.js` | Card → LINE Flex Message, truth-level badges |
| `worker/src/assistant.js` | Gemini "พี่ฝึกงาน" with function calling (`get_overview`, `add_application`, …) |
| `worker/src/prompt.js` | System prompt (Thai date, overview context) |
| `worker/src/ocr.js` | Paxa Labs extraction → pending `AI_EXTRACTED` record awaiting confirm |
| `worker/src/doctypes.js` | Extraction schemas for the 4 document types |
| `worker/src/store.js` | D1 data access: applications, tasks, reminders, documents, audit log |
| `worker/src/seed.js` | Generic 6-item faculty checklist for new users (`USER_REPORTED`) |
| `worker/src/auth.js` | Email + OTP login, sessions, `ALLOWED_EMAILS` gate, LINE linking |
| `worker/src/email.js` | OTP email via Brevo |
| `worker/src/reminders.js` | Cron: push due reminders on LINE, fall back to web banner |
| `worker/src/http.js` | JSON/CORS helpers |
| `worker/migrations/*.sql` | D1 schema (`0001_init`, `0002_message_cards`) |
| `worker/test/*.test.js` | Vitest suite (`cd worker && npx vitest run`), one file per module |
| `worker/scripts/richmenu.mjs`, `worker/richmenu/` | LINE rich menu builder and images |
| `worker/wrangler.toml` | Worker config, D1 binding, cron, model vars (secrets are NOT here) |

### Specs & docs

| Path | What it is |
| --- | --- |
| `AGENTS.md` | Rules and invariants for agents, one copy for every harness. Read first |
| `CLAUDE.md`, `GEMINI.md` | Pointers to `AGENTS.md` for harnesses that look for their own file. Never add content here |
| `docs/adr/` | Decisions already made on purpose (LINE-primary, no admin, not a job board). Read before changing architecture or scope |
| `docs/STATUS.md` | Handoff: current state, in-flight work, next steps, gotchas |
| `PRD.md` | Product requirements, truth hierarchy, data pipeline |
| `UI_UX_SPEC.md` | Screen specs and design tokens |
| `docs/superpowers/specs/2026-11-11-line-primary-web-fallback-design.md` | Design of the LINE-primary / web-fallback architecture |
| `docs/superpowers/plans/2026-11-11-line-primary-web-fallback.md` | Implementation plan for the above |
| `docs/line-setup.md` | How to set up LINE OA, secrets, deploy |
| `docs/test-round-1.csv` | Manual test cases, round 1 |
| `docs/agents/*.md` | Issue tracker (GitHub Issues), triage labels, domain-doc conventions |
| `scripts/index.mjs` | The local search index CLI |

## Key concepts

- **Positioning:** "ผู้ช่วยพาคุณผ่านฤดูฝึกงาน", an action-first seasonal project manager, not a job board.
- **Truth levels** (every datum on screen carries one): `SYSTEM_VERIFIED` (green), `USER_REPORTED` (blue, audit-logged), `AI_EXTRACTED` (yellow, must be confirmed before saving).
- **AI:** Paxa Labs `paxa-doc-extract-v1` for Thai document OCR · Gemini `gemini-3.8-flash` for the chat assistant.
- **Live:** web https://chokky-education.github.io/internmatch-poc/ · Worker `internmatch-api` on Cloudflare.
