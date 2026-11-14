# Manual document-list verification

Date: 14 November 2026. Tester: Codex. Agent model: GPT-6 (session system label). System under test: the shared Cloudflare Worker/D1 services and the real document-page UI. Paxa/Gemini responses in backend tests are simulations; no real provider quality or LINE delivery is claimed.

Owner-selected scope: manual items through the API/web first. Handbook-to-checklist integration is deferred.

## Local results

- Worker Vitest: 20 files, 148 tests passed. New behavior checks cover optional unknown fields, source/page references, separate prepared/submitted states, channel audit history, replay idempotency, concurrent/stale writes, original-season actions, retained legacy data, empty new seasons and manual assistant-tool routing. Existing auth/OCR/application/reminder regressions pass.
- Release tooling/rendering tests: 19 passed, including public-only asset bundling, revision/hash checks, authentication/CORS baselines and inert stored markup.
- Inline/external application script syntax, guardrails and whitespace checks passed. The index was refreshed and the explicit public app/Pages bundles built.
- Real Chromium desktop and WebKit using an iPhone 13 viewport passed the 12 checks in `scripts/uat/document-flow.mjs`: empty state, required title, unknown fields, source/page display, prepared/submitted distinction, edit/reload, stale rejection, retry idempotency, inert markup, viewport layout, original-season actions and no implicit reminder. Local D1 was ephemeral and provider traffic stayed simulated. This is not physical-iPhone verification.

Screenshots remain in ignored `output/playwright/documents/`. They deliberately include long Thai notes and inert HTML text as stress inputs, with a test account and test dates.

## Release boundary

PR/required CI/merge/deploy and production verification are pending at the time this report is committed. Use `docs/document-release.md` and the guarded production smoke after merge; retain its result JSON and release identifiers in the task/PR report. Do not treat these local results as production evidence.
