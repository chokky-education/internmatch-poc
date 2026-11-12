# Complete release workflow implementation plan

> For agentic workers: execute the already-authorized work through review, CI, merge, deploy and production verification; the owner explicitly delegated routine completion in this task.

**Goal:** Finish PR #4 and align instructions with enforced PR → CI → merge → deploy → production verification.
**Architecture:** One instruction source (`AGENTS.md`) points to a detailed release runbook. GitHub branch protection enforces the PR/current-CI boundary; the main CI run gates Pages deploy and checks the exact live artifact. Existing local Wrangler credentials remain the agent-owned Worker deployment path.
**Tech stack:** Node 24, GitHub Actions/Pages, project-local Wrangler, existing Vitest backend suite.
**Spec:** Owner request in this task and `docs/release-workflow.md`.

## Global constraints

- Keep unrelated working-tree files and open PRs out of the release.
- No application secrets, private allowlists or local OAuth credentials enter Git or CI output.
- No changes to Worker runtime behavior, application scope or existing production user data.
- Routine merge/deploy for authorized work is delegated to the agent; credentials/OTP/new destructive scope are concrete blockers, not automatic approval pauses.

## Review focus

- Existing index caches must migrate unchanged specs to the right kind.
- New/nested browser/backend/config files must not escape credential checks.
- A green health endpoint must not hide a broken auth route or stale deployed web assets.
- Pages must deploy the merged SHA after CI and ship only public files.
- Repository settings, not documentation alone, must require PRs/current checks for admins too.

## Tasks and completion criteria

- [x] Review pinned PR #4 with independent standards/spec reviewers; compare findings with actual GitHub settings and existing production state.
- [x] Reproduce index/guard failures with `scripts/test/guardrails.test.mjs`; fix cache version, recursive text enumeration and pre-commit diff checking. All five tests pass.
- [x] Add `scripts/build-pages.mjs`, `scripts/verify-production.mjs` and five local HTTP/artifact tests. Stale SHA/assets and broken OTP routes fail verification.
- [x] Align AGENTS, kickoff, setup, INDEX and STATUS; version the main protection policy and gate Pages deploy on CI.
- [ ] Run full local checks, review the resulting diff and push updates to PR #4. Wait for current CI success; merge only that head.
- [ ] Apply and read back repository protection/Pages settings, follow merged CI through deployment, run live smoke and browser checks, and record evidence in the PR/task report.
