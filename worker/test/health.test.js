import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('health', () => {
  it('GET /api/health returns ok', async () => {
    const r = await SELF.fetch('https://x.test/api/health');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
  it('CORS allows the web origin with credentials', async () => {
    const origin = 'https://chokky-education.github.io';
    const r = await SELF.fetch('https://x.test/api/health', { method: 'OPTIONS', headers: { Origin: origin } });
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(r.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(r.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
  });
});
