const STORAGE_KEY = 'cronicasRessonanciaFichaV3PreAlpha';
const LEGACY_STORAGE_KEY = 'cronicasRessonanciaFichaV1';
const ATTRIBUTE_IDS = ['forca', 'vigor', 'agilidade', 'intelecto', 'presenca'];

const pericias = [
  ['Artes', 'Presença'], ['Atletismo', 'Vigor'], ['Atualidades', 'Intelecto'],
  ['Carisma', 'Presença'], ['Ciências', 'Intelecto'], ['Combate', 'Força'],
  ['Crime', 'Agilidade'], ['Diplomacia', 'Presença'], ['Enganação', 'Presença'],
  ['Furtividade', 'Agilidade'], ['História', 'Intelecto'], ['Iniciativa', 'Agilidade'],
  ['Intuição', 'Presença'], ['Investigação', 'Intelecto'], ['Medicina', 'Intelecto'],
  ['Percepção', 'Presença'], ['Pilotagem', 'Agilidade'], ['Pontaria', 'Agilidade'],
  ['Profissão', 'Intelecto'], ['Reflexos', 'Agilidade'], ['Ressonância', 'Intelecto'],
  ['Sobrevivência', 'Intelecto'], ['Tática', 'Intelecto'], ['Tecnologia', 'Intelecto'],
  ['Vontade', 'Presença']
];

const graus = {
  'Sem Domínio': 0,
  'Praticante': 3,
  'Experiente': 6,
  'Mestre': 9
};

const classDefinitions = {
  Vanguarda: {
    pvBase: 24,
    pvPerLevel: 6,
    pnBase: 8,
    pnPerLevel: 2,
    ability: {
      nome: 'Postura de Combate',
      nivel: '1',
      custo: '1 PN',
      acao: 'Livre',
      frequencia: 'Uma vez por rodada',
      alcance: '',
      duracao: '',
      efeito: 'Você assume uma postura de combate até o início do seu próximo turno. Escolha um dos efeitos:\n\nPostura Agressiva: recebe +2 em testes de ataque corpo a corpo;\n\nPostura Defensiva: recebe +2 na Defesa.\n\nApenas uma postura pode permanecer ativa por vez.'
    }
  },
  Atirador: {
    pvBase: 20,
    pvPerLevel: 5,
    pnBase: 10,
    pnPerLevel: 3,
    ability: {
      nome: 'Mira Precisa',
      nivel: '1',
      custo: '1 PN',
      acao: 'Livre',
      frequencia: 'Uma vez por rodada',
      alcance: '',
      duracao: '',
      efeito: 'Antes de realizar um ataque à distância, você pode rolar +1d20 no teste de ataque e manter apenas o maior resultado entre todos os dados.\n\nEsse dado adicional é temporário e não aumenta seu atributo de Agilidade.'
    }
  },
  Arcano: {
    pvBase: 16,
    pvPerLevel: 4,
    pnBase: 16,
    pnPerLevel: 4,
    ability: {
      nome: 'Canalização Arcana',
      nivel: '1',
      custo: '1 PN',
      acao: 'Livre',
      frequencia: 'Uma vez por rodada',
      alcance: '',
      duracao: '',
      efeito: 'Antes de realizar um teste relacionado a uma Manifestação, você pode rolar +1d20 e manter apenas o maior resultado entre todos os dados.\n\nEsse dado adicional é temporário e não aumenta permanentemente nenhum atributo.'
    }
  },
  Guardião: {
    pvBase: 22,
    pvPerLevel: 5,
    pnBase: 12,
    pnPerLevel: 3,
    ability: {
      nome: 'Pulso Restaurador',
      nivel: '1',
      custo: '1 PN',
      acao: 'Padrão',
      frequencia: 'Uma vez por rodada',
      alcance: 'Curto',
      duracao: '',
      efeito: 'Escolha você ou uma criatura em alcance curto que possa enxergar. O alvo recupera 2d4 + Intelecto Pontos de Vida.\n\nEssa habilidade não pode ser utilizada em personagens mortos.'
    }
  }
};

