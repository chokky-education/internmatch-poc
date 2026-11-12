# Status & Handoff

The one file that says where the work stands. **Read it first; update it last.** Every agent that finishes a chunk of work rewrites the "Now" and "Next" sections and adds one line to the log at the bottom, in the same commit as the work.

_Last updated: 2026-11-13_

## Now (what is true today)

- **Profile release candidate:** Guided profile/seasons/milestones implemented and Local UAT approved by owner, including the dialog layout revision. 136 backend tests and browser UAT passed before release integration. Feature remains on its branch until PR/CI/merge. Production migration and Worker deployment are pending; follow `docs/profile-release.md`.

- **Shipped on `main`:** LINE-primary / web-fallback backend in `worker/` (auth by email + OTP, Gemini assistant, Paxa OCR with confirm step, cards + `runCardAction`, cron reminders with web-banner fallback). Web app reworked into a 2-column dashboard home and a 5-item menu (commit `71d1cdb`).
- **Live:** Pages publishes through GitHub Actions after the required `check` job. The live `release.json` identifies the deployed SHA; HTML/config hashes are checked against it. Worker `internmatch-api` remains unchanged by the release-tooling work and retains the earlier auth allowlist repair.
- **Release policy:** `AGENTS.md` and `docs/release-workflow.md` require agent-owned PR → CI → merge → deploy → production verification, including operational changes. CI checks backend/tooling/docs and gates the Pages deployment; the live manifest and asset hashes identify the merged commit. Worker/DB/secrets deploy remains the agent's responsibility using existing local credentials.
- **Verified repository settings (2026-11-12):** PR #4 merged as `b69b77f`; required PRs and strict GitHub Actions `check` are enabled on `main`, including admins. Force pushes/deletions are disabled and conversations must be resolved. Pages source is `workflow`. CI run `43204001491` passed both `check` and `deploy-pages`; standalone live verification passed all 14 baseline checks for that SHA. [CI/deploy evidence](https://github.com/chokky-education/internmatch-poc/actions/runs/43204001491). Settings were read back from GitHub, not inferred from files. Always re-check current settings and live revision when continuing a release.
- **Auth repair already shipped:** the four existing team accounts were restored to the production allowlist; the affected user re-linked LINE and successfully continued chatting. The cause of the earlier missing LINE binding was not conclusively located. Web logout preserves LINE linking in the backend test suite.
- **Prototype limits:** only emails in the `ALLOWED_EMAILS` secret can log in.

## In flight

- PR #5 contains separate research/handoff work and is not part of the release-workflow setup. PR #4 is merged, deployed and verified; the policy request-shape correction and its guard are included in this handoff.

- PR #2 `feat: typing animation and quoted replies (LINE OA + web)` on branch `claude/ux-ui-loading-animation-68c749`: open, not merged. Check it before touching chat rendering in `index.html` or `line.js`.

## Known gaps (stubs that look real)

- 📁 เอกสาร: faculty checklist is a generic 6-item seed (`worker/src/seed.js`), not tied to a real faculty.
- 🔎 ค้นหาฝึกงาน and ⭐ ที่บันทึกไว้: job listings are sample data in `index.html`; "ฉันสมัครแล้ว" does write to the real board.
- Profile/season/milestone persistence replaces the unsaved onboard form in this release candidate. Dates without confirmed reminders do not yet appear on Dashboard.
- `GLOSSARY.md` defines profile/season vocabulary; ADR 0004 records shared selected season and historical context.

## Next (suggested, not yet agreed with the owner)

1. Continue only work the owner has authorized. PR #2 and PR #5 are separate open work; review them when requested.
2. Finish the authorized profile release via PR/CI/merge, guarded D1 migration, Worker deployment and separate live verification. Faculty checklist remains generic.
3. Replace sample job listings with a real source, keeping "รายงานข้อมูลผิด" and source links.

## Gotchas

- `.local-index/` and `worker/node_modules/` are git-ignored, so a fresh worktree needs `cd worker && npm ci` before `npx vitest run`. The index rebuilds itself on first search.
- Secrets live only in Cloudflare (`wrangler secret put`) and `worker/.dev.vars` (git-ignored). Never in `index.html`, `config.js` or `wrangler.toml`.
- `go('<screen id>')` still works for every old screen id: it opens the grouped page and scrolls (see `GROUPS` in `index.html`).

## Log

- 2026-11-12: Completed PR #4 bootstrap: verified required PR/strict CI for admins, Actions-based Pages publishing, successful merged CI/deploy, 14 live baseline checks and desktop/mobile login-shell browser checks. Corrected the protection API’s mutually exclusive request fields and added regression guards for that request and for generated/nested checkout search pollution; no user data or Worker code changed.
- 2026-11-12: Reviewed PR #4 against the owner’s complete-release requirement. Fixed cached index classification and secret scan coverage, added ten tooling regression checks, CI-gated public-only Pages artifacts with a revision manifest and live verification, and an auditable branch policy/runbook. No app runtime behavior changed.
- 2026-11-12: Added CI, `scripts/check-docs.mjs`, `CODING_STANDARDS.md`, `docs/agent-kickoff.md`; AGENTS.md now requires PRs instead of pushing to `main`.
- 2026-11-12: Added `CLAUDE.md`/`GEMINI.md` pointers to `AGENTS.md` and ADRs 0001-0003 so agents from any vendor share one set of instructions and know the deliberate decisions.
- 2026-11-12: Index made hand-maintained (script no longer overwrites `INDEX.md`), now covers `worker/`, `.sql`, `.toml`, `.csv`. Added this file.

- 2026-11-13: Owner accepted Local UAT and authorized PR/CI/merge/deploy. Integrated current release tooling, expanded the public asset manifest for profile JS/CSS, and added a temporary maintenance entry plus reviewed migration/production smoke procedure. Production operations are not yet complete at this commit.
