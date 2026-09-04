from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label} anchor missing')
    return text.replace(old, new, 1)

script = Path('script.js')
s = script.read_text(encoding='utf-8')
s = replace_once(s,
'''function getChroniclesStorage() {
  if (!window.ChroniclesStorage) throw new Error('CHRONICLES_STORAGE_UNAVAILABLE');
  return window.ChroniclesOnline?.createRouter(window.ChroniclesStorage) || window.ChroniclesStorage;
}''',
'''function getChroniclesStorage() {
  if (!window.ChroniclesStorage) throw new Error('CHRONICLES_STORAGE_UNAVAILABLE');
  const base = window.ChroniclesOnline?.createRouter(window.ChroniclesStorage) || window.ChroniclesStorage;
  if (activeChronicleRecord?.storage === 'online' && window.ChroniclesOnlineCombat?.storage) {
    return Object.freeze({ ...base, ...window.ChroniclesOnlineCombat.storage });
  }
  return base;
}''', 'getChroniclesStorage')
s = replace_once(s,
'''  if (activeSection === 'participants') void renderChronicleParticipants();
  if (activeSection === 'encounters') void window.ConfrontationsUI?.renderIndex();''',
'''  if (activeSection === 'participants') void renderChronicleParticipants();
  if (activeSection === 'encounters') {
    if (activeChronicleRecord?.storage === 'online') void window.ChroniclesOnlineCombat?.render(activeChronicleRecord);
    else void window.ConfrontationsUI?.renderIndex();
  }''', 'encounters render')
s = replace_once(s,
'''    directory: getChronicleCharacterDirectory,
    readCharacter: readStoredCharacter,''',
'''    directory: () => activeChronicleRecord?.storage === 'online'
      ? (window.ChroniclesOnlineCombat?.directory() || { entries: [], byId: new Map(), unavailable: true })
      : getChronicleCharacterDirectory(),
    readCharacter: id => activeChronicleRecord?.storage === 'online'
      ? window.ChroniclesOnlineCombat?.readCharacter(id)
      : readStoredCharacter(id),''', 'confrontation services')
s = replace_once(s,
'''      if (battleId) { await window.ConfrontationsUI.open(battleId); return; }
      try {''',
'''      if (battleId) {
        if (activeChronicleRecord?.storage === 'online') await window.ChroniclesOnlineCombat?.render(activeChronicleRecord);
        else await window.ConfrontationsUI.open(battleId);
        return;
      }
      try {''', 'battle navigation')
script.write_text(s, encoding='utf-8')

confrontation = Path('js/confrontations.js')
c = confrontation.read_text(encoding='utf-8')
c = replace_once(c,
'''    preparation = { chronicleId: services.chronicleId() };
    directory = services.directory();
    showWork();''',
'''    preparation = { chronicleId: services.chronicleId() };
    await storage().listChronicleCastIds(preparation.chronicleId);
    directory = services.directory();
    showWork();''', 'openCreate directory')
confrontation.write_text(c, encoding='utf-8')

master = Path('js/master-shield.js')
m = master.read_text(encoding='utf-8')
m = replace_once(m,
'''        if (onlineOwner) {
          const cast = await onlineCastCount();
          if (canUse()) {
            el('masterHuntersSummary').textContent = cast + ' no Elenco';
            el('masterCombatsSummary').textContent = 'Confrontos online';
          }
        } else {
          const [cast, battles] = await Promise.all([services.storage().listChronicleCastIds(id), services.storage().listConfrontations(id)]);
          if (canUse()) { el('masterHuntersSummary').textContent = cast.length + ' no Elenco'; el('masterCombatsSummary').textContent = battles.length + ' Confrontos'; }
        }''',
'''        const [cast, battles] = await Promise.all([
          onlineOwner ? onlineCastCount() : services.storage().listChronicleCastIds(id).then(items => items.length),
          services.storage().listConfrontations(id)
        ]);
        if (canUse()) {
          el('masterHuntersSummary').textContent = cast + ' no Elenco';
          const active = battles.find(item => item.active);
          el('masterCombatsSummary').textContent = active ? `Ativo · ${active.name}` : `${battles.length} Confrontos`;
        }''', 'master dashboard')
