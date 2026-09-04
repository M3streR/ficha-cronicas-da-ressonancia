(function (global) {
  'use strict';

  function ensureFinalPolishStyles() {
    if (document.querySelector('link[data-final-polish]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/final-polish.css?v=2026-09-04-final-polish-1';
    link.dataset.finalPolish = 'true';
    document.head.append(link);
  }

  function installEntryGate() {
    if (document.querySelector('.site-entry-gate')) return;
    const gate = document.createElement('section');
    gate.className = 'site-entry-gate';
    gate.setAttribute('aria-label', 'Entrada de Crônicas da Ressonância');
    gate.innerHTML = `
      <div class="site-entry-card">
        <span class="site-entry-kicker">Arquivo da Ressonância</span>
        <h1 class="site-entry-title">Crônicas da Ressonância</h1>
        <button class="site-entry-button" type="button">Entrar</button>
      </div>`;

    document.body.classList.add('site-entry-locked');
    document.body.append(gate);

    const enter = gate.querySelector('.site-entry-button');
    enter.addEventListener('click', () => {
      gate.classList.add('is-leaving');
      document.body.classList.remove('site-entry-locked');
      window.setTimeout(() => gate.remove(), 340);
    }, { once: true });
  }

  ensureFinalPolishStyles();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installEntryGate, { once: true });
  } else {
    installEntryGate();
  }

  function node(tag, text, className = '') { const el = document.createElement(tag); el.textContent = text; el.className = className; return el; }
  function row(record, destinations = []) {
    const item = node('li', '', 'roll-history-row');
    const summary = node('div', '', 'roll-history-summary');
    const character = node('strong', record.characterName || 'Personagem sem nome', 'roll-history-character');
    const expression = node('span', record.result.expression, 'roll-history-expression');
    const total = node('b', String(record.result.total), 'roll-history-total');
    const date = new Date(record.createdAt);
    const time = node('time', date.toLocaleString('pt-BR'), 'roll-history-time');
    time.dateTime = record.createdAt;
    summary.append(character, expression, total, time);

    const details = node('details', '');
    details.append(node('summary', 'Ver detalhes'));
    details.append(node('p', `Dados: ${record.result.rolls.join(', ')} · Soma: ${record.result.diceTotal} · Modificador: ${record.result.modifier >= 0 ? '+' : ''}${record.result.modifier} · Total: ${record.result.total}`, 'roll-history-detail'));
    if (destinations.length) details.append(node('p', 'Destino vinculado: ' + destinations.map(destination => destination.name).join(', '), 'roll-history-detail'));
    item.append(summary, details);
    return item;
  }
  function create({ host, storage, confirm, scope, ownerId, canUse = () => true, limit = 50, compact = false }) {
    let epoch = 0, next = null, busy = false;
    const list = node('ol', '', 'roll-history-list'), status = node('p', '', 'roll-history-status'); status.setAttribute('role', 'status');
    const controls = node('div', '', 'roll-history-controls');
    const more = node('button', 'Carregar mais', 'btn secondary'); more.type = 'button'; more.hidden = true;
    const refresh = node('button', 'Atualizar', 'btn secondary'); refresh.type = 'button';
    const clear = node('button', 'Limpar este histórico', 'btn secondary'); clear.type = 'button';
    const filters = node('div', '', 'roll-history-filters');
    const character = document.createElement('select'); character.setAttribute('aria-label', 'Filtrar por personagem');
    character.append(new Option('Todos os personagens', ''));
    const category = document.createElement('select'); category.setAttribute('aria-label', 'Filtrar por categoria');
    category.append(new Option('Todas as categorias', ''), new Option('Expressão livre', 'expression'));
    if (scope === 'chronicle' && !compact) filters.append(character, category);
    if (!compact) controls.append(refresh, more, clear);
    host.replaceChildren(filters, status, list, controls);
    function setBusy(value) { busy = value; controls.querySelectorAll('button').forEach(el => el.disabled = value); }
    async function load(append = false) {
      if (!canUse()) return;
      const token = ++epoch; setBusy(true); status.textContent = 'Carregando histórico…';
      try {
        const [result, actors] = await Promise.all([
          storage().listRollHistory(scope, ownerId(), { before: append ? next : null, limit, characterId: character.value, category: category.value, includeDestinations: scope === 'character' }),
          scope === 'chronicle' && !compact && !append ? storage().listRollActors(scope, ownerId()) : Promise.resolve(null)
        ]);
        if (token !== epoch || !canUse()) return;
        if (!append) list.replaceChildren();
        if (actors) {
          const selected = character.value;
          character.replaceChildren(new Option('Todos os personagens', ''), ...actors.map(actor => new Option(actor.name || 'Sem nome', actor.id)));
          if (selected && !actors.some(actor => actor.id === selected)) character.append(new Option('Personagem sem resultados', selected));
          character.value = selected;
        }
        list.append(...result.records.map(record => row(record, result.destinations?.[record.id]))); next = result.next; more.hidden = !next;
        const known = new Set([...character.options].map(option => option.value));
        for (const record of result.records) if (!known.has(record.characterId)) { character.append(new Option(record.characterName || 'Sem nome', record.characterId)); known.add(record.characterId); }
        status.textContent = list.children.length ? '' : 'Nenhuma rolagem neste histórico.';
      } catch (_) { if (token === epoch && canUse()) status.textContent = 'Não foi possível carregar o histórico. Tente atualizar.'; }
      finally { if (token === epoch) setBusy(false); }
    }
    clear.addEventListener('click', () => {
      if (busy || !canUse()) return;
      const token = epoch, id = ownerId();
      confirm({ title: 'Limpar este histórico?', content: 'Remove todas as referências deste histórico, incluindo resultados fora do filtro. Os históricos de outros locais permanecem intactos.', actions: [
        { label: 'Cancelar', className: 'secondary' }, { label: 'Limpar histórico', className: 'danger', onClick: async () => {
          if (token !== epoch || !canUse() || busy) return;
          setBusy(true);
          try { await storage().clearRollHistory(scope, id); if (token === epoch && canUse()) { character.replaceChildren(new Option('Todos os personagens', '')); await load(); } }
          catch (_) { if (token === epoch && canUse()) status.textContent = 'Não foi possível limpar. O histórico foi preservado.'; }
          finally { if (token === epoch) setBusy(false); }
        } }
      ] });
    });
    more.addEventListener('click', () => void load(true)); refresh.addEventListener('click', () => void load());
    character.addEventListener('change', () => void load()); category.addEventListener('change', () => void load());
    return { load, get busy() { return busy; }, dispose() { ++epoch; host.replaceChildren(); } };
  }
  global.RollHistoryView = Object.freeze({ create, row });
})(window);
