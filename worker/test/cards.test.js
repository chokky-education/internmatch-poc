import { describe, it, expect } from 'vitest';
import { applicationCard, reminderSetCard, reminderDueCard, extractionCard } from '../src/cards.js';
import { toFlex } from '../src/flex.js';

const app = (o = {}) => ({ id: 'a1', company: 'SCB', role: 'Data Intern', status: 'Applied', truth_level: 'USER_REPORTED', ...o });
const datas = c => c.actions.map(a => a.data);

describe('card builders', () => {
  it('applicationCard offers next status and undo only when asked', () => {
    expect(datas(applicationCard(app(), { undo: true }))).toEqual(['app_status:a1:Interview', 'app_undo:a1']);
    expect(datas(applicationCard(app()))).toEqual(['app_status:a1:Interview']);
    expect(applicationCard(app({ status: 'Saved' })).actions[0].data).toBe('app_status:a1:Applied');
  });
  it('applicationCard has no next button at Offer/Closed and none for SYSTEM_VERIFIED', () => {
    expect(applicationCard(app({ status: 'Offer' })).actions).toEqual([]);
    expect(applicationCard(app({ status: 'Closed' })).actions).toEqual([]);
    expect(applicationCard(app({ truth_level: 'SYSTEM_VERIFIED' }), { undo: true }).actions).toEqual([]);
  });
  it('reminderSetCard shows Bangkok time and a delete button', () => {
    const c = reminderSetCard({ id: 'r1', text: 'ส่งเอกสาร', due_at: '2026-11-19T13:00:00.000Z' });
    expect(datas(c)).toEqual(['rem_delete:r1']);
    expect(c.rows[0][1]).toMatch(/20[:.]00/);
  });
  it('reminderDueCard has done and snooze', () => {
    const c = reminderDueCard({ id: 'r1', text: 'ส่งเอกสาร' });
    expect(datas(c)).toEqual(['rem_done:r1', 'rem_snooze:r1']);
    expect(c.title).toBe('⏰ ส่งเอกสาร');
  });
  it('extractionCard is AI_EXTRACTED with confirm and discard', () => {
    const c = extractionCard({ id: 'e1', doc_type: 'job_post', fields: { company: 'ไทยดาต้า', role: 'Intern', deadline: '2026-11-30' } });
    expect(c.truth).toBe('AI_EXTRACTED');
    expect(datas(c)).toEqual(['ext_confirm:e1', 'ext_discard:e1']);
    expect(c.rows.length).toBeGreaterThan(0);
  });
});

describe('toFlex', () => {
  const all = [
    applicationCard(app(), { undo: true }),
    reminderSetCard({ id: 'r1', text: 'x', due_at: '2026-11-19T13:00:00.000Z' }),
    reminderDueCard({ id: 'r1', text: 'x' }),
    extractionCard({ id: 'e1', doc_type: 'job_post', fields: { company: null, role: '' } }),
    applicationCard(app({ role: '', company: '' })),
  ];
  const texts = n => (n && typeof n === 'object' ? [...(n.type === 'text' ? [n.text] : []), ...Object.values(n).flatMap(texts)] : []);
  it('is valid for LINE: altText, non-empty texts, short labels, short data', () => {
    for (const c of all) {
      const f = toFlex(c);
      expect(f.type).toBe('flex');
      expect(f.altText.length).toBeGreaterThan(0);
      expect(f.altText.length).toBeLessThanOrEqual(400);
      texts(f.contents).forEach(t => expect(String(t).length).toBeGreaterThan(0));
      for (const b of f.contents.footer?.contents || []) {
        expect(b.action.label.length).toBeLessThanOrEqual(20);
        expect(b.action.data.length).toBeLessThanOrEqual(300);
        expect(b.action.type).toBe('postback');
      }
    }
  });
  it('omits footer when there are no actions', () => {
    expect(toFlex(applicationCard(app({ status: 'Offer' }))).contents.footer).toBeUndefined();
  });
});
