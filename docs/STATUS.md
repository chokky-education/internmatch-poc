# Status & Handoff

The one file that says where the work stands. **Read it first; update it last.** Every agent that finishes a chunk of work rewrites the "Now" and "Next" sections and adds one line to the log at the bottom, in the same commit as the work.

_Last updated: 2026-11-13_

## Now (what is true today)

- **Security release candidate:** owner authorized stored-XSS and token fixes. Output encoding now covers board/document/task text, OCR labels, profile attributes and drawer text. The same app/API move to the existing Worker origin; Pages becomes a legacy-credential cleanup launcher. Cookie-only hashed sessions reject old raw credentials and untrusted web mutations; LINE authentication/data links stay separate. ADR 0005 and `docs/releases/2026-11-13-session-security.md` record rollout/revocation and synthetic/owner-account verification. Local regression evidence and final PR/CI/deploy results are reported with this task; production success is not asserted by this pre-release commit.

- **Shipped profile/seasons:** PR #8 merged as `94d72cd`; release-verifier repair PR #9 merged as `0eec60a`. The owner accepted Local UAT and the revised milestone dialog. Guided forms now persist through shared Worker/D1 services; education snapshots, multi-season isolation, milestone proposals/rescheduling and original-target confirmations are implemented.
- **Production Worker/D1 verified:** normal Worker version `36bc7368-e2de-4634-8521-fd91122555f3` is active at 100%, annotated with merged runtime SHA `0eec60a5defea032841138351c22e2d4a520858e`. Migration 0003 applied once; all original fields in 11 legacy tables matched before/after fingerprints, and all migrated season owners/selections validated. A private backup was exported and independently restored/compared locally before migration.
- **Live feature verification:** authenticated production API smoke passed blank profile, snapshot education, season isolation, milestone confirmation/replay and atomic rescheduling. The short-lived smoke identity and its records were removed; no OTP/LINE/AI test messages were sent. Web revision and four asset hashes plus 16 baseline API/auth/CORS/signature checks passed for `0eec60a`. See `docs/releases/2026-11-13-profile.md`.
- **CI follow-up:** required checks passed before both merges. Re-running the Pages job after maintenance exposed duplicate artifact names. This patch gives each attempt its own upload/deploy artifact name without changing the application or weakening the required check; verify the latest merged Pages run after this PR. Final integration also includes milestones in the shared assistant overview, even before reminders are confirmed; deploy the resulting merged Worker and repeat safe feature verification.
- **Release policy:** agent-owned PR → CI → merge → deploy → verify, including admins. Public-only Pages artifacts carry a revision manifest; Worker operations remain agent-owned using existing local credentials. Secrets/allowlist and real LINE links were preserved.

## In flight

- PR #5 contains separate research/handoff work and is not part of the release-workflow setup. PR #4 is merged, deployed and verified; the policy request-shape correction and its guard are included in this handoff.

- PR #2 `feat: typing animation and quoted replies (LINE OA + web)` on branch `claude/ux-ui-loading-animation-68c749`: open, not merged. Check it before touching chat rendering in `index.html` or `line.js`.

## Known gaps (stubs that look real)

- 📁 เอกสาร: faculty checklist is a generic 6-item seed (`worker/src/seed.js`), not tied to a real faculty.
- 🔎 ค้นหาฝึกงาน and ⭐ ที่บันทึกไว้: job listings are sample data in `index.html`; "ฉันสมัครแล้ว" does write to the real board.
- Profile/season/milestone persistence replaces the unsaved onboard form in this release candidate. Dates without confirmed reminders do not yet appear on Dashboard.
- `GLOSSARY.md` defines profile/season vocabulary; ADR 0004 records shared selected season and historical context.

## Next (suggested, not yet agreed with the owner)

- Finish the authorized security release through current-head PR CI, merge, Worker-before-Pages deploy, legacy session expiry and real feature checks. Do not merge the separate UAT/research/chat-animation PRs as part of this work.

1. Continue only work the owner has authorized. PR #2 and PR #5 are separate open work; review them when requested.
2. Verify the attempt-specific Pages artifact fix on the latest merged SHA and finish the release handoff. Faculty checklist remains generic.
3. Replace sample job listings with a real source, keeping "รายงานข้อมูลผิด" and source links.

## Gotchas

- `.local-index/` and `worker/node_modules/` are git-ignored, so a fresh worktree needs `cd worker && npm ci` before `npx vitest run`. The index rebuilds itself on first search.
- Secrets live only in Cloudflare (`wrangler secret put`) and `worker/.dev.vars` (git-ignored). Never in `index.html`, `config.js` or `wrangler.toml`.
- `go('<screen id>')` still works for every old screen id: it opens the grouped page and scrolls (see `GROUPS` in `index.html`).

## Log

- 2026-11-13: Built the authorized XSS/cookie-session candidate in an isolated worktree, reproduced seven pre-fix boundary failures, added regression coverage and a reviewed same-origin rollout/verification plan. Existing pending user work was preserved.

- 2026-11-12: Completed PR #4 bootstrap: verified required PR/strict CI for admins, Actions-based Pages publishing, successful merged CI/deploy, 14 live baseline checks and desktop/mobile login-shell browser checks. Corrected the protection API’s mutually exclusive request fields and added regression guards for that request and for generated/nested checkout search pollution; no user data or Worker code changed.
- 2026-11-12: Reviewed PR #4 against the owner’s complete-release requirement. Fixed cached index classification and secret scan coverage, added ten tooling regression checks, CI-gated public-only Pages artifacts with a revision manifest and live verification, and an auditable branch policy/runbook. No app runtime behavior changed.
- 2026-11-12: Added CI, `scripts/check-docs.mjs`, `CODING_STANDARDS.md`, `docs/agent-kickoff.md`; AGENTS.md now requires PRs instead of pushing to `main`.
- 2026-11-12: Added `CLAUDE.md`/`GEMINI.md` pointers to `AGENTS.md` and ADRs 0001-0003 so agents from any vendor share one set of instructions and know the deliberate decisions.
- 2026-11-12: Index made hand-maintained (script no longer overwrites `INDEX.md`), now covers `worker/`, `.sql`, `.toml`, `.csv`. Added this file.

- 2026-11-13: Owner accepted Local UAT and authorized PR/CI/merge/deploy. Integrated current release tooling, expanded the public asset manifest for profile JS/CSS, and added a temporary maintenance entry plus reviewed migration/production smoke procedure. Production operations are not yet complete at this commit.

- 2026-11-13: Production export succeeded under maintenance; release fingerprinting stopped before migration because Wrangler file execution returns import progress, not result rows. Corrected the helper read/write adapter and added a regression; no production user data changed.

- 2026-11-13: Production migration and Worker release verified with protected backup, 11-table fingerprints, authenticated API smoke and complete fixture cleanup. Fixed Pages rerun artifact selection after a failed maintenance-overlap verification; this follow-up changes only release tooling/docs.

- 2026-11-13: Final release inspection added milestones to the shared overview so the assistant can read dates before a reminder has been confirmed. Added an isolation/unconfirmed-reminder regression; no schema change.

- 2026-11-13: Addressed automated review on PR #10 by anchoring artifact regression assertions to complete YAML keys; an `artifact_name` suffix can no longer satisfy the upload `name` assertion.
