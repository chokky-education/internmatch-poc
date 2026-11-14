# Manual document-list release

## Reviewed operational plan

Target: the existing `internmatch-api` Worker/app, GitHub Pages launcher and D1 `internmatch` binding configured in `worker/wrangler.toml`. Follow `docs/release-workflow.md`; release only a clean checkout of the exact merged SHA after its required `check` passes.

- No schema migration, real-user data rewrite/deletion, secret update, allowlist change or LINE-link change.
- Deploy the merged Worker with its six app assets and merged-SHA manifest. Pages waits for the matching app release before publishing the launcher.
- Re-run `scripts/verify-production.mjs <merged-sha>` after deploy. It now includes both document UI assets.
- Run `scripts/release/document-production.mjs <merged-sha>` with `INTERNMATCH_RELEASE_DIR` pointing to a private directory and `INTERNMATCH_PLAYWRIGHT_MODULE` pointing to the existing installed Playwright module.

## Bounded production feature smoke

The script refuses an unmerged SHA or dirty checkout before any remote write. It creates exactly one randomly named `documents-smoke-…@example.invalid` identity and one hashed v2 session, expiring in an hour. It does not add the identity to the allowlist or add a login bypass to the app.

Chromium and mobile-size WebKit each create their own test seasons through the real authenticated API, then exercise the actual manual item form, optional unknown values, source/page display, preparation versus submission, edit/reload, retry idempotency, stale revision rejection, inert stored text and original-season card actions. A due date must create no reminder. This is synthetic-session feature verification; it does not claim real OTP login, real LINE delivery, Paxa extraction or Gemini language quality.

All writes are restricted to that reserved identity. A `finally` block removes its sessions, seasons and records from every business table, verifies fixture cleanup, and compares the fingerprint of existing account IDs/LINE links before and after. SQL, screenshots and the result JSON stay in the private release directory. No credentials or personal values are printed. The flow sends no email, LINE or AI requests.

Cleanup verification uses a single sum of scalar counts across all 12 owning tables. The first production browser pass exposed D1's lower compound-SELECT limit in the original UNION query; all fixture rows had already been deleted, and the replacement read independently confirmed zero rows. The sum avoids that platform limit and fails closed if the expected result is missing. A local SQLite regression checks 12 fixture rows, zero after cleanup, retained unrelated rows and rejection of non-fixture identifiers. Keep the pre-smoke account/link fingerprint in the private evidence directory so an interrupted verifier can be inspected without printing account data.

## Recovery

Before deploying, record the active Worker version and the current app/Pages revision. If a check fails, follow the correction/rollback PR path in the release workflow. Code can be reverted without a reverse migration. Keep the new `kind='checklist_item'` records: an older UI does not manage their progress, so prefer a corrective release. Never delete records or restore an entire database merely to undo this UI release.
