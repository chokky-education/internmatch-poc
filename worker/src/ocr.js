import { context, scoped } from './seasons.js';
import { DOCTYPES } from './doctypes.js';

const MAX_BYTES = 10 * 1024 * 1024;
const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const thDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }) : v;

export async function extractDocument(env, userId, channel, { bytes, mime, docType = 'job_post' }) {
  const originContext=await context(env,userId),origin=originContext.season.id;
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
  await env.DB.prepare('INSERT INTO extractions (id,user_id,season_id,doc_type,fields_json,status,channel,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, userId, origin, docType, JSON.stringify(d.fields), 'pending', channel, new Date().toISOString()).run();
  return { ok: true, extraction: { id, doc_type: docType, fields: d.fields,season_name:originContext.season.name,season_id:origin } };
}

export async function confirmExtraction(env, userId, extractionId, channel) {
  const row = await env.DB.prepare('SELECT * FROM extractions WHERE id=? AND user_id=?').bind(extractionId, userId).first();
  if (!row) return { ok: false, error: 'not_found' };
  if(row.season_id) env=scoped(env,row.season_id);
  if (row.status === 'confirmed') return { ok: false, error: 'already_confirmed' };
  if (row.status !== 'pending') return { ok: false, error: 'not_pending' };
  if (row.doc_type === 'job_post' && !JSON.parse(row.fields_json).company) return { ok: false, error: 'missing_company' };
  if(!row.season_id)return {ok:false,error:'not_found'};
  if(Date.now()-Date.parse(row.created_at)>=86400e3)return {ok:false,error:'expired'};
  const f=JSON.parse(row.fields_json),id=crypto.randomUUID(),at=new Date().toISOString();
  const isJob=row.doc_type==='job_post';
  const duplicate=isJob?(await env.DB.prepare('SELECT company FROM applications WHERE user_id=? AND season_id=?').bind(userId,row.season_id).all()).results.some(a=>a.company.replace(/บริษัท\s*/, '').trim().toLowerCase()===f.company.replace(/บริษัท\s*/, '').trim().toLowerCase()):false;
  if(duplicate)return {ok:false,error:'duplicate'};
  // A unique target ID acts as this transaction's claim token, never visible between batches.
  const marker='applying-'+id;
  const guard="EXISTS(SELECT 1 FROM extractions WHERE id=? AND user_id=? AND status=?)";
  const stmt=isJob ? env.DB.prepare(`INSERT INTO applications(id,user_id,season_id,company,role,status,next_step,url,truth_level,history_json,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`)
   .bind(id,userId,row.season_id,f.company,f.role||'Intern','Saved',f.deadline?'ปิดรับ '+thDate(f.deadline):'—',f.apply_url||null,'AI_EXTRACTED',JSON.stringify([[at,'ยืนยันผล OCR ผ่าน '+channel]]),at,extractionId,userId,marker)
   :env.DB.prepare(`INSERT INTO documents(id,user_id,season_id,kind,title,status,note,fields_json,truth_level,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard}`)
   .bind(id,userId,row.season_id,row.doc_type,DOCTYPES[row.doc_type].label,'warn','อ่านโดย AI กรุณาตรวจสอบ',row.fields_json,'AI_EXTRACTED',at,extractionId,userId,marker);
  const results=await env.DB.batch([
    env.DB.prepare("UPDATE extractions SET status=? WHERE id=? AND user_id=? AND status='pending'").bind(marker,extractionId,userId),stmt,
    env.DB.prepare(`INSERT INTO audit_log(id,user_id,season_id,entity,entity_id,change_json,channel,truth_level,at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),userId,row.season_id,isJob?'application':'document',id,JSON.stringify({op:'confirm_extraction',extraction_id:extractionId}),channel,'AI_EXTRACTED',at,extractionId,userId,marker),
    env.DB.prepare("UPDATE extractions SET status='confirmed' WHERE id=? AND user_id=? AND status=?").bind(extractionId,userId,marker)
  ]);
  return results[0].meta.changes?{ok:true,created:isJob?'application':'document'}:{ok:false,error:'already_confirmed'};
}

export async function discardExtraction(env, userId, extractionId) {
  const row = await env.DB.prepare('SELECT status FROM extractions WHERE id=? AND user_id=?').bind(extractionId, userId).first();
  if (!row) return { ok: false, error: 'not_found' };
  if(row.season_id) env=scoped(env,row.season_id);
  if (row.status === 'confirmed') return { ok: false, error: 'already_confirmed' };
  if (row.status === 'discarded') return { ok: true };
  const r = await env.DB.prepare("UPDATE extractions SET status='discarded' WHERE id=? AND user_id=? AND status='pending'").bind(extractionId, userId).run();
  return r.meta.changes > 0 ? { ok: true } : { ok: false, error: 'already_confirmed' };
}

export function formatExtraction({ doc_type, fields: f }) {
  const label = DOCTYPES[doc_type]?.label || doc_type;
  const lines = doc_type === 'job_post'
    ? [`🏢 ${f.company || '—'}`, `💼 ${f.role || '—'}`, f.deadline ? `📅 ปิดรับ ${thDate(f.deadline)}` : null, f.allowance ? `💰 ${f.allowance}` : null, f.documents?.length ? `📄 ต้องใช้: ${f.documents.join(', ')}` : null]
    : Object.entries(f).filter(([, v]) => v !== null && !(Array.isArray(v) && !v.length)).slice(0, 8).map(([k, v]) => `• ${k}: ${Array.isArray(v) ? v.map(x => typeof x === 'object' ? `${thDate(x.date) || '—'} ${x.task || ''}` : x).join(', ') : thDate(String(v))}`);
  return [`📸 อ่าน${label}แล้ว`, ...lines.filter(Boolean), '', '🤖 อ่านโดย AI · กรุณาตรวจก่อนยืนยัน'].join('\n');
}
