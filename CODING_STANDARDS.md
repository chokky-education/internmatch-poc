# Coding Standards (for review)

Read this when **reviewing** a diff, not while implementing. Anything a machine can check lives in `scripts/check-docs.mjs` or the tests instead; this file holds only the judgement calls. Flag each violation with the file, the line and the rule number.

1. **Respects the ADRs.** The diff does not quietly reverse a decision in `docs/adr/`: no admin/advisor/approval role (0002), no logic that only works in LINE or only on the web (0001), nothing that turns the home page into a listing feed (0003). Reversing one on purpose needs a new ADR in the same PR.
2. **Logic lives in the Worker.** New behaviour goes in `worker/src/`, called by both `line.js` and `web-api.js`. `index.html` only renders and calls the API. Card buttons go through `runCardAction`, never a channel-specific handler.
3. **Every datum shows its truth level.** New data written or shown carries `SYSTEM_VERIFIED`, `USER_REPORTED` or `AI_EXTRACTED`. `AI_EXTRACTED` data is saved only after the user confirms. User edits write the audit log with `channel`.
4. **Honest about stubs.** Sample or unsaved UI says so on screen (as the `discover` and `onboard` notes do) and is listed under Known gaps in `docs/STATUS.md`.
5. **Tests follow behaviour.** A change to a `worker/src/` module comes with a change to its `worker/test/*.test.js`, unless the diff is a pure refactor.
6. **Thai copy for users, plain and short.** User-facing text is Thai, tells the user what to do next, and matches the wording already on screen for the same thing.
7. **Handoff is true.** `docs/STATUS.md` describes what the diff actually did and left undone, not what was planned.
