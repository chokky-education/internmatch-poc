# Status & Handoff

The one file that says where the work stands. **Read it first; update it last.** Every agent that finishes a chunk of work rewrites the "Now" and "Next" sections and adds one line to the log at the bottom, in the same commit as the work.

_Last updated: 2026-11-12_

## Now (what is true today)

- **Shipped on `main`:** LINE-primary / web-fallback backend in `worker/` (auth by email + OTP, Gemini assistant, Paxa OCR with confirm step, cards + `runCardAction`, cron reminders with web-banner fallback). Web app reworked into a 2-column dashboard home and a 5-item menu (commit `71d1cdb`).
- **Live before this release:** Pages served `d115287` and the Worker was last changed by the auth allowlist secret repair. No Worker runtime code is changed in this PR.
- **Release policy:** `AGENTS.md` and `docs/release-workflow.md` require agent-owned PR → CI → merge → deploy → production verification, including operational changes. CI checks backend/tooling/docs and gates the Pages deployment; the live manifest and asset hashes identify the merged commit. Worker/DB/secrets deploy remains the agent's responsibility using existing local credentials.
- **Bootstrap after merging PR #4:** apply `.github/main-protection.json` (PR + current required `check`, including admins), switch Pages to GitHub Actions, and verify the merged CI/deploy/live checks and repository settings. These settings are not implied by YAML; the shipping agent must verify the API responses before reporting success. Production results belong in the PR/task report rather than an unreviewed follow-up edit here.
- **Auth repair already shipped:** the four existing team accounts were restored to the production allowlist; the affected user re-linked LINE and successfully continued chatting. The cause of the earlier missing LINE binding was not conclusively located. Web logout preserves LINE linking in the backend test suite.
- **Prototype limits:** only emails in the `ALLOWED_EMAILS` secret can log in.

## In flight

- PR #4: shared instructions and enforced release workflow; complete the bootstrap checks above before calling it shipped. PR #5 contains separate research/handoff work and is not part of this release.

- PR #2 `feat: typing animation and quoted replies (LINE OA + web)` on branch `claude/ux-ui-loading-animation-68c749`: open, not merged. Check it before touching chat rendering in `index.html` or `line.js`.

## Known gaps (stubs that look real)

- 📁 เอกสาร: faculty checklist is a generic 6-item seed (`worker/src/seed.js`), not tied to a real faculty.
- 🔎 ค้นหาฝึกงาน and ⭐ ที่บันทึกไว้: job listings are sample data in `index.html`; "ฉันสมัครแล้ว" does write to the real board.
- ⚙️ `onboard` (university / faculty / programme): preview page, choices are not saved.
- No `GLOSSARY.md` yet. `/domain-modeling` creates it when the first term gets settled. ADRs 0001-0003 exist in `docs/adr/`.

## Next (suggested, not yet agreed with the owner)

1. Finish and verify PR #4 release bootstrap; then decide PR #2 separately: review, merge, or close.
2. Persist onboarding choices (university / faculty / programme) to D1 and use them to pick a faculty checklist.
3. Replace sample job listings with a real source, keeping "รายงานข้อมูลผิด" and source links.

## Gotchas

- `.local-index/` and `worker/node_modules/` are git-ignored, so a fresh worktree needs `cd worker && npm ci` before `npx vitest run`. The index rebuilds itself on first search.
- Secrets live only in Cloudflare (`wrangler secret put`) and `worker/.dev.vars` (git-ignored). Never in `index.html`, `config.js` or `wrangler.toml`.
- `go('<screen id>')` still works for every old screen id: it opens the grouped page and scrolls (see `GROUPS` in `index.html`).

## Log

- 2026-11-12: Reviewed PR #4 against the owner’s complete-release requirement. Fixed cached index classification and secret scan coverage, added ten tooling regression checks, CI-gated public-only Pages artifacts with a revision manifest and live verification, and an auditable branch policy/runbook. No app runtime behavior changed.
- 2026-11-12: Added CI, `scripts/check-docs.mjs`, `CODING_STANDARDS.md`, `docs/agent-kickoff.md`; AGENTS.md now requires PRs instead of pushing to `main`.
- 2026-11-12: Added `CLAUDE.md`/`GEMINI.md` pointers to `AGENTS.md` and ADRs 0001-0003 so agents from any vendor share one set of instructions and know the deliberate decisions.
- 2026-11-12: Index made hand-maintained (script no longer overwrites `INDEX.md`), now covers `worker/`, `.sql`, `.toml`, `.csv`. Added this file.
