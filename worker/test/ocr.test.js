import { env } from 'cloudflare:test';
import { seedDemo } from './fixtures.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { extractDocument, confirmExtraction, discardExtraction, formatExtraction } from '../src/ocr.js';

const U = 'user-o';
let paxaResp, paxaBodies, realFetch;
const bytes = () => new TextEncoder().encode('fake-image').buffer;
const jobFields = { company: 'ไทยดาต้า', role: 'Data Analyst Intern', deadline: '2026-11-30', apply_url: 'https://jobs.example/1' };

beforeEach(async () => {
  await env.DB.exec('DELETE FROM users; DELETE FROM applications; DELETE FROM tasks; DELETE FROM documents; DELETE FROM extractions; DELETE FROM audit_log;');
  env.PAXA_API_KEY = 'p-key';
  await env.DB.prepare('INSERT INTO users (id,email,created_at) VALUES (?,?,?)').bind(U, 'ton@example.com', new Date().toISOString()).run();
  await seedDemo(env, U);
  paxaResp = { status: 200, body: { status: 'complete', fields: jobFields, unverified: [] } };
  paxaBodies = []; realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
    if (String(u).includes('api.paxalabs.com')) { paxaBodies.push(JSON.parse(init.body)); return new Response(JSON.stringify(paxaResp.body), { status: paxaResp.status }); }
    return realFetch(u, init);
  });
});
afterEach(() => vi.restoreAllMocks());

const count = async t => (await env.DB.prepare(`SELECT COUNT(*) c FROM ${t} WHERE user_id=?`).bind(U).first()).c;

describe('extractDocument', () => {
  it('stores a pending extraction and does not touch the board', async () => {
    const before = await count('applications');
    const r = await extractDocument(env, U, 'line', { bytes: bytes(), mime: 'image/jpeg' });
    expect(r.ok).toBe(true);
    expect(r.extraction.doc_type).toBe('job_post');
    expect(r.extraction.fields.company).toBe('ไทยดาต้า');
    expect(paxaBodies[0].model).toBe(env.PAXA_MODEL);
    expect(await count('applications')).toBe(before);
    expect((await env.DB.prepare('SELECT status FROM extractions WHERE id=?').bind(r.extraction.id).first()).status).toBe('pending');
  });
  it('Paxa error returns ok:false and saves no extraction', async () => {
    paxaResp = { status: 500, body: { title: 'boom' } };
    const r = await extractDocument(env, U, 'web', { bytes: bytes(), mime: 'image/png' });
    expect(r.ok).toBe(false);
    expect(await count('extractions')).toBe(0);
  });
  it('rejects files over 10MB without calling Paxa', async () => {
    const r = await extractDocument(env, U, 'web', { bytes: new ArrayBuffer(10 * 1024 * 1024 + 1), mime: 'image/png' });
    expect(r).toEqual({ ok: false, error: 'too_large' });
    expect(paxaBodies.length).toBe(0);
  });
});

describe('confirmExtraction', () => {
  it('job post confirm creates an AI_EXTRACTED application in Saved', async () => {
    const { extraction } = await extractDocument(env, U, 'line', { bytes: bytes(), mime: 'image/jpeg' });
    const r = await confirmExtraction(env, U, extraction.id, 'line');
    expect(r).toEqual({ ok: true, created: 'application' });
    const a = await env.DB.prepare('SELECT * FROM applications WHERE user_id=? AND company=?').bind(U, 'ไทยดาต้า').first();
    expect(a.truth_level).toBe('AI_EXTRACTED');
    expect(a.status).toBe('Saved');
  });
  it('confirming twice returns already_confirmed and creates only one application', async () => {
    const { extraction } = await extractDocument(env, U, 'line', { bytes: bytes(), mime: 'image/jpeg' });
    await confirmExtraction(env, U, extraction.id, 'line');
    expect(await confirmExtraction(env, U, extraction.id, 'web')).toEqual({ ok: false, error: 'already_confirmed' });
    expect((await env.DB.prepare('SELECT COUNT(*) c FROM applications WHERE user_id=? AND company=?').bind(U, 'ไทยดาต้า').first()).c).toBe(1);
  });
  it('non-job types are saved to the document locker as AI_EXTRACTED', async () => {
    paxaResp = { status: 200, body: { status: 'complete', fields: { student_name: 'มีน', gpax: 3.4 } } };
    const { extraction } = await extractDocument(env, U, 'web', { bytes: bytes(), mime: 'image/png', docType: 'transcript' });
    expect(await confirmExtraction(env, U, extraction.id, 'web')).toEqual({ ok: true, created: 'document' });
    const d = await env.DB.prepare("SELECT * FROM documents WHERE user_id=? AND kind='transcript'").bind(U).first();
    expect(d.truth_level).toBe('AI_EXTRACTED');
  });
  it("another user's extraction cannot be confirmed", async () => {
    const { extraction } = await extractDocument(env, U, 'line', { bytes: bytes(), mime: 'image/jpeg' });
    expect(await confirmExtraction(env, 'someone-else', extraction.id, 'line')).toEqual({ ok: false, error: 'not_found' });
  });
  it('a discarded extraction cannot be confirmed', async () => {
    const { extraction } = await extractDocument(env, U, 'line', { bytes: bytes(), mime: 'image/jpeg' });
    await discardExtraction(env, U, extraction.id);
    expect((await confirmExtraction(env, U, extraction.id, 'line')).ok).toBe(false);
  });
});

describe('formatExtraction', () => {
  it('shows the AI warning and the key fields', () => {
    const s = formatExtraction({ doc_type: 'job_post', fields: jobFields });
    expect(s).toContain('🤖 อ่านโดย AI');
    expect(s).toContain('ไทยดาต้า');
    expect(s).toContain('Data Analyst Intern');
  });
});
