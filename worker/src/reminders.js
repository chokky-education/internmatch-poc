import { push } from './line.js';

export async function sendDueReminders(env, now = new Date()) {
  const due = (await env.DB.prepare(
    'SELECT r.id, r.text, u.line_user_id FROM reminders r JOIN users u ON u.id = r.user_id WHERE r.sent_at IS NULL AND r.due_at <= ? ORDER BY r.due_at'
  ).bind(now.toISOString()).all()).results;
  let sent = 0, failed = 0;
  for (const r of due) {
    const claim = await env.DB.prepare('UPDATE reminders SET sent_at=? WHERE id=? AND sent_at IS NULL').bind(now.toISOString(), r.id).run();
    if (!claim.meta.changes) continue;
    const ok = r.line_user_id ? await push(env, r.line_user_id, [{ type: 'text', text: `⏰ เตือนนะ: ${r.text}` }]) : false;
    await env.DB.prepare('UPDATE reminders SET delivery=? WHERE id=?').bind(ok ? 'line' : 'failed', r.id).run();
    ok ? sent++ : failed++;
  }
  return { sent, failed };
}
