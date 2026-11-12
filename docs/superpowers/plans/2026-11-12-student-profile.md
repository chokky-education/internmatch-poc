# Student profile and internship seasons

Approved: 2026-11-12. Source: ../specs/2026-11-12-student-profile-design.md and accepted Guided prototype.

## Execution checklist
- [x] Database migration: preserve legacy IDs, dates, status/history; account selection, profile versions, seasons, milestones, pending confirmations.
- [x] Shared services: account ownership, frozen season context, atomic mutation/audit, optimistic versions.
- [x] Scope applications, tasks, documents, messages, OCR, reminders and audit by season.
- [x] Milestones: nullable date/range/source; editable reminder proposals; atomic rescheduling; sent history preserved; Cron races covered.
- [x] Web and LINE: shared services/cards/actions; contextual assistant and confirmed profile/season changes; pending cards retain target and expire after 24h.
- [x] Promote revised Guided UI: optional profile, education reuse, season overview/quick milestone add, readable Dashboard buttons.
- [x] Full backend tests, syntax, index, responsive browser interactions and error/persistence checks.
- [ ] User Local UAT feedback → PR → CI → merge → production backup/migration maintenance → Worker/D1 and Pages deployment and live verification.

Defaults: reminders 7/1 days before at 09:00 Asia/Bangkok, future times only. Date ranges anchor to end date and display this before confirmation. No season delete/move or gamification this phase. Discovery stays a labelled sample. Do not stage browser artifacts.

## Progress
- Inspected current checkout and accepted design. Production code initially unchanged.
- Implementation uses branch codex/student-profile-seasons in the current checkout to preserve the uncommitted approved design and prototype.
- Foundation checkpoint: added migration 0003, account-owned season/profile service, snapshot education, optimistic profile/selection/season versions and atomic audit batches. Service not yet connected to live request handlers; existing stores still need season scoping.
- Verified: full backend suite 120/120 passing (13 files). SQLite legacy migration probe preserved existing reminder/application fields and attached legacy season. Index refreshed.
- Next: scope existing store/assistant/OCR operations, then implement pending actions/milestones/reminder rescheduling and integrate Guided UI. No deployment performed.

## Release order required by user
Local UAT must finish before PR → CI → Merge → Deploy. Do not push main or deploy as part of development checkpoints. Collect browser/runtime evidence against local Worker + D1, including cross-channel state, errors, responsive interaction and persistence, then publish the UAT report before the release sequence.

## Store checkpoint
- Scoped applications, checklist, documents and reminders by account+season. Combined store mutation/audit into D1 batches.
- Captured chat/OCR origin; scoped conversation history and pending extraction reads. Added selected profile/season data to state and all-season unseen-reminder fallback.
- Added same-company multi-season isolation, frozen request and audit-failure rollback tests. Suite passed 123/123 before chat/OCR scope additions; final suite result is recorded in the next checkpoint.
- Remaining: shared action origin for legacy cards, stale web selection guard, atomic OCR confirmation, pending action/milestone workflow, UI integration and full Local UAT. Current changes are implementation progress, not UAT completion.
- Final store/chat/OCR checkpoint verification: full backend suite 123/123 passing, 14 test files. Local UAT remains pending implementation completion.

## Local UAT checkpoint — 2026-11-13
- Implemented Guided in the actual app, backed by API/D1; profile/season/milestones and editable confirmation workflow. Added a direct profile/season menu, education reuse, readable Dashboard buttons and responsive layout.
- Implemented shared profile/season proposals for the assistant and channel-neutral cards/actions; frozen image download context; atomic OCR confirmation and reminder/milestone transactions.
- Automated Local UAT uses real Worker handlers and isolated D1, with external providers simulated at the outbound boundary. Full browser flow, backend suite, Wrangler migration preservation/rerun, and legacy-card target checks pass.
- Final independent review found six important issues; fixed with tests: late initial reminder confirmation invalidates old date edit; snooze increments version; first-known-date can add reminders; canceled selection restores displayed season; dirty drafts require explicit discard; LINE image origin captured before media download.
- Ruling: serve the bundled Worker source inline to Miniflare because the installed compatibility adapter failed to load the temporary script path. Same bundled application code and D1; test harness is not deployed.
- Ruling: local execution remains in the existing checkout on a feature branch to retain the accepted uncommitted design artifacts. No main push, PR, merge, or deployment.
- Full source/evidence report: docs/uat/2026-11-13-student-profile-local-uat.md. Human Local UAT feedback is still required before the release sequence.
