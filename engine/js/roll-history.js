(function (global) {
  'use strict';
  let services, characterId = null, epoch = 0, ready = false, destination = '', busy = false, history;
  const pending = new Map(); // Failed commits retain the original ID/results, never reroll on retry.
  const el = id => (global.FichaV2QuickDiceDocument || document).getElementById(id);
  function feedback(message) {
    el('quickDiceHistoryFeedback').textContent = message;
  }
  function sync() {
    el('quickRollDestination').value = destination;
    el('quickRollDestination').disabled = !ready || busy;
    el('quickDiceRetry').hidden = ![...pending.values()].some(item => item.record.characterId === characterId);
    el('quickDiceRetry').disabled = busy;
    el('quickDiceForm').querySelector('[type="submit"]').disabled = busy;
  }
  function setHistoryExpanded(expanded) {
    el('quickDiceHistorySection').hidden = !expanded;
    el('quickDiceHistoryToggle').setAttribute('aria-expanded', String(expanded));
    el('quickDiceHistoryToggle').textContent = expanded ? 'Ocultar histórico de rolagens' : 'Ver histórico de rolagens';
  }
  function close() {
    ++epoch; characterId = null; ready = false; destination = ''; history?.dispose(); history = null;
    el('quickDiceContext').hidden = true; el('quickDiceHistoryControls').hidden = true;
    setHistoryExpanded(false); feedback(''); sync();
  }
  async function open(id) {
    close(); characterId = id; const token = epoch;
    if (!id) return;
    el('quickDiceContext').hidden = true;
    el('quickDiceHistoryControls').hidden = false;
    history = global.RollHistoryView.create({ host: el('quickRollHistory'), storage: services.storage, confirm: services.confirm,
      scope: 'character', ownerId: () => id, canUse: () => token === epoch, compactRows: true });
    await refreshDestinations();
  }
  let lookup = 0;
  async function refreshDestinations() {
    if (!characterId) return;
    const token = epoch, request = ++lookup, id = characterId;
    try {
      const chronicles = await services.storage().listCharacterChronicles(id);
      if (token !== epoch || request !== lookup) return;
      const select = el('quickRollDestination');
      if (!chronicles.some(c => c.id === destination)) destination = '';
      select.replaceChildren(new Option('Somente ficha', ''), ...chronicles.map(c => new Option(`Ficha + Crônica — ${c.name}`, c.id)));
      el('quickDiceContext').hidden = chronicles.length === 0;
      const availability = el('quickDiceAvailability');
      if (availability) { availability.hidden = !global.FichaV2QuickDiceDocument; availability.textContent = 'Crônicas Online indisponíveis neste ambiente de testes. Vínculos locais são utilizados quando existentes.'; }
      ready = true; sync();
    } catch (_) {
      if (token !== epoch || request !== lookup) return;
      destination = ''; ready = true;
      el('quickRollDestination').replaceChildren(new Option('Somente ficha', ''));
      el('quickDiceContext').hidden = true;
      const availability = el('quickDiceAvailability');
      if (availability) { availability.hidden = false; availability.textContent = 'Não foi possível verificar os vínculos. A rolagem será mantida somente nesta ficha.'; }
      sync();
    }
  }

  function beforeRoll() {
    if (!services.inSheet()) return true;
    if (!characterId || !ready || destination === '__choose__' || busy) {
      const message = busy ? 'Aguarde o registro da rolagem anterior.' : !characterId ? 'Abra um personagem salvo para registrar rolagens.' : 'Escolha o destino da rolagem no Rolador Rápido.';
      feedback(message); services.notify(message, 'error'); return false;
    }
    return true;
  }
  async function commit(item) {
    const token = epoch; busy = true; sync();
    try {
      const result = await services.storage().appendRoll(item.record, item.destination || null);
      pending.delete(item.record.id);
      if (token === epoch && characterId === item.record.characterId) {
        feedback(item.destination && !result.chronicleLinked
          ? 'Salva na ficha. O vínculo com a Crônica não está mais disponível.'
          : (result.online
            ? (result.confrontationId ? 'Rolagem salva na ficha e enviada ao combate.' : 'Rolagem salva na ficha e enviada às Rolagens Livres.')
            : 'Rolagem salva neste navegador.'));
        if (!el('quickDiceHistorySection').hidden) await history?.load();
      }
    } catch (_) {
      pending.set(item.record.id, item);
      if (token === epoch && characterId === item.record.characterId) feedback('Rolagem realizada, histórico não salvo. Use Tentar salvar pendentes abaixo. Os resultados não serão rolados novamente.');
    } finally { busy = false; sync(); }
  }
  function record(result, context = {}) {
    if (!services.inSheet() || !characterId) return;
    const item = { destination, record: { id: services.createId(), schemaVersion: result.resolution === 'highest' ? 2 : 1, characterId,
      characterName: services.name(), createdAt: new Date().toISOString(), source: 'quick-dice', category: 'expression', resolution: result.resolution || 'sum',
      ...(context.label ? { label: context.label } : {}),
      result: { ...result, rolls: [...result.rolls] } } };
    global.dispatchEvent(new CustomEvent('cronicas:portrait-roll', { detail: item.record }));
    pending.set(item.record.id, item); void commit(item);
  }
  function initialize(dependencies) {
    services = dependencies;
    el('quickRollDestination').addEventListener('change', event => { destination = event.target.value; feedback(''); sync(); });
    el('quickDiceHistoryToggle').addEventListener('click', () => {
      if (!characterId || !services.inSheet()) return;
      const expanded = el('quickDiceHistorySection').hidden;
      setHistoryExpanded(expanded);
      if (expanded) void history?.load();
    });
    el('quickDiceRetry').addEventListener('click', async () => {
      if (busy) return;
      const id = characterId;
      for (const item of [...pending.values()].filter(item => item.record.characterId === id)) await commit(item);
    });
    global.addEventListener('beforeunload', event => { if (pending.size || busy) { event.preventDefault(); event.returnValue = ''; } });
  }
  global.RollHistory = Object.freeze({ initialize, open, close, beforeRoll, record, refreshDestinations });
})(window);
