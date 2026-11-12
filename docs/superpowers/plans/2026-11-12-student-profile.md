# Student profile and internship seasons

Approved: 2026-11-12. Source: ../specs/2026-11-12-student-profile-design.md and accepted Guided prototype.

## Execution checklist
- [ ] Database migration: preserve legacy IDs, dates, status/history; account selection, profile versions, seasons, milestones, pending confirmations.
- [ ] Shared services: account ownership, frozen season context, atomic mutation/audit, optimistic versions.
- [ ] Scope applications, tasks, documents, messages, OCR, reminders and audit by season.
- [ ] Milestones: nullable date/range/source; editable reminder proposals; atomic rescheduling; sent history preserved; Cron races covered.
- [ ] Web and LINE: shared services/cards/actions; contextual assistant and confirmed profile/season changes; pending cards retain target and expire after 24h.
- [ ] Promote revised Guided UI: optional profile, education reuse, season overview/quick milestone add, readable Dashboard buttons.
- [ ] Full backend tests, syntax, index, responsive browser interactions and error/persistence checks.
- [ ] Review, scoped commits, backup/migration dry run, maintenance gate, deploy Worker/D1 and Pages independently, verify live.

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
