# Status & Handoff

The one file that says where the work stands. **Read it first; update it last.** Every agent that finishes a chunk of work rewrites the "Now" and "Next" sections and adds one line to the log at the bottom, in the same commit as the work.

_Last updated: 2026-11-14_

## Now (what is true today)

- **Manual document release complete:** PR #15 merged as `eab938c`; cleanup verifier PR #16 merged as `32c1173`. Main CI/Pages runs `43590538044` and `43591558827` succeeded. Feature verification completed on `32c1173` / Worker `0ecd6a50-bb69-454f-aa51-ebb2ae266230` at 100%; this closeout changes documentation only and retains the same app/runtime bytes. Its manifest/deployment evidence is retained in the PR/task release report.
- **Production document flow verified:** 29 baseline checks matched both manifests and all eight public asset hashes. Chromium desktop and mobile-size WebKit each passed 15 authenticated manual API/UI checks, including changed retry drafts and failed refreshes. The isolated smoke identity and all its records were removed from 12 tables; existing account/LINE-link fingerprints matched. No schema, secret, allowlist or real-user rewrite occurred and no OTP/LINE/AI messages were sent. See `docs/releases/2026-11-14-documents.md` for exact identifiers and verification limits. Handbook OCR integration remains deferred by the owner.
- **Verifier limitation resolved:** the first production pass exposed D1's compound-SELECT limit only in the final cleanup-count query; an independent read confirmed zero rows after deletion. PR #16 replaced the query with a tested scalar aggregate and the complete smoke, cleanup and link checks then passed.
- **Document-list local checks:** 151/151 Worker tests, 21/21 tooling/rendering tests and 15 changed-flow checks each in Chromium desktop/mobile-size WebKit passed. Syntax/guardrails/index/public bundling passed. Reviewed bounded production fixture/cleanup plan: `docs/document-release.md`; local evidence and external-provider limits: `docs/uat/2026-11-14-documents.md`.

- **XSS/session release complete:** PR #12 shipped the same-origin Worker app, inert text/attribute rendering, HttpOnly cookie-only hashed sessions and Origin enforcement. PR #13 completed the ordinary mobile modal flow. Feature verification finished on `4d7e2b4eeed041b426eaaff0d6916b18b07db74f` / Worker `72b716e4-10b7-49ec-9923-a6f2698e8f1d`; current metadata deployment details are retained in the PR/task release evidence. This closeout changes documentation only and retains those same app/runtime bytes.
- **Verified production behavior:** main CI/Pages run `43342405991` passed, both manifests/six asset hashes matched and 27 baseline checks passed. Chromium and mobile WebKit synthetic login/reload/logout/relogin, stored manual/LINE-origin OCR text, quote-safe profile attributes, storage cleanup and foreign mutation checks passed. Fixtures were removed and existing LINE-link fingerprints matched. Owner-authorized genuine email OTP form login/reload/logout in Chromium and form relogin/reload in mobile-size WebKit passed; the existing LINE link stayed true and Save reached normal validation without writing real business records. Twenty-one old raw sessions were expired once; v2 sessions were preserved. Physical iPhone and new LINE/OCR/LLM deliveries were not claimed. See `docs/releases/2026-11-13-session-security.md` and PRs #12/#13 for the rollout history.

- **Shipped profile/seasons:** PR #8 merged as `94d72cd`; release-verifier repair PR #9 merged as `0eec60a`. The owner accepted Local UAT and the revised milestone dialog. Guided forms now persist through shared Worker/D1 services; education snapshots, multi-season isolation, milestone proposals/rescheduling and original-target confirmations are implemented.
- **Historical profile Worker/D1 verification:** Worker version `36bc7368-e2de-4634-8521-fd91122555f3` was verified at 100% for that release, annotated with runtime SHA `0eec60a5defea032841138351c22e2d4a520858e`. Migration 0003 applied once; all original fields in 11 legacy tables matched before/after fingerprints, and all migrated season owners/selections validated. A private backup was exported and independently restored/compared locally before migration.
- **Live feature verification:** authenticated production API smoke passed blank profile, snapshot education, season isolation, milestone confirmation/replay and atomic rescheduling. The short-lived smoke identity and its records were removed; no OTP/LINE/AI test messages were sent. Web revision and four asset hashes plus 16 baseline API/auth/CORS/signature checks passed for `0eec60a`. See `docs/releases/2026-11-13-profile.md`.
- **CI follow-up:** `PR #10` merged as `f1a0843`; main CI run `43284287883` (`check` + Pages) completed with `success`.
- **Labeled Seam 2 & Seam 3 UAT:** Ran Seam 2 (`worker` Vitest: 18 files, 139 tests including a new `runAssistant` `get_overview` unconfirmed-milestone isolation seam test) and Seam 3 (`scripts/test/*.test.mjs`: 14 tests + guardrails/syntax/Pages build + live `verify-production.mjs` 16/16 baseline checks for `f1a0843`), documented with explicit tester/model/scope labels in `docs/uat/2026-11-13-uat-labeled-report.md`.
- **Release policy:** agent-owned PR → CI → merge → deploy → verify, including admins. Public-only Pages artifacts carry a revision manifest; Worker operations remain agent-owned using existing local credentials. Secrets/allowlist and real LINE links were preserved.