placeholder = '''      } else if (onlineOwner) {
        el('masterShieldConfrontationsList').replaceChildren();
        feedback('O painel está liberado para o Mestre. A persistência compartilhada dos Confrontos será conectada ao backend online na etapa de Combates.','masterShieldConfrontationsFeedback');
        el('createMasterConfrontation').disabled = true;
        el('createMasterConfrontation').title = 'Criação de Confrontos online ainda não está conectada ao backend compartilhado.';
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
      }'''
shared = '''      } else {
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
      }'''
m = replace_once(m, placeholder, shared, 'online combats placeholder')
m = replace_once(m,
'''    el('createMasterConfrontation').addEventListener('click',() => { if (allowed() && !onlineOwner) void global.ConfrontationsUI.openCreate({ returnTo:()=>openModule('combats') }); });''',
'''    el('createMasterConfrontation').addEventListener('click',() => { if (allowed()) void global.ConfrontationsUI.openCreate({ returnTo:()=>openModule('combats') }); });''', 'master create')
master.write_text(m, encoding='utf-8')

online = Path('js/chronicles-online.js')
o = online.read_text(encoding='utf-8')
o = replace_once(o,
'''    global.ChroniclesSharing?.applyDetailMode(chronicle);
    global.ChroniclesCollaboration?.applyDetailMode(chronicle);''',
'''    global.ChroniclesSharing?.applyDetailMode(chronicle);
    global.ChroniclesCollaboration?.applyDetailMode(chronicle);
    global.ChroniclesOnlineCombat?.applyDetailMode?.(chronicle);''', 'online apply detail')
online.write_text(o, encoding='utf-8')

combat = Path('js/chronicles-online-combat.js')
b = combat.read_text(encoding='utf-8')
b = replace_once(b,
'''  function reset() {
    stopRealtime();''',
'''  function applyDetailMode(chronicle) {
    if (chronicle?.storage === 'online') {
      currentChronicle = chronicle;
      startRealtime(chronicle);
    } else reset();
  }

  function reset() {
    stopRealtime();''', 'combat apply detail')
b = replace_once(b,
'''    loadCastDirectory,
    render,
    reset,''',
'''    loadCastDirectory,
    render,
    applyDetailMode,
    reset,''', 'combat export')
b = replace_once(b,
'''  function detailPanel(full, user) {
    const panel = node('aside', 'online-combat-focus');
    const own = full.characterIds''',
'''  function detailPanel(full, user, owner = false) {
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
    const own = full.characterIds''', 'owner focus panel')
b = replace_once(b,
'''    layout.append(initiativeBoard(full, owner), detailPanel(full, user));''',
'''    layout.append(initiativeBoard(full, owner), detailPanel(full, user, owner));''', 'detail panel call')
combat.write_text(b, encoding='utf-8')

index = Path('index.html')
h = index.read_text(encoding='utf-8')
if 'css/chronicles-online-combat.css' not in h:
    h = replace_once(h, '<link rel="stylesheet" href="css/chronicles-collaboration.css?v=4">', '<link rel="stylesheet" href="css/chronicles-collaboration.css?v=4">\n  <link rel="stylesheet" href="css/chronicles-online-combat.css?v=online-combat-complete">', 'combat css include')
if 'js/chronicles-online-combat.js' not in h:
    h = replace_once(h, '<script src="js/chronicles-collaboration.js?v=4"></script>', '<script src="js/chronicles-collaboration.js?v=4"></script>\n  <script src="js/chronicles-online-combat.js?v=online-combat-complete"></script>', 'combat js include')
for pattern, replacement in [
    (r'js/confrontations\.js\?v=[^"\']+', 'js/confrontations.js?v=online-combat-complete'),
    (r'js/master-shield\.js\?v=[^"\']+', 'js/master-shield.js?v=online-combat-complete'),
    (r'js/chronicles-online\.js\?v=[^"\']+', 'js/chronicles-online.js?v=online-combat-complete'),
    (r'script\.js\?v=[^"\']+', 'script.js?v=online-combat-complete')
]:
    h, count = re.subn(pattern, replacement, h, count=1)
    if count != 1:
        raise SystemExit(f'cache reference missing: {pattern}')
index.write_text(h, encoding='utf-8')