const resourceLabels = {
  pvAtual: 'PV',
  pnAtual: 'PN',
  psAtual: 'PS'
};

const resourceProgressIds = {
  pvAtual: 'pvProgress',
  pnAtual: 'pnProgress',
  psAtual: 'psProgress'
};

const simpleFieldIds = [
  'nome', 'patente', 'idade', 'tipoNexo', 'nivel', 'assinatura', 'classe', 'formaConjuracao',
  'pvAtual', 'pvMax', 'pvTemporarios', 'pnAtual', 'pnMax', 'psAtual', 'psMax',
  'forca', 'vigor', 'agilidade', 'intelecto', 'presenca',
  'bonusDefesaEquipamento', 'totalis', 'protecaoPrincipal'
];

const state = {
  schemaVersion: '0.3-pre-alpha',
  photo: '',
  fields: {},
  skills: {},
  equipment: [],
  abilities: [],
  manifestations: []
};

let saveTimer;
let hasPendingSave = false;
let storageAvailable = true;
let isRestoring = false;
let lastAutomationSnapshot = null;

function numberValue(id) {
  return Math.max(0, Number(document.getElementById(id)?.value || 0));
}

function integerBetween(value, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function setStatus(text, mode = 'saved') {
  const status = document.getElementById('autosaveStatus');
  if (!status) return;
  status.textContent = text;
  status.classList.remove('saving', 'error');
  if (mode === 'saving') status.classList.add('saving');
  if (mode === 'error') status.classList.add('error');
}

function captureState() {
  state.schemaVersion = '0.3-pre-alpha';

  for (const id of simpleFieldIds) {
    state.fields[id] = document.getElementById(id)?.value ?? '';
  }

  document.querySelectorAll('.skill-row').forEach(row => {
    state.skills[row.dataset.skill] = row.querySelector('select').value;
  });

  state.equipment = captureDynamicList('listaEquipamentos');
  state.abilities = captureDynamicList('listaHabilidades', { excludeAutomatic: true });
  state.manifestations = captureDynamicList('listaManifestacoes');
}

function captureDynamicList(containerId, options = {}) {
  return [...document.querySelectorAll(`#${containerId} .editable-card`)]
    .filter(card => !(options.excludeAutomatic && card.classList.contains('automatic-class-ability')))
    .map(card => {
      const data = {};
      card.querySelectorAll('[data-field]').forEach(field => {
        data[field.dataset.field] = field.value;
      });
      return data;
    });
}

function saveNow() {
  clearTimeout(saveTimer);
  captureState();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    hasPendingSave = false;
    setStatus('Salvo');
    return true;
  } catch (error) {
    storageAvailable = false;
    console.error('Não foi possível salvar a ficha:', error);
    setStatus('Não salvo', 'error');
    return false;
  }
}

