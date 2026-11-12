# Labeled UAT & Seam Verification Report (Seam 2 & Seam 3)

## ป้ายกำกับชุดทดสอบ (Test Run Labels)

| รายการ | ค่าที่ติดป้ายกำกับ |
| --- | --- |
| **Tester (ผู้ทดสอบ)** | Claude Code (Automated Agent UAT — แยกจาก Human UAT) |
| **Agent Model (Model ที่รันเทส)** | `gemini-default` (Claude Code harness model) |
| **Method / Skill** | `mattpocock-skills:tdd` (Seam-based testing at pre-agreed public boundaries; `GLOSSARY.md` + ADRs `0001`–`0004`) |
| **Branch / Base Commit** | `codex/uat-labeled-report` (branched from `origin/main` @ `f1a08430bd362059783a1df09abf7da1059bc4ee`, PR #10) |
| **System / Models Under Test** | 1. **Seam 2:** Cloudflare Worker (`worker/src/index.js`, `web-api.js`, `line.js`, `actions.js`, `assistant.js`, `seasons.js`, `milestones.js`, `ocr.js`, `reminders.js`, `store.js`, `auth.js`) + D1 SQLite via `@cloudflare/vitest-pool-workers`<br>2. **External AI/Channel Providers inside Seam 2:** `gemini-3.8-flash` (mocked at `globalThis.fetch`), `paxa-doc-extract-v1` (mocked at `globalThis.fetch`), Brevo Email & LINE Messaging API (mocked at `globalThis.fetch`)<br>3. **Seam 3:** Node.js v24.15.0 release tooling & guardrails (`scripts/check-docs.mjs`, `scripts/index.mjs`, `scripts/build-pages.mjs`, `scripts/verify-production.mjs`, `scripts/release/d1-query.mjs`, `.github/workflows/ci.yml`) |
| **Scope & Limits** | ครอบคลุม **Seam 2 & Seam 3** ตามที่ตกลงไว้ล่วงหน้า; **ไม่ได้รัน** Seam 4 (Local Browser Playwright 12 กรณี — อ้างอิงผลเดิมใน `2026-11-13-student-profile-local-uat.md`), **ไม่ได้ยิง** Gemini / Paxa OCR / Brevo / LINE จริง, และ **ไม่ได้ทดสอบ** Human Manual Checklist (`docs/test-round-1.csv`) |

---

## สรุปผลตาม Seam ที่ตกลงทดสอบ (What Was Tested)

| Seam | Public Boundary & Test Target | ผลลัพธ์ | สิ่งที่ตรวจจับได้ (Catches) | สิ่งที่อยู่นอกขอบเขต (Misses / Limits) |
| --- | --- | --- | --- | --- |
| **Seam 2** | `cd worker && npx vitest run` (18 files, 139 tests) | **PASS (139/139)** | พฤติกรรมร่วม LINE + Web บน Worker เดียว (ADR `0001`), truth levels (`SYSTEM_VERIFIED` / `USER_REPORTED` / `AI_EXTRACTED`), การแยก `Internship Season` และ `Season Education Context` (ADR `0004`), `Milestone` vs `Reminder`, `runCardAction`, `audit_log` channel/truth, และกรณีใหม่ที่เพิ่ม: `runAssistant` (`get_overview`) เห็น `Milestone` ที่ยังไม่ยืนยันเตือนเฉพาะ `Selected Season` | DOM/CSS บนเบราว์เซอร์จริง, Cloudflare remote latency/limits, คุณภาพภาษาไทยของ `gemini-3.8-flash` / `paxa-doc-extract-v1` จริง, การส่งข้อความเข้าแอป LINE จริง |
| **Seam 3** | `node --test scripts/test/*.test.mjs` (2 files, 14 tests) + `scripts/check-docs.mjs --base origin/main` + syntax/index/Pages build + `verify-production.mjs f1a0843` | **PASS (14/14 + 16/16 live baseline)** | `INDEX.md` coverage, pointer integrity (`CLAUDE.md`/`GEMINI.md`), ADR numbering, secret scan, `STATUS.md` handoff gate, `.pages` manifest/SHA-256 build, D1 query adapter, CI Pages attempt-specific artifact names, `verifyProduction` failure modes on `node:http` fixture, และผล live baseline 16 ข้อสำหรับ `f1a08430bd362059783a1df09abf7da1059bc4ee` | สถานะ runtime ของโค้ด Worker ใน `f1a0843` หลัง deploy จริง (baseline check ไม่ได้ยืนยัน Worker version หรือยิง authenticated feature smoke) |

---

## รายละเอียดสิ่งที่เทสในรอบนี้ (Test Inventory)

### 1. Seam 2 — Worker & Shared Domain Services (`worker/test/*.test.js`)
- **ชุดเดิมทั้งหมด (18 ไฟล์, 138 เทสต์เดิม):**
  - `actions.test.js`, `assistant.test.js`, `auth.test.js`, `cards.test.js`, `health.test.js`, `line-season-origin.test.js`, `line.test.js`, `local-login.test.js`, `maintenance.test.js`, `menu.test.js`, `milestones.test.js`, `ocr.test.js`, `profile-proposals.test.js`, `reminders.test.js`, `season-isolation.test.js`, `seasons.test.js`, `store.test.js`, `web-api.test.js`
- **เทสต์ใหม่ที่เพิ่มตาม `mattpocock-skills:tdd` (+1 เทสต์ ใน `worker/test/assistant.test.js`):**
  - `get_overview surfaces unconfirmed milestones only for the selected internship season` — ทดสอบผ่าน public interface `runAssistant(env, userId, 'line', ...)` โดยสร้าง `Milestone` ที่ยังไม่ยืนยันเตือนใน `Selected Season` และอีก `Internship Season` แยกกัน แล้วตรวจ payload ที่ส่งกลับเข้า `functionResponse` ว่าเห็นเฉพาะกำหนดการของฤดูที่เลือก (`truth_level: 'USER_REPORTED'`) และ `reminders` ยังว่างอยู่

### 2. Seam 3 — Release Tooling & Guardrails (`scripts/test/*.test.mjs` & `scripts/`)
- `scripts/test/guardrails.test.mjs` (7 tests): secret leak scan, nested module in `INDEX.md`, `STATUS.md` requirement on code change, missing `--base` fail-closed, index spec upgrade, branch protection `contexts`/`checks` mutual exclusion, `.pages` / nested worktree search isolation
- `scripts/test/production.test.mjs` (7 tests): `verifyProduction` full baseline, stale commit failure, stale cached HTML failure, broken OTP route failure, `.pages` public-only asset manifest, D1 read/file write adapter, attempt-specific Pages artifact names in `.github/workflows/ci.yml`
- Static & build checks: `index.html` inline `<script>` syntax, `node --check profile-ui.js`, `node scripts/index.mjs refresh`, `node scripts/build-pages.mjs`, `node scripts/check-docs.mjs --base origin/main`

### 3. Live Production Safe Baseline (`node scripts/verify-production.mjs f1a08430bd362059783a1df09abf7da1059bc4ee`)
- **Checked at:** `2026-11-12T19:53:59.495Z` (`ok: true`, **16/16** checks passed against `f1a08430bd362059783a1df09abf7da1059bc4ee`)
- **Verified live:**
  - GitHub Pages `release.json` reachable and matches `f1a08430bd362059783a1df09abf7da1059bc4ee`
  - Deployed `index.html`, `config.js`, `profile-ui.js`, `profile-ui.css` hashes match the built artifact, login shell present, and `config.js` points to production API
  - Worker API `/api/health` responds, CORS allows production origin + Bearer preflight and rejects foreign origin, `/api/me` and `/api/state` enforce authentication, OTP route queries D1 and rejects an absent code, and `/line/webhook` rejects invalid signatures
- **Remaining limits:** Safe baseline check sends no OTP/LINE/AI messages, creates no session, and does not exercise authenticated features or verify whether Worker `f1a0843` (`get_overview` unconfirmed milestones) has been rolled out to Cloudflare.
