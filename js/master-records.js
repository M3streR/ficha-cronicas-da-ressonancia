(function (global) {
  'use strict';
  function create({ host, storage, confirm, chronicleId, canUse, changed }) {
    const kind = 'journal'; // Investigation data remains dormant in v6; no UI consumes it.
    let epoch = 0, busy = false, draft = null, original = '';
    const node = (tag, text, cls = '') => { const el = document.createElement(tag); el.textContent = text; el.className = cls; return el; };
    const makeButton = (text, action, cls = 'secondary') => { const el = node('button', text, `btn ${cls}`); el.type = 'button'; el.addEventListener('click', action); return el; };
    const status = node('p',''); status.setAttribute('role','status');
    const add = makeButton('Adicionar registro', () => edit(null));
    const form = node('form','', 'master-record-editor'); form.noValidate = true; form.hidden = true;
    const heading = node('h4',''); form.append(heading);
    function field(name, tag, type) {
      const label = node('label',name); const input = document.createElement(tag); if (type) input.type = type;
      label.append(input); form.append(label); return input;
    }
    const title = field('Título · até 120 caracteres', 'input', 'text'); title.maxLength = 120; title.required = true;
    const content = field('Conteúdo · até 50.000 caracteres', 'textarea'); content.rows = 9;
    const extra = field('Data do registro', 'input', 'date');
    const formFeedback = node('p',''); formFeedback.setAttribute('role','status'); form.append(formFeedback);
    const save = node('button','Salvar','btn'); save.type = 'submit';
    const cancel = makeButton('Cancelar', () => { if (!requestExit(() => close())) close(); });
    const actions = node('div','','master-module-actions'); actions.append(cancel, save); form.append(actions);
    const list = node('ol','','master-record-list'); host.replaceChildren(add, status, form, list);
    const value = () => ({ title: title.value, content: content.value, date: extra.value });
    const dirty = () => draft !== null && JSON.stringify(value()) !== original;
    function sync() { host.querySelectorAll('button,input,textarea').forEach(el => el.disabled = busy); changed(); }
    function close() { draft = null; form.hidden = true; form.reset(); formFeedback.textContent = ''; sync(); add.focus(); }
    function requestExit(continuation) {
      if (busy) { status.textContent = 'Aguarde o término da operação.'; return true; }
      if (!dirty()) return false;
      const token = epoch;
      confirm({ title: 'Descartar alterações?', content: 'O texto não salvo será descartado. O registro salvo permanece intacto.', actions: [
        { label: 'Continuar editando', className: 'secondary', onClick: () => title.focus() },
        { label: 'Descartar e sair', className: 'danger', onClick: () => { if (token === epoch && canUse() && !busy) { close(); continuation(); } } }
      ] }); return true;
    }
    function edit(record) {
      if (!canUse() || requestExit(() => edit(record))) return;
      draft = record || {}; title.value = record?.title || ''; content.value = record?.content || '';
      const now = new Date(); extra.value = record?.date || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      original = JSON.stringify(value()); heading.textContent = record ? 'Editar' : 'Novo registro';
      formFeedback.textContent = ''; form.hidden = false; sync(); title.focus();
    }
    function errorText(error) {
      if (error.message === 'PRIVATE_UPDATE_CONFLICT') return 'Este registro mudou em outra aba. Seu texto foi mantido. Cancele e atualize para consultar a versão salva.';
      if (error.message === 'INVALID_PRIVATE_CONTENT') return 'Informe um título de até 120 caracteres e conteúdo de até 50.000. Nenhum texto foi truncado.';
      if (error.message === 'INVALID_PRIVATE_DATE') return 'Informe uma data válida.';
      return 'Não foi possível concluir. Os dados anteriores e o texto em edição foram preservados.';
    }
    async function load() {
      const token = ++epoch; status.textContent = 'Carregando…';
      try {
        const entries = await storage().listPrivateEntries(kind, chronicleId());
        if (token !== epoch || !canUse()) return;
        list.replaceChildren(...entries.map(entry => {
          const li = node('li','','master-record-row'), text = node('div','');
          text.append(node('h4',entry.title), node('small', entry.date.split('-').reverse().join('/')));
          if (entry.content) { const details = node('details',''); details.append(node('summary','Ler conteúdo'), node('p',entry.content,'private-text')); text.append(details); }
          const buttons = node('div','','master-module-actions');
          const editButton = makeButton('Editar', () => edit(entry)); editButton.setAttribute('aria-label',`Editar ${entry.title}`);
          const remove = makeButton('Remover', () => {
            if (!canUse() || requestExit(() => remove.click())) return;
            const removalToken = epoch;
            confirm({ title: 'Remover registro?', content: `“${entry.title}” será removido desta Crônica.`, actions: [
              { label: 'Cancelar', className: 'secondary' }, { label: 'Remover', className: 'danger', onClick: async () => {
                if (removalToken !== epoch || !canUse() || busy) return;
                busy = true; sync();
                try { await storage().deletePrivateEntry(kind, chronicleId(), entry.id, { expectedUpdatedAt: entry.updatedAt }); if (canUse()) { close(); await load(); } }
                catch (error) { if (canUse()) status.textContent = errorText(error); }
                finally { busy = false; sync(); }
              } }
            ] });
          }); remove.setAttribute('aria-label',`Remover ${entry.title}`);
          buttons.append(editButton, remove); li.append(text, buttons); return li;
        })); status.textContent = entries.length ? '' : 'Nenhum registro nesta Crônica.';
      } catch (error) { if (token === epoch && canUse()) status.textContent = errorText(error); }
    }
    form.addEventListener('input', changed);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !canUse() || !draft) return;
      if (!dirty() && draft.id) { formFeedback.textContent = 'Nenhuma alteração para salvar.'; return; }
      const token = epoch; busy = true; sync();
      try {
        await storage().savePrivateEntry(kind, chronicleId(), draft.id || null, value(), { expectedUpdatedAt: draft.updatedAt ?? null });
        if (token === epoch && canUse()) { close(); await load(); }
      } catch (error) { if (token === epoch && canUse()) formFeedback.textContent = errorText(error); }
      finally { busy = false; sync(); }
    });
    return { load, dirty, requestExit, get busy() { return busy; }, dispose() { ++epoch; draft = null; host.replaceChildren(); } };
  }
  global.MasterRecords = Object.freeze({ create });
})(window);