function scheduleSave() {
  if (isRestoring) return;
  hasPendingSave = true;
  setStatus('Salvando...', 'saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}

function getMaximumId(resourceId) {
  return resourceId.replace('Atual', 'Max');
}

function sanitizeResource(resourceId) {
  const currentInput = document.getElementById(resourceId);
  const maxInput = document.getElementById(getMaximumId(resourceId));
  if (!currentInput || !maxInput) return;

  currentInput.value = Math.max(0, Number(currentInput.value || 0));
  maxInput.value = Math.max(0, Number(maxInput.value || 0));
}

function updateResourceUI(resourceId) {
  sanitizeResource(resourceId);
  const current = numberValue(resourceId);
  const maximum = numberValue(getMaximumId(resourceId));
  const progress = document.getElementById(resourceProgressIds[resourceId]);

  if (progress) {
    const percentage = maximum > 0 ? Math.min(100, (current / maximum) * 100) : 0;
    progress.style.width = `${percentage}%`;
  }

  const card = document.querySelector(`[data-resource-card="${resourceId}"]`);
  if (card) {
    card.classList.toggle('resource-empty', current === 0 && maximum > 0);
    card.classList.toggle('resource-overmax', maximum > 0 && current > maximum);
    card.title = maximum > 0 && current > maximum
      ? `${resourceLabels[resourceId]} atual está acima do novo máximo. O valor atual foi preservado.`
      : '';
  }
}

function updateAllResources() {
  Object.keys(resourceLabels).forEach(updateResourceUI);
  const temporaryInput = document.getElementById('pvTemporarios');
  if (temporaryInput) temporaryInput.value = Math.max(0, Number(temporaryInput.value || 0));
}

function setAdjusterFeedback(message, kind = '') {
  const feedback = document.getElementById('ajusteFeedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.dataset.kind = kind;
}

function applyResourceDelta(resourceId, delta, showFeedback = true) {
  const currentInput = document.getElementById(resourceId);
  const maxInput = document.getElementById(getMaximumId(resourceId));
  if (!currentInput || !maxInput || !Number.isFinite(delta)) return;

  const label = resourceLabels[resourceId];
  const current = Math.max(0, Number(currentInput.value || 0));
  const maximum = Math.max(0, Number(maxInput.value || 0));
  let message = '';

  if (delta < 0 && resourceId === 'pvAtual') {
    const requestedDamage = Math.abs(delta);
    const temporaryInput = document.getElementById('pvTemporarios');
    const temporary = Math.max(0, Number(temporaryInput.value || 0));
    const absorbed = Math.min(temporary, requestedDamage);
    const remainingDamage = requestedDamage - absorbed;
    const actualDamage = Math.min(current, remainingDamage);

    temporaryInput.value = temporary - absorbed;
    currentInput.value = Math.max(0, current - remainingDamage);

    if (absorbed > 0) {
      message = `${requestedDamage} de dano: ${absorbed} absorvidos pelos PV temporários e ${actualDamage} retirados dos PV.`;
    } else {
      message = `${actualDamage} PV retirados.`;
    }
  } else {
    const upperLimit = maximum > 0 ? maximum : Number.MAX_SAFE_INTEGER;
    const next = delta > 0 && current > upperLimit
      ? current
      : Math.max(0, Math.min(upperLimit, current + delta));
    const changed = Math.abs(next - current);
    currentInput.value = next;

    if (delta < 0) message = `${changed} ${label} retirados.`;
    else if (current > upperLimit) message = `${label} já está acima do máximo calculado. Reduza o valor atual primeiro.`;
    else message = `${changed} ${label} recuperados.`;
  }

  updateResourceUI(resourceId);
  scheduleSave();
  if (showFeedback) setAdjusterFeedback(message || `${label} não foi alterado.`);
}

function restoreResourceToMaximum(resourceId) {
  const currentInput = document.getElementById(resourceId);
  const maxInput = document.getElementById(getMaximumId(resourceId));
  if (!currentInput || !maxInput) return;
  currentInput.value = Math.max(0, Number(maxInput.value || 0));
  updateResourceUI(resourceId);
  scheduleSave();
  setAdjusterFeedback(`${resourceLabels[resourceId]} restaurado ao máximo.`);
}

function restoreState(saved) {
  isRestoring = true;
  Object.assign(state, saved || {});
  state.schemaVersion = '0.3-pre-alpha';
  state.fields ||= {};
  state.skills ||= {};
  state.equipment ||= [];
  state.abilities ||= [];
  state.manifestations ||= [];

  for (const id of simpleFieldIds) {
    if (state.fields[id] !== undefined && document.getElementById(id)) {
      document.getElementById(id).value = state.fields[id];
    }
  }

  ATTRIBUTE_IDS.forEach(id => {
    const input = document.getElementById(id);
    input.value = integerBetween(input.value, 1, 6);
    input.dataset.lastValidValue = input.value;
  });

  if (state.photo) setPhoto(state.photo);

  document.querySelectorAll('.skill-row').forEach(row => {
    const selected = state.skills[row.dataset.skill] || 'Sem Domínio';
    row.querySelector('select').value = selected;
    updateSkillBonus(row);
  });

  restoreDynamicList('listaEquipamentos', 'templateEquipamento', state.equipment, 'Novo equipamento');
  restoreDynamicList('listaHabilidades', 'templateHabilidade', state.abilities, 'Nova habilidade');
  restoreDynamicList('listaManifestacoes', 'templateManifestacao', state.manifestations, 'Nova Manifestação');

  if (!state.manifestations.length) {
    for (let i = 1; i <= 5; i++) addDynamicCard('listaManifestacoes', 'templateManifestacao', { nome: `Manifestação ${i}` });
    addDynamicCard('listaManifestacoes', 'templateManifestacao', { nome: 'Manifestação X' });
  }

  updateAttributePointsUI();
  recalculateClassResources({ trigger: 'restore', previous: null });
  syncClassAbility();
  updateAllResources();
  recalculateDefense();
  lastAutomationSnapshot = getAutomationSnapshot();
  isRestoring = false;
}

function restoreDynamicList(containerId, templateId, items, defaultTitle) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (!items.length) return;
  items.forEach(item => addDynamicCard(containerId, templateId, item, defaultTitle));
}

function buildSkills() {
  const container = document.getElementById('listaPericias');
  container.innerHTML = '';

  pericias.forEach(([nome, atributo]) => {
    const row = document.createElement('div');
    row.className = 'skill-row';
    row.dataset.skill = nome;
    row.innerHTML = `
      <div class="skill-name">${nome}<span class="skill-attribute">${atributo}</span></div>
      <select aria-label="Grau de domínio em ${nome}">
        ${Object.keys(graus).map(grau => `<option>${grau}</option>`).join('')}
      </select>
      <span class="skill-bonus">+0</span>
    `;
    row.querySelector('select').addEventListener('change', () => {
      updateSkillBonus(row);
      recalculateDefense();
      scheduleSave();
    });
    container.appendChild(row);
  });
}

function updateSkillBonus(row) {
  const grau = row.querySelector('select').value;
  row.querySelector('.skill-bonus').textContent = `+${graus[grau]}`;
}

function getReflexDefenseBonus() {
  const row = [...document.querySelectorAll('.skill-row')].find(item => item.dataset.skill === 'Reflexos');
  if (!row) return 0;
  return Math.min(graus[row.querySelector('select').value] || 0, 3);
}

function recalculateDefense() {
  const agilidade = Number(document.getElementById('agilidade').value || 0);
  const equipamento = Number(document.getElementById('bonusDefesaEquipamento').value || 0);
  document.getElementById('defesaTotal').textContent = 10 + agilidade + getReflexDefenseBonus() + equipamento;
}

function getAutomationSnapshot() {
  return {
    classe: document.getElementById('classe').value,
    nivel: integerBetween(document.getElementById('nivel').value, 1, 11),
    vigor: integerBetween(document.getElementById('vigor').value, 1, 6),
    intelecto: integerBetween(document.getElementById('intelecto').value, 1, 6)
  };
}

function computeClassMaximums(snapshot) {
  const definition = classDefinitions[snapshot.classe];
  if (!definition) return null;
  const additionalLevels = Math.max(0, snapshot.nivel - 1);
  return {
    pvMax: definition.pvBase + snapshot.vigor + (definition.pvPerLevel * additionalLevels),
    pnMax: definition.pnBase + snapshot.intelecto + (definition.pnPerLevel * additionalLevels),
    psMax: 20 + (2 * additionalLevels)
  };
}

function setResourceMaximum(resourceId, newMaximum, options = {}) {
  const currentInput = document.getElementById(resourceId);
  const maxInput = document.getElementById(getMaximumId(resourceId));
  if (!currentInput || !maxInput) return;

  const oldMaximum = Math.max(0, Number(maxInput.value || 0));
  const current = Math.max(0, Number(currentInput.value || 0));
  maxInput.value = newMaximum;

  if (options.fillCurrent) {
    currentInput.value = newMaximum;
  } else if (options.followFullAtLevelOne && current === oldMaximum) {
    currentInput.value = newMaximum;
  }

  updateResourceUI(resourceId);
}

function updateCalculatedFieldState(hasClass) {
  ['pvMax', 'pnMax', 'psMax'].forEach(id => {
    const input = document.getElementById(id);
    input.readOnly = hasClass;
    input.classList.toggle('calculated-field', hasClass);
    input.title = hasClass ? 'Calculado automaticamente pela classe, nível e atributos.' : '';
  });
}

function updateClassAutomationStatus(snapshot, maximums) {
  const status = document.getElementById('classAutomationStatus');
  if (!status) return;

  if (!maximums) {
    status.classList.remove('active', 'warning');
    status.innerHTML = '<strong>Automação de classe</strong><span>Selecione uma classe para calcular PV, PN e PS máximos e adicionar a habilidade inicial.</span>';
    return;
  }

  const overMaximum = [
    ['PV', numberValue('pvAtual'), maximums.pvMax],
    ['PN', numberValue('pnAtual'), maximums.pnMax],
    ['PS', numberValue('psAtual'), maximums.psMax]
  ].filter(([, current, maximum]) => current > maximum);

  const warning = overMaximum.length
    ? ` Atenção: ${overMaximum.map(([label]) => label).join(', ')} atual está acima do novo máximo e foi preservado.`
    : ' Os valores atuais não são recuperados ao subir de nível.';

  status.classList.add('active');
  status.classList.toggle('warning', overMaximum.length > 0);
  status.innerHTML = `<strong>${snapshot.classe} · Nível ${snapshot.nivel}</strong><span>Máximos calculados: ${maximums.pvMax} PV · ${maximums.pnMax} PN · ${maximums.psMax} PS.${warning}</span>`;
}

function recalculateClassResources({ trigger = 'manual', previous = lastAutomationSnapshot } = {}) {
  const snapshot = getAutomationSnapshot();
  const maximums = computeClassMaximums(snapshot);
  updateCalculatedFieldState(Boolean(maximums));

  if (!maximums) {
    updateClassAutomationStatus(snapshot, null);
    lastAutomationSnapshot = snapshot;
    return;
  }

  const firstClassSelection = Boolean(
    trigger === 'classe' &&
    snapshot.classe &&
    !previous?.classe &&
    numberValue('pvMax') === 0 &&
    numberValue('pnMax') === 0
  );
  const levelOneAttributeChange = snapshot.nivel === 1 && (trigger === 'vigor' || trigger === 'intelecto');

  setResourceMaximum('pvAtual', maximums.pvMax, {
    fillCurrent: firstClassSelection,
    followFullAtLevelOne: levelOneAttributeChange && trigger === 'vigor'
  });

  setResourceMaximum('pnAtual', maximums.pnMax, {
    fillCurrent: firstClassSelection,
    followFullAtLevelOne: levelOneAttributeChange && trigger === 'intelecto'
  });

  setResourceMaximum('psAtual', maximums.psMax, {
    fillCurrent: firstClassSelection && numberValue('psAtual') === 0
  });

  updateClassAutomationStatus(snapshot, maximums);
  lastAutomationSnapshot = snapshot;
}

function getAttributeValues() {
  return ATTRIBUTE_IDS.map(id => integerBetween(document.getElementById(id).value, 1, 6));
}

function getInitialAttributePointsUsed() {
  return getAttributeValues().reduce((total, value) => total + Math.max(0, value - 1), 0);
}

function updateAttributePointsUI(message = '') {
  const level = integerBetween(document.getElementById('nivel').value, 1, 11);
  const panel = document.getElementById('attributePointsPanel');
  const availableElement = document.getElementById('attributePointsAvailable');
  const help = document.getElementById('attributePointsHelp');
  const used = getInitialAttributePointsUsed();

  panel.classList.remove('warning', 'manual-mode');

  if (level === 1) {
    const available = 1 - used;
    availableElement.textContent = Math.max(0, available);
    panel.querySelector('span').textContent = available === 1 ? 'Ponto inicial disponível' : 'Pontos iniciais disponíveis';

    if (used > 1) {
      panel.classList.add('warning');
      availableElement.textContent = `−${used - 1}`;
      help.textContent = message || 'Existem pontos extras acima da criação inicial. Ajuste os atributos para usar somente 1 ponto adicional.';
    } else {
      help.textContent = message || 'Todos começam em 1. No nível 1, distribua apenas 1 ponto adicional.';
    }
  } else {
    panel.classList.add('manual-mode');
    panel.querySelector('span').textContent = 'Progressão de atributos';
    availableElement.textContent = 'Manual';
    help.textContent = message || 'A distribuição inicial já terminou. Nesta Pré-Alpha, aumentos de níveis posteriores permanecem em edição manual.';
  }

  updateAttributeButtons();
}

function updateAttributeButtons() {
  const level = integerBetween(document.getElementById('nivel').value, 1, 11);
  const used = getInitialAttributePointsUsed();

  document.querySelectorAll('.attribute-step').forEach(button => {
    const input = document.getElementById(button.dataset.attribute);
    const step = Number(button.dataset.step || 0);
    const value = integerBetween(input.value, 1, 6);

    if (step < 0) button.disabled = value <= 1;
    if (step > 0) button.disabled = value >= 6 || (level === 1 && used >= 1);
  });
}

function commitAttributeValue(input, nextValue, trigger) {
  input.value = integerBetween(nextValue, 1, 6);
  input.dataset.lastValidValue = input.value;
  updateAttributePointsUI();
  recalculateDefense();
  if (input.id === 'vigor' || input.id === 'intelecto') {
    recalculateClassResources({ trigger: input.id });
  }
  scheduleSave();
}

function trySetAttribute(input, nextValue) {
  const oldValue = integerBetween(input.dataset.lastValidValue || input.value, 1, 6);
  const level = integerBetween(document.getElementById('nivel').value, 1, 11);
  input.value = integerBetween(nextValue, 1, 6);

  if (level === 1 && getInitialAttributePointsUsed() > 1) {
    input.value = oldValue;
    updateAttributePointsUI('No nível 1, você possui apenas 1 ponto adicional para distribuir.');
    return false;
  }

  commitAttributeValue(input, input.value, input.id);
  return true;
}

function bindAttributeControls() {
  ATTRIBUTE_IDS.forEach(id => {
    const input = document.getElementById(id);
    input.dataset.lastValidValue = integerBetween(input.value, 1, 6);

    input.addEventListener('change', () => {
      trySetAttribute(input, input.value);
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') input.blur();
    });
  });

  document.querySelectorAll('.attribute-step').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.attribute);
      const step = Number(button.dataset.step || 0);
      trySetAttribute(input, integerBetween(input.value, 1, 6) + step);
    });
  });
}

