(function (global) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' && value.length <= 12000;
  function configuration(value) {
    if (value === undefined) return null;
    if (!plain(value)) throw new Error('Configuração de Aprimoramento inválida.');
    const result = { enabled: value.enabled === true, calculation: value.calculation || 'numeric' };
    if (!['numeric', 'manual'].includes(result.calculation)) throw new Error('Cálculo de Aprimoramento inválido.');
    for (const key of ['aspect', 'normalValue', 'enhancedValue', 'basePnCost']) {
      result[key] = value[key] ?? '';
      if (!text(result[key])) throw new Error('Os campos do Aprimoramento devem conter texto válido.');
    }
    return result;
  }
  function normalizeState(value) {
    if (value !== undefined && !plain(value)) throw new Error('Estado da Geração de Ouro inválido.');
    const source = value || {};
    const result = { version: 1, unlocked: source.unlocked === true, active: source.unlocked === true && source.active === true,
      officialEnhancements: {} };
    if (source.version !== undefined && source.version !== 1) throw new Error('Versão da Geração de Ouro incompatível.');
    for (const key of ['round', 'availableFromRound']) {
      // Preserve saved legacy counters without using them to control enhancement.
      if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = clone(source[key]);
    }
    if (source.officialEnhancements !== undefined && !plain(source.officialEnhancements)) throw new Error('Configurações oficiais inválidas.');
    for (const [id, config] of Object.entries(source.officialEnhancements || {})) {
      if (['__proto__', 'constructor', 'prototype'].includes(id) || id.length > 300) throw new Error('Identificador de habilidade inválido.');
      result.officialEnhancements[id] = configuration(config);
    }
    return result;
  }
  function numeric(value) {
    const raw = String(value).trim();
    if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(raw)) throw new Error('Informe um valor numérico não negativo, ou use resultado manual para efeitos complexos.');
    const number = Number(raw.replace(',', '.'));
    if (!Number.isFinite(number) || number > Number.MAX_SAFE_INTEGER / 2) throw new Error('Valor numérico fora do limite seguro.');
    return number;
  }
  function enhancement(config, baseCost) {
    const data = configuration(config);
    if (!data?.enabled || !data.aspect.trim() || !data.normalValue.trim()) throw new Error('Configure o aspecto aprimorável e seu valor normal.');
    const result = data.calculation === 'numeric' ? String(numeric(data.normalValue) * 2) : data.enhancedValue.trim();
    if (!result) throw new Error('Informe o resultado aprimorado do efeito complexo.');
    const cost = baseCost === undefined ? numeric(data.basePnCost) : Number(baseCost);
    if (!Number.isFinite(cost) || cost < 0 || cost > Number.MAX_SAFE_INTEGER - 2) throw new Error('Informe um custo-base de PN válido.');
    return { aspect: data.aspect.trim(), normal: data.normalValue, result, baseCost: cost, totalCost: cost + 2 };
  }
  function use(value, config, baseCost, pn) {
    const state = normalizeState(value);
    if (!state.unlocked || !state.active) throw new Error('Geração de Ouro não está ativa.');
    const info = enhancement(config, baseCost);
    if (!Number.isFinite(pn) || pn < info.totalCost) throw new Error(`PN insuficiente: são necessários ${info.totalCost} PN.`);
    return { state, pn: pn - info.totalCost, info };
  }
  function duplicate(value) {
    const result = normalizeState(value);
    result.unlocked = false; result.active = false;
    return result;
  }

  let hooks, currentIdentity = '', keyIndex = 0, keyTime = 0, taps = 0, tapTime = 0, armedUntil = 0;
  let revealTimer;
  const configs = new WeakMap();
  const sequence = ['ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'KeyG', 'KeyE'];
  const node = (tag, content = '', className = '') => {
    const element = document.createElement(tag); element.textContent = content; element.className = className; return element;
  };
  const button = (label, action, className = 'btn secondary') => {
    const element = node('button', label, className); element.type = 'button'; element.addEventListener('click', action); return element;
  };
  function resetSequence() { keyIndex = 0; keyTime = 0; taps = 0; tapTime = 0; armedUntil = 0; }
  function visible() { return hooks && !document.getElementById('characterSheetView').hidden && Boolean(hooks.identity()); }
  function active() { return visible() && hooks.read().active; }
  function editable() { return visible() && hooks.canEdit(); }
  function cardConfig(card) {
    const id = card.dataset.automaticAbilityId;
    return id ? hooks.read().officialEnhancements[id] || null : configs.get(card) || null;
  }
  function attach(card, value) {
    if (value !== undefined) configs.set(card, configuration(value));
    renderCard(card);
  }
  function renderCard(card) {
    card.querySelector('.gold-enhancement-config')?.remove();
    card.querySelector('.gold-use-enhancement')?.remove();
    card.querySelector('summary').classList.remove('gold-enhancement-summary');
    if (!hooks || !hooks.read().active) return;
    if (global.CoyoteEyes?.canEnhance(card) === false) {
      const note = node('p', 'Esta Manifestação não recebe benefício adicional do Aprimoramento.', 'gold-enhancement-config span-2');
      card.querySelector('.editable-card-body').append(note); return;
    }
    const data = cardConfig(card) || configuration({});
    const section = node('fieldset', '', 'gold-enhancement-config span-2');
    section.append(node('legend', 'Aprimoramento de Assinatura'));
    const enabledLabel = node('label', '', 'gold-compatible-label');
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = data.enabled;
    enabledLabel.append(enabled, document.createTextNode('Compatível com Aprimoramento de Assinatura'));
    section.append(enabledLabel);
    const fields = node('div', '', 'gold-config-fields'); fields.hidden = !data.enabled;
    const inputs = {};
    const labels = { aspect: 'Aspecto que será dobrado', normalValue: 'Valor normal do aspecto', enhancedValue: 'Resultado aprimorado', basePnCost: 'Custo-base em PN (sem interpretar o texto da habilidade)' };
    for (const [key, labelText] of Object.entries(labels)) {
      if (key === 'basePnCost' && card.dataset.cardType === 'manifestation') continue;
      const label = node('label', labelText);
      const input = document.createElement('input'); input.value = data[key]; input.dataset.goldField = key;
      if (key === 'basePnCost') { input.type = 'number'; input.min = '0'; input.step = 'any'; }
      else { input.type = 'text'; input.maxLength = 12000; }
      label.append(input); fields.append(label); inputs[key] = input;
    }
    const calculationLabel = node('label', 'Forma do cálculo');
    const calculation = document.createElement('select'); calculation.dataset.goldField = 'calculation';
    for (const [value, label] of [['numeric', 'Dobrar um valor numérico'], ['manual', 'Resultado manual de efeito complexo']]) {
      const option = node('option', label); option.value = value; calculation.append(option);
    }
    calculation.value = data.calculation; calculationLabel.append(calculation); fields.prepend(calculationLabel);
    const preview = node('p', '', 'gold-enhancement-preview'); preview.setAttribute('aria-live', 'polite'); fields.append(preview);
    fields.append(node('p', 'Somente o aspecto indicado é dobrado. Custo adicional: +2 PN. Para efeitos complexos, registre explicitamente o resultado que dobra esse aspecto.', 'gold-config-help'));
    section.append(fields); card.querySelector('.editable-card-body').append(section);
    const collect = () => ({ ...data, enabled: enabled.checked, calculation: calculation.value, ...Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value])) });
    function updatePreview() {
      const manual = calculation.value === 'manual';
      inputs.enhancedValue.readOnly = !manual;
      if (!manual) {
        try { inputs.enhancedValue.value = String(numeric(inputs.normalValue.value) * 2); }
        catch { inputs.enhancedValue.value = ''; }
      }
      fields.hidden = !enabled.checked;
      try {
        const info = enhancement(collect(), card.dataset.cardType === 'manifestation' ? card.querySelector('[data-field="custo"]').value : undefined);
        preview.textContent = `${info.aspect}: ${info.normal} → ${info.result} · ${info.baseCost} + 2 = ${info.totalCost} PN`;
      } catch (error) { preview.textContent = error.message; }
    }
    function changed() {
      if (!editable() || !hooks.read().active || !card.isConnected) { refresh(); return; }
      updatePreview();
      const next = configuration(collect());
      if (card.dataset.automaticAbilityId) hooks.configureOfficial(card.dataset.automaticAbilityId, next);
      else { configs.set(card, next); hooks.changed(); }
      updateUseButton(card); updatePreview();
    }
    section.addEventListener('input', changed);
    enabled.addEventListener('change', changed); calculation.addEventListener('change', changed);
    section.querySelectorAll('input, select').forEach(input => { input.disabled = !hooks.canEdit(); });
    updatePreview(); updateUseButton(card);
  }
  function updateUseButton(card) {
    let control = card.querySelector('.gold-use-enhancement');
    if (global.CoyoteEyes?.canEnhance(card) === false || !cardConfig(card)?.enabled || !hooks.read().active) { control?.remove(); card.querySelector('summary').classList.remove('gold-enhancement-summary'); return; }
    card.querySelector('summary').classList.add('gold-enhancement-summary');
    if (!control) {
      control = button('Usar Aprimoramento', event => {
        event.preventDefault(); event.stopPropagation(); requestUse(card);
      }, 'icon-button gold-use-enhancement');
      card.querySelector('summary').append(control);
    }
    let message = '';
    try {
      use(hooks.read(), cardConfig(card), baseCost(card), hooks.pn());
      if (!hooks.canEdit()) message = 'Assuma a edição antes de utilizar Aprimoramento.';
    } catch (error) { message = error.message; }
    control.disabled = Boolean(message); control.title = message || 'Usar a versão Aprimorada com +2 PN';
  }
  function baseCost(card) { return card.dataset.cardType === 'manifestation' ? Number(card.querySelector('[data-field="custo"]').value || 0) : undefined; }
  function requestUse(card) {
    if (!editable() || !active() || !card.isConnected || global.CoyoteEyes?.canEnhance(card) === false) return;
    const identity = hooks.identity();
    const original = JSON.stringify({ config: cardConfig(card), base: baseCost(card), state: hooks.read() });
    let prepared;
    try { prepared = use(hooks.read(), cardConfig(card), baseCost(card), hooks.pn()); }
    catch (error) { hooks.feedback(error.message, 'warning'); return; }
    const content = node('div', '', 'gold-confirm-content');
    content.append(node('p', `${prepared.info.aspect}: ${prepared.info.normal} → ${prepared.info.result}`));
    content.append(node('p', `Custo: ${prepared.info.baseCost} PN + 2 PN adicionais = ${prepared.info.totalCost} PN.`));
    content.append(node('p', 'Após utilizar um Aprimoramento, espere uma rodada completa antes de utilizar outro. Jogadores e Mestre controlam essa espera durante a sessão.'));
    const confirm = button('Confirmar Aprimoramento', async () => {
      if (confirm.disabled) return;
      confirm.disabled = true;
      if (!editable() || identity !== hooks.identity() || !card.isConnected || global.CoyoteEyes?.canEnhance(card) === false || original !== JSON.stringify({ config: cardConfig(card), base: baseCost(card), state: hooks.read() })) {
        hooks.close(); hooks.feedback('A ficha mudou. Revise o Aprimoramento antes de confirmar.', 'warning'); return;
      }
      try {
        const next = use(hooks.read(), cardConfig(card), baseCost(card), hooks.pn());
        if (!await hooks.commit(next.state, next.pn)) throw new Error('Não foi possível salvar. O PN e os dados anteriores foram preservados.');
        hooks.close(); refresh(); hooks.feedback(`Aprimoramento utilizado: ${next.info.aspect} → ${next.info.result}. Custo: ${next.info.totalCost} PN.`);
      } catch (error) {
        const alert = content.querySelector('[role="alert"]') || node('p'); alert.setAttribute('role', 'alert'); alert.textContent = error.message; content.append(alert);
        confirm.disabled = false;
      }
    }, 'btn');
    content.append(button('Cancelar', () => hooks.close()), confirm);
    hooks.openModal({ title: 'Aprimoramento de Assinatura', content, owner: 'gold-enhancement', sheetContext: true });
  }
  async function unlock() {
    resetSequence();
    if (!editable() || hooks.read().unlocked) return false;
    const next = normalizeState(hooks.read()); next.unlocked = true; next.active = true;
    if (!await hooks.commit(next)) return false;
    refresh();
    const sheet = document.getElementById('characterSheetView');
    const reveal = node('div', '', 'gold-unlock-reveal'); reveal.setAttribute('role', 'status');
    reveal.append(node('span', 'Um novo brilho desperta'), node('strong', 'Geração de Ouro'));
    sheet.append(reveal); sheet.classList.add('gold-awakening');
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => { reveal.remove(); sheet.classList.remove('gold-awakening'); }, global.matchMedia('(prefers-reduced-motion: reduce)').matches ? 900 : 1800);
    return true;
  }
  function refresh({ cards = true } = {}) {
    if (!hooks) return;
    const sheet = document.getElementById('characterSheetView');
    const identity = hooks.identity();
    if (currentIdentity !== identity || sheet.hidden) {
      resetSequence(); sheet.querySelector('.gold-unlock-reveal')?.remove(); sheet.classList.remove('gold-awakening'); currentIdentity = identity;
    }
    const state = hooks.read();
    hooks.modalTheme?.(state.active);
    if (state.active) sheet.dataset.characterMode = 'gold'; else delete sheet.dataset.characterMode;
    const toolbar = document.getElementById('goldGenerationControls'); toolbar.hidden = !state.unlocked;
    toolbar.dataset.active = String(state.active);
    document.getElementById('goldGenerationToggle').textContent = state.active ? 'Aparência Alpha' : 'Geração de Ouro';
    document.getElementById('goldGenerationToggle').setAttribute('aria-pressed', String(state.active));
    toolbar.querySelectorAll('button').forEach(control => { control.disabled = !hooks.canEdit(); });
    if (cards) document.querySelectorAll('#listaHabilidades .editable-card, #listaManifestacoes .editable-card').forEach(renderCard);
    else document.querySelectorAll('#listaHabilidades .editable-card, #listaManifestacoes .editable-card').forEach(updateUseButton);
  }
  function configure(value) {
    hooks = value;
    document.getElementById('goldGenerationToggle').addEventListener('click', async () => {
      if (!editable() || !hooks.read().unlocked) return;
      const next = normalizeState(hooks.read()); next.active = !next.active;
      if (await hooks.commit(next)) refresh();
    });
    document.addEventListener('keydown', event => {
      if (!visible() || !editable() || hooks.read().unlocked || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey
        || event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="dialog"]')
        || !document.getElementById('modalOverlay').hidden || document.querySelector('dialog[open]')) { resetSequence(); return; }
      const now = Date.now(); if (now - keyTime > 2000) keyIndex = 0;
      keyIndex = event.code === sequence[keyIndex] ? keyIndex + 1 : event.code === 'ArrowUp' ? 1 : 0;
      keyTime = now; if (keyIndex === sequence.length) unlock();
    });
    document.getElementById('sheetBrand').addEventListener('pointerup', event => {
      if (!visible() || !editable() || hooks.read().unlocked || event.pointerType !== 'touch') return;
      const now = Date.now(); if (now - tapTime > 650 || taps >= 5) taps = 0;
      taps++; tapTime = now; if (taps === 5) armedUntil = now + 1500;
    });
    document.getElementById('characterSheetView').addEventListener('pointerup', event => {
      if (!event.target.closest('#sheetBrand, #abrirAnotacoes')) { taps = 0; armedUntil = 0; }
    });
    document.getElementById('abrirAnotacoes').addEventListener('click', event => {
      if (Date.now() <= armedUntil && taps === 5 && event.detail > 0) unlock();
      else { taps = 0; armedUntil = 0; }
    });
    global.addEventListener('blur', resetSequence);
    document.addEventListener('visibilitychange', () => { if (document.hidden) resetSequence(); });
    global.addEventListener('cronicas:character-edit-authority', () => { resetSequence(); refresh(); });
    new MutationObserver(() => { if (!visible()) resetSequence(); }).observe(document.getElementById('characterSheetView'), { attributes: true, attributeFilter: ['hidden'] });
    refresh();
  }
  global.GoldGeneration = Object.freeze({ configuration, normalizeState, enhancement, use, duplicate, configure, attach, cardConfig, refresh, resetSequence });
})(window);
