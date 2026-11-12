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
