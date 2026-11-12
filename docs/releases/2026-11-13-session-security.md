# XSS and cookie-session release

Scope approved by the owner: close stored-XSS rendering and browser-readable session persistence; PR → CI → merge → deploy → verify. This file is the operational plan reviewed in the PR, not a claim that production checks have already passed. Final release SHA, CI/deployment URLs, Worker version and feature results belong in the PR release evidence and task report.

## Patch boundary

- Encode persisted application, document/task and OCR-label text at HTML sinks, including quotes used by profile/season input attributes and drawer error/action text. Original stored strings are preserved. Card dispatch, truth labels and the intentional floating drawer remain.
- Host the same web app and API together on the existing Worker. Publish only four app assets plus a revision manifest; Pages serves a credential-cleanup launcher with a constant destination. It forwards fragments and drops query parameters.
- Cookie-only sessions use `__Host-im_session` with HttpOnly, Secure, SameSite=Lax and Path=/, no Domain. OTP JSON has no token. Browser Bearer and old cookies are rejected. D1 stores a namespaced SHA-256 digest; raw legacy values cannot be repackaged. Session TTL stays 30 days.
- Reject web mutations with foreign, missing or null Origin before side effects. Keep LINE signature authentication separate. Do not change keys, allowlist membership, LINE IDs or faculty rules.

## Local evidence and legitimate behavior

Before the fix, four actual-renderer regressions failed (board markup, document/task text, input quote breakout, unknown OCR key). Three Worker regressions also failed (JSON secret, reusable old session, cross-origin mutation). After implementation the same cases pass. Run backend Vitest, tooling tests, syntax, guardrails, index and artifact build from the release workflow, then browser checks against isolated local D1/providers. The preserved controls include normal Thai/quotes/ampersands, board movement, OCR confirmation/truth, profile edits, LINE linkage and season isolation.

## Deployment and data operation

1. Merge only after current-head `check` succeeds and review findings are resolved. Use a clean checkout of that exact merged SHA, with the intended account `a2f6173292cd3cb3ab66716cba480325`, Worker `internmatch-api` and existing D1 binding `internmatch`.
2. After merged `check` passes, use project-local Wrangler to deploy the Worker with `--message "PR #<number> <merged-sha>"`. The custom build generates the public app/launcher for that SHA. The Pages job waits for app-only verification before publishing its launcher; it cannot direct users to an unready Worker.
3. Run `scripts/release/security-production.mjs expire-legacy <merged-sha>` with `INTERNMATCH_RELEASE_DIR` set to a protected temporary directory. It only expires `sessions` rows whose stored key lacks the `v2:` namespace. This is intentional web-session revocation, not a business-data migration. No session values are printed. It prevents accidentally reviving old raw sessions during recovery. Already-invalid old rows can remain for later housekeeping.
4. Verify active Worker version/message and both manifests/content hashes with `scripts/verify-production.mjs <merged-sha>`. Wait for the Pages job for this merged SHA to succeed.
5. Run the reviewed synthetic production smoke below. Also test genuine email OTP login/reload/logout/relogin using only the owner-designated account; OTP transmission was explicitly authorized in chat. Inspect only the necessary success/LINE-linked booleans, never publish email, OTP, cookie, token or personal records.

## Synthetic production verification

`scripts/release/security-production.mjs smoke <merged-sha>` requires a clean merged checkout, protected `INTERNMATCH_RELEASE_DIR`, and `INTERNMATCH_PLAYWRIGHT_MODULE` pointing to an installed Playwright module. It:

- Creates one reserved random `security-smoke-*` identity and short-lived OTPs directly in D1, without changing the real allowlist or sending emails/messages. It also creates one active old-format session belonging only to that fixture, to test all replay representations.
- Uses the real OTP verify route and session cookie in Chromium and mobile WebKit. Persists harmless execution-marker strings through the actual manual form and a fixture extraction marked as LINE-origin. Confirms that extraction through the real web confirmation flow. No OCR/LLM/LINE provider call is made.
- Checks literal board/OCR rendering and profile attribute values, reload safety, missing injected nodes/attributes/execution, no token in JSON/storage/document.cookie/browser Authorization, hashed session persistence, rejection of foreign mutation, logout and relogin.
- Deletes every fixture-owned row and its OTP in `finally`, verifies zero remaining fixture rows and compares the existing users' LINE-link digest before/after. Only summary checks are printed. Private SQL files may contain fixture credentials and must stay private; they are not published evidence.

The existing profile production smoke is adapted to cookie login using the same private-OTP fixture approach. Real OCR/LLM/LINE messaging behavior is unchanged; simulated provider tests cover the affected shared paths. Mobile WebKit is a browser-engine check, not a claim of a physical iPhone test.

## Recovery

Keep session revocation and same-origin/Origin enforcement in any forward repair. Do not simply restore the old vulnerable Worker or Pages app: that would restore browser-readable token behavior. Expired legacy rows cannot regain validity from a code rollback, and new hash rows do not match the old raw-token reader. If a deployment fails, keep the old launcher unpublished until the repaired app verifies; use a small reviewed PR with passing CI. No business records, secrets or LINE links require restoration because this change does not migrate them.