function setPhoto(dataUrl) {
  state.photo = dataUrl || '';
  const wrapper = document.querySelector('.portrait-upload');
  const img = document.getElementById('fotoPreview');
  if (dataUrl) {
    img.src = dataUrl;
    wrapper.classList.add('has-image');
  } else {
    img.removeAttribute('src');
    wrapper.classList.remove('has-image');
  }
}

function addDynamicCard(containerId, templateId, values = {}, defaultTitle = '') {
  const template = document.getElementById(templateId);
  const card = template.content.firstElementChild.cloneNode(true);
  const container = document.getElementById(containerId);

  card.querySelectorAll('[data-field]').forEach(field => {
    if (values[field.dataset.field] !== undefined) field.value = values[field.dataset.field];
    field.addEventListener('input', () => {
      updateCardTitle(card, defaultTitle);
      scheduleSave();
    });
  });

  card.querySelector('.remove-card').addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    card.remove();
    scheduleSave();
  });

  const useButton = card.querySelector('.use-manifestation');
  if (useButton) {
    useButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const cost = Math.max(0, Number(card.querySelector('[data-field="custo"]').value || 0));
      const current = numberValue('pnAtual');
      const name = card.querySelector('[data-field="nome"]')?.value.trim() || 'esta Manifestação';

      if (cost > current) {
        alert('PN insuficiente para utilizar esta Manifestação.');
        return;
      }

      if (cost > 0 && !confirm(`Usar ${name} e gastar ${cost} PN?`)) return;
      applyResourceDelta('pnAtual', -cost, false);
      setAdjusterFeedback(`${name} utilizada. Custo: ${cost} PN.`);
    });
  }

  container.appendChild(card);
  updateCardTitle(card, defaultTitle);
  return card;
}

