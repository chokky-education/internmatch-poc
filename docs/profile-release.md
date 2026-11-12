# Profile/seasons production release

Owner approved Local UAT and authorized PR → CI → merge → deploy on 2026-11-13. Includes migration 0003, profile assets, shared web/LINE services. Do not merge unrelated PRs.

## Target and invariants

Cloudflare account and Worker/D1 match `worker/wrangler.toml`: Worker `internmatch-api`, DB `internmatch`. Preserve all real users, sessions, LINE links, keys/allowlist, entity IDs, statuses, history and dates. No real OTP or LINE test messages. GitHub Pages publishes only index/config/profile JS/CSS and release manifest; UAT/control endpoints never ship.

## Procedure after merged main check passes

1. Use the clean merged checkout and record prior Pages SHA and active Worker version. Deploy `worker/src/maintenance.js` using the same Wrangler config/bindings/secrets. Verify API and LINE return 503/Retry-After; scheduled handler is a no-op. Wait for in-flight work to drain and compare aggregate row counts twice before backup.
2. Export D1 remotely to a private mode-600 file under git-ignored `.superpowers/profile-release/`; save its SHA256 and a Time Travel bookmark when available. Never print user records or commit the backup. Record aggregate counts and a digest of the original columns in each legacy table.
3. Apply only the pending reviewed migration 0003 using Wrangler's remote migration manager. Check preserved counts/digests, every legacy row points to its owner's legacy season, user selection is set, and no ambiguous/null legacy season references remain. Migration emits no notifications.
4. Deploy normal `worker/src/index.js` from merged checkout, with deployment message identifying PR and full merged SHA. Read active deployment back; Cron resumes only with normal code after migration checks. Re-run Pages production verifier once Worker is ready; retry failed live-verification job normally if maintenance overlapped it.
5. Exercise authenticated production API with one short-lived non-deliverable test identity (`release-smoke-<random>@example.invalid`) and a random expiring session created through protected D1 input. Never print its token. Use real web handlers/D1 to verify blank profile, education snapshots, selected-season isolation, milestone/reminder proposal and replay. Do not link LINE or invoke external AI/OCR; use future reminders that cannot fire during this check.
6. Remove only the test identity's records from every season-scoped table, sessions and user after verification, and verify no fixture rows remain. Real-user digests should match the preserved baseline except normal user traffic. Production LINE/provider behavior retains Local UAT coverage; actual message/OCR/model delivery requires a separately authorized real interaction and must not be claimed from simulation.
7. Confirm Pages merged SHA and all four asset hashes, authentication/CORS/signature barriers, merged CI/Pages job, Worker active version and D1 migration state. Report concrete evidence and limits to the user.

## Recovery

The maintenance entry can be deployed again from the reviewed merged checkout while diagnosing a failed migration/Worker. Keep writers/Cron stopped if schema checks fail. Do not roll back to an old unscoped writer after schema upgrade. D1 migration manager prevents accidental re-apply; fix forward with a reviewed compatible patch. Restoring a backup or Time Travel can discard post-backup writes, so it requires a specific recovery decision; never restore automatically. Preserve the private backup/bookmark and prior Worker version until verification is complete.

Reviewed helper: `node scripts/release/profile-production.mjs snapshot|verify|smoke <full-merged-sha>` enforces the merged checkout, stores protected SQL/diagnostics locally, prints only aggregate/non-secret evidence, and cleans up its isolated smoke identity. Run snapshot under maintenance, verify after migration before resuming, smoke after normal Worker deploy.

Wrangler adapter: SELECT/PRAGMA use `--command` to receive JSON rows; data writes use protected `--file` input and trust only a successful process exit. Do not parse file-import progress as result rows or print export logs (they may contain temporary download credentials).
