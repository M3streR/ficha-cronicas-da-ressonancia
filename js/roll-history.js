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
    syncSheetContext(lastDestinations);
  }
  function syncSheetContext(chronicles) {
    const doc=el('quickRollDestination').ownerDocument;
    const heading=doc.getElementById('skill-roll-result') || document.getElementById('skillFilterCount');
    if(!heading)return;
    let host=doc.getElementById('skillRollSharing');
    if(!host){host=doc.createElement('aside');host.id='skillRollSharing';host.className='skill-roll-sharing';heading.before(host);}
    host.hidden=!chronicles.length;host.replaceChildren();if(!chronicles.length)return;
    const label=doc.createElement('label');label.textContent='Compartilhar rolagens';
    const select=doc.createElement('select');select.setAttribute('aria-label','Destino das rolagens de Perícia');
    for(const option of el('quickRollDestination').options)select.append(option.cloneNode(true));
    select.value=destination;select.disabled=busy || !ready;
    select.addEventListener('change',()=>{const canonical=el('quickRollDestination');canonical.value=select.value;canonical.dispatchEvent(new canonical.ownerDocument.defaultView.Event('change',{bubbles:true}));});
    label.append(select);host.append(label);
    const combat=chronicles.find(c=>c.id===destination&&c.confrontationId) || chronicles.find(c=>c.confrontationId);
    if(combat){const back=doc.createElement('a');back.textContent='Voltar ao Confronto';const url=new URL('../index.html',document.baseURI);url.searchParams.set('section','chronicles');url.searchParams.set('chronicle',combat.id.split(':')[1]);url.searchParams.set('storage',combat.id.startsWith('local-combat-roll:')?'local':'online');back.href=url.href;back.target='_top';host.append(back);}
  }
  let lastDestinations=[];
  function setHistoryExpanded(expanded) {
    el('quickDiceHistorySection').hidden = !expanded;
    el('quickDiceHistoryToggle').setAttribute('aria-expanded', String(expanded));
    el('quickDiceHistoryToggle').textContent = expanded ? 'Ocultar histórico de rolagens' : 'Ver histórico de rolagens';
  }
  function close() {
    ++epoch; busy=false; lastDestinations=[]; requestedDestination=''; characterId = null; ready = false; destination = ''; history?.dispose(); history = null;
    el('quickDiceContext').hidden = true; el('quickDiceHistoryControls').hidden = true;
    setHistoryExpanded(false); feedback(''); sync();
  }
  async function open(id) {
    close(); characterId = id; const token = epoch;
    if (!id) return;
    el('quickDiceContext').hidden = true;
    el('quickDiceHistoryControls').hidden = false;
    await restorePending(token);
    if (token !== epoch) return;
    try { destination = global.localStorage.getItem(destinationKey()) || ''; } catch (_) { destination = ''; }
    try {
      const request = JSON.parse(global.sessionStorage.getItem('fichaV2CombatDestination') || 'null');
      if (global.parent?.document?.body?.dataset.screen === 'sheet' && request?.characterId === id && request.userId === accountKey) requestedDestination = request.destination || '';
    } catch (_) { requestedDestination = ''; }
    history = global.RollHistoryView.create({ host: el('quickRollHistory'), storage: services.storage, confirm: services.confirm,
      scope: 'character', ownerId: () => id, canUse: () => token === epoch, compactRows: true });
    await refreshDestinations();
  }
  let lookup = 0;
  let requestedDestination = '';
  let accountKey = 'guest';
  const queueKey = () => 'fichaV2RollPending:' + (global.FichaV2AccountConfig?.projectRef || 'local') + ':' + accountKey;
  const destinationKey = () => 'fichaV2RollDestination:' + (global.FichaV2AccountConfig?.projectRef || 'local') + ':' + accountKey + ':' + characterId;
  function rememberDestination() {
    try { global.localStorage.setItem(destinationKey(), destination); } catch (_) { /* The visible choice still works for this session. */ }
  }
  function persistPending() {
    try { for (const item of pending.values()) global.localStorage.setItem(queueKey()+':'+item.record.id, JSON.stringify(item)); return true; }
    catch (_) { feedback('Não foi possível proteger os envios pendentes neste navegador. Mantenha esta página aberta.'); return false; }
  }
  async function restorePending(token) {
    const user = await global.CronicasSupabase?.getUser?.();
    if (token !== epoch) return;
    accountKey = user?.id || 'guest'; pending.clear();
    try {
      const legacy=JSON.parse(global.localStorage.getItem(queueKey()) || '[]');
      const stored=Object.keys(global.localStorage).filter(key=>key.startsWith(queueKey()+':')).map(key=>JSON.parse(global.localStorage.getItem(key)));
      for(const item of [...legacy,...stored])if(item?.record?.id&&Array.isArray(item.record.result?.rolls))pending.set(item.record.id,item);
      if(legacy.length&&persistPending())global.localStorage.removeItem(queueKey());
    } catch (_) { feedback('Não foi possível recuperar os envios pendentes.'); }
  }
  async function refreshDestinations() {
    if (!characterId) return;
    const token = epoch, request = ++lookup, id = characterId;
    try {
      const chronicles = await services.storage().listCharacterChronicles(id);
      if (token !== epoch || request !== lookup) return;
      const select = el('quickRollDestination');
      if (requestedDestination && chronicles.some(c => c.id === requestedDestination)) {
        destination = requestedDestination; requestedDestination = '';
        global.sessionStorage.removeItem('fichaV2CombatDestination');
      }
      const expired = Boolean(destination && !chronicles.some(c => c.id === destination));
      if (expired) { destination = ''; feedback('O destino anterior não está mais disponível. Confira o compartilhamento antes de rolar.'); }
      rememberDestination();
      select.replaceChildren(new Option('Somente ficha', ''), ...chronicles.map(c => new Option(`${c.confrontationId ? 'Ficha + Confronto' : 'Ficha + Crônica'} — ${c.name}`, c.id)));
      el('quickDiceContext').hidden = chronicles.length === 0;
      const availability = el('quickDiceAvailability');
      if (availability) { availability.hidden = true; availability.textContent = ''; }
      lastDestinations=chronicles; ready = true; sync();
    } catch (_) {
      if (token !== epoch || request !== lookup) return;
      destination = ''; lastDestinations=[]; ready = true;
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
    const token = epoch, identity = accountKey; busy = true; sync();
    try {
      const user = await global.CronicasSupabase?.getUser?.();
      if ((user?.id || 'guest') !== identity) return;
      const result = await services.storage().appendRoll(item.record, item.destination || null);
      if (identity === accountKey) { pending.delete(item.record.id); global.localStorage.removeItem(queueKey()+':'+item.record.id); persistPending(); }
      if (token === epoch && characterId === item.record.characterId) {
        feedback(item.destination && !result.chronicleLinked
          ? 'Salva na ficha. O vínculo com a Crônica não está mais disponível.'
          : (result.online
            ? (result.confrontationId ? 'Rolagem salva na ficha e enviada ao combate.' : 'Rolagem salva na ficha e enviada às Rolagens Livres.')
            : 'Rolagem salva neste navegador.'));
        if (!el('quickDiceHistorySection').hidden) await history?.load();
      }
    } catch (error) {
      if (identity === accountKey) { pending.set(item.record.id, item); persistPending(); }
      if (token === epoch && characterId === item.record.characterId) feedback(error?.localSaved ? 'Salva na ficha. Envio ao Confronto/Crônica pendente. Use Tentar salvar pendentes; os dados não serão rolados novamente.' : 'Rolagem realizada, histórico pendente. Use Tentar salvar pendentes; os dados não serão rolados novamente.');
    } finally { if (identity === accountKey && token === epoch) { busy = false; sync(); } }
  }
  function record(result, context = {}) {
    if (!services.inSheet() || !characterId) return;
    const item = { destination, record: { id: services.createId(), schemaVersion: result.resolution === 'highest' ? 2 : 1, characterId,
      characterName: services.name(), createdAt: new Date().toISOString(), source: 'quick-dice', category: 'expression', resolution: result.resolution || 'sum',
      ...(context.label ? { label: context.label } : {}),
      result: { ...result, rolls: [...result.rolls] } } };
    global.dispatchEvent(new CustomEvent('cronicas:portrait-roll', { detail: item.record }));
    pending.set(item.record.id, item); persistPending(); void commit(item);
  }
  function initialize(dependencies) {
    services = dependencies;
    el('quickRollDestination').addEventListener('change', event => { destination = event.target.value; requestedDestination = ''; global.sessionStorage.removeItem('fichaV2CombatDestination'); rememberDestination(); feedback(''); sync(); });
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
    global.addEventListener('cronicas:auth-change', async () => { const user = await global.CronicasSupabase?.getUser?.(); if ((user?.id || 'guest') !== accountKey) { ++epoch; pending.clear(); characterId = null; ready = false; busy = false; destination = ''; sync(); } });
    for (const name of ['online', 'pageshow']) global.addEventListener(name, () => { if (characterId) void refreshDestinations(); });
    global.document.addEventListener('visibilitychange', () => { if (!global.document.hidden && characterId) void refreshDestinations(); });
    global.addEventListener('beforeunload', event => { if (pending.size || busy) { event.preventDefault(); event.returnValue = ''; } });
  }
  global.RollHistory = Object.freeze({ initialize, open, close, beforeRoll, record, refreshDestinations });
})(window);
