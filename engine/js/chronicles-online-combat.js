(function initializeChroniclesOnlineCombat(global) {
  'use strict';

  const ONLINE_PREFIX = 'online:';
  let directoryCache = { entries: [], byId: new Map(), unavailable: false };
  let snapshotCache = new Map();
  let currentChronicle = null;
  let realtimeChronicleChannel = null;
  let realtimeCombatChannel = null;
  let refreshTimer = null;
  let selectedOwnCharacterId = '';
  let selectedCombatant = '';
  let sheetTab = 'summary';
  let mobileTab = 'sheet';
  let activeRenderedId = '';
  let refreshDeferred = false;
  let lastFull = null;
  let lastUser = null;
  let connectionState = 'connecting';
  let pending = false;
  let initiativeEditing = false;
  let renderEpoch = 0;
  let subscriptionEpoch = 0;
  let directoryEpoch = 0;
  const sheetStates = new Map();
  const feedStates = new Map();
  function viewState(full){const key=full.record.id+':'+(full.record.executionId || 'legacy');if(!feedStates.has(key))feedStates.set(key,{includePrevious:false,expanded:new Set(),loadedCount:30});return feedStates.get(key);}
  function activeSheetState(){return lastFull&&selectedCombatant?sheetStates.get(lastFull.record.id+':'+(lastFull.record.executionId || '')+':'+selectedCombatant):null;}
  function editingPending(){return initiativeEditing || Boolean(activeSheetState()?.resourceDraft || activeSheetState()?.saving || document.querySelector('#onlineCombatHost [data-dirty="true"]'));}
  function captureFocus(host){const e=document.activeElement;if(!host?.contains(e))return null;return e.dataset.focusKey || (e.dataset.tab?'sheet-tab:'+e.dataset.tab:null);}
  function restoreFocus(host,key){if(!key)return;host.querySelector('[data-focus-key="'+CSS.escape(key)+'"]')?.focus({preventScroll:true});}
  function draftChanged(){syncCommands();if(refreshDeferred&&!editingPending())scheduleRefresh();}
  let localTimer = null;
  const localMode = () => currentChronicle && currentChronicle.storage !== 'online';
  const combatStorage = () => localMode() ? global.ChroniclesStorage : storage;
  function sheetState(full,target) {
    const key = `${full.record.id}:${full.record.executionId || ''}:${target.kind}:${target.id}`;
    if (!sheetStates.has(key)) sheetStates.set(key,{});
    return sheetStates.get(key);
  }

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
      executionId: row.execution_id || null,
      startedAt: row.started_at || null,
      endedAt: row.ended_at || null,
      createdAt: iso(row.created_at),
      updatedAt: row.updated_at || null
    };
  }

  function normalizeAdversary(row) {
    if (!row) return null;
    const result = {
      id: row.id,
      confrontationId: row.confrontation_id,
      name: text(row.name) || 'Adversário',
      createdAt: iso(row.created_at),
      updatedAt: row.updated_at || null
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
      .select('id, chronicle_id, name, description, active, combat_round, combat_turn, initiative_order, execution_id, started_at, ended_at, created_at, updated_at')
      .eq('chronicle_id', remoteChronicleId(chronicleId))
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(normalizeConfrontation).filter(Boolean);
  }

  async function getConfrontation(id) {
    const { client } = await context();
    const { data, error } = await client
      .from('chronicle_confrontations')
      .select('id, chronicle_id, name, description, active, combat_round, combat_turn, initiative_order, execution_id, started_at, ended_at, created_at, updated_at')
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
    const current = await getConfrontation(id);
    if (active && current.active) return current;
    if (active && (!current.startedAt || options.mode === 'restart')) {
      const [characters, adversaries] = await Promise.all([
        listConfrontationCharacterIds(id),
        listConfrontationAdversaries(id)
      ]);
      const [sheets, enemySheets] = await Promise.all([
        characters.length
          ? client.from('online_characters').select('id,snapshot').in('id', characters)
          : {data: []},
        adversaries.length
          ? client.from('confrontation_adversary_sheets').select('adversary_id,snapshot').in('adversary_id', adversaries.map(enemy => enemy.id))
          : {data: []}
      ]);
      if (sheets.error || enemySheets.error) throw sheets.error || enemySheets.error;
      const snapshots = new Map(sheets.data.map(row => [row.id, row.snapshot]));
      const enemySnapshots = new Map(enemySheets.data.map(row => [row.adversary_id, row.snapshot]));
      const order = global.CronicasCombatRules.initiativeOrder([
        ...characters.map(id => ({kind: 'character', id, snapshot: snapshots.get(id)})),
        ...adversaries.map(({id}) => ({kind: 'adversary', id, snapshot: enemySnapshots.get(id)}))
      ]);
      const { data, error } = await client.rpc('start_confrontation_with_initiative', {
        p_id: id, p_order: order, p_expected_updated_at: options.expectedUpdatedAt || current.updatedAt
      });
      if (error) throw error;
      return getConfrontation(data);
    }
    const resume = Boolean(active && current.startedAt && !current.active && options.mode !== 'restart');
    const { data, error } = resume
      ? await client.rpc('resume_confrontation', { p_id: id, p_expected_updated_at: options.expectedUpdatedAt || current.updatedAt })
      : await client.rpc('set_chronicle_confrontation_active', { p_confrontation_id: id, p_active: Boolean(active), p_expected_updated_at: options.expectedUpdatedAt || current.updatedAt });
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

  async function listConfrontationAdversaries(id, includeStats = true) {
    const {client}=await context();
    const [roster,privateRows]=await Promise.all([
      client.from('confrontation_adversary_roster').select('id,confrontation_id,name,created_at,updated_at').eq('confrontation_id',id).order('created_at',{ascending:true}),
      includeStats ? client.from('confrontation_adversaries').select('id,confrontation_id,name,pv_current,pv_max,defense,created_at,updated_at').eq('confrontation_id',id) : {data: []}
    ]);
    if(roster.error||privateRows.error)throw roster.error || privateRows.error;
    const owned=new Map((privateRows.data || []).map(row=>[row.id,row]));
    return (roster.data || []).map(row=>normalizeAdversary(owned.get(row.id) || row));
  }

  function adversaryPayload(input) {
    const payload = { name: text(input?.name) };
    if (input?.pvCurrent !== undefined) payload.pv_current = Number(input.pvCurrent);
    if (input?.pvMax !== undefined) payload.pv_max = Number(input.pvMax);
    if (input?.defense !== undefined) payload.defense = Number(input.defense);
    return payload;
  }

  async function saveCompleteAdversary(id, enemyId, input, options = {}) {
    const { client } = await context();
    const { data, error } = await client.rpc('save_combat_adversary', { p_confrontation_id: id, p_adversary_id: enemyId, p_values: input, p_expected_updated_at: options.expectedUpdatedAt || null });
    if (error) throw error;
    return (await listConfrontationAdversaries(id)).find(row => row.id === data);
  }

  async function createConfrontationAdversary(id, input) {
    if (input.snapshot) return saveCompleteAdversary(id, null, input);
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
    if (input.snapshot) return saveCompleteAdversary(_confrontationId, adversaryId, input, options);
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

  async function loadCastDirectory(chronicleId, includeSheets = false) {
    const token = ++directoryEpoch;
    const { client } = await context();
    const remoteId = remoteChronicleId(chronicleId);
    const { data: links, error: linksError } = await client
      .from('chronicle_cast_members')
      .select('character_id, created_at')
      .eq('chronicle_id', remoteId)
      .order('created_at', { ascending: true });
    if (linksError) throw linksError;
    const ids = (links || []).map(row => row.character_id);
    if (token !== directoryEpoch) return ids;
    if (!ids.length) {
      directoryCache = { entries: [], byId: new Map(), unavailable: false };
      snapshotCache = new Map();
      return [];
    }
    const { data: characters, error: characterError } = includeSheets
      ? await client.from('online_characters')
        .select('id, owner_id, source_local_id, name, level, class_name, signature, thumbnail, snapshot, updated_at').in('id', ids)
      : await client.rpc('chronicle_character_summaries', {p_chronicle_id: remoteId});
    if (characterError) throw characterError;
    if (token !== directoryEpoch) return ids;
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
    return localMode() ? global.CronicasCombatRules.readLocal(id) : snapshotCache.get(id) || null;
  }

  async function fetchFullConfrontation(id, includeSheets = false) {
    const api=combatStorage();
    const [record, characterIds, adversaries] = await Promise.all([api.getConfrontation(id),api.listConfrontationCharacterIds(id),api.listConfrontationAdversaries(id, localMode() || includeSheets)]);
    if(localMode())directoryCache=global.CronicasCombatRules.localDirectory();
    else await loadCastDirectory(record.chronicleId, includeSheets);
    return { record, characterIds, adversaries };
  }

  async function saveInitiative(id, order, expectedUpdatedAt) {
    if(localMode())return global.ChroniclesStorage.setConfrontationInitiative(id,order,expectedUpdatedAt);
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
    if(localMode())return global.ChroniclesStorage.stepConfrontationTurn(id,direction,expectedUpdatedAt);
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

  function characterSyncLabel(entry, user) {
    if(localMode())return 'Ficha local · alterações permanecem neste navegador';
    if (!entry) return 'Ficha online indisponível';
    if (entry.ownerId === user?.id && entry.sourceLocalId) {
      const state = global.ChroniclesCollaboration?.getCharacterSyncState?.(entry.sourceLocalId);
      if (state?.state === 'pending') return 'Alterações locais pendentes de sincronização';
      if (state?.state === 'syncing') return 'Sincronizando alterações da ficha';
      if (state?.state === 'error') return 'Falha de sincronização — valores online podem estar desatualizados';
    }
    const date = new Date(entry.updatedAt);
    return Number.isFinite(date.getTime())
      ? `Ficha online sincronizada em ${date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
      : 'Valores da última sincronização online';
  }

  function rollFeed(full) {
    const section=node('section','online-combat-feed');
    const heading=node('header','online-combat-section-heading');heading.append(node('h3','','Atividade do Confronto'));
    const feedState=viewState(full);
    const previous=node('input');previous.type='checkbox';previous.checked=feedState.includePrevious;previous.dataset.focusKey='history-filter';const previousLabel=node('label','online-combat-muted');previousLabel.append(previous,document.createTextNode(' Incluir execuções anteriores'));heading.append(previousLabel);
    const status=node('p','online-combat-muted','Carregando rolagens…');const list=node('ol','online-combat-feed-list');
    const more=node('button','btn secondary','Carregar anteriores');more.type='button';more.hidden=true;
    const retry=node('button','btn secondary','Reenviar pendentes');retry.type='button';retry.hidden=localMode();retry.addEventListener('click',async()=>{retry.disabled=true;try{await global.CombatRollOutbox.retry();await load(true);status.textContent=(await global.CombatRollOutbox.count())?'Ainda existem envios pendentes. O combate pode ter sido encerrado ou o acesso alterado.':'Envios verificados.';}finally{retry.disabled=false;}});
    section.append(heading,status,retry,list,more);let cursor=null,loading=false,generation=0;
    const seen=new Set();
    async function load(reset=false){
      if(loading&&!reset)return;const token=++generation;loading=true;more.disabled=true;
      try{const options={confrontationId:full.record.id,...(!previous.checked&&full.record.executionId?{executionId:full.record.executionId}:{}),limit:30,...(!reset&&cursor?{before:cursor}:{})};
        const result=localMode()?await global.ChroniclesStorage.listRollHistory('chronicle',full.record.chronicleId,options):await global.ChroniclesOnlineRolls.listChronicleRolls(full.record.chronicleId,options);
        if(token!==generation)return;
        if(reset){list.replaceChildren();seen.clear();}
        for(const record of result.records){if(seen.has(record.id))continue;seen.add(record.id);
          const item=node('li','online-combat-feed-item');item.dataset.rollId=record.id;
          const title=node('div');title.append(node('strong','',record.characterName),node('span','',record.categoryLabel || record.label || 'Rolagem livre'));
          const execution=record.executionId===full.record.executionId?'Execução atual':record.executionId?'Execução anterior':'Registro antigo';
          const meta=node('small','combat-feed-context',execution+' · '+(record.authorName || 'Registro local'));meta.dataset.executionId=record.executionId || '';title.append(meta);
          const details=node('details');details.open=feedState.expanded.has(record.id);details.addEventListener('toggle',()=>{if(!details.isConnected)return;details.open?feedState.expanded.add(record.id):feedState.expanded.delete(record.id);});const summary=node('summary','',record.result.expression);summary.dataset.focusKey='roll-details:'+record.id;details.append(summary);
          const r=record.result;let breakdown=`Dados: ${r.rolls.join(', ')}`;
          if(record.resolution==='highest'){const discarded=[...r.rolls];discarded.splice(discarded.indexOf(Math.max(...discarded)),1);breakdown+=` · Dado utilizado: ${r.diceTotal}${discarded.length?' · Descartados: '+discarded.join(', '):''}`;}
          breakdown+=` · Bônus: ${r.modifier>=0?'+':''}${r.modifier}`;details.append(node('p','',breakdown));
          const time=node('time','',new Date(record.createdAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}));time.dateTime=record.createdAt;
          item.append(title,details,node('b','',r.total),time);list.append(item);
        }
        cursor=result.next;feedState.loadedCount=Math.max(feedState.loadedCount,seen.size);more.hidden=!cursor;status.textContent=seen.size?'':'Nenhuma rolagem compartilhada nesta execução.';
      }catch(_){if(token===generation)status.textContent='Não foi possível atualizar. Os resultados já exibidos foram preservados.';}
      finally{if(token===generation){loading=false;more.disabled=false;}}
    }
    more.addEventListener('click',()=>void load());previous.addEventListener('change',()=>{feedState.includePrevious=previous.checked;feedState.loadedCount=30;void load(true);});void (async()=>{const desired=feedState.loadedCount;await load(true);while(cursor&&seen.size<desired&&section.isConnected)await load();})();return section;
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
    const panel = node('section', 'online-combat-focus'); panel.dataset.mobilePane='sheet';
    const map = combatantMap(full);
    const order = full.record.initiativeOrder || [];
    const active = order[full.record.combatTurn];
    if (!owner) return panel;
    const chosen = map.get(selectedCombatant);
    const target = chosen || map.get(`${active?.kind}:${active?.id}`) || [...map.values()][0];
    panel.append(node('span', 'chronicles-kicker', 'Ficha consultada · controle do mestre'));
    panel.append(node('h3', '', target?.name || 'Adversários'));
    if (!target) {
      panel.append(node('p', 'online-combat-muted', 'Prepare os adversários no Escudo do Mestre.'));
      return panel;
    }
    selectedCombatant=`${target.kind}:${target.id}`;
    const identity=node('div','combat-focus-identity');identity.append(target.kind==='character'?portrait(target.entry,'online-combat-sheet-portrait'):node('span','online-combat-sheet-portrait is-enemy','◆'),node('span','combat-focus-role',target.kind==='adversary'?'Adversário · exemplar independente':target.entry?.ownerId===user.id?'Seu personagem':'Personagem do grupo'));panel.append(identity);
    if (target.kind === 'adversary') {
      const enemy=target.adversary;
      const card=node('article','online-combat-enemy-control');
      card.append(node('p','combat-defense',enemy.defense !== undefined ? `DEF ${enemy.defense}` : 'DEF não informada'));
      if(enemy.pvMax !== undefined){
        let current=Number(enemy.pvCurrent ?? 0); const max=Number(enemy.pvMax);
        const resources=node('div','combat-summary-resources combat-manual-resources');
        const pv=node('div');pv.dataset.resource='pv';
        pv.append(node('small','','PV'),node('strong','',`${current} / ${max}`));
        const bar=node('progress');bar.max=Math.max(1,max);bar.value=current;bar.setAttribute('aria-label',`PV: ${current} de ${max}`);pv.append(bar);
        const quick=node('div','combat-resource-quick');pv.append(quick);resources.append(pv);card.append(resources);
        const options=node('details','combat-sheet-item');options.append(node('summary','','Ajustar PV'));
        const label=node('label','online-combat-enemy-pv','PV atual');const input=document.createElement('input');input.type='number';input.min='0';input.step='1';input.required=true;input.value=String(current);label.append(input,node('span','',`/ ${max}`));
        const save=node('button','btn','Salvar PV');save.type='button';options.append(label,save);card.append(options);
        const buttons=[];
        function syncPV(){for(const [button,step] of buttons)button.disabled=pending||input.value!==String(current)||(step<0?current<=0:current>=max);}
        async function savePV(next){
          if(pending)return;pending=true;save.disabled=true;input.disabled=true;syncPV();
          try {
            const saved = await combatStorage().updateConfrontationAdversary(full.record.id, enemy.id,
              {...enemy, pvCurrent: next}, {expectedUpdatedAt: enemy.updatedAt});
            Object.assign(enemy, saved);
            current = Number(saved.pvCurrent);
            input.value = String(current);
            delete input.dataset.dirty;
            pv.querySelector('strong').textContent = `${current} / ${max}`;
            bar.value = current;
            bar.setAttribute('aria-label', `PV: ${current} de ${max}`);
            updateAdversaryInitiativeLabel(enemy);
          }
          catch(_){global.showNotification?.('PV não salvo. Outra tela pode ter atualizado este adversário. Atualize e confira os valores.','error');}
          finally{pending=false;save.disabled=false;input.disabled=false;syncPV();syncCommands();}
        }
        for(const [step,caption] of [[-1,'−1'],[1,'+1'],[-5,'−5'],[5,'+5']]){
          const button=node('button','',caption);button.type='button';button.dataset.direction=step<0?'loss':'gain';button.setAttribute('aria-label',`${step<0?'Diminuir':'Recuperar'} ${Math.abs(step)} PV`);
          button.dataset.focusKey=`manual-pv:${step}`;
          button.addEventListener('click',()=>{if(!button.disabled)void savePV(step<0?Math.max(0,current+step):Math.min(max,current+step));});buttons.push([button,step]);quick.append(button);
        }
        input.addEventListener('input',syncPV);
        save.addEventListener('click',()=>{if(input.reportValidity())void savePV(Number(input.value));});syncPV();
      }panel.append(card);
      const free=node('details','combat-sheet-item');free.append(node('summary','','Rolagem livre do adversário'));
      const form=node('form','online-combat-dice-form');const expression=node('input');expression.type='text';expression.placeholder='Ex.: 2d6+3';expression.maxLength=32;expression.required=true;expression.setAttribute('aria-label',`Expressão de ${enemy.name}`);const roll=node('button','btn','Rolar');roll.type='submit';const result=node('p','combat-roll-result');result.setAttribute('role','status');form.append(expression,roll);free.append(form,result);panel.append(free);
      form.addEventListener('submit',async e=>{e.preventDefault();roll.disabled=true;try{const r=await rollEnemy(full,enemy,expression.value,'Rolagem livre');result.textContent=`${r.total} · Dados: ${r.rolls.join(', ')}${r.pending?' · Envio pendente':''}`;delete expression.dataset.dirty;}catch(error){result.textContent=error.message;}finally{roll.disabled=false;}});
      const projection=node('div');panel.append(projection,free);projection.textContent='Carregando ficha do adversário…';
      const selection=selectedCombatant;const epoch=renderEpoch;
      void (localMode()?Promise.resolve({data:enemy.snapshot?{snapshot:enemy.snapshot}:null}):context().then(({client})=>client.from('confrontation_adversary_sheets').select('snapshot,updated_at').eq('adversary_id',enemy.id).maybeSingle())).then(({data,error})=>{
        if(!projection.isConnected || epoch!==renderEpoch || selection!==selectedCombatant)return;
        projection.replaceChildren();
        if(error){projection.textContent='Não foi possível consultar a ficha protegida. Tente Atualizar.';return;}
        if(!data){projection.append(node('p','online-combat-muted','Adversário manual · possui nome, PV e DEF. Use a rolagem livre para suas ações. A associação de uma ficha completa fica na preparação, no Escudo do Mestre.'));return;}
        card.hidden=true;
        const snapshot=structuredClone(data.snapshot);snapshot.fields ||= {};Object.assign(snapshot.fields,{pvAtual:enemy.pvCurrent,pvMax:enemy.pvMax});
        projection.append(global.CombatSheetView.create({snapshot,state:sheetState(full,target),onDraftChange:draftChanged,resourceVersion:enemy.updatedAt,name:enemy.name,defenseValue:enemy.defense,tab:sheetTab,onTab:key=>sheetTab=key,onResources:async (changes,expectedUpdatedAt,defense)=>{
          const updated=structuredClone(snapshot);Object.assign(updated.fields,changes);
          const saved=await combatStorage().updateConfrontationAdversary(full.record.id,enemy.id,{...enemy,pvCurrent:Number(changes.pvAtual),pvMax:Number(changes.pvMax),defense,snapshot:updated},{expectedUpdatedAt:expectedUpdatedAt || enemy.updatedAt});
          Object.assign(enemy,saved);Object.assign(snapshot.fields,changes);
          try{full.record=await combatStorage().getConfrontation(full.record.id);}catch(_){/* Refresh will retry the parent version without rewriting acknowledged resources. */}
          updateAdversaryInitiativeLabel(enemy);
          return {updatedAt:saved.updatedAt};
        },onRoll:(expression,label)=>rollEnemy(full,enemy,expression,label)}));
      }).catch(()=>{if(projection.isConnected)projection.textContent='Ficha temporariamente indisponível. Use Atualizar.';});
    } else {
      const snapshot = readCharacter(target.id);
      if (snapshot) {
        panel.append(global.CombatSheetView.create({
          snapshot, state: sheetState(full, target), name: target.name,
          tab: sheetTab, onTab: key => sheetTab = key
        }));
      } else {
        panel.append(node('p', 'online-combat-muted', 'Ficha compartilhada indisponível.'));
      }
    }
    return panel;
  }

  async function rollEnemy(full,enemy,expression,label) {
    const parsed=global.CronicasDiceEngine.parse(expression);
    if(!parsed.valid)throw new Error(parsed.message);
    const result=global.CronicasDiceEngine.roll(parsed);
    const record={id:global.crypto.randomUUID(),characterId:enemy.id,characterName:enemy.name,label,resolution:result.resolution || 'sum',executionId:full.record.executionId,result};
    if(localMode()){
      await global.ChroniclesStorage.appendConfrontationRoll(full.record.id,{...record,createdAt:new Date().toISOString(),schemaVersion:result.resolution==='highest'?2:1,source:'quick-dice',category:'expression'});scheduleRefresh();return result;
    }
    // Preserve the exact draw locally before attempting the network. Retry never rerolls.
    const receipt=await global.CombatRollOutbox.send(record,full.record.id,enemy.id);
    result.pending=receipt.pending;
    scheduleRefresh();return result;
  }

  function currentCombatantLabel(full) {
    const order = full.record.initiativeOrder || [];
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
    if(full.record.combatRound===1&&full.record.combatTurn===0)previous.disabled=true;
    previous.addEventListener('click', () => void performTurn(full, -1));
    next.addEventListener('click', () => void performTurn(full, 1));
    end.addEventListener('click', () => {
      if(pending||editingPending())return;
      global.openModal({title:'Encerrar Confronto?',content:`Encerrar “${full.record.name}”? A composição, os recursos e o histórico continuarão salvos.`,actions:[{label:'Continuar combate',className:'secondary'},{label:'Encerrar Confronto',className:'danger',onClick:()=>void endCombat(full)}]});
    });
    previous.dataset.combatCommand='previous';next.dataset.combatCommand='next';end.dataset.combatCommand='end';
    previous.dataset.focusKey='previous-turn';next.dataset.focusKey='next-turn';end.dataset.focusKey='end-combat';
    controls.append(previous, next, end);
    return controls;
  }

  function syncCommands(){
    const host=document.getElementById('onlineCombatHost');if(host){let notice=host.querySelector('.combat-edit-notice');if(!notice){notice=node('p','combat-edit-notice');notice.setAttribute('role','status');host.querySelector('.online-combat-header')?.after(notice);}notice.hidden=!editingPending();notice.textContent=initiativeEditing?'Conclua ou cancele a edição da iniciativa antes de mudar o turno.':'Há alterações de recursos não salvas. Volte ao Resumo para salvar ou descartar antes de mudar o turno.';}
    document.querySelectorAll('#onlineCombatHost [data-combat-command]').forEach(button=>{button.disabled=pending || editingPending() || (button.dataset.combatCommand==='previous'&&lastFull?.record.combatRound===1&&lastFull?.record.combatTurn===0);});
  }

  async function performTurn(full, direction) {
    if (pending || editingPending()) return;
    pending = true;syncCommands();
    try {
      await stepTurn(full.record.id, direction, full.record.updatedAt);
      await render(currentChronicle);
    } catch (error) {
      global.showNotification?.('Não foi possível alterar o turno. O combate pode ter sido atualizado em outra tela.', 'error');
      await render(currentChronicle);
    } finally { pending = false; syncCommands(); }
  }

  async function endCombat(full) {
    if (pending || editingPending()) return;
    pending = true;syncCommands();
    try {
      await combatStorage().setConfrontationActive(full.record.id, false, { expectedUpdatedAt: full.record.updatedAt });
      global.showNotification?.('Confronto encerrado. A composição foi preservada.');
      await render(currentChronicle);
    } catch (error) {
      global.showNotification?.('Não foi possível encerrar o Confronto.', 'error');
      await render(currentChronicle);
    } finally { pending = false; syncCommands(); }
  }

  async function saveInitiativeFromUI(full, host) {
    if (pending) return;
    const rows = [...host.querySelectorAll('[data-online-initiative-row]')];
    const inputs=rows.map(row=>row.querySelector('input'));
    const invalid=inputs.find(input=>!input.reportValidity() || !Number.isInteger(input.valueAsNumber));
    if(invalid){global.showNotification?.('Informe iniciativas inteiras entre -999 e 999.','error');invalid.focus();return;}
    const order=rows.map((row,index)=>({kind:row.dataset.kind,id:row.dataset.id,initiative:inputs[index].valueAsNumber})).sort((a,b)=>b.initiative-a.initiative);
    pending = true;syncCommands();
    try {
      await saveInitiative(full.record.id, order, full.record.updatedAt);
      initiativeEditing = false;
      document.querySelectorAll('#onlineCombatHost [data-dirty]').forEach(e=>delete e.dataset.dirty);
      global.showNotification?.('Ordem de iniciativa atualizada.');
      await render(currentChronicle);
    } catch (error) {
      global.showNotification?.('Não foi possível salvar a iniciativa. Os valores em edição foram preservados. Use Atualizar para conferir o estado mais recente.', 'error');
      await render(currentChronicle);
    } finally { pending = false; syncCommands(); }
  }

  function adversaryResourceLabel(enemy) {
    const defense = enemy.defense !== undefined ? `DEF ${enemy.defense}` : '';
    if (enemy.pvMax === undefined) return defense || 'Adversário · recursos reservados';
    return `PV ${enemy.pvCurrent} / ${enemy.pvMax}${defense ? ' · ' + defense : ''}`;
  }

  function updateAdversaryInitiativeLabel(enemy) {
    const row = document.querySelector(`#onlineCombatHost [data-kind="adversary"][data-id="${CSS.escape(enemy.id)}"]`);
    const label = row?.querySelector('.online-combat-initiative-identity small');
    if (label) label.textContent = adversaryResourceLabel(enemy);
  }

  function initiativeBoard(full, owner) {
    const board = node('section', 'online-combat-initiative');
    const heading = node('header', 'online-combat-section-heading');
    const headingCopy = node('div');
    headingCopy.append(node('span', 'chronicles-kicker', 'Ordem de ação'), node('h3', '', 'Iniciativa'));
    heading.append(headingCopy);
    if (owner) {
      const edit = node('button', 'btn secondary', initiativeEditing ? 'Salvar iniciativa' : 'Editar iniciativa'); edit.type = 'button';edit.dataset.focusKey='edit-initiative';
      edit.addEventListener('click', () => {
        if (!initiativeEditing) { initiativeEditing = true; renderActiveCombat(lastFull,currentChronicle,lastUser); }
        else void saveInitiativeFromUI(full, board);
      });
      heading.append(edit);
      if(initiativeEditing){const cancel=node('button','btn secondary','Cancelar iniciativa');cancel.type='button';cancel.dataset.focusKey='cancel-initiative';cancel.addEventListener('click',()=>{initiativeEditing=false;board.querySelectorAll('[data-dirty]').forEach(e=>delete e.dataset.dirty);void render(currentChronicle);});heading.append(cancel);}
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
      if (owner && target.kind === 'character') {
        const resources = characterResources(target.id);
        identity.append(node('small', '', `PV ${resources.pv}`));
      } else if (owner && target.kind === 'adversary') {
        const enemy = target.adversary;
        identity.append(node('small', '', adversaryResourceLabel(enemy)));
      }
      const score = owner && initiativeEditing ? document.createElement('input') : node('strong', 'online-combat-initiative-score', String(item.initiative || 0));
      if (owner && initiativeEditing) {
        score.type = 'number'; score.min = '-999'; score.max = '999'; score.step = '1'; score.value = String(item.initiative || 0); score.className = 'online-combat-initiative-input';score.dataset.focusKey='initiative:'+item.kind+':'+item.id;score.inputMode='numeric'; score.setAttribute('aria-label', `Iniciativa de ${target.name}`);
      }
      const select=node(owner ? 'button' : 'div','online-combat-select');if(owner)select.type='button';select.dataset.focusKey='participant:'+item.kind+':'+item.id;select.append(turn,visual,identity);
      if (owner) {
      const canSelect=owner;
      select.setAttribute('aria-label',`Consultar ficha de ${target.name}`);select.setAttribute('aria-pressed',String(selectedCombatant===`${item.kind}:${item.id}`));
      select.addEventListener('click',()=>{if(!canSelect)return;if(activeSheetState()?.saving)return;if((activeSheetState()?.resourceDraft || document.querySelector('.online-combat-focus [data-dirty="true"]'))&&!global.confirm('Trocar a ficha consultada descartará os valores ainda não salvos. Continuar?'))return;const previousState=activeSheetState();if(previousState)delete previousState.resourceDraft;selectedCombatant=`${item.kind}:${item.id}`;sheetTab='summary';mobileTab='sheet';const focus=detailPanel(lastFull,lastUser,owner);document.querySelector('#onlineCombatHost .online-combat-focus')?.replaceWith(focus);applyMobilePane();syncCommands();document.querySelectorAll('.online-combat-select').forEach(b=>b.setAttribute('aria-pressed',String(b===select)));});
      }
      if(index===full.record.combatTurn)identity.append(node('span','combat-turn-badge','Em ação'));
      row.append(select,score); list.append(row);
    });
    board.append(node('p','combat-order-help',owner?'Selecione um personagem para consultar a ficha ou um adversário para conduzir suas ações. Use os controles acima para avançar o turno.':'Faça suas rolagens pela Ficha. A iniciativa acompanha o turno conduzido pelo mestre.'),list);
    return board;
  }

  function renderActiveCombat(full, chronicle, user) {
    const host = ensureActiveHost();
    if (!host) return;
    if(activeRenderedId!==full.record.id){selectedCombatant='';sheetTab='summary';activeRenderedId=full.record.id;}
    lastFull=full;lastUser=user;
    const focused=captureFocus(host);
    host.replaceChildren(); host.hidden = false; setIndexVisible(false);
    const owner = localMode() || chronicle.role === 'owner';
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
    host.dataset.viewerRole = owner ? 'master' : 'player';
    layout.append(initiativeBoard(full, owner));
    if (owner) layout.append(detailPanel(full, user, owner));
    if (!owner) mobileTab = 'order';
    const nav=node('nav','online-combat-mobile-nav');nav.setAttribute('aria-label','Áreas do Confronto');
    for(const [key,title] of (owner ? [['order','Iniciativa'],['sheet','Fichas'],['activity','Rolagens']] : [['order','Iniciativa']])){const b=node('button','btn secondary',title);b.type='button';b.dataset.mobileTab=key;b.addEventListener('click',()=>{mobileTab=key;applyMobilePane();});nav.append(b);}
    layout.querySelector('.online-combat-initiative').dataset.mobilePane='order';
    const feed = owner ? rollFeed(full) : null;
    if (feed) feed.dataset.mobilePane = 'activity';
    const refresh=node('button','btn secondary','Atualizar');refresh.type='button';refresh.dataset.focusKey='refresh-combat';refresh.addEventListener('click',()=>{if(activeSheetState()?.saving)return;if((activeSheetState()?.resourceDraft || host.querySelector('[data-dirty="true"]'))&&!global.confirm('Atualizar descartará os valores ainda não salvos neste painel. Continuar?'))return;const edited=activeSheetState();if(edited)delete edited.resourceDraft;initiativeEditing=false;host.querySelectorAll('[data-dirty]').forEach(e=>delete e.dataset.dirty);void render(currentChronicle);});
    const connection=node('p','online-combat-connection');connection.setAttribute('role','status');
    const toolbar=node('div','combat-live-toolbar');toolbar.append(connection);if (owner) host.append(nav);host.append(refresh,toolbar,layout);if(feed)host.append(feed);updateConnection();applyMobilePane();
    host.oninput=event=>{if(event.target.type==='number'||event.target.closest('.online-combat-dice-form'))event.target.dataset.dirty='true';syncCommands();};
    syncCommands();restoreFocus(host,focused);
    host.onfocusout=()=>{if(refreshDeferred&&!host.querySelector('[data-dirty="true"]')&&!initiativeEditing)scheduleRefresh();};
  }

  async function render(chronicle = currentChronicle) {
    if (!chronicle) return false;
    currentChronicle = chronicle;
    const existing=document.getElementById('onlineCombatHost');
    if(activeSheetState()?.saving || existing?.querySelector('[data-dirty="true"]') || initiativeEditing || (existing?.contains(document.activeElement)&&document.activeElement?.matches('input,textarea'))){refreshDeferred=true;updateConnection();return true;}
    refreshDeferred=false;
    const token = ++renderEpoch;
    const host = ensureActiveHost();
    if (!host) return true;
    try {
      const user = localMode()?{id:(await global.CronicasSupabase?.getUser?.())?.id || 'guest'}:(await context()).user;
      const records = await combatStorage().listConfrontations(chronicle.id);
      if (token !== renderEpoch || currentChronicle?.id !== chronicle.id) return true;
      const active = records.find(item => item.active);
      if (!active) {
        host.replaceChildren(); host.hidden = true; setIndexVisible(true);
        await global.ConfrontationsUI?.renderIndex();
        return true;
      }
      if(localMode()&&!active.executionId)await global.ChroniclesStorage.setConfrontationActive(active.id,true,{expectedUpdatedAt:active.updatedAt});
      const full = await fetchFullConfrontation(active.id, chronicle.role === 'owner');
      if (token !== renderEpoch || currentChronicle?.id !== chronicle.id) return true;
      if (activeSheetState()?.saving) { refreshDeferred = true; updateConnection(); return true; }
      renderActiveCombat(full, chronicle, user);
      if(localMode()){if(!localTimer)localTimer=global.setInterval(()=>{if(!document.hidden)scheduleRefresh();},4000);}
      else startRealtime(chronicle);
    } catch (error) {
      if (token !== renderEpoch || currentChronicle?.id !== chronicle.id) return true;
      if(host.children.length){connectionState='stale';updateConnection();return true;}
      setIndexVisible(false); host.hidden = false; host.replaceChildren();
      const state = node('div', 'online-combat-error');
      state.append(node('strong', '', 'Não foi possível carregar o Confronto.'), node('p', '', 'O estado compartilhado foi preservado. Recarregue a Crônica e tente novamente.'));
      host.append(state);
    }
    return true;
  }

  function applyMobilePane(){const host=document.getElementById('onlineCombatHost');if(!host)return;host.dataset.mobileTab=mobileTab;host.querySelectorAll('[data-mobile-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mobileTab===mobileTab)));}
  function updateConnection(){const e=document.querySelector('.online-combat-connection');if(e)e.textContent=localMode()?'Modo local · salvo neste navegador':refreshDeferred?'Atualização recebida · conclua a edição ou use Atualizar':connectionState==='subscribed'?'Conectado · dados consultados no servidor':connectionState==='offline'?'Sem internet · última informação exibida':connectionState==='stale'?'Não foi possível atualizar · última informação preservada':'Reconectando · use Atualizar para consultar o servidor';}
  function handleSubscription(status){const previous=connectionState;connectionState=status==='SUBSCRIBED'?'subscribed':'connecting';updateConnection();if(status==='SUBSCRIBED'&&previous!=='subscribed')scheduleRefresh();}

  function scheduleRefresh() {
    global.clearTimeout(refreshTimer);
    refreshTimer = global.setTimeout(() => {
      const panel = document.getElementById('chroniclePanelEncounters');
      if (currentChronicle && panel && !panel.hidden && !panel.closest('[hidden]')) void render(currentChronicle);
    }, 140);
  }

  function stopRealtime() {
    ++subscriptionEpoch;
    global.clearTimeout(refreshTimer);
    refreshTimer = null;
    const client = global.CronicasSupabase?.client;
    if (client && realtimeChronicleChannel) client.removeChannel(realtimeChronicleChannel);
    if (client && realtimeCombatChannel) client.removeChannel(realtimeCombatChannel);
    realtimeChronicleChannel = null;
    realtimeCombatChannel = null;
  }

  function startRealtime(chronicle) {
    if (!chronicle?.remoteId || !global.CronicasSupabase?.client) return;
    const name = `online-combat:${chronicle.remoteId}`;
    const client = global.CronicasSupabase.client;
    if (!realtimeChronicleChannel?.topic?.includes(name)) {
      stopRealtime();
      realtimeChronicleChannel = client.channel(name)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chronicle_confrontations', filter: `chronicle_id=eq.${chronicle.remoteId}` }, scheduleRefresh)
        .subscribe(handleSubscription);
    }
    const token = ++subscriptionEpoch;
    void listConfrontations(chronicle.id).then(records => {
      if (token !== subscriptionEpoch || currentChronicle?.remoteId !== chronicle.remoteId) return;
      const active = records.find(item => item.active);
      if (!active) {
        if (realtimeCombatChannel) client.removeChannel(realtimeCombatChannel);
        realtimeCombatChannel = null;
        return;
      }
      if (realtimeCombatChannel?.topic?.includes(active.id)) return;
      if (realtimeCombatChannel) client.removeChannel(realtimeCombatChannel);
      realtimeCombatChannel = client.channel(`online-combat-detail:${active.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'confrontation_character_links', filter: `confrontation_id=eq.${active.id}` }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'confrontation_adversary_roster', filter: `confrontation_id=eq.${active.id}` }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'confrontation_adversaries', filter: `confrontation_id=eq.${active.id}` }, event => {
          const change = event.new;
          if (event.eventType === 'UPDATE' && change?.id && change.updated_at) {
            global.setTimeout(() => {
              if (lastFull?.record.id !== active.id || currentChronicle?.remoteId !== chronicle.remoteId) return;
              const current = lastFull.adversaries.find(enemy => enemy.id === change.id);
              if (!current?.updatedAt || Date.parse(change.updated_at) > Date.parse(current.updatedAt)) scheduleRefresh();
            }, 300);
          } else scheduleRefresh();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'online_roll_records', filter: `confrontation_id=eq.${active.id}` }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'online_characters' }, payload => {
          const id = payload?.new?.id || payload?.old?.id;
          if (id && directoryCache.byId.has(id)) scheduleRefresh();
        })
        .subscribe(handleSubscription);
    }).catch(() => {
      // Keep the current channel through transient network failures; a future
      // render or Realtime event retries discovery without an unhandled promise.
    });
  }

  function applyDetailMode(chronicle) {
    ++renderEpoch;
    if (chronicle?.storage === 'online') {
      currentChronicle = chronicle;
      startRealtime(chronicle);
    } else reset();
  }

  function reset() {
    global.clearInterval(localTimer);localTimer=null;
    ++directoryEpoch;
    ++renderEpoch;
    stopRealtime();
    sheetStates.clear();feedStates.clear();
    currentChronicle = null; selectedOwnCharacterId = ''; selectedCombatant=''; lastFull=null; lastUser=null; pending = false; initiativeEditing = false;
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

  global.addEventListener('cronicas:auth-change', event => { if (!event.detail?.authenticated || (lastUser && event.detail?.user?.id && event.detail.user.id!==lastUser.id)) reset(); });
  global.addEventListener('offline',()=>{connectionState='offline';updateConnection();});
  for(const name of ['online','pageshow'])global.addEventListener(name,()=>{if(currentChronicle)scheduleRefresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentChronicle)scheduleRefresh();});

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