function addAutomaticClassAbility(className) {
  const definition = classDefinitions[className];
  if (!definition) return null;

  const template = document.getElementById('templateHabilidade');
  const card = template.content.firstElementChild.cloneNode(true);
  card.classList.add('automatic-class-ability');
  card.dataset.automaticClass = className;
  card.open = true;

  const removeButton = card.querySelector('.remove-card');
  removeButton.remove();

  const badge = document.createElement('span');
  badge.className = 'automatic-badge';
  badge.textContent = `${className} · automática`;
  card.querySelector('summary').appendChild(badge);

  card.querySelectorAll('[data-field]').forEach(field => {
    field.value = definition.ability[field.dataset.field] ?? '';
    field.readOnly = true;
    field.classList.add('automatic-field');
  });

  updateCardTitle(card, definition.ability.nome);
  document.getElementById('listaHabilidades').prepend(card);
  return card;
}

function syncClassAbility() {
  document.querySelectorAll('.automatic-class-ability').forEach(card => card.remove());
  const className = document.getElementById('classe').value;
  if (classDefinitions[className]) addAutomaticClassAbility(className);
}

function updateCardTitle(card, fallback) {
  const nameInput = card.querySelector('[data-field="nome"]');
  const title = card.querySelector('.card-title');
  if (title) title.textContent = nameInput?.value.trim() || fallback;
}

