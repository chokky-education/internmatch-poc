# Local UAT

Run from repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
node scripts/uat/server.mjs
```

Open http://localhost:8000/scripts/uat/open.html and choose a test account. The UAT Worker runs at localhost:8787 with **ephemeral isolated D1**, never the production database. Restarting the server resets fixtures. localhost:8788 is a loopback-only test control server; it is not part of the deployed Worker. No production secrets are loaded. All external service requests are intercepted; unknown destinations fail closed.

Browser regression:

```sh
mkdir -p output/uat
/Users/chalisa/.codex/skills/playwright/scripts/playwright_cli.sh --session internmatch-uat open http://localhost:8000/ --headed
/Users/chalisa/.codex/skills/playwright/scripts/playwright_cli.sh --session internmatch-uat run-code "$(cat scripts/uat/browser.js)"
node scripts/uat/migration-check.mjs
```

Run the browser regression against a freshly restarted UAT server. It uses the real app, request handlers, shared services/cards/actions and D1; provider responses are deterministic simulations. The test-only entry includes seed and Cron triggers and is never referenced by production wrangler.toml. Legacy fixture B is inserted before migration 0003. The migration check separately uses Wrangler's migration manager and checks rerun guards.

The simulated Gemini provider supports `profile:NAME`, `season:EXACT NAME`, `newseason:NAME`, `milestone:TITLE`, and otherwise reads the selected season overview. This validates transport and tool plumbing, not natural-language model quality or real LINE delivery.
