import { context } from './seasons.js';

export const DOCUMENT_STATUS = { todo: 'ยังไม่ได้เตรียม', prepared: 'เตรียมแล้ว', submitted: 'ส่งแล้ว' };
const KIND = 'checklist_item';
const limits = { title: 160, detail: 2000, recipient: 300, submission_method: 600, source: 1200, source_page: 120 };
const bad = error => ({ ok: false, error });
const dateOK = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function checklistItem(row, seasonName) {
  const f = JSON.parse(row.fields_json);
  return { id: row.id, season_id: row.season_id, season_name: seasonName, title: row.title, detail: row.note,
    status: row.status, truth_level: row.truth_level, status_truth_level: 'USER_REPORTED',
    recipient: f.recipient ?? null, submission_method: f.submission_method ?? null,
    due_date: f.due_date ?? null, source: f.source ?? null, source_page: f.source_page ?? null,
    version: f.version || 0 };
}

export function checklistSummary(items) {
  return { total: items.length, prepared: items.filter(x => x.status === 'prepared').length,
    submitted: items.filter(x => x.status === 'submitted').length };
}

function validate(input, before) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const next = before ? { ...before } : { title: null, detail: null, recipient: null, submission_method: null, due_date: null, source: null, source_page: null };
  for (const [key, limit] of Object.entries(limits)) if (key in input) {
    if (input[key] !== null && (typeof input[key] !== 'string' || input[key].length > limit)) return null;
    next[key] = input[key]?.trim() || null;
  }
  if (!next.title) return null;
  if ('due_date' in input) {
    if (input.due_date !== null && input.due_date !== '' && !dateOK(input.due_date)) return null;
    next.due_date = input.due_date || null;
  }
  return next;
}

async function fingerprint(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function documentCreateFingerprint(input) {
  const normalized = validate(input, null);
  return normalized ? fingerprint(normalized) : null;
}
export async function documentRequestId(namespace, operation) {
  return 'chat-' + await fingerprint([namespace, operation]);
}

async function find(env, userId, seasonId, id) {
  return env.DB.prepare('SELECT * FROM documents WHERE id=? AND user_id=? AND season_id=? AND kind=?').bind(id, userId, seasonId, KIND).first();
}

function audit(env, userId, seasonId, id, change, channel, truth = 'USER_REPORTED') {
  return env.DB.prepare('INSERT INTO audit_log(id,user_id,season_id,entity,entity_id,change_json,channel,truth_level,at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()>0')
    .bind(crypto.randomUUID(), userId, seasonId, KIND, id, JSON.stringify(change), channel, truth, new Date().toISOString());
}

// All writes use the existing document table and commit provenance in the same D1 batch.
export async function saveChecklistItem(env, userId, input, channel, options = {}) {
  const c = await context(env, userId), seasonId = c.season.id;
  const row = options.id ? await find(env, userId, seasonId, options.id) : null;
  if (options.id && !row) return bad('not_found');
  const before = row && checklistItem(row, c.season.name), next = validate(input, before);
  if (!next) return bad('bad_request');
  if (row && (!Number.isInteger(options.version) || options.version !== before.version)) return bad('conflict');
  const selection = options.selection_version ?? c.selection_version;
  if (!row && (options.season_id !== undefined && options.season_id !== seasonId || !Number.isInteger(selection))) return bad('conflict');
  const requestId = options.request_id;
  if (!row && (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(requestId))) return bad('bad_request');
  const id = row?.id || 'checklist-' + requestId;
  const creationFingerprint = row ? JSON.parse(row.fields_json).creation_fingerprint : await fingerprint(next);
  const metadata = { recipient: next.recipient, submission_method: next.submission_method, due_date: next.due_date,
    source: next.source, source_page: next.source_page,
    version: row ? before.version + 1 : 0, creation_fingerprint: creationFingerprint };
  const stmt = row
    ? env.DB.prepare('UPDATE documents SET title=?,note=?,fields_json=?,truth_level=? WHERE id=? AND user_id=? AND season_id=? AND kind=? AND COALESCE(json_extract(fields_json,\'$.version\'),0)=?')
      .bind(next.title, next.detail, JSON.stringify(metadata), 'USER_REPORTED', id, userId, seasonId, KIND, options.version)
    : env.DB.prepare('INSERT OR IGNORE INTO documents(id,user_id,season_id,kind,title,status,note,fields_json,truth_level,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND selected_season_id=? AND selection_version=?)')
      .bind(id, userId, seasonId, KIND, next.title, 'todo', next.detail, JSON.stringify(metadata), 'USER_REPORTED', new Date().toISOString(), userId, seasonId, selection);
  const results = await env.DB.batch([stmt, audit(env, userId, seasonId, id, { op: row ? 'edit' : 'add', before, after: next }, channel)]);
  const saved = await find(env, userId, seasonId, id);
  if (!results[0].meta.changes && (!saved || row)) return bad('conflict');
  if (!results[0].meta.changes && JSON.parse(saved.fields_json).creation_fingerprint !== creationFingerprint) return bad('request_conflict');
  return { ok: true, item: checklistItem(saved, c.season.name), replayed: !results[0].meta.changes };
}

export async function setChecklistStatus(env, userId, id, status, version, channel) {
  if (!Object.hasOwn(DOCUMENT_STATUS, status) || !Number.isInteger(version) || version < 0) return bad('bad_request');
  const c = await context(env, userId), seasonId = c.season.id;
  const row = await find(env, userId, seasonId, id);
  if (!row) return bad('not_found');
  const before = checklistItem(row);
  const stmt = env.DB.prepare('UPDATE documents SET status=?,fields_json=json_set(fields_json,\'$.version\',?) WHERE id=? AND user_id=? AND season_id=? AND kind=? AND COALESCE(json_extract(fields_json,\'$.version\'),0)=?')
    .bind(status, version + 1, id, userId, seasonId, KIND, version);
  const result = await env.DB.batch([stmt, audit(env, userId, seasonId, id, { op: 'status', from: before.status, to: status }, channel)]);
  if (!result[0].meta.changes) return bad('conflict');
  return { ok: true, item: checklistItem(await find(env, userId, seasonId, id), c.season.name) };
}
