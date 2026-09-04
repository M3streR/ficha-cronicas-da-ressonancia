/* Teste de integração no navegador. Somente os namespaces de armazenamento
   são substituídos; lógica, DOM e CSS são os arquivos reais da aplicação. */
'use strict';
const frame = document.getElementById('app');
const results = document.getElementById('results');
const status = document.getElementById('status');
const request = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const complete = tx => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onabort = () => reject(tx.error || new Error('aborted'));
});
const wait = async predicate => {
  for (let n = 0; n < 250; n++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Timeout aguardando interface');
};
function assert(value, label) {
  const li = document.createElement('li');
  li.className = value ? 'pass' : 'fail';
  li.textContent = `${value ? 'OK' : 'FALHOU'} — ${label}`;
  results.append(li);
  if (!value) throw new Error(label);
}
async function rejects(promise, code) {
  try { await promise; return false; } catch (error) { return !code || error.message === code; }
}
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
document.querySelectorAll('[data-width]').forEach(button => button.onclick = () => {
  frame.width = button.dataset.width;
});
document.getElementById('run').onclick = async () => {
  document.getElementById('run').disabled = true;
  results.replaceChildren();
  status.textContent = 'Executando…';
  const prefix = `elencoV1Test${crypto.randomUUID().replaceAll('-', '')}`;
  const dbName = `${prefix}Chronicles`;
  const urls = [];
  let db;
  try {
    const timestamp = '2026-01-01T12:00:00.000Z';
    const old = { id: 'chronicle-legacy-0001', schemaVersion: 1, name: 'Horizonte de Teste',
      synopsis: 'Uma história de teste. Dados anteriores ao Elenco.', type: 'campaign', hasCover: true,
      createdAt: timestamp, updatedAt: timestamp };
    const canvas = document.createElement('canvas');
    canvas.width = 960; canvas.height = 540;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#332456'; ctx.fillRect(0, 0, 960, 540);
    ctx.fillStyle = '#d5c4ff'; ctx.font = '56px sans-serif'; ctx.fillText('CRÔNICA · TESTE', 90, 280);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.8));
    const openV1 = indexedDB.open(dbName, 1);
    openV1.onupgradeneeded = () => {
      const s = openV1.result.createObjectStore('chronicles', { keyPath: 'id' });
      for (const name of ['createdAt', 'updatedAt', 'type']) s.createIndex(name, name);
      openV1.result.createObjectStore('chronicleCovers', { keyPath: 'chronicleId' });
    };
    const legacy = await request(openV1);
    const tx = legacy.transaction(['chronicles', 'chronicleCovers'], 'readwrite');
    tx.objectStore('chronicles').add(old);
    tx.objectStore('chronicleCovers').add({ chronicleId: old.id, blob, width: 960, height: 540 });
    await complete(tx); legacy.close();

    const [html, storageSource, appSource] = await Promise.all([
      fetch('../index.html').then(r => r.text()), fetch('../js/chronicles-storage.js').then(r => r.text()),
      fetch('../script.js').then(r => r.text())
    ]);
    const scriptURL = source => {
      const url = URL.createObjectURL(new Blob([source.replaceAll('cronicasRessonancia', prefix)], { type: 'text/javascript' }));
      urls.push(url); return url;
    };
    const storageURL = scriptURL(storageSource);
    const appURL = scriptURL(appSource);
    await new Promise(resolve => {
      frame.onload = resolve;
      frame.srcdoc = html.replace('<head>', `<head><base href="${new URL('../',location.href)}">`)
        .replace(/src="js\/chronicles-storage.js[^\"]*"/, `src="${storageURL}"`)
        .replace(/src="script.js[^\"]*"/, `src="${appURL}"`);
    });
    const w = frame.contentWindow;
    const d = w.document;
    const el = id => d.getElementById(id);
    await wait(() => typeof w.getChronicleCharacterDirectory === 'function' && !el('characterManagerView').hidden);
    const api = w.ChroniclesStorage;
    assert(JSON.stringify(await api.getChronicle(old.id)) === JSON.stringify(old), 'Upgrade v1 → v6 preserva todos os metadados');
    const cover = await api.getChronicleCover(old.id);
    assert(cover.blob.size === blob.size && await cover.blob.text() === await blob.text(), 'Upgrade preserva o Blob da capa byte a byte');
    db = await request(indexedDB.open(dbName));
    const inspect = db.transaction('chronicleCastLinks');
    const store = inspect.objectStore('chronicleCastLinks');
    assert(db.version === 6 && same(store.keyPath, ['chronicleId', 'characterId']) && same(store.indexNames, ['chronicleId', 'characterId']), 'Banco v6 preserva chave composta e ambos os índices do Elenco');
    assert((await api.listChronicleCastIds(old.id)).length === 0, 'Crônica antiga começa com Elenco vazio');

    const ids = ['character-test-aria', 'character-test-breno', 'character-test-celia'];
    let manager = w.readCharacterManager() || w.createEmptyCharacterManager();
    for (const [i, name] of ['Ária — Horizonte', 'Breno', 'Célia'].entries()) {
      const character = w.createEmptyCharacterState();
      character.fields.nome = name; character.fields.nivel = i + 1; character.fields.assinatura = 'Teste';
      w.writeStoredCharacter(ids[i], character);
      manager = w.setCharacterSummary(manager, ids[i], await w.createCharacterSummary(character));
    }
    w.writeCharacterManager(manager);
    const snapshot = () => manager.order.map(id => w.localStorage.getItem(`${prefix}CharacterV4:${id}`));
    const originalCharacters = JSON.stringify(snapshot());
    const second = await api.createChronicle({ name: 'Outra Crônica', synopsis: '', type: 'oneshot' });
    const saved = await api.replaceChronicleCast(old.id, ids.slice(0, 2), { expectedUpdatedAt: old.updatedAt });
    await api.replaceChronicleCast(second.id, [ids[0]]);
    assert(same(await api.listChronicleCastIds(old.id), ids.slice(0, 2)) && same(await api.listChronicleCastIds(second.id), [ids[0]]), 'Adição múltipla e mesmo personagem em duas Crônicas');
    const linkRows = await request(db.transaction('chronicleCastLinks').objectStore('chronicleCastLinks').getAll());
    assert(linkRows.every(row => same(Object.keys(row), ['chronicleId', 'characterId'])), 'Vínculos contêm exclusivamente os dois IDs');
    const unchanged = await api.replaceChronicleCast(old.id, [ids[1], ids[0], ids[0]], { expectedUpdatedAt: saved.chronicle.updatedAt });
    assert(unchanged.chronicle.updatedAt === saved.chronicle.updatedAt, 'Seleção idêntica não altera updatedAt nem duplica vínculos');
    assert(await rejects(api.replaceChronicleCast(old.id, [ids[2]], { expectedUpdatedAt: old.updatedAt }), 'CHRONICLE_UPDATE_CONFLICT'), 'Conflito de updatedAt impede sobrescrita');
    assert(same(await api.listChronicleCastIds(old.id), ids.slice(0, 2)), 'Conflito mantém vínculos anteriores');
    assert(await rejects(api.replaceChronicleCast(old.id, ['invalid']), 'INVALID_CHRONICLE_CAST_CHARACTER_ID'), 'ID inválido é rejeitado antes de gravar');
    assert(await rejects(api.replaceChronicleCast('chronicle-not-present', ids), 'CHRONICLE_NOT_FOUND'), 'Registro ausente não gera novos vínculos');

    const originalAdd = w.IDBObjectStore.prototype.add;
    let adds = 0;
    w.IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'chronicleCastLinks' && ++adds === 2) throw new Error('TEST_TRANSACTION_FAILURE');
      return originalAdd.apply(this, args);
    };
    assert(await rejects(api.replaceChronicleCast(old.id, [ids[1], ids[2]]), 'TEST_TRANSACTION_FAILURE'), 'Falha injetada após escrita parcial aborta a transação');
    w.IDBObjectStore.prototype.add = originalAdd;
    assert(same(await api.listChronicleCastIds(old.id), ids.slice(0, 2)) && (await api.getChronicle(old.id)).updatedAt === saved.chronicle.updatedAt, 'Rollback restaura vínculos e updatedAt');
    assert(JSON.stringify(snapshot()) === originalCharacters, 'Persistência de Elenco não altera as fichas');
    const withCover = await api.createChronicle({ name: 'Excluir com capa', synopsis: '', type: 'campaign', cover });
    await api.replaceChronicleCast(withCover.id, ids);
    const originalDelete = w.IDBObjectStore.prototype.delete;
    w.IDBObjectStore.prototype.delete = function (...args) {
      if (this.name === 'chronicleCovers') throw new Error('TEST_DELETE_FAILURE');
      return originalDelete.apply(this, args);
    };
    assert(await rejects(api.deleteChronicle(withCover.id), 'TEST_DELETE_FAILURE'), 'Falha na exclusão aborta a transação');
    w.IDBObjectStore.prototype.delete = originalDelete;
    assert(await api.getChronicle(withCover.id) && await api.getChronicleCover(withCover.id) && same(await api.listChronicleCastIds(withCover.id), ids), 'Falha de exclusão mantém metadados, capa e vínculos');
    await api.deleteChronicle(withCover.id);
    assert(!await api.getChronicle(withCover.id) && !await api.getChronicleCover(withCover.id) && !(await api.listChronicleCastIds(withCover.id)).length, 'Exclusão com capa remove as três entidades atomicamente');

    w.showManagerSection('chronicles');
    await wait(() => d.querySelector(`[data-chronicle-id="${old.id}"] button`));
    const open = async id => {
      if (el('characterManagerView').dataset.activeEnvironment !== 'chronicles') {
        w.showManagerSection('chronicles');
      }
      await w.showChroniclesIndex();
      const entry = d.querySelector(`[data-chronicle-id="${id}"]`);
      await w.openChronicleDetail(id, 1, entry.querySelector('button'));
    };
    await open(old.id);
    el('chronicleTabCast').click();
    await wait(() => d.querySelectorAll('.chronicle-cast-member').length === 2);
    assert(el('chronicleCastList').textContent.includes('Ária'), 'Consulta renderiza dados reais dos personagens');
    const manage = async () => {
      await w.openChronicleCastManagement(el('manageChronicleCast'));
      assert(!el('chronicleCastManagerView').hidden && !el('saveChronicleCast').disabled && !el('chronicleCastSearch').disabled, 'Gerenciamento abre com controles habilitados');
    };
    const toggle = id => d.querySelector(`.chronicle-cast-selection-option[data-character-id="${id}"] input`).click();
    const search = value => { el('chronicleCastSearch').value = value; el('chronicleCastSearch').dispatchEvent(new w.Event('input')); };
    await manage();
    search('aria');
    assert(d.querySelectorAll('.chronicle-cast-selection-option').length === 1, 'Busca por nome ignora acento e caixa');
    search('Teste');
    assert(!el('chronicleCastNoResults').hidden, 'Busca não inclui Assinatura ou outros campos');
    search(''); toggle(ids[0]); toggle(ids[2]);
    el('cancelChronicleCastManagement').click();
    assert(!el('modalOverlay').hidden, 'Cancelar alterações abre confirmação');
    [...el('modalActions').querySelectorAll('button')].find(b => b.textContent === 'Descartar alterações').click();
    await wait(() => !el('chronicleCastConsultView').hidden && !el('chronicleCastList').hasAttribute('aria-busy'));
    assert(same(await api.listChronicleCastIds(old.id), ids.slice(0, 2)), 'Cancelamento não persiste alterações');
    await manage(); toggle(ids[0]); toggle(ids[1]); toggle(ids[2]);
    await w.saveChronicleCastManagement();
    assert(same(await api.listChronicleCastIds(old.id), [ids[2]]), 'Salvar adiciona e remove vários vínculos');
    assert(same(await api.listChronicleCastIds(second.id), [ids[0]]), 'Remoção em uma Crônica não afeta outra');
    await manage();
    assert(el('chronicleCastSearch').value === '', 'Busca é reiniciada ao reabrir');
    toggle(ids[0]);
    const beforeConflict = await api.getChronicle(old.id);
    await api.updateChronicle(old.id, { ...beforeConflict, synopsis: 'Alteração concorrente' }, { expectedUpdatedAt: beforeConflict.updatedAt });
    await w.saveChronicleCastManagement();
    assert(!el('chronicleCastManagerView').hidden && d.querySelector(`[data-character-id="${ids[0]}"] input`).checked && el('chronicleCastManagerFeedback').textContent.includes('outra aba'), 'Conflito mantém seleção e gerenciamento abertos');
    w.closeChronicleCastManagement({ render: false, restoreFocus: false });
    await manage(); toggle(ids[0]);
    w.IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'chronicleCastLinks') throw new Error('TEST_UI_FAILURE');
      return originalAdd.apply(this, args);
    };
    await w.saveChronicleCastManagement();
    w.IDBObjectStore.prototype.add = originalAdd;
    assert(!el('chronicleCastManagerView').hidden && !el('saveChronicleCast').disabled && d.querySelector(`[data-character-id="${ids[0]}"] input`).checked, 'Falha de transação mantém seleção e permite nova tentativa');
    await w.saveChronicleCastManagement();
    const currentCharacter = w.readStoredCharacter(ids[0]);
    currentCharacter.fields.nome = 'Ária Atualizada'; currentCharacter.fields.nivel = 6;
    w.writeStoredCharacter(ids[0], currentCharacter);
    await w.renderChronicleCast();
    assert(el('chronicleCastList').textContent.includes('Ária Atualizada') && el('chronicleCastList').textContent.includes('Nível 6'), 'Nova renderização lê nome e nível atuais, sem cópias');

    const beforeDup = w.readCharacterManager().order;
    await w.duplicateCharacterById(ids[0], null);
    const duplicateId = w.readCharacterManager().order.find(id => !beforeDup.includes(id));
    assert(duplicateId && !(await api.listChronicleCastIds(old.id)).includes(duplicateId), 'Duplicação usa novo ID e não herda vínculos');
    const beforeImport = w.readCharacterManager().order;
    await w.storeImportedCharacterAsNew(currentCharacter);
    const importedId = w.readCharacterManager().order.find(id => !beforeImport.includes(id));
    assert(importedId && importedId !== duplicateId && !(await api.listChronicleCastIds(old.id)).includes(importedId), 'Importação usa novo ID e não herda vínculos');
    await w.deleteCharacterById(ids[0]);
    await open(old.id); w.setChronicleDetailSection('cast');
    await wait(() => el('chronicleCastList').querySelector('.is-unavailable'));
    assert((await api.listChronicleCastIds(old.id)).includes(ids[0]) && (await api.listChronicleCastIds(second.id)).includes(ids[0]), 'Excluir personagem preserva referências indisponíveis nas duas Crônicas');
    assert(el('chronicleCastList').querySelectorAll('.is-unavailable').length === 1, 'Importado e duplicado não religam referência órfã');
    await manage(); toggle(ids[0]); await w.saveChronicleCastManagement();
    assert(!(await api.listChronicleCastIds(old.id)).includes(ids[0]) && (await api.listChronicleCastIds(second.id)).includes(ids[0]), 'Limpeza manual remove somente o vínculo escolhido');

    await api.replaceChronicleCast(old.id, []);
    await w.renderChronicleCast();
    assert(!el('chronicleCastEmpty').hidden, 'Elenco vazio exibe CTA apropriado');
    el('manageChronicleCast').click();
    await wait(() => !el('chronicleCastManagerView').hidden);
    assert(el('chronicleCastSearch').value === '', 'CTA vazio abre o mesmo gerenciamento');
    toggle(ids[1]); toggle(ids[2]); await w.saveChronicleCastManagement();
    await manage(); toggle(ids[1]);
    d.querySelector('[data-manager-section="chronicles"]').click();
    assert(!el('modalOverlay').hidden && !el('chronicleCastManagerView').hidden, 'Navegação para o próprio índice também protege seleção não salva');
    w.closeModal(); w.closeChronicleCastManagement({ render: false, restoreFocus: false });

    let releaseOpening;
    const openingGate = new Promise(resolve => { releaseOpening = resolve; });
    w.ChroniclesStorage = { ...api, getChronicle: async id => { await openingGate; return api.getChronicle(id); } };
    const pendingOpen = w.openChronicleCastManagement(el('manageChronicleCast'));
    w.setChronicleDetailSection('overview'); releaseOpening(); await pendingOpen;
    w.ChroniclesStorage = api;
    assert(el('chronicleCastManagerView').hidden && el('chronicleTabOverview').getAttribute('aria-selected') === 'true', 'Carregamento atrasado não reabre gerenciamento após troca de aba');
    await manage(); toggle(ids[1]);
    let releaseSave;
    let writeCalls = 0;
    const saveGate = new Promise(resolve => { releaseSave = resolve; });
    w.ChroniclesStorage = { ...api, replaceChronicleCast: async (...args) => { writeCalls++; await saveGate; return api.replaceChronicleCast(...args); } };
    const firstSave = w.saveChronicleCastManagement();
    const secondSave = w.saveChronicleCastManagement();
    w.requestChronicleCastManagementExit(() => { throw new Error('Saiu durante salvamento'); });
    releaseSave(); await Promise.all([firstSave, secondSave]); w.ChroniclesStorage = api;
    assert(writeCalls === 1, 'Duplo Salvar executa uma transação e saída durante gravação é protegida');
    await api.replaceChronicleCast(old.id, [ids[1], ids[2]]);

    await w.openChronicleEditor();
    el('chronicleName').value = 'Horizonte revisado';
    await w.submitChronicleUpdate({ preventDefault() {} });
    assert(el('chronicleDetailTitle').textContent === 'Horizonte revisado' && (await api.getChronicleCover(old.id)).blob.size === blob.size, 'Regressão: editar preserva capa e atualiza masthead');
    assert(el('chronicleOverviewType').textContent === 'Campanha' && el('chronicleOverviewUpdatedAt').textContent, 'Regressão: Visão Geral apresenta dados reais');
    assert(same(await api.listChronicleCastIds(old.id), [ids[1], ids[2]]), 'Editar metadados preserva Elenco');
    await w.returnToChroniclesIndex();
    w.openChronicleCreation();
    el('chronicleName').value = 'Crônica criada no teste';
    d.querySelector('input[name="chronicleType"][value="oneshot"]').checked = true;
    await w.submitChronicleCreation({ preventDefault() {} });
    const created = (await api.listChronicles()).find(x => x.name === 'Crônica criada no teste');
    assert(created && !el('chroniclesIndexView').hidden, 'Regressão: criar e listar Crônica');
    await api.replaceChronicleCast(created.id, [ids[1], ids[2]]);
    await open(created.id); await w.openChronicleEditor();
    w.openChronicleDeletionConfirmation();
    assert(el('modalDescription').textContent.includes(created.name), 'Confirmação de exclusão identifica a Crônica');
    w.closeModal(); await w.deleteActiveChronicle();
    assert(!await api.getChronicle(created.id) && (await api.listChronicleCastIds(created.id)).length === 0 && !el('chroniclesIndexView').hidden, 'Regressão: excluir Crônica remove vínculos e retorna ao índice');
    await api.deleteChronicle(second.id);
    assert(!await api.getChronicle(second.id) && !await api.getChronicleCover(second.id) && (await api.listChronicleCastIds(second.id)).length === 0, 'Exclusão atômica elimina registro e referências órfãs');

    let largeManager = w.readCharacterManager();
    for (let i = 0; i < 25; i++) {
      const character = w.createEmptyCharacterState();
      character.fields.nome = i === 0 ? 'Personagem com nome extenso para validar quebra e leitura em telas pequenas' : `Personagem de teste ${i + 1}`;
      const id = `character-large-test-${i}`;
      w.writeStoredCharacter(id, character);
      largeManager = w.setCharacterSummary(largeManager, id, await w.createCharacterSummary(character));
    }
    w.writeCharacterManager(largeManager);
    await open(old.id); w.setChronicleDetailSection('cast');
    await wait(() => el('chronicleCastList').querySelectorAll('.chronicle-cast-member').length === 2);
    frame.scrollIntoView({ block: 'start' });
    for (const width of [1440, 768, 390, 320]) {
      frame.width = width;
      await new Promise(resolve => setTimeout(resolve, 80));
      assert(d.documentElement.scrollWidth <= width, `Consulta sem overflow horizontal em ${width}px`);
      await manage();
      assert(d.documentElement.scrollWidth <= width && el('saveChronicleCast').getBoundingClientRect().height >= 44 && d.querySelectorAll('.chronicle-cast-selection-option').length >= 25, `Lista longa, nomes extensos e toque em ${width}px`);
      const selectionList = el('chronicleCastSelectionList');
      assert(selectionList.clientHeight < selectionList.scrollHeight && selectionList.clientHeight <= 560, `Lista tem rolagem própria e ações fora dela em ${width}px`);
      if (width <= 1100) {
        el('cancelChronicleCastManagement').click();
        await wait(() => !el('chronicleCastConsultView').hidden);
        w.openChronicleActions();
        assert(el('chronicleActionsPanel').getAttribute('aria-modal') === 'true', `Ações em bottom sheet em ${width}px`);
        el('manageChronicleCast').click();
        await wait(() => !el('chronicleCastManagerView').hidden);
        el('cancelChronicleCastManagement').click();
        await wait(() => d.activeElement === el('manageChronicleCast'));
        assert(d.activeElement === el('manageChronicleCast'), `Foco volta à ação da própria aba em ${width}px`);
      } else w.closeChronicleCastManagement({ render: true });
      await wait(() => !el('chronicleCastList').hasAttribute('aria-busy'));
    }
    frame.width = 1440;
    assert(el('chronicleTabParticipants') && el('chronicleParticipantForm') && el('confrontationIndex') && d.querySelectorAll('.chronicle-actions-list .chronicle-context-action').length === 3 && el('makeChronicleOnlineAction')?.closest('.chronicle-online-promotion'), 'Elenco, Participantes e Confrontos coexistem; compartilhamento fica fora das três ações globais');
    status.textContent = `Concluído: ${results.children.length} verificações aprovadas. Namespace isolado: ${prefix}`;
  } catch (error) {
    console.error(error);
    status.textContent = `Falha: ${error.message}`;
  } finally {
    db?.close();
    // Scripts já executados não precisam manter suas URLs temporárias.
    urls.forEach(url => URL.revokeObjectURL(url));
    document.getElementById('run').disabled = false;
  }
};
