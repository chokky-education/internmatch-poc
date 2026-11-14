# Student-owned document checklist

Owner direction: start from information the student has. Scope: manual items through the shared API and the web, with desktop/mobile verification. Connecting handbook OCR to the checklist is deferred at the owner's request (14 November 2026).

## Behavior

- A new account/season starts with no invented faculty tasks, dates or form numbers.
- The document page shows the selected season, an honest empty state and a form to add a preparation item.
- Each item has a title, optional notes, recipient, submission method, due date and source reference/page. Missing values stay unknown. Sources can be a document name, URL or a note about information the student received.
- Progress states are `todo` (ยังไม่ได้เตรียม), `prepared` (เตรียมแล้ว), `submitted` (ส่งแล้ว). These are student-reported progress, not confirmation that a faculty received or approved anything.
- Item editing and progress updates are shared backend operations, audit-logged with channel and protected by ownership, season and revision checks. Card buttons run through `runCardAction`. Manual chat commands use the same services so the two front doors remain consistent.
- Repeated add requests do not create duplicate records. A stale edit/status request does not overwrite newer information. A card continues to refer to its original season after the selected season changes.
- Existing generic `tasks` and their checked states remain intact in a clearly labeled legacy section. They are excluded from the new preparation list and its counts.
- Existing OCR results remain readable as extracted information, separate from the checklist. The page explains that only extracted data is retained, not original files. There is no new upload-to-checklist action.
- Dashboard and LINE checklist summaries use the new list and describe counts as items the student added. They never claim all faculty requirements are completed.
- A due date on an item does not create a reminder. The existing explicit reminder flow remains available separately.

## Storage and scope

Use the existing season-scoped `documents` table with `kind='checklist_item'`; use `title`, `note`, `status`, `truth_level` and validated `fields_json` metadata. Other document kinds remain separate records. This introduces no infrastructure service, schema migration, data deletion, authentication change or advisor role.

A researched faculty database, handbook OCR integration, original-file storage, institutional submission/approval and automatic reminders are outside this release.

## Verification

The owner selected the shared API and real web UI as the test focus:

1. Authenticated API/shared card actions: add/edit/status, unknown fields, invalid dates, audit channel/provenance, stale revisions, repeated submission, cross-user/season isolation and retained legacy progress. Simulated manual chat commands check the shared-service adapter; no real LLM/LINE delivery is claimed.
2. Desktop/mobile browsers: empty state, manual form, progress, source display, reload persistence, errors/stale drafts, long Thai text and inert rendering of stored markup.
3. Production: merged-SHA app/Pages baseline and changed-flow smoke using one isolated reversible test identity. No real user records, allowlist, LINE links or secrets change; no OTP email/LINE/AI messages are sent. Record fixture cleanup and external-provider limits.

Release follows `docs/release-workflow.md`: PR → required CI → merge → Worker/app deploy → Pages launcher → production baseline and changed-flow verification.
