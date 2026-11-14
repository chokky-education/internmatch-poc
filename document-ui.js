// Rendering and input only. Requirements, progress and provenance live in the Worker.
window.InternDocuments = {
  mount({ api, reload, notify, esc }) {
    const el = id => document.getElementById(id);
    const form = el('documentForm');
    let state = null, draft = null, saving = false, account = null;
    const labels = { todo: 'ยังไม่ได้เตรียม', prepared: 'เตรียมแล้ว', submitted: 'ส่งแล้ว' };
    const fields = ['title', 'detail', 'recipient', 'submission_method', 'due_date', 'source', 'source_page'];
    const value = v => esc(v || 'ยังไม่ทราบ');

    function close() { draft = null; form.hidden = true; el('documentAdd').focus(); }
    function edit(item = null) {
      if (!state) return;
      draft = { id: item?.id, version: item?.version, request_id: crypto.randomUUID(),
        season_id: item?.season_id || state.selected_season.id, selection_version: state.selection_version };
      fields.forEach(k => { form.elements[k].value = item?.[k] || ''; });
      el('documentFormTitle').textContent = item ? 'แก้รายการที่ต้องเตรียม' : 'เพิ่มรายการที่ต้องเตรียม';
      el('documentFormSeason').textContent = 'ฤดู: ' + state.selected_season.name;
      el('documentFormError').textContent = '';
      form.hidden = false;
      form.elements.title.focus();
      form.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
    async function action(body) {
      const r = await api('/api/actions', { method: 'POST', body: JSON.stringify(body) });
      if (!r.ok || !r.data.ok) throw new Error(r.data.reply || ({ conflict: 'ฤดูหรือข้อมูลเปลี่ยนแล้ว โหลดข้อมูลล่าสุดก่อนบันทึก ร่างที่กรอกยังอยู่', network: 'เชื่อมต่อไม่ได้ ลองใหม่ได้ ร่างที่กรอกยังอยู่' }[r.data.error]) || 'บันทึกไม่สำเร็จ ตรวจข้อมูลแล้วลองใหม่');
      return r.data;
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!draft || saving || !form.reportValidity()) return;
      saving = true; el('documentSubmit').disabled = true; el('documentFormError').textContent = '';
      const item = Object.fromEntries(fields.map(k => [k, form.elements[k].value.trim() || null]));
      try {
        await action({ data: draft.id ? 'doc_save:' + draft.id : 'doc_save', ...draft, item });
        close(); notify('บันทึกรายการแล้ว'); await reload();
      } catch (error) { el('documentFormError').textContent = error.message; }
      finally { saving = false; el('documentSubmit').disabled = false; }
    });
    el('documentCancel').addEventListener('click', close);
    el('documentReload').addEventListener('click', async () => {
      await reload();
      if (draft) el('documentFormError').textContent = 'โหลดข้อมูลล่าสุดแล้ว ร่างนี้ยังผูกกับฤดูเดิม หากรายการเปลี่ยนแล้ว ให้เปิดแก้รายการอีกครั้ง';
    });
    el('documentAdd').addEventListener('click', () => edit());
    el('documentItems').addEventListener('click', event => {
      const button = event.target.closest('[data-edit-document]');
      if (button) edit(state.checklist_items.find(x => x.id === button.dataset.editDocument));
    });
    el('documentItems').addEventListener('change', async event => {
      const select = event.target.closest('[data-document-status]');
      if (!select || select.disabled) return;
      const item = state.checklist_items.find(x => x.id === select.dataset.documentStatus);
      if (!item) return;
      select.disabled = true;
      try { await action({ data: `doc_status:${item.id}:${select.value}:${item.version}` }); notify('อัปเดตสถานะที่คุณรายงานแล้ว'); }
      catch (error) { select.value = item.status; notify(error.message); }
      finally { await reload(); select.disabled = false; }
    });
    return {
      render(next) {
        if (!next) return;
        if (account && account !== next.user.email) { draft = null; form.hidden = true; }
        account = next.user.email; state = next;
        const items = state.checklist_items || [], summary = state.checklist_summary || { total: 0, prepared: 0, submitted: 0 };
        el('documentSeason').textContent = state.selected_season.name;
        el('documentProgress').textContent = summary.total ? `เตรียมแล้ว ${summary.prepared} · ส่งแล้ว ${summary.submitted} จาก ${summary.total} รายการที่เพิ่ม` : 'ยังไม่มีรายการที่เพิ่ม';
        el('documentEmpty').hidden = items.length > 0;
        el('documentProgressNote').hidden = items.length === 0;
        el('documentLegacy').hidden = !(state.university_checklist || []).length;
        el('documentItems').innerHTML = items.map((item, index) => `<article class="document-item">
          <div class="document-item-heading"><h3>${esc(item.title)}</h3><span class="chip ${item.truth_level === 'AI_EXTRACTED' ? 'warn' : ''}">${item.truth_level === 'AI_EXTRACTED' ? '🤖 อ่านโดย AI' : '✎ อัปเดตโดยคุณ'}</span></div>
          <dl class="document-facts"><div><dt>ส่งให้</dt><dd>${value(item.recipient)}</dd></div><div><dt>ส่งทาง</dt><dd>${value(item.submission_method)}</dd></div>
          <div><dt>กำหนดส่ง</dt><dd>${item.due_date ? esc(new Date(item.due_date + 'T00:00:00+07:00').toLocaleDateString('th-TH', { dateStyle: 'long', timeZone: 'Asia/Bangkok' })) : 'ยังไม่ทราบ'}</dd></div>
          <div><dt>ที่มา</dt><dd>${value(item.source)}${item.source_page ? ' · หน้า ' + esc(item.source_page) : ''}</dd></div></dl>
          ${item.detail ? `<p class="document-detail">${esc(item.detail)}</p>` : ''}
          <div class="document-item-controls"><label for="document-status-${index}">สถานะที่ฉันรายงาน<select id="document-status-${index}" data-document-status="${esc(item.id)}">${Object.entries(labels).map(([key, label]) => `<option value="${key}"${key === item.status ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
          <button class="btn ghost sm" type="button" data-edit-document="${esc(item.id)}" aria-label="แก้รายการ ${esc(item.title)}">แก้รายละเอียด</button></div></article>`).join('');
      },
    };
  },
};
