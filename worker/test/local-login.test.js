import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';

const call = (url, bindings = {}, init = {}) => worker.fetch(new Request(url, init), { ...env, LOCAL_DEV_LOGIN: 'false', ...bindings }, {});
beforeEach(async () => {
  await env.DB.exec('DELETE FROM tasks; DELETE FROM users; DELETE FROM sessions;');
});

describe('local development login', () => {
  it('opens the app without OTP and keeps checklist changes across requests', async () => {
    const bindings = { LOCAL_DEV_LOGIN: 'true' };
    const first = await call('http://localhost:8787/api/state', bindings);
    expect(first.status).toBe(200);
    const state = await first.json();
    expect(state.user.email).toBe('local-dev@example.test');
    expect(state.university_checklist).toHaveLength(6);
    const task = state.university_checklist[0];
    const update = await call(`http://localhost:8787/api/tasks/${task.id}`, bindings, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: true }),
    });
    expect(update.status).toBe(200);
    const again = await (await call('http://127.0.0.1:8787/api/state', bindings)).json();
    expect(again.university_checklist).toHaveLength(6);
    expect(again.university_checklist.find(t => t.id === task.id).done).toBe(true);
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
