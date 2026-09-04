(function initializeMasterShield(global) {
  'use strict';
  // Local Chronicles keep the casual password barrier. Online Chronicles use the authenticated owner role.
  let services, access, activeId = null, epoch = 0, returnSection = 'overview', moduleName = 'dashboard', onlineOwner = false;
  const el = id => document.getElementById(id);
  const isOnlineId = id => typeof id === 'string' && id.startsWith('online:');
  const onlineRemoteId = id => isOnlineId(id) ? id.slice('online:'.length) : '';
  const allowed = () => Boolean(activeId && (onlineOwner || access?.unlocked));
  const working = () => Boolean(global.ConfrontationsUI?.busy);
  const focus = target => { if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true }); };
  const node = (tag, text, className = '') => { const result = document.createElement(tag); result.textContent = text; result.className = className; return result; };
  function feedback(message = '', id = 'masterShieldFeedback') { el(id).textContent = message; }
  function setEyebrow(online) {
    const eyebrow = document.querySelector('#chronicleMasterShieldView .master-shield-eyebrow');
    if (eyebrow) eyebrow.textContent = online ? 'Arquivo reservado · acesso do Mestre online' : 'Arquivo reservado · armazenamento local';
  }
  function reset() {
    ++epoch;
    if (!onlineOwner) access?.close();
    global.ConfrontationsUI?.reset();
    activeId = null; onlineOwner = false; moduleName = 'dashboard';
    for (const id of ['masterShieldChronicleName','masterShieldChronicleType','masterShieldChronicleDate','masterShieldCastList','masterShieldConfrontationsList']) el(id).replaceChildren();
    el('masterShieldAccess').hidden = true;
    el('masterShieldPrivate').hidden = true; el('chronicleMasterShieldView').hidden = true;
    el('lockMasterShield').hidden = true; feedback();
    setEyebrow(false);
  }
  function requestExit(continuation) {
    if (!activeId) return false;
    if (working() || (!onlineOwner && access.pending)) { feedback('Aguarde o término da operação antes de sair.'); return true; }
    if (global.ConfrontationsUI?.requestExit(() => { reset(); continuation(); })) return true;
    reset(); return false;
  }
  function navigate(section, battleId, restoreTrigger = false) {
    const go = () => services.navigate(section, battleId, restoreTrigger);
    if (!requestExit(go)) return go();
  }
  async function onlineCastCount() {
    const client = global.CronicasSupabase?.client;
    const remoteId = onlineRemoteId(activeId);
    if (!client || !remoteId) return 0;
    const { count, error } = await client
      .from('chronicle_cast_members')
      .select('character_id', { count: 'exact', head: true })
      .eq('chronicle_id', remoteId);
    if (error) throw error;
    return count || 0;
  }
  async function renderOnlineHunters(canUse) {
    const client = global.CronicasSupabase?.client;
    const remoteId = onlineRemoteId(activeId);
    if (!client || !remoteId) throw new Error('ONLINE_UNAVAILABLE');
    const { data: links, error: linkError } = await client
      .from('chronicle_cast_members')
      .select('character_id')
      .eq('chronicle_id', remoteId);
    if (linkError) throw linkError;
    const ids = (links || []).map(item => item.character_id);
    if (!ids.length) {
      if (canUse()) {
        el('masterShieldCastList').replaceChildren();
        feedback('Nenhum Caçador no Elenco.','masterShieldCastFeedback');
      }
      return;
    }
    const { data: characters, error: characterError } = await client
      .from('online_characters')
      .select('id, name, level, class_name, signature, thumbnail')
      .in('id', ids);
    if (characterError) throw characterError;
    if (!canUse()) return;
    const byId = new Map((characters || []).map(item => [item.id, item]));
    el('masterShieldCastList').replaceChildren(...ids.map(characterId => {
      const entry = byId.get(characterId);
      const row = node('li','','master-shield-person');
      const identity = node('div', entry?.name || 'Personagem indisponível');
      const detail = [entry?.class_name, entry?.level !== undefined ? 'Nível ' + entry.level : '', entry?.signature].filter(Boolean).join(' · ');
      if (detail) identity.append(node('small',detail));
      const portrait = node('span','', 'master-shield-portrait');
      if (entry?.thumbnail) {
        const image = document.createElement('img'); image.src = entry.thumbnail; image.alt = ''; portrait.append(image);
      } else portrait.append(node('span', entry?.name?.charAt(0)?.toUpperCase() || '◇'));
      row.append(portrait,identity); return row;
    }));
    feedback('','masterShieldCastFeedback');
  }
  async function openModule(name) {
    if (!['dashboard','hunters','combats'].includes(name) || !allowed()) return;
    if (global.ConfrontationsUI?.requestExit(() => void openModule(name))) return;
    global.ConfrontationsUI?.reset();
    const previous = moduleName;
    moduleName = name; const token = ++epoch, id = activeId;
    el('masterDashboard').hidden = name !== 'dashboard'; el('masterModule').hidden = name === 'dashboard';
    el('masterHuntersModule').hidden = name !== 'hunters'; el('masterCombatsModule').hidden = name !== 'combats';
    el('masterCombatsOverview').hidden = false;
    el('masterShieldTitle').textContent = 'Painel do Mestre';
    el('masterModuleTitle').textContent = name === 'hunters' ? 'Caçadores' : 'Combates';
    feedback();
    const canUse = () => token === epoch && allowed() && id === activeId;
    if (name === 'dashboard') {
      focus(document.querySelector('[data-master-module="' + previous + '"]') || el('masterShieldTitle'));
      try {
        const [cast, battles] = await Promise.all([
          onlineOwner ? onlineCastCount() : services.storage().listChronicleCastIds(id).then(items => items.length),
          services.storage().listConfrontations(id)
        ]);
        if (canUse()) {
          el('masterHuntersSummary').textContent = cast + ' no Elenco';
          const active = battles.find(item => item.active);
          el('masterCombatsSummary').textContent = active ? `Ativo · ${active.name}` : `${battles.length} Confrontos`;
        }
      } catch (_) { if (canUse()) feedback('Não foi possível atualizar os resumos. Abra a ferramenta para tentar novamente.'); }
      return;
    }
    focus(el('masterModuleTitle'));
    try {
      if (name === 'hunters') {
        feedback('Carregando…','masterShieldCastFeedback');
        if (onlineOwner) {
          await renderOnlineHunters(canUse);
        } else {
          const ids = await services.storage().listChronicleCastIds(id), directory = services.directory();
          if (!canUse()) return;
          if (directory.unavailable) throw new Error('CHARACTERS_UNAVAILABLE');
          el('masterShieldCastList').replaceChildren(...ids.map(characterId => {
            const entry = directory.byId.get(characterId), row = node('li','','master-shield-person'), identity = node('div',entry?.name || 'Personagem indisponível');
            const detail = [entry?.className, entry?.level !== undefined ? 'Nível ' + entry.level : ''].filter(Boolean).join(' · ');
            if (detail) identity.append(node('small',detail));
            row.append(services.portrait(entry,'master-shield-portrait'),identity); return row;
          }));
          feedback(ids.length ? '' : 'Nenhum Caçador no Elenco.','masterShieldCastFeedback');
        }
      } else {
        el('createMasterConfrontation').disabled = false;
        el('createMasterConfrontation').title = '';
        feedback('Carregando…','masterShieldConfrontationsFeedback');
        const battles = await services.storage().listConfrontations(id);
        if (!canUse()) return;
        el('masterShieldConfrontationsList').replaceChildren(...battles.map(battle => {
          const row = node('li','','master-combat-row'), identity = node('div',''), actions = node('div','','master-module-actions');
          identity.append(node('h4',battle.name),node('small',battle.active ? 'Ativo' : 'Preparado · inativo'));
          if (battle.description) identity.append(node('p',battle.description));
          const open = node('button','Abrir composição','btn secondary'); open.type = 'button';
          open.setAttribute('aria-label','Abrir composição: ' + battle.name);
          open.addEventListener('click',() => { if (canUse()) void global.ConfrontationsUI.open(battle.id, { preparing:true, returnTo:()=>openModule('combats') }); });
          const start = node('button',battle.active ? 'Abrir Confronto ativo' : 'Iniciar Confronto','btn'); start.type = 'button';
          start.setAttribute('aria-label', start.textContent + ': ' + battle.name);
          start.addEventListener('click',() => { if (canUse()) void global.ConfrontationsUI.start(battle); });
          actions.append(open,start); row.append(identity,actions); return row;
        }));
        feedback(battles.length ? '' : 'Nenhum Confronto preparado.','masterShieldConfrontationsFeedback');
      }
    } catch (_) { if (canUse()) feedback('Não foi possível carregar. Volte ao painel e tente novamente.'); }
  }
  async function open(section = 'overview') {
    if (requestExit(() => void open(section))) return;
    reset(); activeId = services.chronicleId(); if (!activeId) return;
    returnSection = section; services.closeActions(); services.showView('shield');
    el('masterShieldTitle').textContent = 'Escudo do Mestre';
    const id = activeId, token = epoch;
    try {
      const chronicle = await services.storage().getChronicle(id);
      if (token !== epoch || id !== activeId || !chronicle) return;
      el('masterShieldChronicleName').textContent = chronicle.name;
      el('masterShieldChronicleType').textContent = services.type(chronicle.type);
      el('masterShieldChronicleDate').textContent = 'Última alteração pública: ' + services.date(chronicle.updatedAt);

      const online = chronicle.storage === 'online' || isOnlineId(id);
      setEyebrow(online);
      if (online) {
        if (chronicle.role !== 'owner') {
          el('masterShieldAccess').hidden = true;
          el('masterShieldPrivate').hidden = true;
          feedback('Somente o Mestre desta Crônica pode acessar o Escudo.');
          return;
        }
        onlineOwner = true;
        el('masterShieldAccess').hidden = true;
        el('masterShieldPrivate').hidden = false;
        el('masterShieldPrivate').inert = false;
        el('lockMasterShield').hidden = true;
        el('createMasterConfrontation').disabled = false;
        el('createMasterConfrontation').title = '';
        await openModule('dashboard');
        return;
      }
      onlineOwner = false;
      await access.open(id);
    } catch (_) {
      if (token === epoch) feedback('Não foi possível abrir o Escudo do Mestre. Tente novamente.');
    }
  }
  function initialize(dependencies) {
    services = dependencies;
    access = global.MasterAccess.create({ host:el('masterShieldAccess'), storage:services.storage, confirm:services.confirm, isBusy:working,
      onLock: () => { el('masterShieldPrivate').hidden = true; el('masterShieldPrivate').inert = true; el('lockMasterShield').hidden = true; },
      onUnlock: () => {
        el('masterShieldPrivate').hidden = false; el('masterShieldPrivate').inert = false; el('lockMasterShield').hidden = false;
        if (global.ConfrontationsUI?.isManaging) focus(el('confrontationTitle')); else void openModule(moduleName);
      } });
    el('backFromMasterShield').addEventListener('click',() => navigate(returnSection,null,true));
    el('backToMasterDashboard').addEventListener('click',() => void openModule('dashboard'));
    el('lockMasterShield').addEventListener('click',() => { if (!onlineOwner) access.lock(); });
    el('createMasterConfrontation').addEventListener('click',() => { if (allowed()) void global.ConfrontationsUI.openCreate({ returnTo:()=>openModule('combats') }); });
    document.querySelectorAll('[data-master-module]').forEach(button => button.addEventListener('click',() => void openModule(button.dataset.masterModule)));
  }
  global.MasterShieldUI = Object.freeze({ initialize, open, reset, requestExit,
    get isUnlocked() { return allowed(); }, executeCombat: id => { if (allowed()) return navigate('encounters', id); } });
})(window);
