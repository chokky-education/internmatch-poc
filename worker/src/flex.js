const S = v => String(v == null || v === '' ? '—' : v);
const BADGE = { USER_REPORTED: '✎ อัปเดตโดยคุณ', AI_EXTRACTED: '🤖 อ่านโดย AI · ตรวจก่อนยืนยัน', SYSTEM_VERIFIED: '✔ ยืนยันโดยระบบ' };

export function toFlex(card) {
  const body = [{ type: 'text', text: S(card.title), weight: 'bold', size: 'lg', wrap: true }];
  if (card.subtitle) body.push({ type: 'text', text: S(card.subtitle), size: 'sm', color: '#888888', wrap: true });
  if (card.truth && BADGE[card.truth]) body.push({ type: 'text', text: BADGE[card.truth], size: 'xs', color: '#888888', wrap: true, margin: 'sm' });
  if (card.rows?.length) {
    body.push({ type: 'separator', margin: 'md' });
    for (const [k, v] of card.rows) body.push({ type: 'box', layout: 'baseline', margin: 'sm', contents: [
      { type: 'text', text: S(k), size: 'sm', color: '#888888', flex: 2 },
      { type: 'text', text: S(v), size: 'sm', wrap: true, flex: 5 },
    ] });
  }
  const bubble = { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: body } };
  if (card.actions?.length) bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: card.actions.map(a => ({
    type: 'button', style: a.style || 'secondary', height: 'sm',
    action: { type: 'postback', label: S(a.label).slice(0, 20), data: a.data, displayText: S(a.label).slice(0, 20) },
  })) };
  const firstRow = card.rows?.[0] ? ' ' + S(card.rows[0][1]) : '';
  return { type: 'flex', altText: (S(card.title) + firstRow).slice(0, 400), contents: bubble };
}
