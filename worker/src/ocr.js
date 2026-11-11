import { addApplication, addDocument } from './store.js';
import { DOCTYPES } from './doctypes.js';

const MAX_BYTES = 10 * 1024 * 1024;
const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const thDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }) : v;

export async function extractDocument(env, userId, channel, { bytes, mime, docType = 'job_post' }) {
  const type = DOCTYPES[docType];
  if (!type) return { ok: false, error: 'unknown_doc_type' };
  if (bytes.byteLength > MAX_BYTES) return { ok: false, error: 'too_large' };
  let d;
  try {
    const r = await fetch('https://api.paxalabs.com/v1/extract', {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.PAXA_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: b64(bytes), model: env.PAXA_MODEL, schema: { fields: type.fields }, include_pages: true }),
    });
    d = await r.json();
    if (!r.ok || d.title || !d.fields) return { ok: false, error: 'extract_failed' };
  } catch { return { ok: false, error: 'extract_failed' }; }
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO extractions (id,user_id,doc_type,fields_json,status,channel,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(id, userId, docType, JSON.stringify(d.fields), 'pending', channel, new Date().toISOString()).run();
  return { ok: true, extraction: { id, doc_type: docType, fields: d.fields } };
}

export async function confirmExtraction(env, userId, extractionId, channel) {
  const row = await env.DB.prepare('SELECT * FROM extractions WHERE id=? AND user_id=?').bind(extractionId, userId).first();
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status === 'confirmed') return { ok: false, error: 'already_confirmed' };
  if (row.status !== 'pending') return { ok: false, error: 'not_pending' };
  const claim = await env.DB.prepare("UPDATE extractions SET status='confirmed' WHERE id=? AND status='pending'").bind(extractionId).run();
  if (!claim.meta.changes) return { ok: false, error: 'already_confirmed' };
  const f = JSON.parse(row.fields_json);
  const res = row.doc_type === 'job_post'
    ? await addApplication(env, userId, { company: f.company || 'ไม่ทราบบริษัท', role: f.role || 'Intern', status: 'Saved', next_step: f.deadline ? 'ปิดรับ ' + thDate(f.deadline) : '—', url: f.apply_url || null, truth_level: 'AI_EXTRACTED' }, channel)
    : await addDocument(env, userId, { kind: row.doc_type, title: DOCTYPES[row.doc_type].label, fields: f, truth_level: 'AI_EXTRACTED' }, channel);
  if (!res.ok) {
    await env.DB.prepare("UPDATE extractions SET status='pending' WHERE id=?").bind(extractionId).run();
    return { ok: false, error: res.error };
  }
  return { ok: true, created: row.doc_type === 'job_post' ? 'application' : 'document' };
}

export async function discardExtraction(env, userId, extractionId) {
  const r = await env.DB.prepare("UPDATE extractions SET status='discarded' WHERE id=? AND user_id=? AND status='pending'").bind(extractionId, userId).run();
  return { ok: r.meta.changes > 0 };
}

export function formatExtraction({ doc_type, fields: f }) {
  const label = DOCTYPES[doc_type]?.label || doc_type;
  const lines = doc_type === 'job_post'
    ? [`🏢 ${f.company || '—'}`, `💼 ${f.role || '—'}`, f.deadline ? `📅 ปิดรับ ${thDate(f.deadline)}` : null, f.allowance ? `💰 ${f.allowance}` : null, f.documents?.length ? `📄 ต้องใช้: ${f.documents.join(', ')}` : null]
    : Object.entries(f).filter(([, v]) => v !== null && !(Array.isArray(v) && !v.length)).slice(0, 8).map(([k, v]) => `• ${k}: ${Array.isArray(v) ? v.map(x => typeof x === 'object' ? `${thDate(x.date) || '—'} ${x.task || ''}` : x).join(', ') : thDate(String(v))}`);
  return [`📸 อ่าน${label}แล้ว`, ...lines.filter(Boolean), '', '🤖 อ่านโดย AI · กรุณาตรวจก่อนยืนยัน'].join('\n');
}
