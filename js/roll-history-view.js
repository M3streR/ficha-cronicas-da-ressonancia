(function (global) {
  'use strict';
  function node(tag, text, className = '') { const el = document.createElement(tag); el.textContent = text; el.className = className; return el; }
  function row(record, destinations = []) {
    const item = node('li', '', 'roll-history-row'), summary = node('div', '', 'roll-history-summary');
    const date = new Date(record.createdAt), time = node('time', date.toLocaleString('pt-BR')); time.dateTime = record.createdAt;
    summary.append(node('strong', record.characterName || 'Personagem sem nome'), node('span', record.result.expression), node('b', String(record.result.total)), time);
    const details = node('details', ''); details.append(node('summary', 'Detalhes da rolagem'));
    details.append(node('p', `Dados: ${record.result.rolls.join(', ')} · Soma: ${record.result.diceTotal} · Modificador: ${record.result.modifier >= 0 ? '+' : ''}${record.result.modifier} · Total: ${record.result.total}`));
    if (destinations.length) details.append(node('p', 'Destino vinculado: ' + destinations.map(destination => destination.name).join(', ')));
    item.append(summary, details); return item;
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
