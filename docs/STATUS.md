# Status & Handoff

The one file that says where the work stands. **Read it first; update it last.** Every agent that finishes a chunk of work rewrites the "Now" and "Next" sections and adds one line to the log at the bottom, in the same commit as the work.

_Last updated: 2026-11-12_

## Now (what is true today)

- **Shipped on `main`:** LINE-primary / web-fallback backend in `worker/` (auth by email + OTP, Gemini assistant, Paxa OCR with confirm step, cards + `runCardAction`, cron reminders with web-banner fallback). Web app reworked into a 2-column dashboard home and a 5-item menu (commit `71d1cdb`).
- **Live:** web on GitHub Pages (auto-deploys from `main`); Worker `internmatch-api` on Cloudflare (deployed by hand with `wrangler deploy`, not by CI).
- **Prototype limits:** only emails in the `ALLOWED_EMAILS` secret can log in.

## In flight

- PR #2 `feat: typing animation and quoted replies (LINE OA + web)` on branch `claude/ux-ui-loading-animation-68c749`: open, not merged. Check it before touching chat rendering in `index.html` or `line.js`.

## Known gaps (stubs that look real)

- 📁 เอกสาร: faculty checklist is a generic 6-item seed (`worker/src/seed.js`), not tied to a real faculty.
- 🔎 ค้นหาฝึกงาน and ⭐ ที่บันทึกไว้: job listings are sample data in `index.html`; "ฉันสมัครแล้ว" does write to the real board.
- ⚙️ `onboard` (university / faculty / programme): preview page, choices are not saved.
- No `GLOSSARY.md` or `docs/adr/` yet. `/domain-modeling` creates them when a term or decision gets settled.

## Next (suggested, not yet agreed with the owner)

1. Decide PR #2: review, merge, or close.
2. Persist onboarding choices (university / faculty / programme) to D1 and use them to pick a faculty checklist.
3. Replace sample job listings with a real source, keeping "รายงานข้อมูลผิด" and source links.

## Gotchas

- `.local-index/` and `worker/node_modules/` are git-ignored, so a fresh worktree needs `cd worker && npm install` before `npx vitest run`. The index rebuilds itself on first search.
- Secrets live only in Cloudflare (`wrangler secret put`) and `worker/.dev.vars` (git-ignored). Never in `index.html`, `config.js` or `wrangler.toml`.
- `go('<screen id>')` still works for every old screen id: it opens the grouped page and scrolls (see `GROUPS` in `index.html`).

## Log

- 2026-11-12: Index made hand-maintained (script no longer overwrites `INDEX.md`), now covers `worker/`, `.sql`, `.toml`, `.csv`. Added this file.
