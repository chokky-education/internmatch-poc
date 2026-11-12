# Release workflow

Owner decision (2026-11-12): agents own authorized work through **PR → CI → merge → deploy → production verification**. Routine merge/deploy needs no second approval. A request for review-only or a draft still stops at that requested boundary. Do not merge unrelated open PRs.

## 1. Prepare and validate

- Fetch `origin/main`, inspect the current branch/uncommitted work, and create an isolated branch or reuse the PR branch being continued. Never include someone else's pending files.
- Update `docs/STATUS.md` with the actual change and `INDEX.md` for new/moved modules. Review against `CODING_STANDARDS.md`.
- From the repository root, run:

```bash
npm ci --prefix worker
(cd worker && npx vitest run)
node --test scripts/test/*.test.mjs
node -e "const h=require('fs').readFileSync('index.html','utf8');[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(m=>new Function(m[1]));console.log('OK')"
node scripts/check-docs.mjs --base origin/main
node scripts/index.mjs refresh
node scripts/build-pages.mjs
```

CI repeats these checks, including the local tooling regression tests. Secret scanning covers tracked/new text files; it is a guard against known credential patterns, not proof that every possible secret format is detectable.

## 2. PR, review and merge

1. Commit only this task's files; push the task branch. Create/update a PR with the problem, final behavior, validation, operational steps and verification limits. Use `--body-file` for a multiline body.
2. Review the final diff; fix substantive findings. Run `gh pr checks <number> --watch --fail-fast` and verify `check` passed for the latest head. An older run is not evidence for new commits.
3. Required policy is stored in `.github/main-protection.json`: PRs, up-to-date required `check` from GitHub Actions (app 15368), resolved conversations, no force push/deletion, including administrators. Zero mandatory human approvals lets an authorized agent merge after review and CI; it does not waive review.
4. Merge with `gh pr merge <number> --merge --match-head-commit <reviewed-head-sha>`. Never use `--admin`, disable protection or push to `main` to finish a task. If the base changes, bring it into the branch and repeat checks.
5. Fetch the merged SHA from the PR and use a clean checkout of that exact commit for release commands. Unmerged local code must not reach production.

The agent checks settings using `gh api repos/chokky-education/internmatch-poc/branches/main/protection`. Authorized policy repairs use the reviewed JSON with `gh api --method PUT repos/chokky-education/internmatch-poc/branches/main/protection --input .github/main-protection.json`; verify the returned settings. Do not weaken protection to work around a failure.

## 3. Deploy the merged change

| Change | Agent responsibility after merge |
| --- | --- |
| Any repository change | Follow the `CI` run for the **merged SHA**. `check` gates `deploy-pages`. Pages publishing source is GitHub Actions, not legacy branch publishing. Only `index.html`, `config.js`, and generated `release.json` ship. |
| `worker/src/`, `worker/package*.json`, `worker/wrangler.toml` | After merged CI passes, run project-local `npx wrangler deploy --message "PR #<number> <merged-sha>"` from `worker/`. Check account, Worker and D1 binding first; preserve deployed secrets. Verify the active deployment version and its message identify the merged SHA. |
| `worker/migrations/` | Review the migration and recovery plan in the PR. Apply only the authorized changes with project-local Wrangler against the intended remote DB, then deploy the Worker. Data loss/new billing/scope expansion needs an explicit user decision. |
| Secret, allowlist or production data change | Put a **non-secret** operational plan in the PR: target, intended change, expected invariants, verification and rollback. Merge it first; apply through the appropriate secret/data tool using protected input. `wrangler secret put` deploys immediately. Preserve all intended members when replacing an allowlist. Verify affected and unaffected access without printing secrets. |
| Docs-only | Pages deployment and baseline production checks still run. Do not redeploy an unchanged Worker. |

Cloudflare deployment currently uses the agent's existing local Wrangler login. GitHub Actions has no Cloudflare deployment credential, so Worker deployment is **agent-owned**, not an unattended CI job. A successful Pages job does not prove Worker changes were deployed. Do not copy the local OAuth token into GitHub secrets or ask the user to repeat routine deployment commands.

## 4. Production verification and evidence

- Pages deploy waits for `check`, then runs `node scripts/verify-production.mjs <merged-sha>`. It retries up to six times for CDN propagation and fails the job if checks still fail. Inspect the exact run with `gh run view <run-id>`; `gh run list --commit <merged-sha>` locates it.
- The verifier checks the live manifest SHA, HTML/config hashes, login shell, API URL/health, CORS/Bearer preflight, authentication barriers, a nonexistent OTP against D1, and rejection of an invalid LINE signature. It sends no OTP email or LINE message and does not create a session or change real user records.
- After a Worker or operational change, rerun the verifier **after that change**, even if the earlier Pages job passed. Confirm the active Cloudflare deployment version for a Worker release.
- Also exercise the **changed user flow** in production: for auth, fresh login/logout/relogin on affected browser types and persistence of LINE linking; for cards/OCR, confirm the same action through the affected channels; for reminders, check delivery/fallback. Use an authorized test account and minimal reversible data. Only send user-facing test messages when authorized for that task.
- If production flow verification needs an OTP, a device, missing credentials or unavailable external service, complete all independent checks, request the smallest missing input, and report the remaining gap. Do not invent a passed check or claim “fully verified” from health-only tests.
- Keep the PR/run URL, merged SHA, Pages manifest SHA, Worker version (when applicable), commands/results, feature evidence and unresolved limits in the task/PR report. `docs/STATUS.md` describes the state committed in the PR; later changes to that file also go through a PR.

## Failures and rollback

A red CI, deploy or production check is unfinished work. Inspect logs, fix on the task branch and follow the same PR path; never bypass the gate. Before a production change, identify the last working Pages SHA/Worker version and a recovery plan. Rolling back code does not roll back D1 data or restore a previous secret value. An urgent recovery still needs a small non-secret PR and passing CI; report any credential or external-service blocker clearly.
