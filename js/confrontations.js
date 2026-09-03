(function initializeConfrontations(global) {
  'use strict';
  // Estado exclusivamente visual. Dados persistidos e transações pertencem ao storage.
  let services, record = null, draft = null, busy = false;
  let returnTo = null, managing = false, preparation = null, viewAnchor, enemySequence = 0;
  let epoch = 0, indexToken = 0, formToken = 0, returnId = '';
  let characterIds = [], adversaries = [], castIds = new Set(), directory;
  const el = id => document.getElementById(id);
  const storage = () => services.storage();
  const sortIds = ids => [...ids].sort();
  const normalizeSearch = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function button(text, action, className = 'secondary') {
    const element = node('button', `btn ${className}`, text);
    element.type = 'button';
    element.addEventListener('click', action);
    return element;
  }
  function feedback(message = '', kind = '', target) {
    const element = el(target || (el('confrontationView').hidden ? 'confrontationIndexFeedback' : 'confrontationFeedback'));
    element.textContent = message;
    element.dataset.kind = kind;
  }
  function errorText(error) {
    const messages = {
      EMPTY_CONFRONTATION: 'Adicione Caçadores ou adversários à composição antes de salvar ou iniciar.',
      ACTIVE_CONFRONTATION_EXISTS: 'Já existe um Confronto ativo nesta Crônica. Encerre-o antes de iniciar outro.',
      CONFRONTATION_NOT_ACTIVE: 'Este Confronto não está ativo. Inicie-o em Escudo do Mestre → Combates.',
      INVALID_CONFRONTATION_NAME: 'Informe um nome com até 120 caracteres.',
      INVALID_CONFRONTATION_DESCRIPTION: 'A descrição deve ter até 1.200 caracteres.',
      INVALID_ADVERSARY_PV: 'Informe PV atual e máximo juntos: atual não negativo e máximo maior que zero.',
      INVALID_ADVERSARY_NUMBERS: 'Utilize números inteiros válidos nos campos numéricos.',
      CONFRONTATION_UPDATE_CONFLICT: 'O Confronto mudou em outra operação. Seus campos foram mantidos. Cancele e reabra para conferir os dados atuais.',
      COMBAT_SELECTION_CONFLICT: 'A seleção foi alterada em outra aba. Suas escolhas foram mantidas; cancele e reabra para revisar.',
      ADVERSARY_UPDATE_CONFLICT: 'Este adversário foi alterado em outra aba. Nenhuma sobrescrita foi feita. Reabra sua edição para conferir a versão atual.',
      CHARACTER_NOT_IN_CAST: 'Um personagem selecionado não pertence mais ao Elenco. Sua seleção foi mantida para revisão.',
      CHARACTER_UNAVAILABLE: 'Um personagem selecionado não está mais disponível. Sua seleção foi mantida.',
      CHRONICLE_NOT_FOUND: 'A Crônica não está mais disponível. Nenhum registro foi recriado.',
      CONFRONTATION_NOT_FOUND: 'O Confronto não está mais disponível. Nenhum registro foi recriado.',
      ADVERSARY_NOT_FOUND: 'O adversário não está mais disponível. Nenhum registro foi recriado.',
      CONFRONTATION_INVALID_RECORD: 'Há um registro que não pode ser lido com segurança. Os dados foram preservados.',
      INDEXEDDB_UPGRADE_BLOCKED: 'Feche outras abas antigas do site e tente novamente.'
    };
    return messages[error?.message] || 'Não foi possível concluir a operação. Os campos e dados anteriores foram preservados. Tente novamente.';
  }
  function syncBusy() {
    ['confrontationView', 'chroniclePanelEncounters', 'confrontationForm', 'masterCombatsOverview'].forEach(id => {
      el(id).setAttribute('aria-busy', String(busy));
      el(id).querySelectorAll('button,input,textarea').forEach(input => { input.disabled = busy; });
    });
    el('editConfrontation').hidden = Boolean(preparation);
    el('startConfrontation').hidden = !managing || !record || record.active;
    el('endConfrontation').hidden = managing || !record?.active;
    el('confrontationCompositionActions').hidden = !preparation;
    el('confrontationPreparationHelp').hidden = !preparation;
    el('confrontationMetadataActions').hidden = Boolean(preparation);
    if (draft?.loading) {
      const form = el(draft.form);
      form.querySelectorAll('input,textarea,button[type="submit"]').forEach(input => { input.disabled = true; });
    }
  }
  function focusIfVisible(target) {
    if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true });
  }
  function formValue() {
    if (!draft) return '';
    if (draft.kind === 'selection') return JSON.stringify(sortIds(draft.ids));
    if (draft.kind === 'metadata') return JSON.stringify([el('confrontationName').value.trim(), el('confrontationDescriptionInput').value.trim()]);
    return JSON.stringify(['confrontationAdversaryName','confrontationAdversaryPVCurrent','confrontationAdversaryPVMax','confrontationAdversaryDefense'].map(id => el(id).value.trim()));
  }
  function clearDraft(restoreFocus = false) {
    const target = draft?.trigger;
    formToken += 1;
    draft = null;
    (preparation ? ['confrontationSelectionForm','confrontationAdversaryForm'] : ['confrontationForm','confrontationSelectionForm','confrontationAdversaryForm']).forEach(id => {
      el(id).hidden = true;
      el(id).reset();
      el(id).querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
    });
    ['confrontationFormFeedback','confrontationSelectionFeedback','confrontationAdversaryFeedback'].forEach(id => feedback('', '', id));
    syncBusy();
    if (restoreFocus) focusIfVisible(target);
  }
  function requestDraftExit(callback) {
    if (busy) { feedback('Aguarde o término do salvamento antes de sair.', 'warning', draft?.feedback); return true; }
    if (!draft) return false;
    if (draft.loading || formValue() === draft.original) { clearDraft(); return false; }
    const current = draft;
    services.closeActions();
    services.confirm({ title: 'Descartar alterações?', content: 'As alterações deste formulário ainda não foram salvas.', actions: [
      { label: 'Continuar editando', className: 'secondary' },
      { label: 'Descartar alterações', className: 'danger', onClick: () => {
        if (draft !== current || busy) return;
        clearDraft(); callback();
      } }
    ] });
    return true;
  }
  function preparationDirty() {
    return Boolean(preparation && (el('confrontationName').value || el('confrontationDescriptionInput').value || characterIds.length || adversaries.length));
  }
  function requestExit(callback) {
    if (requestDraftExit(() => { if (!requestExit(callback)) callback(); })) return true;
    if (!preparation) return false;
    if (!preparationDirty()) { preparation = null; clearDraft(); return false; }
    const current = preparation;
    services.confirm({ title: 'Descartar composição?', content: 'Este Confronto ainda não foi salvo. A composição em preparação será descartada.', actions: [
      { label: 'Continuar editando', className: 'secondary' },
      { label: 'Descartar alterações', className: 'danger', onClick: () => {
        if (current !== preparation || busy) return;
        preparation = null; clearDraft(); callback();
      } }
    ] }); return true;
  }
  function showWork() {
    if (managing) {
      services.showView('shield');
      el('chronicleMasterShieldView').classList.add('is-combat-editor');
      el('masterCombatsOverview').hidden = true;
      el('masterCombatEditorHost').append(el('confrontationView'));
      el('confrontationView').hidden = false;
    } else {
      viewAnchor.after(el('confrontationView'));
      services.showView('confrontation');
    }
  }
  async function openCreate(options = {}) {
    if (!services.canPrepare() || requestExit(() => void openCreate(options))) return;
    reset(); managing = true; returnTo = options.returnTo || null;
    preparation = { chronicleId: services.chronicleId() };
    directory = services.directory();
    showWork();
    el('confrontationTitle').textContent = 'Criar Confronto';
    el('confrontationChronicleName').textContent = el('masterShieldChronicleName').textContent;
    el('backFromConfrontation').textContent = '← Voltar para Combates';
    el('confrontationDescription').hidden = true;
    el('confrontationEditorHost').append(el('confrontationForm'));
    el('confrontationForm').reset(); el('confrontationForm').hidden = false;
    el('confrontationFormTitle').textContent = 'Identificação';
    el('confrontationDangerZone').hidden = true;
    renderCharacters(); renderAdversaries(); syncBusy(); focusIfVisible(el('confrontationName'));
  }
  function saveComposition() {
    if (!preparation || busy || !services.canPrepare()) return;
    if (draft) { feedback('Confirme ou cancele o formulário de composição aberto antes de salvar o Confronto.'); return; }
    const current = preparation, live = services.directory();
    if (characterIds.length && (live.unavailable || characterIds.some(id => !live.byId.has(id)))) { feedback(errorText(new Error('CHARACTER_UNAVAILABLE'))); return; }
    const input = { name: el('confrontationName').value, description: el('confrontationDescriptionInput').value };
    const composition = { characterIds: [...characterIds], adversaries: adversaries.map(item => ({ ...item })) };
    const goBack = returnTo;
    void execute(() => storage().createConfrontation(current.chronicleId, input, composition), async result => {
      preparation = null; clearDraft();
      await open(result.id, { preparing: true, returnTo: goBack });
      services.notify('Composição salva. O Confronto ainda não está ativo.');
    });
  }
  async function start(item = record) {
    if (!item || !services.canPrepare() || busy || requestDraftExit(() => void start(item))) return;
    await execute(() => storage().setConfrontationActive(item.id, true, { expectedUpdatedAt: item.updatedAt }), async result => {
      await services.executeCombat(result.id);
    }, managing ? 'confrontationFeedback' : 'masterShieldConfrontationsFeedback');
  }
  function end() {
    if (!record?.active || busy || requestDraftExit(end)) return;
    const current = record;
    void execute(() => storage().setConfrontationActive(current.id, false, { expectedUpdatedAt: current.updatedAt }), async () => {
      services.notify('Confronto encerrado. A composição foi preservada.');
      await back();
    });
  }
  function reset() {
    returnTo = null; preparation = null; managing = false;
    el('chronicleMasterShieldView').classList.remove('is-combat-editor');
    viewAnchor?.after(el('confrontationView'));
    epoch += 1; indexToken += 1;
    clearDraft(); record = null; characterIds = []; adversaries = []; returnId = '';
    castIds = new Set(); directory = null;
    ['confrontationIndex','confrontationCharacters','confrontationAdversaries','confrontationSelectionList'].forEach(id => el(id).replaceChildren());
    el('confrontationView').hidden = true;
    feedback('', '', 'confrontationIndexFeedback'); feedback('', '', 'confrontationFeedback');
  }
  async function renderIndex(focusId) {
    const chronicleId = services.chronicleId();
    if (!chronicleId) return;
    const token = ++indexToken;
    feedback('Carregando Confrontos…', '', 'confrontationIndexFeedback');
    try {
      const records = (await storage().listConfrontations(chronicleId)).filter(item => item.active);
      if (token !== indexToken || chronicleId !== services.chronicleId()) return;
      const list = el('confrontationIndex'); list.replaceChildren();
      records.forEach(item => {
        const row = node('li', 'confrontation-index-row'); row.dataset.confrontationId = item.id;
        const identity = node('div'); identity.append(node('h4', '', item.name));
        if (item.description) identity.append(node('p', 'confrontation-excerpt', item.description));
        const openButton = button('Abrir Confronto', () => void open(item.id));
        openButton.setAttribute('aria-label', `Abrir Confronto: ${item.name}`);
        row.append(identity, openButton); list.append(row);
        if (focusId === item.id) focusIfVisible(openButton);
      });
      el('confrontationEmpty').hidden = records.length !== 0;
      feedback('', '', 'confrontationIndexFeedback'); syncBusy();
    } catch (error) {
      if (token === indexToken && chronicleId === services.chronicleId()) {
        el('confrontationEmpty').hidden = true;
        feedback(errorText(error), 'error', 'confrontationIndexFeedback');
      }
    }
  }
  async function open(id, options = {}) {
    if (options.preparing && !services.canPrepare()) return;
    if (requestExit(() => void open(id, options))) return;
    managing = Boolean(options.preparing);
    returnTo = options.returnTo || null;
    const chronicleId = services.chronicleId(), token = ++epoch;
    services.closeActions();
    feedback('Abrindo Confronto…');
    try {
      const next = await storage().getConfrontation(id);
      if (token !== epoch || chronicleId !== services.chronicleId()) return;
      if (next.chronicleId !== chronicleId) throw new Error('CONFRONTATION_NOT_FOUND');
      if (!managing && !next.active) throw new Error('CONFRONTATION_NOT_ACTIVE');
      record = next; returnId = id;
      el('backFromConfrontation').textContent = returnTo ? '← Voltar para Combates' : '← Voltar para Confrontos';
      showWork();
      await refresh();
      if (token === epoch) focusIfVisible(el('confrontationTitle'));
    } catch (error) { if (token === epoch) feedback(errorText(error), 'error'); }
  }
  async function back() {
    if (requestExit(() => void back())) return;
    const id = returnId;
    epoch += 1; record = null;
    if (returnTo) { const go = returnTo; returnTo = null; await go(); return; }
    await services.returnToList();
    await renderIndex(id);
    if (!id) focusIfVisible(document.querySelector('[data-chronicle-detail-tab="encounters"]'));
  }
  function resourceText(characterId) {
    try {
      const fields = services.readCharacter(characterId)?.fields;
      const numeric = value => value !== undefined && value !== null && String(value).trim() !== '' && Number.isFinite(Number(value));
      if (!fields || !numeric(fields.pvAtual) || !numeric(fields.pvMax)) return 'PV não informado';
      const temporary = numeric(fields.pvTemporarios) && Number(fields.pvTemporarios) > 0 ? ` · ${fields.pvTemporarios} PV temporários` : '';
      return `PV ${fields.pvAtual} / ${fields.pvMax}${temporary}`;
    } catch (_error) { return 'PV indisponível'; }
  }
  function orderedCharacters(ids) {
    return [...ids].sort((a, b) => (directory.byId.get(a)?.managerIndex ?? Infinity) - (directory.byId.get(b)?.managerIndex ?? Infinity) || a.localeCompare(b));
  }
  function characterIdentity(id) {
    const entry = directory.byId.get(id), identity = node('div', 'confrontation-character-identity');
    identity.append(node('strong', '', entry?.name || 'Personagem indisponível'));
    if (entry) {
      identity.append(node('span', 'confrontation-help', [entry.className, `Nível ${entry.level}`].filter(Boolean).join(' · ')));
      if (!castIds.has(id)) identity.append(node('span', 'confrontation-reference-warning', 'Fora do Elenco'));
    } else identity.append(node('span', 'confrontation-reference-warning', 'A referência foi preservada.'));
    return identity;
  }
  function renderCharacters() {
    const host = el('confrontationCharacters'); host.replaceChildren();
    if (!characterIds.length) { host.append(node('p', 'confrontation-empty', 'Nenhum personagem selecionado para este Confronto.')); return; }
    orderedCharacters(characterIds).forEach(id => {
      const entry = directory.byId.get(id), row = node('article', 'confrontation-character'); row.dataset.characterId = id;
      row.append(services.portrait(entry, 'confrontation-portrait'), characterIdentity(id));
      if (entry) row.append(node('p', 'confrontation-character-pv', resourceText(id)));
      host.append(row);
    });
  }
  function renderAdversaries() {
    const host = el('confrontationAdversaries'); host.replaceChildren();
    if (!adversaries.length) { host.append(node('li', 'confrontation-empty', 'Nenhum adversário adicionado.')); return; }
    adversaries.forEach((adversary, index) => {
      const row = node('li', 'confrontation-adversary'); row.dataset.adversaryId = adversary.id; row.tabIndex = -1;
      const identity = node('div', 'confrontation-adversary-identity');
      identity.append(node('span', 'confrontation-number', String(index + 1).padStart(2, '0')), node('h5', '', adversary.name));
      const stats = node('div', 'confrontation-adversary-stats');
      const pv = adversary.pvCurrent === undefined ? 'PV não informado' : `PV ${adversary.pvCurrent} / ${adversary.pvMax}`;
      const defense = adversary.defense === undefined ? 'DEF não informada' : `DEF ${adversary.defense}`;
      stats.append(node('span', 'confrontation-pv', pv), node('span', 'confrontation-defense', defense));
      const actions = node('div', 'confrontation-row-actions');
      const edit = button('Editar', () => void openAdversary(adversary.id));
      const remove = button('Remover', () => confirmRemoveAdversary(adversary), 'danger');
      edit.setAttribute('aria-label', `Editar ${adversary.name}, adversário ${index + 1}`);
      remove.setAttribute('aria-label', `Remover ${adversary.name}, adversário ${index + 1}`);
      actions.append(edit, remove); row.append(identity, stats, actions); host.append(row);
    });
  }
  async function refresh() {
    if (!record) return;
    const id = record.id, token = epoch;
    try {
      const [current, ids, enemies, cast, chronicle] = await Promise.all([
        storage().getConfrontation(id), storage().listConfrontationCharacterIds(id), storage().listConfrontationAdversaries(id),
        storage().listChronicleCastIds(record.chronicleId), storage().getChronicle(record.chronicleId)
      ]);
      if (token !== epoch || record?.id !== id) return;
      if (!chronicle) throw new Error('CHRONICLE_NOT_FOUND');
      if (!managing && !current.active) { await back(); return; }
      record = current; characterIds = ids; adversaries = enemies; castIds = new Set(cast); directory = services.directory();
      el('confrontationChronicleName').textContent = chronicle.name;
      el('confrontationTitle').textContent = current.name;
      el('confrontationDescription').textContent = current.description; el('confrontationDescription').hidden = !current.description;
      renderCharacters(); renderAdversaries(); syncBusy();
      services.chronicleUpdated(chronicle);
      feedback(directory.unavailable ? 'O índice de personagens está indisponível. As referências foram preservadas.' : '', directory.unavailable ? 'warning' : '');
    } catch (error) { if (token === epoch) feedback(errorText(error), 'error'); }
  }
  async function execute(work, success, target) {
    if (busy || (managing && !services.canPrepare())) return;
    const token = epoch;
    busy = true; syncBusy(); feedback('Salvando…', '', target);
    let committed = false;
    try {
      const result = await work(); committed = true;
      if (token !== epoch) return;
      busy = false; syncBusy();
      await success(result);
    } catch (error) {
      if (token === epoch) {
        feedback(committed ? 'Os dados foram salvos, mas a tela não pôde ser atualizada. Reabra o Confronto.' : errorText(error), 'error', target);
      }
    } finally {
      busy = false; syncBusy();
      if (!committed && token === epoch && draft) focusIfVisible(el(draft.form).querySelector('input'));
    }
  }
  async function openMetadata(edit = false) {
    if (requestDraftExit(() => void openMetadata(edit))) return;
    const token = ++formToken;
    if (!edit || !record) return;
    el('confrontationEditorHost').append(el('confrontationForm'));
    draft = { kind: 'metadata', form: 'confrontationForm', feedback: 'confrontationFormFeedback', loading: edit,
      trigger: document.activeElement, chronicleId: services.chronicleId(), id: edit ? record?.id : null };
    el('confrontationForm').reset(); el('confrontationForm').hidden = false;
    el('confrontationFormTitle').textContent = edit ? 'Editar Confronto' : 'Novo Confronto';
    el('saveConfrontation').textContent = edit ? 'Salvar alterações' : 'Criar Confronto';
    el('confrontationDangerZone').hidden = !edit; syncBusy();
    try {
      if (edit) {
        const current = await storage().getConfrontation(draft.id);
        if (token !== formToken) return;
        draft.updatedAt = current.updatedAt; draft.record = current;
        el('confrontationName').value = current.name; el('confrontationDescriptionInput').value = current.description;
      }
      if (token !== formToken) return;
      draft.loading = false; draft.original = formValue(); syncBusy(); el('confrontationName').focus();
    } catch (error) { if (token === formToken) feedback(errorText(error), 'error', draft.feedback); }
  }
  function saveMetadata(event) {
    event.preventDefault(); if (preparation) { saveComposition(); return; }
    if (!draft || draft.loading || busy) return;
    const current = draft, name = el('confrontationName').value.trim(), description = el('confrontationDescriptionInput').value.trim();
    if (!name || name.length > 120 || description.length > 1200) {
      const field = !name || name.length > 120 ? el('confrontationName') : el('confrontationDescriptionInput');
      field.setAttribute('aria-invalid', 'true'); field.focus();
      feedback(!name || name.length > 120 ? 'Informe um nome com até 120 caracteres.' : 'A descrição deve ter até 1.200 caracteres.', 'error', current.feedback); return;
    }
    if (!current.id) return;
    void execute(() => storage().updateConfrontation(current.id, { name, description }, { expectedUpdatedAt: current.updatedAt }), async result => {
        clearDraft(); services.notify('Confronto atualizado.'); await open(result.id, { preparing: managing, returnTo });
      }, current.feedback);
  }
  async function openSelection() {
    if ((!record && !preparation) || requestDraftExit(() => void openSelection())) return;
    const token = ++formToken, id = record?.id;
    draft = { kind: 'selection', form: 'confrontationSelectionForm', feedback: 'confrontationSelectionFeedback', loading: true, ids: new Set(), trigger: el('selectConfrontationCharacters') };
    el('confrontationSelectionForm').hidden = false; el('confrontationCharacterSearch').value = ''; el('confrontationSelectionList').replaceChildren();
    feedback('Carregando personagens…', '', draft.feedback); syncBusy();
    try {
      const [ids, cast] = await Promise.all([preparation ? Promise.resolve(characterIds) : storage().listConfrontationCharacterIds(id), storage().listChronicleCastIds(preparation?.chronicleId || record.chronicleId)]);
      if (token !== formToken) return;
      directory = services.directory(); if (directory.unavailable) throw new Error('CHARACTER_UNAVAILABLE');
      castIds = new Set(cast);
      draft.ids = new Set(ids); draft.expected = [...ids]; draft.loading = false;
      draft.available = orderedCharacters(new Set([...ids, ...cast.filter(value => directory.byId.has(value))]));
      draft.original = formValue(); renderSelection(); feedback('', '', draft.feedback); syncBusy(); el('confrontationCharacterSearch').focus();
    } catch (error) { if (token === formToken) feedback(errorText(error), 'error', draft.feedback); }
  }
  function renderSelection() {
    if (draft?.kind !== 'selection' || draft.loading) return;
    const query = normalizeSearch(el('confrontationCharacterSearch').value), list = el('confrontationSelectionList'); list.replaceChildren();
    draft.available.filter(id => normalizeSearch(directory.byId.get(id)?.name || 'Personagem indisponível').includes(query)).forEach(id => {
      const label = node('label', 'confrontation-selection-option'), input = document.createElement('input');
      input.type = 'checkbox'; input.checked = draft.ids.has(id); input.dataset.characterId = id;
      input.addEventListener('change', () => {
        if (busy || draft?.kind !== 'selection') return;
        if (input.checked) draft.ids.add(id); else draft.ids.delete(id);
        el('confrontationSelectionCount').textContent = `${draft.ids.size} selecionados`;
      });
      label.append(input, characterIdentity(id)); list.append(label);
    });
    if (!list.children.length) list.append(node('p', 'confrontation-empty', query ? 'Nenhum personagem corresponde à busca.' : 'Nenhum personagem disponível no Elenco.'));
    el('confrontationSelectionCount').textContent = `${draft.ids.size} selecionados`; syncBusy();
  }
  function saveSelection(event) {
    event.preventDefault(); if (draft?.kind !== 'selection' || draft.loading || busy) return;
    const current = draft, selected = [...current.ids], liveDirectory = services.directory();
    if (liveDirectory.unavailable || selected.some(id => !current.expected.includes(id) && !liveDirectory.byId.has(id))) {
      feedback(errorText(new Error('CHARACTER_UNAVAILABLE')), 'error', current.feedback); return;
    }
    if (preparation) {
      if (!services.canPrepare()) return;
      characterIds = selected; clearDraft(true); renderCharacters(); return;
    }
    void execute(() => storage().replaceConfrontationCharacters(record.id, selected, { expectedCharacterIds: current.expected }), async () => {
      clearDraft(true); await refresh(); services.notify('Seleção de combatentes salva.');
    }, current.feedback);
  }
  async function openAdversary(id = null) {
    if ((!record && !preparation) || requestDraftExit(() => void openAdversary(id))) return;
    const token = ++formToken;
    draft = { kind: 'adversary', form: 'confrontationAdversaryForm', feedback: 'confrontationAdversaryFeedback', id, loading: !!id, trigger: document.activeElement };
    el('confrontationAdversaryForm').reset(); el('confrontationAdversaryForm').hidden = false;
    el('confrontationAdversaryFormTitle').textContent = id ? 'Editar adversário' : 'Adicionar adversário'; syncBusy();
    try {
      if (id) {
        const rows = preparation ? adversaries : await storage().listConfrontationAdversaries(record.id);
        if (token !== formToken) return;
        const current = rows.find(row => row.id === id); if (!current) throw new Error('ADVERSARY_NOT_FOUND');
        draft.updatedAt = current.updatedAt;
        el('confrontationAdversaryName').value = current.name;
        [['pvCurrent','PVCurrent'],['pvMax','PVMax'],['defense','Defense']].forEach(([key, suffix]) => { el(`confrontationAdversary${suffix}`).value = current[key] ?? ''; });
      }
      if (token !== formToken) return;
      draft.loading = false; draft.original = formValue(); syncBusy(); el('confrontationAdversaryName').focus();
    } catch (error) { if (token === formToken) feedback(errorText(error), 'error', draft.feedback); }
  }
  function saveAdversary(event) {
    event.preventDefault(); if (draft?.kind !== 'adversary' || draft.loading || busy) return;
    const current = draft, input = { name: el('confrontationAdversaryName').value.trim() };
    if (!input.name || input.name.length > 120) {
      el('confrontationAdversaryName').setAttribute('aria-invalid', 'true'); el('confrontationAdversaryName').focus();
      feedback('Informe um nome com até 120 caracteres.', 'error', current.feedback); return;
    }
    for (const [key, suffix] of [['pvCurrent','PVCurrent'],['pvMax','PVMax'],['defense','Defense']]) {
      const field = el(`confrontationAdversary${suffix}`);
      if (field.validity.badInput || (field.value !== '' && !Number.isSafeInteger(Number(field.value)))) {
        field.setAttribute('aria-invalid','true'); field.focus(); feedback(errorText(new Error('INVALID_ADVERSARY_NUMBERS')), 'error', current.feedback); return;
      }
      if (field.value !== '') input[key] = Number(field.value);
    }
    if ((input.pvCurrent === undefined) !== (input.pvMax === undefined) || (input.pvCurrent !== undefined && (input.pvCurrent < 0 || input.pvMax < 1))) {
      el('confrontationAdversaryPVCurrent').setAttribute('aria-invalid','true'); el('confrontationAdversaryPVCurrent').focus();
      feedback(errorText(new Error('INVALID_ADVERSARY_PV')), 'error', current.feedback); return;
    }
    if (preparation) {
      if (!services.canPrepare()) return;
      const item = { ...input, id: current.id || 'draft-enemy-' + (++enemySequence) };
      if (current.id) adversaries = adversaries.map(enemy => enemy.id === current.id ? item : enemy); else adversaries.push(item);
      clearDraft(); renderAdversaries(); focusIfVisible(el('addConfrontationAdversary')); return;
    }
    void execute(() => current.id ? storage().updateConfrontationAdversary(record.id, current.id, input, { expectedUpdatedAt: current.updatedAt })
      : storage().createConfrontationAdversary(record.id, input), async result => {
        clearDraft(); await refresh();
        focusIfVisible([...el('confrontationAdversaries').children].find(row => row.dataset.adversaryId === result.id));
        services.notify('Adversário salvo.');
      }, current.feedback);
  }
  function confirmRemoveAdversary(adversary) {
    if ((!record && !preparation) || requestDraftExit(() => confirmRemoveAdversary(adversary))) return;
    const id = record?.id, token = epoch;
    services.confirm({ title: 'Remover adversário?', content: `Remover “${adversary.name}” deste Confronto? Esta ação não altera personagens ou Participantes.`, actions: [
      { label: 'Cancelar', className: 'secondary' },
      { label: 'Remover adversário', className: 'danger', onClick: () => {
        if (token !== epoch || record?.id !== id) return;
        if (preparation) {
          if (!services.canPrepare()) return;
          adversaries = adversaries.filter(item => item.id !== adversary.id); renderAdversaries(); focusIfVisible(el('addConfrontationAdversary')); return;
        }
        void execute(() => storage().deleteConfrontationAdversary(id, adversary.id, { expectedUpdatedAt: adversary.updatedAt }), async () => {
          await refresh(); focusIfVisible(el('addConfrontationAdversary')); services.notify('Adversário removido.');
        });
      } }
    ] });
  }
  function confirmDelete() {
    if (!record || busy || draft?.loading) return;
    const current = draft?.record || record, token = epoch;
    services.confirm({ title: 'Excluir Confronto?', content: `Excluir “${current.name}” e seus adversários? Os vínculos serão removidos, mas as fichas originais e os Participantes serão preservados.`, actions: [
      { label: 'Cancelar', className: 'secondary' },
      { label: 'Excluir Confronto', className: 'danger', onClick: () => {
        if (token !== epoch || record?.id !== current.id) return;
        void execute(() => storage().deleteConfrontation(current.id, { expectedUpdatedAt: current.updatedAt }), async () => {
          clearDraft(); returnId = ''; await back(); services.notify('Confronto excluído.');
        }, draft?.feedback);
      } }
    ] });
  }
  function initialize(dependencies) {
    services = dependencies;
    viewAnchor = document.createComment('confrontation-view-home');
    el('confrontationView').before(viewAnchor);
    el('saveConfrontationComposition').addEventListener('click', saveComposition);
    el('cancelConfrontationComposition').addEventListener('click', () => void back());
    el('startConfrontation').addEventListener('click', () => void start());
    el('endConfrontation').addEventListener('click', end);
    global.addEventListener('beforeunload', event => {
      if (busy || preparationDirty() || (draft && !draft.loading && formValue() !== draft.original)) { event.preventDefault(); event.returnValue = ''; }
    });
    el('confrontationForm').addEventListener('submit', saveMetadata);
    el('confrontationSelectionForm').addEventListener('submit', saveSelection);
    el('confrontationAdversaryForm').addEventListener('submit', saveAdversary);
    ['cancelConfrontationForm','cancelConfrontationSelection','cancelConfrontationAdversary'].forEach(id => el(id).addEventListener('click', () => { if (!busy) clearDraft(true); }));
    el('editConfrontation').addEventListener('click', () => void openMetadata(true));
    el('backFromConfrontation').addEventListener('click', () => void back());
    el('selectConfrontationCharacters').addEventListener('click', () => void openSelection());
    el('confrontationCharacterSearch').addEventListener('input', renderSelection);
    el('addConfrontationAdversary').addEventListener('click', () => void openAdversary());
    el('deleteConfrontation').addEventListener('click', confirmDelete);
    ['confrontationForm','confrontationAdversaryForm'].forEach(id => el(id).addEventListener('input', event => event.target.removeAttribute('aria-invalid')));
  }
  global.ConfrontationsUI = Object.freeze({ initialize, renderIndex, open, openCreate, start, reset, requestExit, get busy() { return busy; }, get isManaging() { return managing; } });
})(window);
