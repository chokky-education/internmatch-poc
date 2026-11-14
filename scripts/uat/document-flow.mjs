// Real browser checks shared by isolated local UAT and the bounded release smoke.
export async function checkDocumentFlow(page, { base, label, outputDir }) {
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const errors = [], createdRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url() === base + '/api/actions' && request.method() === 'POST') {
      const body = request.postDataJSON();
      if (body?.data === 'doc_save') createdRequests.push(body);
    }
  });
  const api = async (path, body) => {
    const response = await page.request.fetch(base + path, { method: body ? 'POST' : 'GET',
      headers: { Origin: base }, ...(body ? { data: body } : {}) });
    return { status: response.status(), data: await response.json() };
  };
  const state = async () => (await api('/api/state')).data;
  const created = await api('/api/seasons', { name: 'ทดสอบเอกสาร ' + label });
  check(created.data.ok, 'Could not create the isolated document season');
  const seasonId = created.data.season.id;
  await api(`/api/seasons/${seasonId}/select`, { selection_version: (await state()).selection_version });
  await page.goto(base + '/');
  await page.waitForFunction(id => typeof serverState !== 'undefined' && serverState?.selected_season.id === id, seasonId);
  await page.locator('#nav [data-s=docs]').click();
  check(await page.locator('#documentEmpty').isVisible(), 'A new season did not start empty');
  check(!(await page.locator('#documentLegacy').isVisible()), 'A new season contains invented legacy tasks');
  await page.getByRole('button', { name: '＋ เพิ่มรายการเอง', exact: true }).click();
  await page.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click();
  check(await page.locator('#documentTitle:invalid').count() === 1, 'The required item title was not validated');
  const title = 'เตรียมเอกสารทดสอบ ' + label;
  const source = 'ประกาศทดสอบ <img src=x onerror="window.__documentProbe=1"> & "ไทย"';
  await page.locator('#documentTitle').fill(title);
  await page.locator('#documentSource').fill(source);
  await page.locator('#documentPage').fill('4–5');
  await page.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click();
  await page.waitForFunction(() => serverState.checklist_items.length === 1);
  let current = await state(), item = current.checklist_items[0];
  check(item.recipient === null && item.submission_method === null && item.due_date === null, 'Unknown document requirements were invented');
  check(item.source === source && item.source_page === '4–5', 'The source reference changed');
  await page.locator('#documentItems select').selectOption('prepared');
  await page.waitForFunction(() => serverState.checklist_summary.prepared === 1 && serverState.checklist_summary.submitted === 0);
  await page.getByRole('button', { name: 'แก้รายการ ' + title, exact: true }).click();
  await page.locator('#documentRecipient').fill('งานฝึกงาน (ข้อมูลทดสอบ)');
  await page.locator('#documentMethod').fill('ตามช่องทางในประกาศ (ข้อมูลทดสอบ)');
  await page.locator('#documentDue').fill('2099-01-31');
  await page.locator('#documentDetail').fill('รายละเอียดภาษาไทยที่ยาวสำหรับตรวจการตัดบรรทัด '.repeat(18));
  await page.getByRole('button', { name: 'บันทึกรายการ', exact: true }).click();
  await page.waitForFunction(() => serverState.checklist_items[0].version === 2);
  current = await state(); item = current.checklist_items[0];
  check(item.status === 'prepared' && item.due_date === '2099-01-31', 'Editing reset progress or lost the due date');
  const stale = await api('/api/actions', { data: 'doc_save:' + item.id, version: 1, item: { title: 'stale write' } });
  check(!stale.data.ok && stale.data.error === 'conflict', 'A stale edit overwrote current information');
  check(createdRequests.length === 1, 'Unexpected repeated browser create submission');
  check((await api('/api/actions', createdRequests[0])).data.ok, 'Retry did not return the original saved item');
  check((await state()).checklist_items.length === 1, 'Retry duplicated the item');
  await page.locator('#documentItems select').selectOption('submitted');
  await page.waitForFunction(() => serverState.checklist_summary.submitted === 1);
  await page.reload();
  await page.waitForFunction(() => typeof serverState !== 'undefined' && serverState?.checklist_items[0]?.status === 'submitted');
  await page.locator('#nav [data-s=docs]').click();
  check((await page.locator('#documentProgress').textContent()).includes('ส่งแล้ว 1'), 'Submitted progress did not persist');
  check(await page.locator('#documentItems img,#documentItems svg,#documentItems script').count() === 0, 'Stored source text created markup');
  check(await page.evaluate(() => !window.__documentProbe), 'Stored source script executed');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Document UI overflows the viewport');
  if (outputDir) await page.screenshot({ path: outputDir + '/' + label + '-documents.png', fullPage: true });
  const other = await api('/api/seasons', { name: 'อีกฤดูทดสอบ ' + label });
  await api(`/api/seasons/${other.data.season.id}/select`, { selection_version: (await state()).selection_version });
  check((await state()).checklist_items.length === 0, 'Document records leaked into another season');
  check((await api('/api/actions', { data: `doc_status:${item.id}:prepared:3` })).data.ok, 'The original-season card could not be used');
  check((await state()).checklist_items.length === 0, 'An old card wrote into the selected season');
  await api(`/api/seasons/${seasonId}/select`, { selection_version: (await state()).selection_version });
  current = await state();
  check(current.checklist_items[0].status === 'prepared', 'The original-season card changed the wrong item');
  check(current.reminders.length === 0, 'An item due date created an unconfirmed reminder');
  check(errors.length === 0, 'Browser errors: ' + errors.join('; '));
  return { engine: label, ok: true, checks: ['empty state', 'required title', 'unknown values', 'source text and page', 'prepared/submitted distinction', 'edit and persistence', 'stale edit rejection', 'retry idempotency', 'inert stored markup', 'viewport layout', 'original-season actions', 'no implicit reminder'], seasonId };
}
