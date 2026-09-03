(function initializeMasterShield(global) {
  'use strict';
  // Only the two visible tools live here. Notes, journal and roll stores are not deleted.
  let services, access, activeId = null, epoch = 0, returnSection = 'overview', moduleName = 'dashboard';
  const el = id => document.getElementById(id);
  const allowed = () => Boolean(activeId && access?.unlocked);
  const working = () => Boolean(global.ConfrontationsUI?.busy);
  const focus = target => { if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true }); };
  const node = (tag, text, className = '') => { const result = document.createElement(tag); result.textContent = text; result.className = className; return result; };
  function feedback(message = '', id = 'masterShieldFeedback') { el(id).textContent = message; }
  function reset() {
    ++epoch; access?.close(); global.ConfrontationsUI?.reset();
    activeId = null; moduleName = 'dashboard';
    for (const id of ['masterShieldChronicleName','masterShieldChronicleType','masterShieldChronicleDate','masterShieldCastList','masterShieldConfrontationsList']) el(id).replaceChildren();
    el('masterShieldPrivate').hidden = true; el('chronicleMasterShieldView').hidden = true;
    el('lockMasterShield').hidden = true; feedback();
  }
  function requestExit(continuation) {
    if (!activeId) return false;
    if (working() || access.pending) { feedback('Aguarde o término da operação antes de sair.'); return true; }
    if (global.ConfrontationsUI?.requestExit(() => { reset(); continuation(); })) return true;
    reset(); return false;
  }
  function navigate(section, battleId, restoreTrigger = false) {
    const go = () => services.navigate(section, battleId, restoreTrigger);
    if (!requestExit(go)) return go();
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
        const [cast, battles] = await Promise.all([services.storage().listChronicleCastIds(id), services.storage().listConfrontations(id)]);
        if (canUse()) { el('masterHuntersSummary').textContent = cast.length + ' no Elenco'; el('masterCombatsSummary').textContent = battles.length + ' Confrontos'; }
      } catch (_) { if (canUse()) feedback('Não foi possível atualizar os resumos. Abra a ferramenta para tentar novamente.'); }
      return;
    }
    focus(el('masterModuleTitle'));
    try {
      if (name === 'hunters') {
        feedback('Carregando…','masterShieldCastFeedback');
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
      } else {
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
    void services.storage().getChronicle(id).then(chronicle => {
      if (token !== epoch || id !== activeId || !chronicle) return;
      el('masterShieldChronicleName').textContent = chronicle.name;
      el('masterShieldChronicleType').textContent = services.type(chronicle.type);
      el('masterShieldChronicleDate').textContent = 'Última alteração pública: ' + services.date(chronicle.updatedAt);
    }).catch(() => {});
    await access.open(id);
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
    el('lockMasterShield').addEventListener('click',() => access.lock());
    el('createMasterConfrontation').addEventListener('click',() => { if (allowed()) void global.ConfrontationsUI.openCreate({ returnTo:()=>openModule('combats') }); });
    document.querySelectorAll('[data-master-module]').forEach(button => button.addEventListener('click',() => void openModule(button.dataset.masterModule)));
  }
  global.MasterShieldUI = Object.freeze({ initialize, open, reset, requestExit,
    get isUnlocked() { return allowed(); }, executeCombat: id => { if (allowed()) return navigate('encounters', id); } });
})(window);