function bindSimpleFields() {
  simpleFieldIds.forEach(id => {
    const element = document.getElementById(id);
    if (!element || ATTRIBUTE_IDS.includes(id)) return;

    element.addEventListener('input', () => {
      if (id === 'agilidade' || id === 'bonusDefesaEquipamento') recalculateDefense();

      if (resourceLabels[id]) {
        const maximum = numberValue(getMaximumId(id));
        const value = Math.max(0, Number(element.value || 0));
        element.value = maximum > 0 ? Math.min(value, maximum) : value;
        updateResourceUI(id);
      }

      if (id.endsWith('Max')) updateResourceUI(id.replace('Max', 'Atual'));
      if (id === 'pvTemporarios') element.value = Math.max(0, Number(element.value || 0));

      if (id === 'nivel') {
        element.value = integerBetween(element.value, 1, 11);
        updateAttributePointsUI();
        recalculateClassResources({ trigger: 'nivel' });
      }

      if (id === 'classe') {
        recalculateClassResources({ trigger: 'classe' });
        syncClassAbility();
      }

      scheduleSave();
    });
  });

  document.querySelectorAll('[data-resource]').forEach(button => {
    button.addEventListener('click', () => {
      applyResourceDelta(button.dataset.resource, Number(button.dataset.step || 0));
    });
  });

  document.getElementById('fotoPersonagem').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(reader.result);
      scheduleSave();
    };
    reader.readAsDataURL(file);
  });
}

