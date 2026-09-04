(function initializeChronicleFreeRolls(global) {
  'use strict';

  const PAGE_SIZE = 30;
  let currentChronicle = null;
  let nextCursor = null;
  let busy = false;
  let epoch = 0;
  let refreshTimer = null;
  let renderedIds = new Set();

  const el = id => document.getElementById(id);
  const text = value => typeof value === 'string' ? value.trim() : '';
  const node = (tag, className = '', content = '') => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== '') element.textContent = content;
    return element;
  };

  function formatTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    return `${sameDay ? 'hoje' : date.toLocaleDateString('pt-BR')}, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function formatModifier(value) {
    const number = Number(value) || 0;
    return number >= 0 ? `+${number}` : String(number);
  }

  function createRollCard(record) {
    const item = node('li', 'chronicle-free-roll-card');
    item.dataset.rollId = record.id;
    const header = node('header', 'chronicle-free-roll-card-heading');
    const identity = node('div', 'chronicle-free-roll-identity');
    identity.append(node('strong', '', record.characterName || 'Personagem'));
    identity.append(node('span', '', record.categoryLabel || (record.category === 'expression' ? 'Rolagem livre' : record.category || 'Rolagem')));
    const total = node('strong', 'chronicle-free-roll-total', String(record.result?.total ?? 0));
    total.setAttribute('aria-label', `Resultado total ${record.result?.total ?? 0}`);
    header.append(identity, total);

    const expression = node('p', 'chronicle-free-roll-expression', record.result?.expression || 'Expressão não informada');
    const byline = node('p', 'chronicle-free-roll-byline');
    const time = node('time', '', formatTime(record.createdAt));
    time.dateTime = record.createdAt || '';
    byline.append(node('span', '', record.authorName || 'Caçador'), node('span', '', '·'), time);

    const details = node('details', 'chronicle-free-roll-details');
    details.append(node('summary', '', 'Ver detalhes'));
    const grid = node('dl', 'chronicle-free-roll-breakdown');
    const pairs = [
      ['Dados', (record.result?.rolls || []).join(', ') || '—'],
      ['Resultado utilizado', String(record.result?.diceTotal ?? '—')],
      ['Modificador', formatModifier(record.result?.modifier)],
      ['Total', String(record.result?.total ?? 0)]
    ];
    pairs.forEach(([label, value]) => {
      const row = node('div');
      row.append(node('dt', '', label), node('dd', '', value));
      grid.append(row);
    });
    details.append(grid);
    item.append(header, expression, byline, details);
    return item;
  }

  async function listLocal(chronicle, options) {
    const storage = global.getChroniclesStorage?.() || global.ChroniclesStorage;
    if (!storage?.listRollHistory) return { records: [], next: null };
    return storage.listRollHistory('chronicle', chronicle.id, options);
  }

  async function listRolls(chronicle, options) {
    if (chronicle.storage === 'online') {
      return global.ChroniclesOnlineRolls.listChronicleRolls(chronicle.id, { ...options, freeOnly: true });
    }
    return listLocal(chronicle, options);
  }

  function setBusy(value) {
    busy = value;
    const refresh = el('refreshChronicleFreeRolls');
    const more = el('loadMoreChronicleFreeRolls');
    if (refresh) refresh.disabled = value;
    if (more) more.disabled = value;
  }

  async function render(chronicle = currentChronicle, { append = false, announce = false } = {}) {
    if (!chronicle || busy) return false;
    currentChronicle = chronicle;
    const token = ++epoch;
    const list = el('chronicleFreeRollsList');
    const status = el('chronicleFreeRollsStatus');
    const empty = el('chronicleFreeRollsEmpty');
    const more = el('loadMoreChronicleFreeRolls');
    if (!list || !status || !empty || !more) return false;
    setBusy(true);
    status.textContent = append ? 'Carregando mais resultados…' : 'Atualizando resultados…';
    try {
      const result = await listRolls(chronicle, { before: append ? nextCursor : null, limit: PAGE_SIZE });
      if (token !== epoch || currentChronicle?.id !== chronicle.id) return false;
      if (!append) {
        list.replaceChildren();
        renderedIds = new Set();
      }
      let added = 0;
      (result.records || []).forEach(record => {
        if (record.confrontationId || renderedIds.has(record.id)) return;
        renderedIds.add(record.id);
        list.append(createRollCard(record));
        added += 1;
      });
      nextCursor = result.next || null;
      more.hidden = !nextCursor;
      empty.hidden = list.children.length !== 0;
      status.textContent = '';
      if (announce && added) {
        el('chronicleFreeRollsAnnouncement').textContent = `${added === 1 ? 'Uma nova rolagem livre foi recebida' : `${added} novas rolagens livres foram recebidas`}.`;
      }
      return true;
    } catch (error) {
      console.error('[Rolagens Livres] Não foi possível carregar:', error);
      if (token === epoch) status.textContent = 'Não foi possível carregar as Rolagens Livres. Tente atualizar.';
      return false;
    } finally {
      if (token === epoch) setBusy(false);
    }
  }

  function scheduleRealtimeRefresh(payload) {
    if (payload?.new?.confrontation_id || payload?.old?.confrontation_id) return;
    global.clearTimeout(refreshTimer);
    refreshTimer = global.setTimeout(() => {
      const panel = el('chroniclePanelFreeRolls');
      if (currentChronicle?.storage === 'online' && panel && !panel.hidden) {
        void render(currentChronicle, { announce: payload?.eventType === 'INSERT' });
      }
    }, 120);
  }

  function stopRealtime() {
    global.clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  function startRealtime(chronicle) {
    stopRealtime();
    currentChronicle = chronicle || currentChronicle;
  }

  function applyDetailMode(chronicle) {
    currentChronicle = chronicle || null;
    nextCursor = null;
    renderedIds = new Set();
    if (chronicle?.storage === 'online') startRealtime(chronicle);
    else stopRealtime();
  }

  function reset() {
    ++epoch;
    stopRealtime();
    currentChronicle = null;
    nextCursor = null;
    renderedIds = new Set();
    busy = false;
    el('chronicleFreeRollsList')?.replaceChildren();
    if (el('chronicleFreeRollsStatus')) el('chronicleFreeRollsStatus').textContent = '';
    if (el('chronicleFreeRollsAnnouncement')) el('chronicleFreeRollsAnnouncement').textContent = '';
  }

  global.addEventListener('DOMContentLoaded', () => {
    el('refreshChronicleFreeRolls')?.addEventListener('click', () => void render(currentChronicle));
    el('loadMoreChronicleFreeRolls')?.addEventListener('click', () => void render(currentChronicle, { append: true }));
  });
  global.addEventListener('cronicas:auth-change', event => { if (!event.detail?.authenticated) reset(); });
  global.addEventListener('cronicas:online-rolls-change', event => {
    if (event.detail?.chronicleId !== currentChronicle?.remoteId) return;
    scheduleRealtimeRefresh(event.detail?.payload);
  });

  global.ChronicleFreeRolls = Object.freeze({ render, applyDetailMode, reset, startRealtime, stopRealtime });
})(window);
