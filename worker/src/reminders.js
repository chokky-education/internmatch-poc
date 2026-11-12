import { push } from './line.js';
import { reminderDueCard } from './cards.js';
import { toFlex } from './flex.js';

export async function sendDueReminders(env, now = new Date()) {
  const due = (await env.DB.prepare(
    'SELECT r.id, r.text, r.due_at, r.version, s.name AS season_name, u.line_user_id FROM reminders r JOIN users u ON u.id = r.user_id LEFT JOIN seasons s ON s.id=r.season_id WHERE r.sent_at IS NULL AND r.due_at <= ? ORDER BY r.due_at'
  ).bind(now.toISOString()).all()).results;
  let sent = 0, failed = 0;
  for (const r of due) {
    const claim = await env.DB.prepare('UPDATE reminders SET sent_at=?,version=version+1 WHERE id=? AND sent_at IS NULL AND due_at=? AND version=?').bind(now.toISOString(), r.id,r.due_at,r.version).run();
    if (!claim.meta.changes) continue;
    const plain = [{ type: 'text', text: `⏰ ${r.season_name||'ฤดูฝึกงาน'}: ${r.text}` }];
    const ok = r.line_user_id ? (await push(env, r.line_user_id, [toFlex(reminderDueCard(r))])) || (await push(env, r.line_user_id, plain)) : false;
    await env.DB.prepare('UPDATE reminders SET delivery=? WHERE id=?').bind(ok ? 'line' : 'failed', r.id).run();
    ok ? sent++ : failed++;
  }
  return { sent, failed };
}
