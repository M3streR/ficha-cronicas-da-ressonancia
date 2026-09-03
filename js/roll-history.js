(function (global) {
  'use strict';
  let services, characterId = null, epoch = 0, ready = false, destination = '', busy = false, history;
  const pending = new Map(); // Failed commits retain the original ID/results, never reroll on retry.
  const el = id => document.getElementById(id);
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
    el('quickDiceContext').hidden = false;
    el('quickDiceHistoryControls').hidden = false;
    history = global.RollHistoryView.create({ host: el('quickRollHistory'), storage: services.storage, confirm: services.confirm,
      scope: 'character', ownerId: () => id, canUse: () => token === epoch });
    feedback('Consultando vínculos com Crônicas…');
    try {
      const chronicles = await services.storage().listCharacterChronicles(id);
      if (token !== epoch) return;
      destination = chronicles.length === 1 ? chronicles[0].id : chronicles.length > 1 ? '__choose__' : '';
      {
        const select = el('quickRollDestination'); select.replaceChildren();
        if (chronicles.length > 1) { const option = new Option('Escolha o destino…','__choose__'); option.disabled = true; select.append(option); }
        select.append(new Option('Somente ficha', ''), ...chronicles.map(c => new Option(c.name, c.id)));
      }
      ready = true; feedback(chronicles.length > 1 ? 'Escolha um destino antes de rolar. Nunca enviamos para todas as Crônicas.' : ''); sync();
    } catch (_) {
      if (token !== epoch) return;
      el('quickRollDestination').replaceChildren(new Option('Escolha o destino…', '__choose__'), new Option('Somente ficha', ''));
      destination = '__choose__'; ready = true; sync();
      feedback('Não foi possível consultar o Elenco. Você pode escolher Somente ficha e tentar salvar o histórico.');
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
        feedback(item.destination && !result.chronicleLinked ? 'Salva na ficha. O vínculo com a Crônica não está mais disponível.' : 'Rolagem salva neste navegador.');
        if (!el('quickDiceHistorySection').hidden) await history?.load();
      }
    } catch (_) {
      pending.set(item.record.id, item);
      if (token === epoch && characterId === item.record.characterId) feedback('Rolagem realizada, histórico não salvo. Use Tentar salvar pendentes abaixo. Os resultados não serão rolados novamente.');
    } finally { busy = false; sync(); }
  }
  function record(result) {
    if (!services.inSheet() || !characterId) return;
    const item = { destination, record: { id: services.createId(), schemaVersion: 1, characterId,
      characterName: services.name(), createdAt: new Date().toISOString(), source: 'quick-dice', category: 'expression', resolution: 'sum',
      result: { ...result, rolls: [...result.rolls] } } };
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
  global.RollHistory = Object.freeze({ initialize, open, close, beforeRoll, record });
})(window);
