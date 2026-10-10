(function (global) {
  'use strict';
  const principles = Object.freeze({ Estrutura: '#D4AF37', Ruptura: '#DC4545', Psique: '#9B65E8', Fluxo: '#43B878', Vínculo: '#4285E9' });
  const targets = ['Arma', 'Proteção', 'Assinatura', 'Personalizado'];
  const copy = value => JSON.parse(JSON.stringify(value));
  function validate(list) {
    if (list === undefined) return [];
    if (!Array.isArray(list) || list.length > 3) throw new Error('Encantamentos devem ser uma lista com no máximo três registros.');
    const ids = new Set();
    return list.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Registro de Encantamento inválido.');
      const result = {};
      for (const key of ['id', 'name', 'principle', 'grade', 'action', 'target', 'customTarget', 'description']) {
        const value = item[key] ?? (key === 'customTarget' ? '' : null);
        if (typeof value !== 'string') throw new Error('Os campos do Encantamento devem conter texto.');
        result[key] = key === 'description' ? value : value.trim();
      }
      if (!result.id || ids.has(result.id) || !result.name || !result.action || !result.description.trim()
        || !Object.hasOwn(principles, result.principle) || !['I', 'II', 'III'].includes(result.grade)
        || !targets.includes(result.target) || (result.target === 'Personalizado' && !result.customTarget)) {
        throw new Error('Preencha nome, Princípio, Grau, Ação, Alvo e descrição válidos, com identificadores únicos.');
      }
      ids.add(result.id);
      return result;
    });
  }
  const formula = item => [item.principle, item.action, item.target === 'Personalizado' ? item.customTarget : item.target].filter(Boolean).join(' + ');
  let hooks, session;
  const node = (tag, text = '', className = '') => {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  function button(label, action, disabled = false) {
    const element = node('button', label, 'btn secondary');
    element.type = 'button'; element.disabled = disabled;
    element.addEventListener('click', action);
    return element;
  }
  function changed() { return session?.draft && JSON.stringify(session.draft) !== session.originalDraft; }
  function requestClose() {
    if (!changed()) return true;
    confirmDiscard(() => hooks.close());
    return false;
  }
  function shell(content, focus) {
    hooks.openModal({ title: 'Encantamentos', content, actions: [], owner: 'enchantments', modalClass: 'enchantments-modal', beforeClose: requestClose, onClose: () => { session = null; } });
    requestAnimationFrame(() => focus?.focus());
  }
  function confirmDiscard(proceed) {
    const content = node('div', '', 'enchantments-content');
    content.append(node('p', 'Há alterações não salvas. Descartar esta edição?'));
    content.append(button('Continuar editando', renderForm), button('Descartar alterações', () => { session.draft = null; proceed(); }));
    shell(content);
  }
  function error(content, message) {
    const alert = content.querySelector('[role="alert"]') || node('p', '', 'enchantments-error');
    alert.setAttribute('role', 'alert'); alert.textContent = message; content.append(alert);
  }
  function list() {
    if (!session) return;
    session.draft = null;
    const content = node('div', '', 'enchantments-content');
    const items = hooks.read();
    const counter = node('p', `Encantamentos conhecidos: ${items.length}/3`);
    counter.setAttribute('role', 'status');
    const add = button('+ Adicionar Encantamento', () => edit(), items.length >= 3 || !hooks.canEdit());
    content.append(counter, add);
    if (items.length >= 3) content.append(node('p', 'Para aprender outro, abandone um dos Encantamentos conhecidos.'));
    if (!items.length) content.append(node('p', 'Nenhum Encantamento registrado.'));
    items.forEach(item => {
      const card = node('details', '', 'enchantment-card');
      card.style.setProperty('--principle-color', principles[item.principle]);
      const summary = node('summary');
      summary.append(node('strong', item.name), node('span', `${item.principle} · Grau ${item.grade}`, 'enchantment-meta'));
      const body = node('div', '', 'enchantment-body');
      body.append(node('p', formula(item), 'enchantment-formula'), node('p', item.description, 'enchantment-description'));
      const actions = node('div', '', 'enchantment-actions');
      actions.append(button('Editar', () => edit(item), !hooks.canEdit()), button('Remover', () => abandon(item), !hooks.canEdit()));
      body.append(actions); card.append(summary, body); content.append(card);
    });
    shell(content, add.disabled ? null : add);
  }
  function edit(item) {
    if (!hooks.canEdit()) return;
    session.base = JSON.stringify(hooks.read());
    session.editId = item?.id || '';
    session.draft = item ? copy(item) : { id: `enchantment-${crypto.randomUUID()}`, name: '', principle: 'Estrutura', grade: 'I', action: '', target: 'Arma', customTarget: '', description: '' };
    session.originalDraft = JSON.stringify(session.draft);
    renderForm();
  }
  function renderForm() {
    const form = node('form', '', 'enchantment-form');
    const fields = [ ['name', 'Nome do Encantamento'], ['principle', 'Princípio Primordial', Object.keys(principles)], ['grade', 'Grau', ['I', 'II', 'III']], ['action', 'Ação da fórmula'], ['target', 'Alvo', targets], ['customTarget', 'Alvo personalizado'], ['description', 'Descrição'] ];
    const preview = node('p', '', 'enchantment-formula'); preview.setAttribute('aria-live', 'polite');
    let first, customLabel;
    const updatePreview = () => {
      preview.textContent = `Fórmula: ${formula(session.draft)}`;
      customLabel.hidden = session.draft.target !== 'Personalizado';
      customLabel.querySelector('input').required = !customLabel.hidden;
      customLabel.querySelector('input').disabled = customLabel.hidden;
    };
    fields.forEach(([key, labelText, options]) => {
      const label = node('label', labelText);
      const input = node(options ? 'select' : key === 'description' ? 'textarea' : 'input');
      if (options) options.forEach(value => { const option = node('option', value); option.value = value; input.append(option); });
      input.name = key; input.value = session.draft[key]; input.required = true;
      if (key === 'description') { input.rows = 7; label.className = 'enchantment-wide'; }
      input.addEventListener('input', () => { session.draft[key] = input.value; updatePreview(); });
      label.append(input); form.append(label);
      if (key === 'customTarget') customLabel = label;
      if (!first) first = input;
    });
    updatePreview();
    const actions = node('div', '', 'enchantment-actions enchantment-wide');
    const save = node('button', 'Salvar Encantamento', 'btn'); save.type = 'submit';
    actions.append(save, button('Cancelar', () => changed() ? confirmDiscard(list) : list()));
    form.append(preview, actions);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        if (!hooks.canEdit() || hooks.identity() !== session.identity) throw new Error('Assuma a edição desta ficha antes de salvar.');
        if (JSON.stringify(hooks.read()) !== session.base) throw new Error('Os Encantamentos mudaram durante a edição. Seu texto foi preservado; cancele e revise a lista atual antes de salvar.');
        const item = validate([session.draft])[0];
        const current = hooks.read();
        const next = session.editId ? current.map(value => value.id === session.editId ? item : value) : [...current, item];
        if (!await hooks.commit(validate(next))) throw new Error('Não foi possível salvar. O rascunho foi preservado.');
        list();
      } catch (failure) { error(form, failure.message); }
    });
    shell(form, first);
  }
  function abandon(item) {
    session.base = JSON.stringify(hooks.read());
    const content = node('div', '', 'enchantments-content');
    content.append(node('p', `Abandonar “${item.name}”?`), node('p', 'Este Encantamento será abandonado e removido da ficha. Será necessário encontrá-lo novamente para reaprendê-lo.'));
    content.append(button('Cancelar', list), button('Confirmar abandono', async () => {
      try {
        if (hooks.identity() !== session.identity || !hooks.canEdit()) throw new Error('Esta aba não possui autorização para alterar a ficha.');
        if (JSON.stringify(hooks.read()) !== session.base) throw new Error('A lista mudou. Cancele e revise antes de abandonar.');
        if (!await hooks.commit(hooks.read().filter(value => value.id !== item.id))) throw new Error('Não foi possível salvar o abandono. O registro foi preservado.');
        list();
      } catch (failure) { error(content, failure.message); }
    }));
    shell(content);
  }
  global.addEventListener('beforeunload', event => {
    if (!changed()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  global.Enchantments = Object.freeze({ validate, formula, principles, configure: value => { hooks = value; }, open() {
    if (session) {
      if (changed()) { confirmDiscard(() => { session = { identity: hooks.identity(), draft: null }; list(); }); return; }
    }
    session = { identity: hooks.identity(), draft: null }; list();
  } });
})(window);