function bindResourceAdjuster() {
  const resourceSelect = document.getElementById('ajusteRecurso');
  const amountInput = document.getElementById('ajusteValor');

  function readAmount() {
    const amount = Math.max(0, Number(amountInput.value || 0));
    if (!amount) {
      setAdjusterFeedback('Digite um valor maior que zero.', 'error');
      amountInput.focus();
      return null;
    }
    return amount;
  }

  document.getElementById('reduzirRecurso').addEventListener('click', () => {
    const amount = readAmount();
    if (amount === null) return;
    applyResourceDelta(resourceSelect.value, -amount);
    amountInput.value = '';
  });

  document.getElementById('recuperarRecurso').addEventListener('click', () => {
    const amount = readAmount();
    if (amount === null) return;
    applyResourceDelta(resourceSelect.value, amount);
    amountInput.value = '';
  });

  document.getElementById('restaurarRecurso').addEventListener('click', () => {
    restoreResourceToMaximum(resourceSelect.value);
  });

  amountInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') document.getElementById('reduzirRecurso').click();
  });
}

function bindDynamicButtons() {
  document.getElementById('adicionarEquipamento').addEventListener('click', () => {
    addDynamicCard('listaEquipamentos', 'templateEquipamento', {}, 'Novo equipamento');
    scheduleSave();
  });

  document.getElementById('adicionarHabilidade').addEventListener('click', () => {
    addDynamicCard('listaHabilidades', 'templateHabilidade', {}, 'Nova habilidade');
    scheduleSave();
  });

  document.getElementById('adicionarManifestacao').addEventListener('click', () => {
    addDynamicCard('listaManifestacoes', 'templateManifestacao', {}, 'Nova Manifestação');
    scheduleSave();
  });
}

