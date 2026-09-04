(function initializeChroniclesOnlineCombat(global) {
  'use strict';

  const ONLINE_PREFIX = 'online:';
  let directoryCache = { entries: [], byId: new Map(), unavailable: false };
  let snapshotCache = new Map();
  let currentChronicle = null;
  let realtimeChannel = null;
  let refreshTimer = null;
  let selectedOwnCharacterId = '';
  let pending = false;

  const text = value => typeof value === 'string' ? value.trim() : '';
  const isOnlineId = id => typeof id === 'string' && id.startsWith(ONLINE_PREFIX);
  const remoteChronicleId = id => isOnlineId(id) ? id.slice(ONLINE_PREFIX.length) : id;
  const iso = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date(0).toISOString();
  const node = (tag, className = '', content = '') => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== '') element.textContent = content;
    return element;
  };

  async function context() {
    const auth = global.CronicasSupabase;
    if (!auth) throw new Error('ONLINE_AUTH_UNAVAILABLE');
    await auth.ready;
    const user = await auth.getUser();
    if (!user) throw new Error('ONLINE_AUTH_REQUIRED');
    return { auth, user, client: auth.client };
  }

  function normalizeConfrontation(row) {
    if (!row) return null;
    return {
      id: row.id,
      chronicleId: `${ONLINE_PREFIX}${row.chronicle_id}`,
      name: text(row.name) || 'Confronto',
      description: typeof row.description === 'string' ? row.description : '',
      active: row.active === true,
      combatRound: Math.max(1, Number(row.combat_round) || 1),
      combatTurn: Math.max(0, Number(row.combat_turn) || 0),
      initiativeOrder: Array.isArray(row.initiative_order) ? row.initiative_order : [],
      startedAt: row.started_at || null,
      endedAt: row.ended_at || null,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at)
    };
  }

  function normalizeAdversary(row) {
    if (!row) return null;
    const result = {
      id: row.id,
      confrontationId: row.confrontation_id,
      name: text(row.name) || 'Adversário',
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at)
    };
    if (row.pv_current !== null && row.pv_current !== undefined) result.pvCurrent = Number(row.pv_current);
    if (row.pv_max !== null && row.pv_max !== undefined) result.pvMax = Number(row.pv_max);
    if (row.defense !== null && row.defense !== undefined) result.defense = Number(row.defense);
    return result;
  }

  async function listConfrontations(chronicleId) {
    const { client } = await context();
    const { data, error } = await client
      .from('chronicle_confrontations')
      .select('id, chronicle_id, name, description, active, combat_round, combat_turn, initiative_order, started_at, ended_at, created_at, updated_at')
      .eq('chronicle_id', remoteChronicleId(chronicleId))
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeConfrontation).filter(Boolean);
  }

  async function getConfrontation(id) {
    const { client } = await context();
    const { data, error } = await client
      .from('chronicle_confrontations')
      .select('id, chronicle_id, name, description, active, combat_round, combat_turn, initiative_order, started_at, ended_at, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('CONFRONTATION_NOT_FOUND');
    return normalizeConfrontation(data);
  }

  async function createConfrontation(chronicleId, input, composition = null) {
    const { client } = await context();
    const characterIds = Array.isArray(composition?.characterIds) ? composition.characterIds : [];
    const adversaries = Array.isArray(composition?.adversaries) ? composition.adversaries : [];
    const { data, error } = await client.rpc('create_chronicle_confrontation', {
      p_chronicle_id: remoteChronicleId(chronicleId),
      p_name: text(input?.name),
      p_description: typeof input?.description === 'string' ? input.description.trim() : '',
      p_character_ids: characterIds,
      p_adversaries: adversaries
    });
    if (error) throw error;
    return getConfrontation(data);
  }

  async function updateConfrontation(id, input, options = {}) {
    const { client } = await context();
    const { data, error } = await client.rpc('update_chronicle_confrontation', {
      p_confrontation_id: id,
      p_name: text(input?.name),
      p_description: typeof input?.description === 'string' ? input.description.trim() : '',
      p_expected_updated_at: options.expectedUpdatedAt || null
    });
    if (error) throw error;
    return getConfrontation(data);
  }

  async function deleteConfrontation(id, options = {}) {
    const { client } = await context();
    const { data, error } = await client.rpc('delete_chronicle_confrontation', {
      p_confrontation_id: id,
      p_expected_updated_at: options.expectedUpdatedAt || null
    });
    if (error) throw error;
    return Boolean(data);
  }

  async function setConfrontationActive(id, active, options = {}) {
    const { client } = await context();
    const { data, error } = await client.rpc('set_chronicle_confrontation_active', {
      p_confrontation_id: id,
      p_active: Boolean(active),
      p_expected_updated_at: options.expectedUpdatedAt || null
    });
    if (error) throw error;
    return getConfrontation(data);
  }

  async function listConfrontationCharacterIds(id) {
    const { client } = await context();
    const { data, error } = await client
      .from('confrontation_character_links')
      .select('character_id')
      .eq('confrontation_id', id);
    if (error) throw error;
    return (data || []).map(row => row.character_id);
  }

  async function replaceConfrontationCharacters(id, characterIds, options = {}) {
    const { client } = await context();
    const { data, error } = await client.rpc('replace_confrontation_characters', {
      p_confrontation_id: id,
      p_character_ids: characterIds || [],
      p_expected_character_ids: options.expectedCharacterIds || []
    });
    if (error) throw error;
    return Boolean(data);
  }

  async function listConfrontationAdversaries(id) {
    const { client } = await context();
    const { data, error } = await client
      .from('confrontation_adversaries')
      .select('id, confrontation_id, name, pv_current, pv_max, defense, created_at, updated_at')
      .eq('confrontation_id', id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(normalizeAdversary).filter(Boolean);
  }

  function adversaryPayload(input) {
    const payload = { name: text(input?.name) };
    if (input?.pvCurrent !== undefined) payload.pv_current = Number(input.pvCurrent);
    if (input?.pvMax !== undefined) payload.pv_max = Number(input.pvMax);
    if (input?.defense !== undefined) payload.defense = Number(input.defense);
    return payload;
  }

  async function createConfrontationAdversary(id, input) {
    const { client } = await context();
    const { data, error } = await client
      .from('confrontation_adversaries')
      .insert({ confrontation_id: id, ...adversaryPayload(input) })
      .select('id, confrontation_id, name, pv_current, pv_max, defense, created_at, updated_at')
      .single();
    if (error) throw error;
    return normalizeAdversary(data);
  }

  async function updateConfrontationAdversary(_confrontationId, adversaryId, input, options = {}) {
    const { client } = await context();
    let query = client.from('confrontation_adversaries').update(adversaryPayload(input)).eq('id', adversaryId);
    if (options.expectedUpdatedAt) query = query.eq('updated_at', options.expectedUpdatedAt);
    const { data, error } = await query
      .select('id, confrontation_id, name, pv_current, pv_max, defense, created_at, updated_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('ADVERSARY_UPDATE_CONFLICT');
    return normalizeAdversary(data);
  }

  async function deleteConfrontationAdversary(_confrontationId, adversaryId, options = {}) {
    const { client } = await context();
    let query = client.from('confrontation_adversaries').delete().eq('id', adversaryId);
    if (options.expectedUpdatedAt) query = query.eq('updated_at', options.expectedUpdatedAt);
    const { data, error } = await query.select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('ADVERSARY_UPDATE_CONFLICT');
    return true;
  }

  async function loadCastDirectory(chronicleId) {
    const { client } = await context();
    const remoteId = remoteChronicleId(chronicleId);
    const { data: links, error: linksError } = await client
      .from('chronicle_cast_members')
      .select('character_id, created_at')
      .eq('chronicle_id', remoteId)
      .order('created_at', { ascending: true });
    if (linksError) throw linksError;
    const ids = (links || []).map(row => row.character_id);
    if (!ids.length) {
      directoryCache = { entries: [], byId: new Map(), unavailable: false };
      snapshotCache = new Map();
      return [];
    }
    const { data: characters, error: characterError } = await client
      .from('online_characters')
      .select('id, owner_id, source_local_id, name, level, class_name, signature, thumbnail, snapshot, updated_at')
      .in('id', ids);
    if (characterError) throw characterError;
    const rawById = new Map((characters || []).map(row => [row.id, row]));
    const entries = ids.map((id, managerIndex) => {
      const row = rawById.get(id);
      if (!row) return null;
      return {
        id: row.id,
        ownerId: row.owner_id,
        sourceLocalId: row.source_local_id,
        name: text(row.name) || 'Personagem',
        level: Number(row.level) || 1,
        className: text(row.class_name),
        signature: text(row.signature),
        thumbnail: text(row.thumbnail),
        managerIndex,
        updatedAt: row.updated_at
      };
    }).filter(Boolean);
    directoryCache = { entries, byId: new Map(entries.map(entry => [entry.id, entry])), unavailable: false };
    snapshotCache = new Map((characters || []).map(row => [row.id, row.snapshot || {}]));
    return ids;
  }

  async function listChronicleCastIds(chronicleId) {
    return loadCastDirectory(chronicleId);
  }

  function directory() {
    return directoryCache;
  }

  function readCharacter(id) {
    return snapshotCache.get(id) || null;
  }

  async function fetchFullConfrontation(id) {
    const [record, characterIds, adversaries] = await Promise.all([
      getConfrontation(id),
      listConfrontationCharacterIds(id),
      listConfrontationAdversaries(id)
    ]);
    await loadCastDirectory(record.chronicleId);
    return { record, characterIds, adversaries };
  }

  async function saveInitiative(id, order, expectedUpdatedAt) {
    const { client } = await context();
    const { data, error } = await client.rpc('set_confrontation_initiative', {
      p_confrontation_id: id,
      p_order: order,
      p_expected_updated_at: expectedUpdatedAt
    });
    if (error) throw error;
    return getConfrontation(data);
  }

  async function stepTurn(id, direction, expectedUpdatedAt) {
    const { client } = await context();
    const { data, error } = await client.rpc('step_confrontation_turn', {
      p_confrontation_id: id,
      p_direction: direction,
      p_expected_updated_at: expectedUpdatedAt
    });
    if (error) throw error;
    return getConfrontation(data);
  }

  function ensureActiveHost() {
    const panel = document.getElementById('chroniclePanelEncounters');
    if (!panel) return null;
    let host = document.getElementById('onlineCombatHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'onlineCombatHost';
      host.className = 'online-combat-host';
      host.hidden = true;
      panel.appendChild(host);
    }
    return host;
  }

  function setIndexVisible(visible) {
    const ids = ['confrontationIndexFeedback', 'confrontationEmpty', 'confrontationIndex'];
    ids.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.hidden = !visible;
    });
    const heading = document.querySelector('#chroniclePanelEncounters .confrontation-index-heading');
    if (heading) heading.hidden = !visible;
  }

  function portrait(entry, className = 'online-combat-portrait') {
    const shell = node('span', className);
    if (entry?.thumbnail) {
      const img = document.createElement('img');
      img.src = entry.thumbnail; img.alt = '';
      shell.append(img);
    } else {
      shell.append(node('span', '', text(entry?.name).charAt(0).toUpperCase() || '◇'));
    }
    return shell;
  }

  function characterResources(id) {
    const fields = readCharacter(id)?.fields || {};
    const value = key => fields[key] !== undefined && fields[key] !== null && String(fields[key]).trim() !== '' ? fields[key] : null;
    return {
      pv: value('pvAtual') !== null && value('pvMax') !== null ? `${value('pvAtual')} / ${value('pvMax')}` : '—',
      pn: value('pnAtual') !== null && value('pnMax') !== null ? `${value('pnAtual')} / ${value('pnMax')}` : '—',
      ps: value('psAtual') !== null && value('psMax') !== null ? `${value('psAtual')} / ${value('psMax')}` : '—'
    };
  }

  function combatantMap(full) {
    const map = new Map();
    full.characterIds.forEach(id => {
      const entry = directoryCache.byId.get(id);
      map.set(`character:${id}`, { kind: 'character', id, name: entry?.name || 'Personagem', entry });
    });
    full.adversaries.forEach(enemy => map.set(`adversary:${enemy.id}`, { kind: 'adversary', id: enemy.id, name: enemy.name, adversary: enemy }));
    return map;
  }

  function normalizedInitiative(full) {
    const map = combatantMap(full);
    const seen = new Set();
    const result = [];
    (full.record.initiativeOrder || []).forEach(item => {
      const key = `${item.kind}:${item.id}`;
      if (!map.has(key) || seen.has(key)) return;
      seen.add(key);
      result.push({ kind: item.kind, id: item.id, initiative: Number(item.initiative) || 0 });
    });
    map.forEach(item => {
      const key = `${item.kind}:${item.id}`;
      if (!seen.has(key)) result.push({ kind: item.kind, id: item.id, initiative: 0 });
    });
    return result;
  }

  function detailPanel(full, user, owner = false) {
    const panel = node('aside', 'online-combat-focus');
    if (owner) {
      const order = normalizedInitiative(full);
      const activeItem = order[Math.min(full.record.combatTurn, Math.max(order.length - 1, 0))];
      const target = activeItem ? combatantMap(full).get(`${activeItem.kind}:${activeItem.id}`) : null;
      panel.append(node('span', 'chronicles-kicker', 'Controle de turno'));
      panel.append(node('h3', '', target ? target.name : 'Combatente atual'));
      if (target?.kind === 'adversary') {
        const enemy = target.adversary;
        const card = node('article', 'online-combat-enemy-control');
        card.append(node('p', 'online-combat-muted', enemy.defense !== undefined ? `DEF ${enemy.defense}` : 'DEF não informada'));
        if (enemy.pvMax !== undefined) {
          const label = node('label', 'online-combat-enemy-pv');
          label.append(node('span', '', 'PV atual'));
          const input = document.createElement('input'); input.type='number'; input.min='0'; input.max=String(enemy.pvMax); input.step='1'; input.value=String(enemy.pvCurrent ?? 0);
          label.append(input, node('span', '', `/ ${enemy.pvMax}`)); card.append(label);
          const save = node('button', 'btn', 'Salvar PV'); save.type='button'; save.disabled=pending;
          save.addEventListener('click', async () => {
            if (pending) return;
            pending = true;
            try {
              await updateConfrontationAdversary(full.record.id, enemy.id, { name: enemy.name, pvCurrent: Math.max(0, Math.min(enemy.pvMax, Number.parseInt(input.value,10) || 0)), pvMax: enemy.pvMax, ...(enemy.defense !== undefined ? { defense: enemy.defense } : {}) }, { expectedUpdatedAt: enemy.updatedAt });
              await render(currentChronicle);
            } catch (_) {
              global.showNotification?.('Não foi possível atualizar o PV do adversário.', 'error');
              await render(currentChronicle);
            } finally { pending = false; }
          });
          card.append(save);
        } else card.append(node('p','online-combat-muted','Este adversário não possui PV configurado.'));
        panel.append(card);
      } else if (target?.kind === 'character') {
        const resources = characterResources(target.id);
        const card = node('article','online-combat-sheet-card');
        const identity = node('div','online-combat-sheet-identity');
        identity.append(portrait(target.entry,'online-combat-sheet-portrait'));
        const copy=node('div'); copy.append(node('strong','',target.name),node('span','online-combat-muted',[target.entry?.className,`Nível ${target.entry?.level || 1}`,target.entry?.signature].filter(Boolean).join(' · '))); identity.append(copy); card.append(identity);
        const grid=node('div','online-combat-resource-grid');
        [['PV',resources.pv],['PN',resources.pn],['PS',resources.ps]].forEach(([label,value])=>{const item=node('div','online-combat-resource');item.append(node('small','',label),node('strong','',value));grid.append(item);});
        card.append(grid,node('p','online-combat-muted','Recursos da última sincronização da ficha.')); panel.append(card);
      } else panel.append(node('p','online-combat-muted','Defina a iniciativa para começar a acompanhar o turno atual.'));
      return panel;
    }
    const own = full.characterIds
      .map(id => directoryCache.byId.get(id))
      .filter(entry => entry?.ownerId === user.id);
    panel.append(node('span', 'chronicles-kicker', own.length ? 'Suas fichas' : 'Leitura de batalha'));
    const title = node('h3', '', own.length ? 'Seu espaço no combate' : 'Acompanhe o Confronto');
    panel.append(title);
    if (!own.length) {
      panel.append(node('p', 'online-combat-muted', 'Você acompanha a ordem de iniciativa e o turno atual. Nenhuma ficha sua participa deste Confronto.'));
      return panel;
    }
    if (!selectedOwnCharacterId || !own.some(entry => entry.id === selectedOwnCharacterId)) selectedOwnCharacterId = own[0].id;
    const chooser = node('div', 'online-combat-own-tabs');
    own.forEach(entry => {
      const button = node('button', entry.id === selectedOwnCharacterId ? 'is-active' : '', entry.name);
      button.type = 'button';
      button.addEventListener('click', () => { selectedOwnCharacterId = entry.id; void render(currentChronicle); });
      chooser.append(button);
    });
    panel.append(chooser);
    const current = own.find(entry => entry.id === selectedOwnCharacterId) || own[0];
    const card = node('article', 'online-combat-sheet-card');
    const identity = node('div', 'online-combat-sheet-identity');
    identity.append(portrait(current, 'online-combat-sheet-portrait'));
    const copy = node('div');
    copy.append(node('strong', '', current.name));
    copy.append(node('span', 'online-combat-muted', [current.className, `Nível ${current.level}`, current.signature].filter(Boolean).join(' · ')));
    identity.append(copy); card.append(identity);
    const resources = characterResources(current.id);
    const grid = node('div', 'online-combat-resource-grid');
    [['PV', resources.pv], ['PN', resources.pn], ['PS', resources.ps]].forEach(([label, value]) => {
      const item = node('div', 'online-combat-resource');
      item.append(node('small', '', label), node('strong', '', value)); grid.append(item);
    });
    card.append(grid);
    card.append(node('p', 'online-combat-muted', 'Os valores exibidos vêm da última sincronização da sua ficha online.'));
    panel.append(card);
    return panel;
  }

  function currentCombatantLabel(full) {
    const order = normalizedInitiative(full);
    if (!order.length) return 'Sem iniciativa definida';
    const item = order[Math.min(full.record.combatTurn, order.length - 1)];
    const target = combatantMap(full).get(`${item.kind}:${item.id}`);
    return target?.name || 'Combatente';
  }

  function ownerControls(full) {
    const controls = node('div', 'online-combat-owner-controls');
    const previous = node('button', 'btn secondary', '← Turno anterior'); previous.type = 'button';
    const next = node('button', 'btn', 'Próximo turno →'); next.type = 'button';
    const end = node('button', 'btn danger', 'Encerrar combate'); end.type = 'button';
    [previous, next, end].forEach(button => { button.disabled = pending; });
    previous.addEventListener('click', () => void performTurn(full, -1));
    next.addEventListener('click', () => void performTurn(full, 1));
    end.addEventListener('click', () => {
      if (!global.confirm(`Encerrar “${full.record.name}”? A composição continuará salva para uso futuro.`)) return;
      void endCombat(full);
    });
    controls.append(previous, next, end);
    return controls;
  }

  async function performTurn(full, direction) {
    if (pending) return;
    pending = true;
    try {
      await stepTurn(full.record.id, direction, full.record.updatedAt);
      await render(currentChronicle);
    } catch (error) {
      global.showNotification?.('Não foi possível alterar o turno. O combate pode ter sido atualizado em outra tela.', 'error');
      await render(currentChronicle);
    } finally { pending = false; }
  }

  async function endCombat(full) {
    if (pending) return;
    pending = true;
    try {
      await setConfrontationActive(full.record.id, false, { expectedUpdatedAt: full.record.updatedAt });
      global.showNotification?.('Confronto encerrado. A composição foi preservada.');
      await render(currentChronicle);
    } catch (error) {
      global.showNotification?.('Não foi possível encerrar o Confronto.', 'error');
      await render(currentChronicle);
    } finally { pending = false; }
  }

  async function saveInitiativeFromUI(full, host) {
    if (pending) return;
    const rows = [...host.querySelectorAll('[data-online-initiative-row]')];
    const order = rows.map(row => ({
      kind: row.dataset.kind,
      id: row.dataset.id,
      initiative: Number.parseInt(row.querySelector('input')?.value, 10) || 0
    })).sort((a, b) => b.initiative - a.initiative);
    pending = true;
    try {
      await saveInitiative(full.record.id, order, full.record.updatedAt);
      global.showNotification?.('Ordem de iniciativa atualizada.');
      await render(currentChronicle);
    } catch (error) {
      global.showNotification?.('Não foi possível salvar a iniciativa. Recarreguei o estado mais recente.', 'error');
      await render(currentChronicle);
    } finally { pending = false; }
  }

  function initiativeBoard(full, owner) {
    const board = node('section', 'online-combat-initiative');
    const heading = node('header', 'online-combat-section-heading');
    const headingCopy = node('div');
    headingCopy.append(node('span', 'chronicles-kicker', 'Ordem de ação'), node('h3', '', 'Iniciativa'));
    heading.append(headingCopy);
    if (owner) {
      const save = node('button', 'btn secondary', 'Salvar iniciativa'); save.type = 'button';
      save.addEventListener('click', () => void saveInitiativeFromUI(full, board));
      heading.append(save);
    }
    board.append(heading);
    const order = normalizedInitiative(full);
    const map = combatantMap(full);
    const list = node('ol', 'online-combat-initiative-list');
    order.forEach((item, index) => {
      const target = map.get(`${item.kind}:${item.id}`);
      if (!target) return;
      const row = node('li', 'online-combat-initiative-row');
      row.dataset.onlineInitiativeRow = 'true'; row.dataset.kind = item.kind; row.dataset.id = item.id;
      if (index === full.record.combatTurn) row.classList.add('is-current');
      const turn = node('span', 'online-combat-turn-index', String(index + 1).padStart(2, '0'));
      const visual = target.kind === 'character' ? portrait(target.entry) : node('span', 'online-combat-portrait is-enemy', '◆');
      const identity = node('div', 'online-combat-initiative-identity');
      identity.append(node('strong', '', target.name));
      if (target.kind === 'character') {
        const resources = characterResources(target.id);
        identity.append(node('small', '', `PV ${resources.pv}`));
      } else {
        const enemy = target.adversary;
        identity.append(node('small', '', enemy.pvMax !== undefined ? `PV ${enemy.pvCurrent} / ${enemy.pvMax}${enemy.defense !== undefined ? ` · DEF ${enemy.defense}` : ''}` : (enemy.defense !== undefined ? `DEF ${enemy.defense}` : 'Adversário')));
      }
      const score = owner ? document.createElement('input') : node('strong', 'online-combat-initiative-score', String(item.initiative || 0));
      if (owner) {
        score.type = 'number'; score.min = '-999'; score.max = '999'; score.step = '1'; score.value = String(item.initiative || 0); score.className = 'online-combat-initiative-input'; score.setAttribute('aria-label', `Iniciativa de ${target.name}`);
      }
      row.append(turn, visual, identity, score); list.append(row);
    });
    board.append(list);
    return board;
  }

  function renderActiveCombat(full, chronicle, user) {
    const host = ensureActiveHost();
    if (!host) return;
    host.replaceChildren(); host.hidden = false; setIndexVisible(false);
    const owner = chronicle.role === 'owner';
    const header = node('header', 'online-combat-header');
    const copy = node('div', 'online-combat-title');
    copy.append(node('span', 'chronicles-kicker', owner ? 'Controle do Mestre · combate ativo' : 'Confronto em andamento'));
    copy.append(node('h2', '', full.record.name));
    if (full.record.description) copy.append(node('p', '', full.record.description));
    header.append(copy);
    const status = node('div', 'online-combat-status');
    const round = node('div'); round.append(node('small', '', 'Rodada'), node('strong', '', String(full.record.combatRound)));
    const turn = node('div'); turn.append(node('small', '', 'Turno atual'), node('strong', '', currentCombatantLabel(full)));
    status.append(round, turn); header.append(status);
    if (owner) header.append(ownerControls(full));
    host.append(header);
    const layout = node('div', 'online-combat-layout');
    layout.append(initiativeBoard(full, owner), detailPanel(full, user, owner));
    host.append(layout);
  }

  async function render(chronicle = currentChronicle) {
    if (!chronicle || chronicle.storage !== 'online') return false;
    currentChronicle = chronicle;
    const host = ensureActiveHost();
    if (!host) return true;
    try {
      const { user } = await context();
      const records = await listConfrontations(chronicle.id);
      const active = records.find(item => item.active);
      if (!active) {
        host.replaceChildren(); host.hidden = true; setIndexVisible(true);
        await global.ConfrontationsUI?.renderIndex();
        return true;
      }
      const full = await fetchFullConfrontation(active.id);
      renderActiveCombat(full, chronicle, user);
      startRealtime(chronicle);
    } catch (error) {
      setIndexVisible(false); host.hidden = false; host.replaceChildren();
      const state = node('div', 'online-combat-error');
      state.append(node('strong', '', 'Não foi possível carregar o combate online.'), node('p', '', 'O estado compartilhado foi preservado. Recarregue a Crônica e tente novamente.'));
      host.append(state);
    }
    return true;
  }

  function scheduleRefresh() {
    global.clearTimeout(refreshTimer);
    refreshTimer = global.setTimeout(() => {
      const panel = document.getElementById('chroniclePanelEncounters');
      if (currentChronicle?.storage === 'online' && panel && !panel.hidden) void render(currentChronicle);
    }, 140);
  }

  function stopRealtime() {
    if (realtimeChannel && global.CronicasSupabase?.client) global.CronicasSupabase.client.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  function startRealtime(chronicle) {
    if (!chronicle?.remoteId || !global.CronicasSupabase?.client) return;
    const name = `online-combat:${chronicle.remoteId}`;
    if (realtimeChannel?.topic?.includes(name)) return;
    stopRealtime();
    const client = global.CronicasSupabase.client;
    realtimeChannel = client.channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chronicle_confrontations', filter: `chronicle_id=eq.${chronicle.remoteId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'confrontation_character_links' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'confrontation_adversaries' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'online_characters' }, scheduleRefresh)
      .subscribe();
  }

  function applyDetailMode(chronicle) {
    if (chronicle?.storage === 'online') {
      currentChronicle = chronicle;
      startRealtime(chronicle);
    } else reset();
  }

  function reset() {
    stopRealtime();
    currentChronicle = null; selectedOwnCharacterId = ''; pending = false;
    directoryCache = { entries: [], byId: new Map(), unavailable: false };
    snapshotCache = new Map();
    const host = document.getElementById('onlineCombatHost');
    if (host) { host.replaceChildren(); host.hidden = true; }
    setIndexVisible(true);
  }

  const storage = Object.freeze({
    listConfrontations,
    getConfrontation,
    createConfrontation,
    updateConfrontation,
    deleteConfrontation,
    setConfrontationActive,
    listConfrontationCharacterIds,
    replaceConfrontationCharacters,
    listConfrontationAdversaries,
    createConfrontationAdversary,
    updateConfrontationAdversary,
    deleteConfrontationAdversary,
    listChronicleCastIds
  });

  global.addEventListener('cronicas:auth-change', event => { if (!event.detail?.authenticated) reset(); });

  global.ChroniclesOnlineCombat = Object.freeze({
    storage,
    directory,
    readCharacter,
    loadCastDirectory,
    render,
    applyDetailMode,
    reset,
    startRealtime,
    get currentChronicle() { return currentChronicle; }
  });
})(window);
