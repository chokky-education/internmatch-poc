// Create the two LINE rich menus, set the guest menu as default, and switch linked users to the main menu.
// Usage (from worker/):
//   LINE_TOKEN=... node scripts/richmenu.mjs [lineUserId ...]
// Prints the main menu id: put it in wrangler.toml [vars] RICHMENU_MAIN, then `npx wrangler deploy`.
// Images: re-render richmenu/*.html with headless Chrome (see docs/line-setup.md) if you change them.
import { readFile } from 'node:fs/promises';

const token = process.env.LINE_TOKEN;
if (!token) throw new Error('set LINE_TOKEN');
const WEB = 'https://chokky-education.github.io/internmatch-poc/';
const H = { Authorization: 'Bearer ' + token };

const W = 2500, cw = [833, 833, 834], cx = [0, 833, 1666];
const cell = (col, row, action) => ({ bounds: { x: cx[col], y: row * 843, width: cw[col], height: 843 }, action });
const pb = (data, text) => ({ type: 'postback', data, displayText: text });

const MAIN = {
  size: { width: W, height: 1686 }, selected: true, name: 'InternMatch main', chatBarText: 'เมนู',
  areas: [
    cell(0, 0, pb('menu:today', 'วันนี้ต้องทำอะไร')),
    cell(1, 0, { type: 'uri', uri: 'https://line.me/R/nv/cameraRoll/single' }),
    cell(2, 0, pb('menu:apps', 'ขอดูสถานะใบสมัครทั้งหมด')),
    cell(0, 1, pb('menu:checklist', 'เช็กลิสต์คณะเหลืออะไรบ้าง')),
    cell(1, 1, pb('menu:reminders', 'มีเตือนอะไรตั้งไว้บ้าง')),
    cell(2, 1, { type: 'uri', uri: WEB }),
  ],
};
const GUEST = {
  size: { width: W, height: 843 }, selected: true, name: 'InternMatch guest', chatBarText: 'เริ่มต้น',
  areas: [
    { bounds: { x: 0, y: 0, width: 1250, height: 843 }, action: { type: 'message', text: 'ผูกบัญชี' } },
    { bounds: { x: 1250, y: 0, width: 1250, height: 843 }, action: { type: 'uri', uri: WEB } },
  ],
};

async function call(url, opt) {
  const r = await fetch(url, opt);
  const t = await r.text();
  if (!r.ok) throw new Error(`${opt?.method || 'GET'} ${url} → ${r.status} ${t}`);
  return t ? JSON.parse(t) : {};
}
async function create(menu, png) {
  await call('https://api.line.me/v2/bot/richmenu/validate', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(menu) });
  const { richMenuId } = await call('https://api.line.me/v2/bot/richmenu', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(menu) });
  await call(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, { method: 'POST', headers: { ...H, 'Content-Type': 'image/png' }, body: await readFile(new URL(png, import.meta.url)) });
  return richMenuId;
}

const mainId = await create(MAIN, '../richmenu/main.png');
const guestId = await create(GUEST, '../richmenu/guest.png');
await call(`https://api.line.me/v2/bot/user/all/richmenu/${guestId}`, { method: 'POST', headers: H });
const users = process.argv.slice(2);
if (users.length) await call('https://api.line.me/v2/bot/richmenu/bulk/link', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ richMenuId: mainId, userIds: users }) });
console.log(JSON.stringify({ RICHMENU_MAIN: mainId, RICHMENU_GUEST: guestId, linkedUsers: users.length }));
