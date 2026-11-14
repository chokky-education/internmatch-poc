import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';

const call = (url, bindings = {}, init = {}) => worker.fetch(new Request(url, init), { ...env, LOCAL_DEV_LOGIN: 'false', ...bindings }, {});
beforeEach(async () => {
  await env.DB.exec('DELETE FROM tasks; DELETE FROM users; DELETE FROM sessions; DELETE FROM documents; DELETE FROM messages; DELETE FROM audit_log;');
});

describe('local development login', () => {
  it('opens the app without OTP and keeps checklist changes across requests', async () => {
    const bindings = { LOCAL_DEV_LOGIN: 'true', WEB_ORIGIN: 'http://localhost:8787' };
    const first = await call('http://localhost:8787/api/state', bindings);
    expect(first.status).toBe(200);
    const state = await first.json();
    expect(state.user.email).toBe('local-dev@example.test');
    expect(state.university_checklist).toHaveLength(0);
    expect(state.checklist_items).toHaveLength(0);
    const update = await call('http://localhost:8787/api/actions', bindings, {
      method: 'POST', headers: { Origin: 'http://localhost:8787', 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'doc_save', item: { title: 'รายการที่เพิ่มเอง' }, request_id: crypto.randomUUID(), season_id: state.selected_season.id, selection_version: state.selection_version }),
    });
    expect(update.status).toBe(200);
    const again = await (await call('http://127.0.0.1:8787/api/state', bindings)).json();
    expect(again.university_checklist).toHaveLength(0);
    expect(again.checklist_items).toEqual([expect.objectContaining({ title: 'รายการที่เพิ่มเอง', status: 'todo', due_date: null })]);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n).toBe(1);
  });

  it('requires normal authentication unless explicitly enabled', async () => {
    expect((await call('http://localhost:8787/api/state')).status).toBe(401);
  });

  it('never bypasses authentication on a public host even with the flag enabled', async () => {
    expect((await call('https://internmatch-api.entrace-space.workers.dev/api/state', { LOCAL_DEV_LOGIN: 'true' })).status).toBe(401);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n).toBe(0);
  });
});