function bindMobileNavigation() {
  const buttons = document.querySelectorAll('[data-mobile-target]');
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      buttons.forEach(item => item.classList.toggle('active', item === button));
      document.querySelectorAll('.mobile-section').forEach(section => {
        section.classList.toggle('active', section.dataset.mobileSection === button.dataset.mobileTarget);
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function exportSheet() {
  captureState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  const safeName = (document.getElementById('nome').value || 'personagem').trim().replace(/[^\p{L}\p{N}-]+/gu, '-').toLowerCase();
  link.href = URL.createObjectURL(blob);
  link.download = `${safeName || 'personagem'}-cronicas-da-ressonancia.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importSheet(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported || typeof imported !== 'object') throw new Error('Formato inválido');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
      location.reload();
    } catch (error) {
      console.error(error);
      alert('O arquivo selecionado não é uma ficha válida ou o navegador bloqueou o armazenamento.');
    }
  };
  reader.readAsText(file);
}

function bindHeaderActions() {
  document.getElementById('exportarFicha').addEventListener('click', exportSheet);
  document.getElementById('importarFicha').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) importSheet(file);
    event.target.value = '';
  });

  document.getElementById('limparFicha').addEventListener('click', () => {
    const firstConfirmation = confirm('Apagar todos os dados desta ficha? Esta ação não poderá ser desfeita sem um arquivo exportado.');
    if (!firstConfirmation) return;
    const finalConfirmation = confirm('Confirma novamente que deseja limpar a ficha inteira?');
    if (!finalConfirmation) return;

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error(error);
    }
    location.reload();
  });
}

function loadSavedState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);

    // Não migra automaticamente a v0.2 para evitar alterar o backup estável.
    // A ficha antiga continua disponível sob sua própria chave de armazenamento.
    void LEGACY_STORAGE_KEY;
    return {};
  } catch (error) {
    storageAvailable = false;
    console.error('Não foi possível carregar a ficha salva:', error);
    setStatus('Armazenamento bloqueado', 'error');
    return {};
  }
}

function init() {
  buildSkills();
  bindSimpleFields();
  bindAttributeControls();
  bindResourceAdjuster();
  bindDynamicButtons();
  bindMobileNavigation();
  bindHeaderActions();
  restoreState(loadSavedState());
  if (storageAvailable) setStatus('Salvo');

  window.addEventListener('beforeunload', () => {
    if (hasPendingSave) saveNow();
  });
}

document.addEventListener('DOMContentLoaded', init);
