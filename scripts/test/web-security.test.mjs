import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../../profile-ui.js', import.meta.url), 'utf8');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const payload = `<img src=x onerror="window.__securityProbe=1"> & 'ไทย'`;
function renderer(code, globals) {
  const elements = new Map();
  const $ = key => { if (!elements.has(key)) elements.set(key, { innerHTML: '', textContent: '', insertAdjacentHTML(_, value) { this.innerHTML += value; } }); return elements.get(key); };
  const context = vm.createContext({ $, ...globals });
  vm.runInContext(html.match(/^const esc=.*$/m)[0] + '\n' + code, context);
  return { context, elements };
}

test('the actual board renders persisted application fields as text', () => {
  const { elements } = renderer(between(html, 'function renderKanban()', 'function renderDash()') + '\nrenderKanban();', {
    STAGES: ['Saved'], TH: { Saved: 'บันทึกไว้' },
    apps: [{ role: payload, co: payload, next: payload, st: 'Saved', truth: 'AI_EXTRACTED', upd: 0 }],
  });
  const out = elements.get('#kanban').innerHTML;
  assert.ok(!out.includes('<img'), 'stored markup must not become a tag');
  assert.ok(out.includes('&lt;img') && out.includes('ไทย'), 'the original field remains visible as text');
  assert.ok(out.includes('move(0,1)'), 'ordinary board controls remain');
});

test('document and task renderers keep stored names, versions and notes inert', () => {
  const { elements } = renderer(between(html, 'function renderDocs()', 'const uni=[];') + '\n' + between(html, 'function renderUni()', 'function autofill()') + '\nrenderDocs();renderUni();', {
    myDocs: [{ i: '📄', t: payload, v: payload, n: payload, s: 'warn' }], extraDocs: [],
    need: {}, ic: { warn: '⚠' }, uni: [{ t: payload, d: payload, done: false }],
  });
  for (const name of ['#myDocs', '#uniList']) assert.ok(!elements.get(name).innerHTML.includes('<img'), name);
});

test('profile input values cannot break out of their quoted attribute', () => {
  const { context } = renderer(profile.match(/^const formField=.*$/m)[0] + '\nresult = formField("preferred_name", "ชื่อ", value);', { value: 'ไทย" autofocus onfocus="window.__securityProbe=1' });
  assert.ok(context.result.includes('value="ไทย&quot; autofocus onfocus=&quot;'), 'literal quotes stay inside the value');
});

test('unknown OCR field names are text, including before confirmation', () => {
  const { elements } = renderer(between(html, 'function renderOut(x)', 'async function confirmExt(') + '\nrenderOut(extraction);', {
    LBL: {}, show: value => String(value), extraction: { id: 'fixture', doc_type: 'job_post', fields: { [payload]: 'ordinary value' } },
  });
  assert.ok(!elements.get('#ocrOut').innerHTML.includes('<img'));
});