## In flight

- PR #5 contains separate research/handoff work and is not part of the release-workflow setup. PR #4 is merged, deployed and verified; the policy request-shape correction and its guard are included in this handoff.

- PR #2 `feat: typing animation and quoted replies (LINE OA + web)` on branch `claude/ux-ui-loading-animation-68c749`: open, not merged. Check it before touching chat rendering in `index.html` or `line.js`.

## Known gaps (stubs that look real)

- 📁 เอกสาร: preparation items are student-reported, not a researched faculty requirement database. Existing OCR stores extracted data only and does not populate the checklist; original-file storage and readiness matrices are unavailable.
- 🔎 ค้นหาฝึกงาน and ⭐ ที่บันทึกไว้: job listings are sample data in `index.html`; "ฉันสมัครแล้ว" does write to the real board.
- Profile/season/milestone persistence replaces the unsaved onboard form in this release candidate. Dates without confirmed reminders do not yet appear on Dashboard.
- `GLOSSARY.md` defines profile/season vocabulary; ADR 0004 records shared selected season and historical context.

## Next (suggested, not yet agreed with the owner)

- The authorized security feature work and changed-flow verification are complete. Preserve session revocation and the same-origin boundary in future changes; do not merge unrelated open work or repeat legacy expiry on v2 sessions.

1. Continue only work the owner has authorized. PR #2 and PR #5 are separate open work; review them when requested.
2. Follow the same-origin release workflow for the next owner-authorized change; keep Worker app and Pages launcher manifests matched to the merged release. The overview and security changes have been deployed.
3. The authorized manual document list and its production verification are complete. Continue only newly authorized work; handbook-to-checklist integration and real job-listing sources remain separate future decisions.

## Gotchas

- `.local-index/` and `worker/node_modules/` are git-ignored, so a fresh worktree needs `cd worker && npm ci` before `npx vitest run`. The index rebuilds itself on first search.
- Secrets live only in Cloudflare (`wrangler secret put`) and `worker/.dev.vars` (git-ignored). Never in `index.html`, `config.js` or `wrangler.toml`.
- `go('<screen id>')` still works for every old screen id: it opens the grouped page and scrolls (see `GROUPS` in `index.html`).

## Log

- 2026-11-14: Completed the manual document release through PR #15/#16, both main CI/Pages runs, matching Worker deployment, 29 production baseline checks and 15 changed-flow checks per browser. Full reserved-identity cleanup and unchanged existing LINE-link fingerprints verified; recorded the documentation closeout without changing runtime bytes.

- 2026-11-14: PR #15 shipped and passed the production baseline and both browser flows. Repaired the final cleanup verifier's D1 compound-SELECT limitation; independently confirmed all 12 fixture tables empty and added aggregate/ownership/prefix regressions. The follow-up changes release verification only and remains pending release at this commit.

- 2026-11-14: Addressed Standards/Spec review: source-season labels on document cards, mandatory stable create request IDs, payload fingerprints preserving changed retry drafts, shared chat retry IDs, durable document-chat success/partial receipts that replay before model tool reordering, and honest failed-refresh feedback. Rechecked 151 Worker tests, 19 tooling tests and 15 browser checks per engine.

- 2026-11-14: Built the owner-authorized manual document-list candidate, retained legacy progress, stopped real-user template seeding in all three initialization paths, and documented the API/web verification scope. No migration, secret, allowlist or real user data change is part of this release.

- 2026-11-13: Completed PR #12/#13 feature verification: both production browser engines passed the unchanged security smoke; real OTP login/logout/relogin and LINE-link preservation passed; all temporary data/sessions were cleaned up. Recorded final evidence without changing runtime code.

- 2026-11-13: PR #12 merged/deployed with 27 baseline checks and real Chromium OTP/reload confirmed. Production mobile WebKit exposed an existing modal/FAB stacking conflict; added the narrow follow-up and retained fixture cleanup/LINE-link invariants.

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

- 2026-11-13: Ran labeled Seam 2 & Seam 3 UAT (`docs/uat/2026-11-13-uat-labeled-report.md`, Tester: Claude Code / Model: `gemini-default`), added a `runAssistant` `get_overview` unconfirmed-milestone seam test (139/139 Worker tests, 14/14 tooling tests), recorded main CI run `43284287883` success, and verified live baseline `verify-production.mjs` (16/16) for `f1a0843`.
