# Manual document-list release evidence

The owner selected student-provided information and manual API/web work first. Handbook-to-checklist OCR integration remains deferred.

## Released revisions

| Release | Merged SHA | Main CI/Pages | Verified Worker version |
| --- | --- | --- | --- |
| [PR #15](https://github.com/chokky-education/internmatch-poc/pull/15): document list | `eab938c6db64182e657c03db3f1f9dd6a520b88a` | [43590538044](https://github.com/chokky-education/internmatch-poc/actions/runs/43590538044) — success | `c4c88d98-ba37-48dd-9a2e-a9b19c65d5f8` |
| [PR #16](https://github.com/chokky-education/internmatch-poc/pull/16): cleanup verifier | `32c1173d368ee6f68103230c62c72de6ca44dd21` | [43591558827](https://github.com/chokky-education/internmatch-poc/actions/runs/43591558827) — success | `0ecd6a50-bb69-454f-aa51-ebb2ae266230` at 100% |

The verified deployment message identified PR #16 and its full merged SHA. This documentation closeout retains the app/runtime bytes verified below; its own manifest release follows the normal workflow and is recorded in the PR/task release report.

## What was verified

- Local/CI: 151 Worker tests, 21 tooling/rendering tests, syntax, guardrails, index and public bundling passed. See `docs/uat/2026-11-14-documents.md` for the original local feature scope.
- Production baseline after the verifier release: 29 checks passed. Both Worker app and Pages manifests matched `32c1173`; all six app assets and both launcher assets matched their artifacts. The checks also exercised cookie/auth/CORS barriers and invalid LINE signatures.
- Authenticated production flow: 15 checks each in Chromium desktop and WebKit with an iPhone 13 viewport passed. They covered empty new seasons, required title, unknown recipient/method/date, source/page references, separate prepared/submitted states, edit/reload, stale rejection, idempotent retry, inert stored markup, viewport layout, original-season actions, no implicit reminders, retained edited retry drafts, one record after a lost response and honest failed-refresh feedback.
- The guarded smoke used one reserved synthetic-session identity. Its records were removed from all 12 owning tables, and the aggregate remaining count was zero. Existing account/LINE-link fingerprints matched before/after. The final result records `fixture_cleanup=true`, `existing_links_unchanged=true` and `external_messages_sent=false`. SQL, result JSON and screenshots remain in private release evidence; credentials were not published.
- The first browser pass also passed both flows, but its final UNION count exceeded D1's compound-SELECT limit. Deletion had completed, and an independent scalar-count read confirmed zero rows across all 12 tables. PR #16 fixed the verifier and the complete smoke was then rerun successfully.

No schema migration, secret/allowlist update, real-user data rewrite or real LINE-link change occurred. No OTP email, LINE message or AI request was sent by the production smoke. The changed-flow check uses synthetic sessions and browser emulation; it does not claim physical-iPhone testing, real OTP login, LINE delivery or Paxa/Gemini quality.

## Review and resulting behavior

Standards review cleared the final runtime revision. Spec review findings were corrected and rechecked by the primary agent with regressions, including the exact partial-chat retry/tool-reordering case. Cards name their original season, create requests require stable IDs, changed retry drafts are preserved and document-chat receipts replay before the model can reorder committed operations.

Students now add their own preparation items with optional recipient, submission method, date, source/page and notes. Counts describe only those items. Historical generic checkbox data is retained separately and is not treated as the student's faculty requirements. Read/extracted documents remain separate from this manual list.
