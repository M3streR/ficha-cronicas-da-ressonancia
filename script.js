const STORAGE_KEY = 'cronicasRessonanciaFichaV3PreAlpha';
const LEGACY_STORAGE_KEY = 'cronicasRessonanciaFichaV1';
const CONTENT_SECTION_SESSION_KEY = 'cronicasRessonanciaContentSection';
const RESOURCE_BAR_SESSION_KEY = 'cronicasRessonanciaResourceBarCollapsed';
const NOTICE_SESSION_KEY = 'cronicasRessonanciaPendingNotice';
const CHARACTER_MANAGER_STORAGE_KEY = 'cronicasRessonanciaCharacterManagerV4';
const CHARACTER_STORAGE_PREFIX = 'cronicasRessonanciaCharacterV4:';
const CHARACTER_MANAGER_STORAGE_VERSION = 1;
const CHARACTER_THUMBNAIL_WIDTH = 240;
const CHARACTER_THUMBNAIL_HEIGHT = 300;
const CHARACTER_THUMBNAIL_QUALITY = 0.72;
const V3_MIGRATION_ID = 'v3SingleCharacter';
const LARGE_IMAGE_BYTES = 1.5 * 1024 * 1024;
const ATTRIBUTE_IDS = ['forca', 'vigor', 'agilidade', 'intelecto', 'presenca'];

const pericias = [
  ['Acrobacia', 'Vigor'], ['Artes', 'Presença'], ['Atletismo', 'Vigor'], ['Atualidades', 'Intelecto'],
  ['Carisma', 'Presença'], ['Ciências', 'Intelecto'], ['Combate', 'Força'],
  ['Crime', 'Agilidade'], ['Diplomacia', 'Presença'], ['Enganação', 'Presença'],
  ['Fortitude', 'Vigor'], ['Furtividade', 'Agilidade'], ['História', 'Intelecto'], ['Iniciativa', 'Agilidade'],
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
  manifestations: [],
  automaticAbilityFavorites: {},
  notes: [],
  activeEffects: []
};

const favoriteFilterModes = {
  equipment: 'all',
  ability: 'all',
  manifestation: 'all'
};

const favoriteSectionContainers = {
  equipment: 'listaEquipamentos',
  ability: 'listaHabilidades',
  manifestation: 'listaManifestacoes'
};

let saveTimer;
let hasPendingSave = false;
let pendingSaveTargetId = null;
let activeCharacterId = null;
let storageMode = 'legacy';
let metadataUpdatePromise = Promise.resolve();
let isCreatingCharacter = false;
let isImportingCharacterFromMenu = false;
let isDeletingCharacter = false;
let isDuplicatingCharacter = false;
let isViewTransitioning = false;
let openCharacterOptions = null;
let storageAvailable = true;
let isRestoring = false;
let lastAutomationSnapshot = null;
let notificationTimer;
let modalReturnFocus = null;
let notesReturnScrollY = 0;
const initialFieldValues = {};

function createEmptyCharacterManager() {
  return {
    storageVersion: CHARACTER_MANAGER_STORAGE_VERSION,
    activeCharacterId: null,
    order: [],
    characters: {},
    migrations: {}
  };
}

function createCharacterId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  const randomPart = cryptoApi?.getRandomValues
    ? [...cryptoApi.getRandomValues(new Uint32Array(4))].map(value => value.toString(36)).join('')
    : `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `character-${Date.now().toString(36)}-${randomPart}`;
}

function isValidCharacterId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{12,128}$/.test(id);
}

function getCharacterStorageKey(id) {
  if (!isValidCharacterId(id)) throw new Error('INVALID_CHARACTER_ID');
  return `${CHARACTER_STORAGE_PREFIX}${id}`;
}

function isValidCharacterSummary(summary) {
  if (!isPlainObject(summary)) return false;
  if (typeof summary.name !== 'string') return false;
  if (!Number.isInteger(summary.level) || summary.level < 1 || summary.level > 11) return false;
  if (typeof summary.thumbnail !== 'string') return false;
  if (summary.thumbnail && !summary.thumbnail.startsWith('data:image/')) return false;
  if (summary.photoFingerprint !== undefined && typeof summary.photoFingerprint !== 'string') return false;
  if (typeof summary.updatedAt !== 'string' || !Number.isFinite(Date.parse(summary.updatedAt))) return false;
  return true;
}

function validateCharacterManager(manager) {
  if (!isPlainObject(manager) || manager.storageVersion !== CHARACTER_MANAGER_STORAGE_VERSION) {
    return { valid: false, message: 'O índice de personagens não possui uma versão reconhecida.' };
  }
  if (!Array.isArray(manager.order) || !isPlainObject(manager.characters) || !isPlainObject(manager.migrations)) {
    return { valid: false, message: 'O índice de personagens está incompleto.' };
  }
  if (manager.activeCharacterId !== null && !isValidCharacterId(manager.activeCharacterId)) {
    return { valid: false, message: 'O personagem ativo do índice é inválido.' };
  }

  const orderedIds = new Set();
  for (const id of manager.order) {
    if (!isValidCharacterId(id) || orderedIds.has(id) || !isValidCharacterSummary(manager.characters[id])) {
      return { valid: false, message: 'A ordem dos personagens contém uma entrada inválida.' };
    }
    orderedIds.add(id);
  }

  const summaryIds = Object.keys(manager.characters);
  if (summaryIds.some(id => !orderedIds.has(id) || !isValidCharacterId(id))) {
    return { valid: false, message: 'O índice contém personagens fora da lista principal.' };
  }
  if (manager.activeCharacterId && !orderedIds.has(manager.activeCharacterId)) {
    return { valid: false, message: 'O personagem ativo não existe mais no índice.' };
  }

  return { valid: true };
}

function readCharacterManager() {
  const serialized = localStorage.getItem(CHARACTER_MANAGER_STORAGE_KEY);
  if (serialized === null) return null;
  const manager = JSON.parse(serialized);
  const validation = validateCharacterManager(manager);
  if (!validation.valid) throw new Error(`INVALID_CHARACTER_MANAGER: ${validation.message}`);
  return manager;
}

function writeCharacterManager(manager) {
  const validation = validateCharacterManager(manager);
  if (!validation.valid) throw new Error(`INVALID_CHARACTER_MANAGER: ${validation.message}`);
  const serialized = JSON.stringify(manager);
  localStorage.setItem(CHARACTER_MANAGER_STORAGE_KEY, serialized);
  if (localStorage.getItem(CHARACTER_MANAGER_STORAGE_KEY) !== serialized) {
    throw new Error('CHARACTER_MANAGER_WRITE_VERIFICATION_FAILED');
  }
  return manager;
}

function setCharacterSummary(manager, id, summary) {
  const validation = validateCharacterManager(manager);
  if (!validation.valid) throw new Error(`INVALID_CHARACTER_MANAGER: ${validation.message}`);
  if (!isValidCharacterId(id)) throw new Error('INVALID_CHARACTER_ID');
  if (!isValidCharacterSummary(summary)) throw new Error('INVALID_CHARACTER_SUMMARY');

  const nextManager = JSON.parse(JSON.stringify(manager));
  if (!nextManager.order.includes(id)) nextManager.order.push(id);
  nextManager.characters[id] = { ...summary };
  return nextManager;
}

function setActiveCharacterId(manager, id = null) {
  const validation = validateCharacterManager(manager);
  if (!validation.valid) throw new Error(`INVALID_CHARACTER_MANAGER: ${validation.message}`);
  if (id !== null && (!isValidCharacterId(id) || !manager.order.includes(id))) {
    throw new Error('INVALID_ACTIVE_CHARACTER');
  }

  const nextManager = JSON.parse(JSON.stringify(manager));
  nextManager.activeCharacterId = id;
  return nextManager;
}

function removeCharacterFromManager(manager, id) {
  const validation = validateCharacterManager(manager);
  if (!validation.valid) throw new Error(`INVALID_CHARACTER_MANAGER: ${validation.message}`);
  if (!isValidCharacterId(id)) throw new Error('INVALID_CHARACTER_ID');

  const nextManager = JSON.parse(JSON.stringify(manager));
  nextManager.order = nextManager.order.filter(characterId => characterId !== id);
  delete nextManager.characters[id];
  if (nextManager.activeCharacterId === id) nextManager.activeCharacterId = null;
  return nextManager;
}

function readStoredCharacter(id) {
  const serialized = localStorage.getItem(getCharacterStorageKey(id));
  if (serialized === null) return null;
  const character = JSON.parse(serialized);
  if (!isPlainObject(character)) throw new Error('INVALID_STORED_CHARACTER');
  return character;
}

function writeStoredCharacter(id, character) {
  if (!isPlainObject(character)) throw new Error('INVALID_STORED_CHARACTER');
  const key = getCharacterStorageKey(id);
  const serialized = JSON.stringify(character);
  localStorage.setItem(key, serialized);
  if (localStorage.getItem(key) !== serialized) {
    throw new Error('CHARACTER_WRITE_VERIFICATION_FAILED');
  }
  return character;
}

function removeStoredCharacter(id) {
  const key = getCharacterStorageKey(id);
  localStorage.removeItem(key);
  if (localStorage.getItem(key) !== null) throw new Error('CHARACTER_REMOVE_VERIFICATION_FAILED');
}

function listStoredCharacters(manager = readCharacterManager()) {
  if (!manager) return [];
  return manager.order.map(id => ({
    id,
    summary: { ...manager.characters[id] },
    character: readStoredCharacter(id)
  }));
}

function inspectCharacterStorage(manager = readCharacterManager()) {
  const indexedIds = new Set(manager?.order || []);
  const missingCharacterIds = [...indexedIds].filter(id => (
    localStorage.getItem(getCharacterStorageKey(id)) === null
  ));
  const orphanedCharacterIds = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(CHARACTER_STORAGE_PREFIX)) continue;
    const id = key.slice(CHARACTER_STORAGE_PREFIX.length);
    if (isValidCharacterId(id) && !indexedIds.has(id)) orphanedCharacterIds.push(id);
  }

  return { missingCharacterIds, orphanedCharacterIds };
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('INVALID_CHARACTER_PHOTO'));
    image.src = dataUrl;
  });
}

async function createCharacterThumbnail(photoDataUrl) {
  if (!photoDataUrl) return '';
  if (typeof photoDataUrl !== 'string' || !photoDataUrl.startsWith('data:image/')) {
    throw new Error('INVALID_CHARACTER_PHOTO');
  }

  const image = await loadImageFromDataUrl(photoDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = CHARACTER_THUMBNAIL_WIDTH;
  canvas.height = CHARACTER_THUMBNAIL_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('THUMBNAIL_CANVAS_UNAVAILABLE');

  const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const sourceWidth = canvas.width / scale;
  const sourceHeight = canvas.height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas.toDataURL('image/jpeg', CHARACTER_THUMBNAIL_QUALITY);
}

async function createCharacterSummary(character) {
  if (!isPlainObject(character)) throw new Error('INVALID_STORED_CHARACTER');
  const fields = isPlainObject(character.fields) ? character.fields : {};
  return {
    name: String(fields.nome || '').trim(),
    level: integerBetween(fields.nivel, 1, 11),
    thumbnail: await createCharacterThumbnail(character.photo || ''),
    photoFingerprint: createPhotoFingerprint(character.photo || ''),
    updatedAt: new Date().toISOString()
  };
}

function createPhotoFingerprint(photoDataUrl) {
  if (!photoDataUrl) return '';
  let hash = 2166136261;
  for (let index = 0; index < photoDataUrl.length; index += 1) {
    hash = Math.imul(hash ^ photoDataUrl.charCodeAt(index), 16777619);
  }
  return `${photoDataUrl.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

async function createLegacyCharacterId(serializedCharacter) {
  const bytes = new TextEncoder().encode(serializedCharacter);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const fingerprint = [...new Uint8Array(digest)]
      .slice(0, 16)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
    return `legacy-v3-${fingerprint}`;
  }

  let firstHash = 2166136261;
  let secondHash = 2246822519;
  for (const byte of bytes) {
    firstHash = Math.imul(firstHash ^ byte, 16777619);
    secondHash = Math.imul(secondHash ^ byte, 3266489917);
  }
  return `legacy-v3-${(firstHash >>> 0).toString(16).padStart(8, '0')}${(secondHash >>> 0).toString(16).padStart(8, '0')}`;
}

function hasCompletedV3Migration(manager) {
  const migration = manager?.migrations?.[V3_MIGRATION_ID];
  if (!migration) return false;
  if (
    migration.status !== 'completed'
    || migration.sourceKey !== STORAGE_KEY
    || !isValidCharacterId(migration.characterId)
  ) {
    throw new Error('INVALID_V3_MIGRATION_MARKER');
  }

  if (migration.v4ActivatedAt) {
    if (!Number.isFinite(Date.parse(migration.v4ActivatedAt))) {
      throw new Error('INVALID_V4_ACTIVATION_MARKER');
    }
    return true;
  }

  if (
    !manager.order.includes(migration.characterId)
    || !manager.characters[migration.characterId]
  ) {
    throw new Error('INVALID_V3_MIGRATION_MARKER');
  }
  if (localStorage.getItem(getCharacterStorageKey(migration.characterId)) === null) {
    throw new Error('MIGRATED_CHARACTER_NOT_FOUND');
  }
  return true;
}

async function migrateV3CharacterToManager() {
  const serializedLegacyCharacter = localStorage.getItem(STORAGE_KEY);
  if (serializedLegacyCharacter === null) return { status: 'not-needed' };

  const existingManager = readCharacterManager();
  if (existingManager && hasCompletedV3Migration(existingManager)) {
    return { status: 'already-completed' };
  }

  let legacyCharacter;
  try {
    legacyCharacter = JSON.parse(serializedLegacyCharacter);
  } catch (error) {
    throw new Error('INVALID_V3_CHARACTER_JSON', { cause: error });
  }

  const validation = validateImportedSheet(legacyCharacter);
  if (!validation.valid) {
    throw new Error(`INVALID_V3_CHARACTER: ${validation.message}`);
  }

  const characterId = await createLegacyCharacterId(serializedLegacyCharacter);
  const summary = await createCharacterSummary(legacyCharacter);
  const storedCharacter = readStoredCharacter(characterId);

  if (storedCharacter === null) {
    writeStoredCharacter(characterId, legacyCharacter);
  } else if (JSON.stringify(storedCharacter) !== JSON.stringify(legacyCharacter)) {
    throw new Error('LEGACY_CHARACTER_ID_CONFLICT');
  }

  const verifiedCharacter = readStoredCharacter(characterId);
  if (JSON.stringify(verifiedCharacter) !== JSON.stringify(legacyCharacter)) {
    throw new Error('LEGACY_CHARACTER_COPY_VERIFICATION_FAILED');
  }

  let nextManager = setCharacterSummary(existingManager || createEmptyCharacterManager(), characterId, summary);
  nextManager.migrations[V3_MIGRATION_ID] = {
    status: 'completed',
    sourceKey: STORAGE_KEY,
    characterId,
    completedAt: new Date().toISOString(),
    v4ActivatedAt: new Date().toISOString()
  };
  nextManager = setActiveCharacterId(nextManager, characterId);
  writeCharacterManager(nextManager);

  return { status: 'completed', characterId };
}

async function activateMigratedCharacterStorage() {
  const manager = readCharacterManager();
  const migration = manager?.migrations?.[V3_MIGRATION_ID];
  if (!migration || migration.v4ActivatedAt) return false;

  const serializedLegacyCharacter = localStorage.getItem(STORAGE_KEY);
  if (serializedLegacyCharacter === null) throw new Error('V3_RECOVERY_COPY_NOT_FOUND');
  const legacyCharacter = JSON.parse(serializedLegacyCharacter);
  const validation = validateImportedSheet(legacyCharacter);
  if (!validation.valid) throw new Error(`INVALID_V3_RECOVERY_COPY: ${validation.message}`);

  writeStoredCharacter(migration.characterId, legacyCharacter);
  const verifiedCharacter = readStoredCharacter(migration.characterId);
  if (JSON.stringify(verifiedCharacter) !== JSON.stringify(legacyCharacter)) {
    throw new Error('V4_ACTIVATION_COPY_VERIFICATION_FAILED');
  }

  const summary = await createCharacterSummary(legacyCharacter);
  const latestManager = readCharacterManager();
  let nextManager = setCharacterSummary(latestManager, migration.characterId, summary);
  nextManager.migrations[V3_MIGRATION_ID] = {
    ...nextManager.migrations[V3_MIGRATION_ID],
    v4ActivatedAt: new Date().toISOString()
  };
  writeCharacterManager(nextManager);
  return true;
}

function cloneCharacterState(character = state) {
  return JSON.parse(JSON.stringify(character));
}

function discardPendingSave() {
  clearTimeout(saveTimer);
  hasPendingSave = false;
  pendingSaveTargetId = null;
}

async function refreshCharacterMetadata(id, character) {
  const manager = readCharacterManager();
  if (!manager || !manager.order.includes(id)) throw new Error('CHARACTER_NOT_INDEXED');
  const currentSummary = manager.characters[id];
  const fields = isPlainObject(character.fields) ? character.fields : {};
  const name = String(fields.nome || '').trim();
  const level = integerBetween(fields.nivel, 1, 11);
  const photoFingerprint = createPhotoFingerprint(character.photo || '');
  const nameChanged = currentSummary.name !== name;
  const levelChanged = currentSummary.level !== level;
  const photoChanged = currentSummary.photoFingerprint !== photoFingerprint;
  if (!nameChanged && !levelChanged && !photoChanged) return false;

  const nextSummary = {
    name,
    level,
    thumbnail: photoChanged
      ? await createCharacterThumbnail(character.photo || '')
      : currentSummary.thumbnail,
    photoFingerprint,
    updatedAt: new Date().toISOString()
  };
  writeCharacterManager(setCharacterSummary(readCharacterManager(), id, nextSummary));
  return true;
}

function queueCharacterMetadataRefresh(id, character) {
  metadataUpdatePromise = metadataUpdatePromise
    .catch(() => undefined)
    .then(() => refreshCharacterMetadata(id, character))
    .catch(error => {
      console.error('Não foi possível atualizar o resumo do personagem:', error);
      showNotification(
        'A ficha foi salva, mas o resumo para a futura lista de personagens não pôde ser atualizado.',
        'warning',
        6500
      );
      return false;
    });
  return metadataUpdatePromise;
}

async function refreshActiveCharacterMetadata() {
  if (storageMode !== 'v4' || !activeCharacterId) return false;
  captureState();
  return queueCharacterMetadataRefresh(activeCharacterId, cloneCharacterState());
}

async function saveActiveCharacter() {
  let saved = true;
  if (hasPendingSave) saved = saveNow(pendingSaveTargetId);
  await metadataUpdatePromise;
  return saved;
}

async function openCharacter(id, options = {}) {
  if (!isValidCharacterId(id)) throw new Error('INVALID_CHARACTER_ID');
  const manager = readCharacterManager();
  if (!manager || !manager.order.includes(id)) throw new Error('CHARACTER_NOT_INDEXED');

  if (options.discardLegacyPending && storageMode === 'legacy') discardPendingSave();
  else await saveActiveCharacter();

  const character = readStoredCharacter(id);
  if (!character) throw new Error('CHARACTER_NOT_FOUND');
  const validation = validateImportedSheet(character);
  if (!validation.valid) throw new Error(`INVALID_STORED_CHARACTER: ${validation.message}`);

  const latestManager = readCharacterManager();
  if (latestManager.activeCharacterId !== id) {
    writeCharacterManager(setActiveCharacterId(latestManager, id));
  }

  discardPendingSave();
  activeCharacterId = id;
  storageMode = 'v4';
  restoreState(character);
  queueCharacterMetadataRefresh(id, cloneCharacterState(character));
  return character;
}

async function closeCharacter() {
  await saveActiveCharacter();
  const manager = readCharacterManager();
  if (manager?.activeCharacterId) writeCharacterManager(setActiveCharacterId(manager, null));
  discardPendingSave();
  activeCharacterId = null;
  storageMode = 'closed';
  resetCharacterView();
}

function getCharacterInitial(name) {
  const normalizedName = String(name || '').trim();
  return normalizedName ? normalizedName.charAt(0).toLocaleUpperCase('pt-BR') : '◇';
}

function closeDesktopCharacterOptions({ restoreFocus = false } = {}) {
  if (!openCharacterOptions) return;
  const { popover, button } = openCharacterOptions;
  popover.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  openCharacterOptions = null;
  if (restoreFocus && button.isConnected) button.focus();
}

function openCharacterCardOptions(id, button, popover) {
  if (window.matchMedia('(max-width: 1279px)').matches) {
    closeDesktopCharacterOptions();
    const manager = readCharacterManager();
    const characterName = manager?.characters?.[id]?.name || 'Novo personagem';
    openModal({
      title: `Opções de ${characterName}`,
      content: createModalContent('Escolha uma ação para este personagem.'),
      actions: [
        { label: 'Exportar personagem', onClick: () => exportStoredCharacterById(id) },
        {
          label: 'Duplicar personagem',
          close: false,
          onClick: () => duplicateCharacterById(id, document.activeElement, { closeMobileModal: true })
        },
        { label: 'Excluir personagem', className: 'danger', onClick: () => openCharacterDeletionOptions(id) },
        { label: 'Cancelar', className: 'secondary', spanAll: true }
      ]
    });
    return;
  }

  if (openCharacterOptions?.popover === popover) {
    closeDesktopCharacterOptions({ restoreFocus: true });
    return;
  }
  closeDesktopCharacterOptions();
  popover.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  openCharacterOptions = { popover, button };
  popover.querySelector('button')?.focus();
}

function createCharacterCard(id, summary) {
  const shell = document.createElement('article');
  shell.className = 'character-card-shell';

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'character-card';
  card.dataset.characterId = id;
  const characterName = summary.name || 'Novo personagem';
  card.setAttribute('aria-label', `Abrir ${characterName}, nível ${summary.level}`);

  const portrait = document.createElement('span');
  portrait.className = 'character-card-portrait';
  if (summary.thumbnail) {
    const image = document.createElement('img');
    image.src = summary.thumbnail;
    image.alt = '';
    portrait.appendChild(image);
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'character-card-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.textContent = getCharacterInitial(characterName);
    portrait.appendChild(placeholder);
  }

  const info = document.createElement('span');
  info.className = 'character-card-info';
  const name = document.createElement('span');
  name.className = 'character-card-name';
  name.textContent = characterName;
  name.title = characterName;
  const level = document.createElement('span');
  level.className = 'character-card-level';
  level.textContent = `Nível ${summary.level}`;
  info.append(name, level);

  try {
    const storedCharacter = readStoredCharacter(id);
    const storedFields = isPlainObject(storedCharacter?.fields) ? storedCharacter.fields : {};
    const className = String(storedFields.classe || '').trim();
    const signature = String(storedFields.assinatura || '').trim();
    const details = [className, signature].filter(Boolean).join(' · ');
    if (details) {
      const detailLine = document.createElement('span');
      detailLine.className = 'character-card-detail';
      detailLine.textContent = details;
      detailLine.title = details;
      info.appendChild(detailLine);
    }
  } catch (error) {
    console.warn('Não foi possível carregar os detalhes visuais do personagem:', error);
  }

  card.append(portrait, info);

  card.addEventListener('click', async () => {
    if (card.disabled || isViewTransitioning) return;
    beginViewTransition(card, document.getElementById('characterManagerView'));
    card.disabled = true;
    try {
      await openCharacter(id);
      await completeMenuToSheetTransition(card);
    } catch (error) {
      cancelViewTransition(card, document.getElementById('characterManagerView'));
      console.error('Não foi possível abrir o personagem:', error);
      card.disabled = false;
      openModal({
        title: 'Personagem não aberto',
        content: createModalContent(
          'Não foi possível abrir este personagem com segurança.',
          'Os demais personagens continuam intactos neste navegador.'
        ),
        actions: [{ label: 'Entendi', className: 'secondary', spanAll: true }]
      });
    }
  });

  const optionsButton = document.createElement('button');
  optionsButton.type = 'button';
  optionsButton.className = 'character-options-button';
  optionsButton.setAttribute('aria-label', `Opções de ${characterName}`);
  optionsButton.setAttribute('aria-haspopup', 'menu');
  optionsButton.setAttribute('aria-expanded', 'false');
  optionsButton.textContent = '⋮';

  const popover = document.createElement('div');
  popover.className = 'character-options-popover';
  popover.setAttribute('role', 'menu');
  popover.hidden = true;
  const exportOption = document.createElement('button');
  exportOption.type = 'button';
  exportOption.setAttribute('role', 'menuitem');
  exportOption.textContent = 'Exportar personagem';
  exportOption.addEventListener('click', event => {
    event.stopPropagation();
    closeDesktopCharacterOptions();
    exportStoredCharacterById(id);
  });
  const duplicateOption = document.createElement('button');
  duplicateOption.type = 'button';
  duplicateOption.setAttribute('role', 'menuitem');
  duplicateOption.textContent = 'Duplicar personagem';
  duplicateOption.addEventListener('click', event => {
    event.stopPropagation();
    duplicateCharacterById(id, duplicateOption);
  });
  const deleteOption = document.createElement('button');
  deleteOption.type = 'button';
  deleteOption.setAttribute('role', 'menuitem');
  deleteOption.className = 'danger-option';
  deleteOption.textContent = 'Excluir personagem';
  deleteOption.addEventListener('click', event => {
    event.stopPropagation();
    closeDesktopCharacterOptions();
    openCharacterDeletionOptions(id);
  });
  popover.append(exportOption, duplicateOption, deleteOption);

  optionsButton.addEventListener('click', event => {
    event.stopPropagation();
    openCharacterCardOptions(id, optionsButton, popover);
  });
  shell.append(card, optionsButton, popover);
  return shell;
}

function renderCharacterManager() {
  const cardList = document.getElementById('characterCardList');
  const emptyState = document.getElementById('managerEmptyState');
  if (!cardList || !emptyState) return [];
  closeDesktopCharacterOptions();
  cardList.replaceChildren();
  const manager = readCharacterManager();
  const characterIds = manager?.order || [];

  characterIds.forEach(id => {
    cardList.appendChild(createCharacterCard(id, manager.characters[id]));
  });
  emptyState.hidden = characterIds.length > 0;
  return characterIds;
}

function showCharacterSheetView() {
  resetNotesViewNavigation();
  document.getElementById('characterManagerView').hidden = true;
  document.getElementById('characterSheetView').hidden = false;
  document.body.classList.remove('manager-view-open');
  window.scrollTo({ top: 0, behavior: 'auto' });
  document.getElementById('voltarPersonagens')?.focus();
}

const VIEW_TRANSITION_SAFETY_MS = 190;

function prefersReducedViewMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function waitForViewTransition(element) {
  if (!element || prefersReducedViewMotion()) return Promise.resolve();
  return new Promise(resolve => {
    let settled = false;
    const finish = event => {
      if (settled || (event && event.target !== element)) return;
      settled = true;
      element.removeEventListener('transitionend', finish);
      clearTimeout(safetyTimer);
      resolve();
    };
    const safetyTimer = window.setTimeout(finish, VIEW_TRANSITION_SAFETY_MS);
    element.addEventListener('transitionend', finish);
  });
}

function beginViewTransition(trigger, surface) {
  if (isViewTransitioning) return false;
  isViewTransitioning = true;
  trigger?.classList.add('is-opening');
  trigger?.setAttribute('aria-disabled', 'true');
  surface?.classList.add('view-transition-locked');
  surface?.setAttribute('aria-busy', 'true');
  return true;
}

function clearViewTransitionState(trigger, ...surfaces) {
  trigger?.classList.remove('is-opening');
  trigger?.removeAttribute('aria-disabled');
  surfaces.filter(Boolean).forEach(surface => {
    surface.classList.remove(
      'view-transition-locked',
      'view-leaving',
      'view-enter-prep',
      'view-entering'
    );
    surface.removeAttribute('aria-busy');
  });
  isViewTransitioning = false;
}

function cancelViewTransition(trigger, ...surfaces) {
  clearViewTransitionState(trigger, ...surfaces);
}

async function leaveView(surface) {
  surface.classList.add('view-leaving');
  await waitForViewTransition(surface);
}

async function enterView(surface) {
  surface.classList.add('view-enter-prep');
  if (!prefersReducedViewMotion()) {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
  surface.classList.add('view-entering');
  await waitForViewTransition(surface);
}

async function completeMenuToSheetTransition(trigger) {
  const managerView = document.getElementById('characterManagerView');
  const sheetView = document.getElementById('characterSheetView');
  try {
    await leaveView(managerView);
    managerView.hidden = true;
    managerView.classList.remove('view-leaving');
    sheetView.hidden = false;
    document.body.classList.remove('manager-view-open');
    window.scrollTo({ top: 0, behavior: 'auto' });
    await enterView(sheetView);
    document.getElementById('voltarPersonagens')?.focus();
  } finally {
    clearViewTransitionState(trigger, managerView, sheetView);
  }
}

async function completeSheetToMenuTransition(trigger, focusCharacterId) {
  const managerView = document.getElementById('characterManagerView');
  const sheetView = document.getElementById('characterSheetView');
  await leaveView(sheetView);

  try {
    await closeCharacter();
  } catch (error) {
    sheetView.classList.remove('view-leaving');
    await enterView(sheetView);
    throw error;
  }

  renderCharacterManager();
  sheetView.hidden = true;
  sheetView.classList.remove('view-leaving');
  managerView.hidden = false;
  document.body.classList.add('manager-view-open');
  window.scrollTo({ top: 0, behavior: 'auto' });
  await enterView(managerView);

  const focusTarget = focusCharacterId
    ? document.querySelector(`[data-character-id="${CSS.escape(focusCharacterId)}"]`)
    : null;
  (focusTarget || document.getElementById('characterManagerTitle'))?.focus();
  clearViewTransitionState(trigger, managerView, sheetView);
}

function showCharacterManagerView(focusCharacterId = '') {
  const characterIds = renderCharacterManager();
  document.getElementById('characterSheetView').hidden = true;
  document.getElementById('characterManagerView').hidden = false;
  document.body.classList.add('manager-view-open');
  window.scrollTo({ top: 0, behavior: 'auto' });

  requestAnimationFrame(() => {
    const focusTarget = focusCharacterId
      ? document.querySelector(`[data-character-id="${CSS.escape(focusCharacterId)}"]`)
      : null;
    (focusTarget || document.getElementById('characterManagerTitle'))?.focus();
  });
}

async function returnToCharacterManager() {
  if (isViewTransitioning) return;
  const characterIdToFocus = activeCharacterId;
  const returnButton = document.getElementById('voltarPersonagens');
  beginViewTransition(returnButton, document.getElementById('characterSheetView'));
  returnButton.disabled = true;
  try {
    const saved = await saveActiveCharacter();
    if (!saved) throw new Error('ACTIVE_CHARACTER_SAVE_FAILED');
    await refreshActiveCharacterMetadata();
    await completeSheetToMenuTransition(returnButton, characterIdToFocus);
  } catch (error) {
    cancelViewTransition(
      returnButton,
      document.getElementById('characterManagerView'),
      document.getElementById('characterSheetView')
    );
    console.error('Não foi possível voltar à lista de personagens:', error);
    openModal({
      title: 'Não foi possível voltar',
      content: createModalContent(
        'A ficha continua aberta para evitar a perda de alterações.',
        'Tente novamente depois de conferir o indicador de salvamento.'
      ),
      actions: [{ label: 'Entendi', className: 'secondary', spanAll: true }]
    });
  } finally {
    returnButton.disabled = false;
  }
}

function createUniqueCharacterId(manager) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = createCharacterId();
    if (!manager.order.includes(id) && localStorage.getItem(getCharacterStorageKey(id)) === null) {
      return id;
    }
  }
  throw new Error('CHARACTER_ID_GENERATION_FAILED');
}

function restoreManagerAfterFailedCreation(previousManager) {
  if (previousManager) {
    writeCharacterManager(previousManager);
    return;
  }
  localStorage.removeItem(CHARACTER_MANAGER_STORAGE_KEY);
  if (localStorage.getItem(CHARACTER_MANAGER_STORAGE_KEY) !== null) {
    throw new Error('CHARACTER_MANAGER_ROLLBACK_FAILED');
  }
}

async function createNewCharacter() {
  if (isCreatingCharacter || isViewTransitioning) return;
  isCreatingCharacter = true;
  const createButton = document.getElementById('managerCreateCharacter');
  createButton.disabled = true;
  createButton.setAttribute('aria-busy', 'true');

  const previousManager = readCharacterManager();
  const baseManager = previousManager || createEmptyCharacterManager();
  const characterId = createUniqueCharacterId(baseManager);
  const emptyCharacter = createEmptyCharacterState();
  let recordCreated = false;
  let indexCommitted = false;

  try {
    writeStoredCharacter(characterId, emptyCharacter);
    recordCreated = true;
    const verifiedCharacter = readStoredCharacter(characterId);
    if (JSON.stringify(verifiedCharacter) !== JSON.stringify(emptyCharacter)) {
      throw new Error('NEW_CHARACTER_VERIFICATION_FAILED');
    }

    const summary = await createCharacterSummary(emptyCharacter);
    let nextManager = setCharacterSummary(baseManager, characterId, summary);
    nextManager = setActiveCharacterId(nextManager, characterId);

    try {
      writeCharacterManager(nextManager);
      indexCommitted = true;
    } catch (indexError) {
      const recoveredManager = (() => {
        try {
          return readCharacterManager();
        } catch {
          return null;
        }
      })();
      indexCommitted = Boolean(
        recoveredManager?.order.includes(characterId)
        && recoveredManager.characters[characterId]
        && readStoredCharacter(characterId)
      );
      if (!indexCommitted) throw indexError;
    }

    await openCharacter(characterId);
    beginViewTransition(createButton, document.getElementById('characterManagerView'));
    await completeMenuToSheetTransition(createButton);
  } catch (error) {
    console.error('Não foi possível criar o personagem:', error);

    if (!indexCommitted) {
      try {
        restoreManagerAfterFailedCreation(previousManager);
      } catch (rollbackError) {
        console.error('Não foi possível restaurar o índice após a falha de criação:', rollbackError);
      }
      if (recordCreated) {
        try {
          removeStoredCharacter(characterId);
        } catch (rollbackError) {
          console.error('Não foi possível remover o registro após a falha de criação:', rollbackError);
        }
      }
    } else {
      discardPendingSave();
      activeCharacterId = null;
      storageMode = 'closed';
      showCharacterManagerView(characterId);
    }

    openModal({
      title: indexCommitted ? 'Personagem salvo, mas não aberto' : 'Personagem não criado',
      content: indexCommitted
        ? createModalContent(
          'A nova ficha foi salva e está disponível na lista de personagens.',
          'Não foi possível abri-la agora. Tente novamente pelo cartão.'
        )
        : createModalContent(
          'Não foi possível criar uma nova ficha com segurança.',
          'Nenhum personagem existente foi alterado. Verifique o espaço disponível neste navegador e tente novamente.'
        ),
      actions: [{ label: 'Entendi', className: 'secondary', spanAll: true }]
    });
  } finally {
    isCreatingCharacter = false;
    createButton.disabled = false;
    createButton.removeAttribute('aria-busy');
  }
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function findImportedCharacterDuplicate(validation) {
  const importedSerialized = stableSerialize(validation.normalized);
  const importedName = normalizeFilterText(validation.summary.name.trim());
  let possibleDuplicate = null;
  const manager = readCharacterManager();

  for (const id of manager?.order || []) {
    let existingValidation;
    try {
      existingValidation = validateImportedSheet(readStoredCharacter(id));
    } catch (error) {
      console.warn(`O personagem ${id} não pôde ser comparado durante a importação:`, error);
      continue;
    }
    if (!existingValidation.valid) continue;
    if (stableSerialize(existingValidation.normalized) === importedSerialized) {
      return { type: 'exact', id, summary: manager.characters[id] };
    }
    const existingName = normalizeFilterText(existingValidation.summary.name.trim());
    if (
      importedName
      && importedName === existingName
      && validation.summary.level === existingValidation.summary.level
    ) {
      possibleDuplicate ||= { type: 'possible', id, summary: manager.characters[id] };
    }
  }
  return possibleDuplicate;
}

async function storeImportedCharacterAsNew(character) {
  const previousManager = readCharacterManager();
  const baseManager = previousManager || createEmptyCharacterManager();
  const characterId = createUniqueCharacterId(baseManager);
  let recordCreated = false;
  let indexCommitted = false;

  try {
    writeStoredCharacter(characterId, character);
    recordCreated = true;
    const verifiedCharacter = readStoredCharacter(characterId);
    if (JSON.stringify(verifiedCharacter) !== JSON.stringify(character)) {
      throw new Error('IMPORTED_CHARACTER_VERIFICATION_FAILED');
    }

    const summary = await createCharacterSummary(character);
    const nextManager = setCharacterSummary(baseManager, characterId, summary);

    try {
      writeCharacterManager(nextManager);
      indexCommitted = true;
    } catch (indexError) {
      const recoveredManager = (() => {
        try {
          return readCharacterManager();
        } catch {
          return null;
        }
      })();
      indexCommitted = Boolean(
        recoveredManager?.order.includes(characterId)
        && recoveredManager.characters[characterId]
        && readStoredCharacter(characterId)
      );
      if (!indexCommitted) throw indexError;
    }

    return characterId;
  } catch (error) {
    if (!indexCommitted) {
      try {
        restoreManagerAfterFailedCreation(previousManager);
      } catch (rollbackError) {
        console.error('Não foi possível restaurar o índice após a falha de importação:', rollbackError);
      }
      if (recordCreated) {
        try {
          removeStoredCharacter(characterId);
        } catch (rollbackError) {
          console.error('Não foi possível remover o registro após a falha de importação:', rollbackError);
        }
      }
    }
    throw error;
  }
}

async function confirmMenuCharacterImport(validation) {
  if (isImportingCharacterFromMenu) return;
  isImportingCharacterFromMenu = true;
  const importButton = document.getElementById('managerImportCharacter');
  importButton.disabled = true;
  importButton.setAttribute('aria-busy', 'true');

  try {
    const characterId = await storeImportedCharacterAsNew(validation.normalized);
    showCharacterManagerView(characterId);
    const correctionMessage = validation.corrections.length
      ? ` ${validation.corrections.length} correção(ões) foi(ram) aplicada(s).`
      : '';
    showNotification(`Personagem adicionado à lista.${correctionMessage}`);
  } catch (error) {
    console.error('Não foi possível importar o personagem pelo menu:', error);
    openModal({
      title: 'Personagem não importado',
      content: createModalContent(
        'Não foi possível adicionar este personagem com segurança.',
        'Todos os personagens já salvos permanecem intactos. Verifique o espaço disponível e tente novamente.'
      ),
      actions: [{ label: 'Entendi', className: 'secondary', spanAll: true }]
    });
  } finally {
    isImportingCharacterFromMenu = false;
    importButton.disabled = false;
    importButton.removeAttribute('aria-busy');
  }
}

function rejectMenuCharacterImport(message, incompatible = false) {
  openModal({
    title: incompatible ? 'Versão incompatível' : 'Importação recusada',
    content: createModalContent(
      message,
      'Nenhum personagem salvo neste navegador foi alterado.'
    ),
    actions: [{ label: 'Entendi', className: 'secondary', spanAll: true }]
  });
}

function openMenuImportPreview(validation) {
  const duplicate = findImportedCharacterDuplicate(validation);
  openModal({
    title: duplicate ? 'Adicionar uma cópia?' : 'Adicionar personagem?',
    content: createImportPreview(validation, {
      intro: 'Confira os dados antes de adicionar este personagem à sua lista.',
      duplicate
    }),
    actions: [
      {
        label: duplicate ? 'Importar como cópia' : 'Adicionar personagem',
        onClick: () => confirmMenuCharacterImport(validation)
      },
      { label: 'Cancelar', className: 'secondary' }
    ]
  });
}

function importCharacterFromMenu(file) {
  if (!file.name.toLocaleLowerCase('pt-BR').endsWith('.json')) {
    rejectMenuCharacterImport('Escolha um arquivo JSON exportado pela ficha.');
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    rejectMenuCharacterImport('O arquivo é grande demais para ser uma ficha válida.');
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => rejectMenuCharacterImport('Não foi possível ler o arquivo selecionado.');
  reader.onload = () => {
    let validation;
    try {
      validation = validateImportedSheet(JSON.parse(reader.result));
    } catch (error) {
      if (String(error.message).startsWith('INVALID_')) {
        validation = { valid: false, reason: 'invalid', message: 'Uma das listas da ficha contém dados inválidos.' };
      } else {
        console.error(error);
        validation = { valid: false, reason: 'invalid', message: 'O arquivo não contém um JSON válido.' };
      }
    }

    if (!validation.valid) {
      rejectMenuCharacterImport(validation.message, validation.reason === 'incompatible');
      return;
    }
    openMenuImportPreview(validation);
  };
  reader.readAsText(file);
}

function bindCharacterManager() {
  document.getElementById('managerCreateCharacter').addEventListener('click', createNewCharacter);
  const menuImportInput = document.getElementById('managerImportFile');
  document.getElementById('managerImportCharacter').addEventListener('click', () => menuImportInput.click());
  menuImportInput.addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) importCharacterFromMenu(file);
    event.target.value = '';
  });
  document.getElementById('voltarPersonagens').addEventListener('click', returnToCharacterManager);
  document.addEventListener('click', event => {
    if (
      openCharacterOptions
      && !openCharacterOptions.popover.contains(event.target)
      && event.target !== openCharacterOptions.button
    ) {
      closeDesktopCharacterOptions();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && openCharacterOptions) {
      event.preventDefault();
      closeDesktopCharacterOptions({ restoreFocus: true });
    }
  });
}

async function startV3CharacterMigration() {
  try {
    const result = await migrateV3CharacterToManager();
    await activateMigratedCharacterStorage();
    discardPendingSave();
    activeCharacterId = null;
    storageMode = 'closed';
    showCharacterManagerView();
    if (result.status === 'completed') {
      showNotification('Sua ficha anterior foi adicionada com segurança à futura lista de personagens.');
    }
  } catch (error) {
    console.error('Não foi possível preparar a ficha para o gerenciador de personagens:', error);
    document.getElementById('characterManagerView').hidden = true;
    document.getElementById('characterSheetView').hidden = false;
    document.body.classList.remove('manager-view-open');
    showNotification(
      'Não foi possível preparar a lista de personagens. Sua ficha atual continua salva e funcionando normalmente.',
      'error',
      7500
    );
  }
}

function numberValue(id) {
  return Math.max(0, Number(document.getElementById(id)?.value || 0));
}

function integerBetween(value, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function getAttributeMaximum(level = integerBetween(document.getElementById('nivel')?.value, 1, 11)) {
  return level === 11 ? 6 : 5;
}

function getApexAttribute(excludeId = '') {
  return ATTRIBUTE_IDS.find(id => id !== excludeId && Number(document.getElementById(id)?.value || 0) >= 6) || '';
}

function normalizeAttributesForLevel() {
  const level = integerBetween(document.getElementById('nivel')?.value, 1, 11);
  const maximum = getAttributeMaximum(level);
  let apexClaimed = false;
  const changedIds = [];

  ATTRIBUTE_IDS.forEach(id => {
    const input = document.getElementById(id);
    const previousValue = Number(input.value);
    let nextValue = integerBetween(input.value, 1, maximum);

    if (level === 11 && nextValue === 6) {
      if (apexClaimed) nextValue = 5;
      else apexClaimed = true;
    }

    input.value = nextValue;
    input.max = maximum;
    input.dataset.lastValidValue = String(nextValue);
    if (previousValue !== nextValue) changedIds.push(id);
  });

  return changedIds;
}

function setStatus(text, mode = 'saved') {
  const status = document.getElementById('autosaveStatus');
  if (!status) return;
  status.textContent = text;
  status.classList.remove('saving', 'error');
  if (mode === 'saving') status.classList.add('saving');
  if (mode === 'error') status.classList.add('error');
}

function showNotification(message, kind = 'success', duration = 4500) {
  const notification = document.getElementById('globalNotification');
  if (!notification) return;
  clearTimeout(notificationTimer);
  notification.textContent = message;
  notification.classList.remove('error', 'warning');
  if (kind === 'error' || kind === 'warning') notification.classList.add(kind);
  notification.hidden = false;
  notificationTimer = setTimeout(() => {
    notification.hidden = true;
  }, duration);
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.classList.remove('modal-open');
  const returnTarget = modalReturnFocus;
  modalReturnFocus = null;
  if (returnTarget?.isConnected) returnTarget.focus();
}

function openModal({ title, content, actions = [] }) {
  const overlay = document.getElementById('modalOverlay');
  const titleElement = document.getElementById('modalTitle');
  const description = document.getElementById('modalDescription');
  const actionsContainer = document.getElementById('modalActions');
  modalReturnFocus = document.activeElement;
  titleElement.textContent = title;
  description.replaceChildren();
  if (typeof content === 'string') {
    const paragraph = document.createElement('p');
    paragraph.textContent = content;
    description.appendChild(paragraph);
  } else if (content) {
    description.appendChild(content);
  }
  actionsContainer.replaceChildren();

  actions.forEach(action => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn${action.className ? ` ${action.className}` : ''}${action.spanAll ? ' span-all' : ''}`;
    button.textContent = action.label;
    button.addEventListener('click', () => {
      if (action.close !== false) closeModal();
      action.onClick?.();
    });
    actionsContainer.appendChild(button);
  });

  overlay.hidden = false;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    const firstAction = actionsContainer.querySelector('button');
    (firstAction || document.getElementById('modalClose')).focus();
  });
}

function bindModalSystem() {
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('appModal');
  document.getElementById('modalClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeModal();
  });
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function createModalContent(...paragraphs) {
  const wrapper = document.createElement('div');
  paragraphs.filter(Boolean).forEach(text => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    wrapper.appendChild(paragraph);
  });
  return wrapper;
}

function storePendingNotice(message) {
  try {
    sessionStorage.setItem(NOTICE_SESSION_KEY, message);
    return true;
  } catch (error) {
    console.warn('Não foi possível guardar a mensagem de confirmação:', error);
    return false;
  }
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
  state.notes = captureNotes();
  state.activeEffects = captureActiveEffects();
  if (
    isPlainObject(state.automaticAbilityFavorites)
    && !Object.keys(state.automaticAbilityFavorites).length
  ) {
    delete state.automaticAbilityFavorites;
  }
}

function captureDynamicList(containerId, options = {}) {
  return [...document.querySelectorAll(`#${containerId} .editable-card`)]
    .filter(card => !(options.excludeAutomatic && card.classList.contains('automatic-class-ability')))
    .map(card => {
      const data = {};
      card.querySelectorAll('[data-field]').forEach(field => {
        data[field.dataset.field] = field.value;
      });
      if (card.dataset.favorite === 'true') data.favorite = true;
      return data;
    });
}

function saveNow(targetId = pendingSaveTargetId ?? (storageMode === 'v4' ? activeCharacterId : null)) {
  clearTimeout(saveTimer);

  if (storageMode === 'closed') {
    discardPendingSave();
    return false;
  }
  if (storageMode === 'v4' && (!targetId || targetId !== activeCharacterId)) {
    console.warn('Um salvamento antigo foi descartado porque o personagem ativo mudou.');
    discardPendingSave();
    return false;
  }

  captureState();

  try {
    if (storageMode === 'v4') {
      const capturedCharacter = cloneCharacterState();
      writeStoredCharacter(activeCharacterId, capturedCharacter);
      queueCharacterMetadataRefresh(activeCharacterId, capturedCharacter);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    hasPendingSave = false;
    pendingSaveTargetId = null;
    setStatus('Salvo neste navegador');
    return true;
  } catch (error) {
    storageAvailable = false;
    console.error('Não foi possível salvar a ficha:', error);
    setStatus('Erro ao salvar', 'error');
    showNotification('Não foi possível salvar as últimas alterações neste navegador.', 'error', 6500);
    return false;
  }
}

function scheduleSave() {
  if (isRestoring || storageMode === 'closed') return;
  hasPendingSave = true;
  pendingSaveTargetId = storageMode === 'v4' ? activeCharacterId : null;
  setStatus('Salvando...', 'saving');
  clearTimeout(saveTimer);
  const scheduledTargetId = pendingSaveTargetId;
  saveTimer = setTimeout(() => saveNow(scheduledTargetId), 250);
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

  if (resourceId === 'pnAtual') updateAllManifestationUseStates();
  updateMobileResource(resourceId);
  if (document.getElementById('ajusteRecurso')?.value === resourceId) updateResourceAdjusterContext();
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

function captureInitialFieldValues() {
  for (const id of simpleFieldIds) {
    const field = document.getElementById(id);
    if (field) initialFieldValues[id] = field.value;
  }
}

function createEmptyCharacterState() {
  return {
    schemaVersion: '0.3-pre-alpha',
    photo: '',
    fields: { ...initialFieldValues },
    skills: {},
    equipment: [],
    abilities: [],
    manifestations: [{ nome: 'Manifestação 1' }],
    automaticAbilityFavorites: {},
    notes: [],
    activeEffects: []
  };
}

function resetCharacterView() {
  restoreState(createEmptyCharacterState());
}

function restoreState(saved) {
  isRestoring = true;
  const restored = isPlainObject(saved) ? saved : {};
  state.photo = typeof restored.photo === 'string' ? restored.photo : '';
  state.fields = isPlainObject(restored.fields) ? { ...restored.fields } : {};
  state.skills = isPlainObject(restored.skills) ? { ...restored.skills } : {};
  state.equipment = Array.isArray(restored.equipment) ? cloneCharacterState(restored.equipment) : [];
  state.abilities = Array.isArray(restored.abilities) ? cloneCharacterState(restored.abilities) : [];
  state.manifestations = Array.isArray(restored.manifestations) ? cloneCharacterState(restored.manifestations) : [];
  state.notes = Array.isArray(restored.notes) ? cloneCharacterState(restored.notes) : [];
  state.activeEffects = Array.isArray(restored.activeEffects) ? cloneCharacterState(restored.activeEffects) : [];
  state.automaticAbilityFavorites = isPlainObject(restored.automaticAbilityFavorites)
    ? { ...restored.automaticAbilityFavorites }
    : {};
  state.schemaVersion = '0.3-pre-alpha';

  for (const id of simpleFieldIds) {
    const field = document.getElementById(id);
    if (!field) continue;
    field.value = state.fields[id] !== undefined
      ? state.fields[id]
      : (initialFieldValues[id] ?? '');
  }

  const levelInput = document.getElementById('nivel');
  levelInput.value = integerBetween(levelInput.value, 1, 11);
  levelInput.dataset.lastValidValue = levelInput.value;
  const normalizedAttributeIds = normalizeAttributesForLevel();

  setPhoto(state.photo);

  document.querySelectorAll('.skill-row').forEach(row => {
    const selected = state.skills[row.dataset.skill] || 'Sem Domínio';
    row.querySelector('select').value = selected;
    updateSkillBonus(row);
  });
  applySkillFilters();

  restoreDynamicList('listaEquipamentos', 'templateEquipamento', state.equipment, 'Novo equipamento');
  restoreDynamicList('listaHabilidades', 'templateHabilidade', state.abilities, 'Nova habilidade');
  restoreDynamicList('listaManifestacoes', 'templateManifestacao', state.manifestations, 'Nova Manifestação');

  if (!state.manifestations.length) {
    addDynamicCard('listaManifestacoes', 'templateManifestacao', { nome: 'Manifestação 1' });
  }
  renderNotes(state.notes);
  renderActiveEffects(state.activeEffects);

  updateAttributePointsUI();
  recalculateClassResources({ trigger: 'restore', previous: null });
  syncClassAbility();
  updateAllResources();
  recalculateDefense();
  lastAutomationSnapshot = getAutomationSnapshot();
  isRestoring = false;
  if (normalizedAttributeIds.length) scheduleSave();
}

function restoreDynamicList(containerId, templateId, items, defaultTitle) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (!items.length) {
    const cardType = Object.entries(favoriteSectionContainers)
      .find(([, id]) => id === containerId)?.[0];
    if (cardType) applyFavoriteFilter(cardType);
    return;
  }
  items.forEach(item => addDynamicCard(containerId, templateId, item, defaultTitle, { startOpen: false }));
}

function buildSkills() {
  const container = document.getElementById('listaPericias');
  container.innerHTML = '';

  pericias.forEach(([nome, atributo]) => {
    const row = document.createElement('div');
    row.className = 'skill-row';
    row.dataset.skill = nome;
    row.dataset.skillAttribute = normalizeFilterText(atributo);
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
      applySkillFilters();
      scheduleSave();
    });
    container.appendChild(row);
  });
}

function updateSkillBonus(row) {
  const grau = row.querySelector('select').value;
  row.querySelector('.skill-bonus').textContent = `+${graus[grau]}`;
  const degreeLevels = {
    'Sem Domínio': 'none',
    'Praticante': 'practitioner',
    'Experiente': 'experienced',
    'Mestre': 'master'
  };
  row.dataset.skillDegree = degreeLevels[grau] || 'none';
}

function normalizeFilterText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function applySkillFilters() {
  const searchInput = document.getElementById('skillSearch');
  const attributeSelect = document.getElementById('skillAttributeFilter');
  const activeDomainButton = document.querySelector('[data-skill-domain].active');
  const rows = [...document.querySelectorAll('.skill-row')];
  if (!searchInput || !attributeSelect || !activeDomainButton) return;

  const query = normalizeFilterText(searchInput.value);
  const domainFilter = activeDomainButton.dataset.skillDomain;
  const attributeFilter = attributeSelect.value;
  let visibleCount = 0;

  rows.forEach(row => {
    const matchesName = normalizeFilterText(row.dataset.skill).includes(query);
    const matchesDomain = domainFilter === 'all' || row.dataset.skillDegree !== 'none';
    const matchesAttribute = attributeFilter === 'all' || row.dataset.skillAttribute === attributeFilter;
    const isVisible = matchesName && matchesDomain && matchesAttribute;
    row.hidden = !isVisible;
    if (isVisible) visibleCount += 1;
  });

  const counter = document.getElementById('skillFilterCount');
  if (counter) counter.textContent = `Exibindo ${visibleCount} de ${rows.length} perícias`;
}

function bindSkillFilters() {
  const searchInput = document.getElementById('skillSearch');
  const clearButton = document.getElementById('clearSkillSearch');
  const attributeSelect = document.getElementById('skillAttributeFilter');
  const domainButtons = document.querySelectorAll('[data-skill-domain]');

  searchInput.addEventListener('input', () => {
    clearButton.disabled = !searchInput.value;
    applySkillFilters();
  });

  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    clearButton.disabled = true;
    searchInput.focus();
    applySkillFilters();
  });

  attributeSelect.addEventListener('change', applySkillFilters);

  domainButtons.forEach(button => {
    button.addEventListener('click', () => {
      domainButtons.forEach(item => {
        const isActive = item === button;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-pressed', String(isActive));
      });
      applySkillFilters();
    });
  });

  applySkillFilters();
}

function getReflexDefenseBonus() {
  const row = [...document.querySelectorAll('.skill-row')].find(item => item.dataset.skill === 'Reflexos');
  if (!row) return 0;
  return Math.min(graus[row.querySelector('select').value] || 0, 3);
}

function recalculateDefense() {
  const agilidade = Number(document.getElementById('agilidade').value || 0);
  const equipamento = Number(document.getElementById('bonusDefesaEquipamento').value || 0);
  const defense = 10 + agilidade + getReflexDefenseBonus() + equipamento;
  document.getElementById('defesaTotal').textContent = defense;
  const mobileDefense = document.getElementById('mobileDefesa');
  if (mobileDefense) mobileDefense.textContent = defense;
}

function getAutomationSnapshot() {
  const nivel = integerBetween(document.getElementById('nivel').value, 1, 11);
  const attributeMaximum = getAttributeMaximum(nivel);
  return {
    classe: document.getElementById('classe').value,
    nivel,
    vigor: integerBetween(document.getElementById('vigor').value, 1, attributeMaximum),
    intelecto: integerBetween(document.getElementById('intelecto').value, 1, attributeMaximum)
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
  const maximum = getAttributeMaximum();
  return ATTRIBUTE_IDS.map(id => integerBetween(document.getElementById(id).value, 1, maximum));
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
  } else if (level < 11) {
    panel.classList.add('manual-mode');
    panel.querySelector('span').textContent = 'Progressão de atributos';
    availableElement.textContent = 'Manual';
    help.textContent = message || 'A progressão é manual. Até o nível 10, nenhum atributo pode ultrapassar 5.';
  } else {
    const apexAttribute = getApexAttribute();
    panel.classList.add('manual-mode');
    panel.querySelector('span').textContent = 'Ápice do Nexo';
    availableElement.textContent = apexAttribute ? 'Ativo' : 'Disponível';
    help.textContent = message || (apexAttribute
      ? `${getAttributeLabel(apexAttribute)} alcançou 6 através do Ápice do Nexo. Reduza esse atributo para escolher outro.`
      : 'Ápice do Nexo disponível: um único atributo pode alcançar 6.');
  }

  updateAttributeButtons();
}

function updateAttributeButtons() {
  const level = integerBetween(document.getElementById('nivel').value, 1, 11);
  const maximum = getAttributeMaximum(level);
  const used = getInitialAttributePointsUsed();

  document.querySelectorAll('.attribute-step').forEach(button => {
    const input = document.getElementById(button.dataset.attribute);
    const step = Number(button.dataset.step || 0);
    const value = integerBetween(input.value, 1, maximum);
    const apexUsedByAnotherAttribute = level === 11 && value === 5 && Boolean(getApexAttribute(input.id));

    if (step < 0) button.disabled = value <= 1;
    if (step > 0) button.disabled = value >= maximum || apexUsedByAnotherAttribute || (level === 1 && used >= 1);
  });
}

function getAttributeLabel(id) {
  const labels = {
    forca: 'Força',
    vigor: 'Vigor',
    agilidade: 'Agilidade',
    intelecto: 'Intelecto',
    presenca: 'Presença'
  };
  return labels[id] || id;
}

function commitAttributeValue(input, nextValue, trigger) {
  input.value = integerBetween(nextValue, 1, getAttributeMaximum());
  input.dataset.lastValidValue = input.value;
  updateAttributePointsUI();
  recalculateDefense();
  if (input.id === 'vigor' || input.id === 'intelecto') {
    recalculateClassResources({ trigger: input.id });
  }
  scheduleSave();
}

function trySetAttribute(input, nextValue) {
  const level = integerBetween(document.getElementById('nivel').value, 1, 11);
  const maximum = getAttributeMaximum(level);
  const oldValue = integerBetween(input.dataset.lastValidValue || input.value, 1, maximum);
  input.value = integerBetween(nextValue, 1, maximum);

  if (input.value === '6' && getApexAttribute(input.id)) {
    input.value = oldValue;
    updateAttributePointsUI('O Ápice do Nexo já foi aplicado a outro atributo. Reduza-o antes de escolher um novo.');
    return false;
  }

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
    input.dataset.lastValidValue = integerBetween(input.value, 1, getAttributeMaximum());

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
      trySetAttribute(input, integerBetween(input.value, 1, getAttributeMaximum()) + step);
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

function readAndApplyPhoto(file) {
  const reader = new FileReader();
  reader.onerror = () => showNotification('Não foi possível ler a imagem selecionada.', 'error');
  reader.onload = () => {
    const previousPhoto = state.photo;
    setPhoto(reader.result);
    if (saveNow()) {
      showNotification('Foto atualizada e salva neste navegador.');
      return;
    }

    setPhoto(previousPhoto);
    saveNow();
    openModal({
      title: 'Foto não adicionada',
      content: createModalContent(
        'A imagem ocuparia mais espaço do que este navegador permite.',
        'A foto anterior foi mantida. Escolha uma imagem menor.'
      ),
      actions: [{ label: 'Entendi', className: 'secondary', spanAll: true }]
    });
  };
  reader.readAsDataURL(file);
}

function handleSelectedPhoto(file, input) {
  if (!file.type.startsWith('image/')) {
    openModal({
      title: 'Imagem inválida',
      content: createModalContent('Escolha um arquivo de imagem válido. A foto atual foi mantida.'),
      actions: [{ label: 'Entendi', className: 'secondary', spanAll: true }]
    });
    input.value = '';
    return;
  }

  if (file.size <= LARGE_IMAGE_BYTES) {
    readAndApplyPhoto(file);
    input.value = '';
    return;
  }

  const sizeInMb = (file.size / (1024 * 1024)).toFixed(1).replace('.', ',');
  openModal({
    title: 'Esta imagem é grande',
    content: createModalContent(
      `A imagem possui aproximadamente ${sizeInMb} MB e pode ultrapassar o espaço disponível neste navegador.`,
      'Uma imagem menor é mais segura para o salvamento da ficha.'
    ),
    actions: [
      { label: 'Usar mesmo assim', onClick: () => readAndApplyPhoto(file) },
      {
        label: 'Escolher outra',
        className: 'secondary',
        onClick: () => {
          input.value = '';
          input.click();
        }
      },
      { label: 'Cancelar', className: 'secondary', spanAll: true }
    ]
  });
  input.value = '';
}

function getAutomaticAbilityFavoriteId(className) {
  return normalizeFilterText(className).replace(/\s+/g, '-');
}

function setFavoriteButtonState(card, favorite) {
  const button = card.querySelector('.favorite-card-button');
  if (!button) return;
  if (favorite) card.dataset.favorite = 'true';
  else delete card.dataset.favorite;
  button.textContent = favorite ? '★' : '☆';
  button.setAttribute('aria-pressed', String(favorite));
  button.setAttribute('aria-label', favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
}

function applyFavoriteFilter(cardType) {
  const containerId = favoriteSectionContainers[cardType];
  const container = document.getElementById(containerId);
  if (!container) return;
  const favoritesOnly = favoriteFilterModes[cardType] === 'favorites';
  let visibleCount = 0;

  container.querySelectorAll('.editable-card').forEach(card => {
    const shouldHide = favoritesOnly && card.dataset.favorite !== 'true';
    card.hidden = shouldHide;
    if (!shouldHide) visibleCount += 1;
  });

  const emptyState = document.querySelector(`[data-favorite-empty="${cardType}"]`);
  if (emptyState) emptyState.hidden = !favoritesOnly || visibleCount > 0;
}

function bindFavoriteButton(card, options = {}) {
  const button = card.querySelector('.favorite-card-button');
  if (!button) return;
  setFavoriteButtonState(card, options.favorite === true);
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const favorite = card.dataset.favorite !== 'true';
    setFavoriteButtonState(card, favorite);

    if (options.automaticAbilityId) {
      if (!isPlainObject(state.automaticAbilityFavorites)) state.automaticAbilityFavorites = {};
      if (favorite) state.automaticAbilityFavorites[options.automaticAbilityId] = true;
      else delete state.automaticAbilityFavorites[options.automaticAbilityId];
    }

    applyFavoriteFilter(card.dataset.cardType);
    scheduleSave();
  });
}

function bindFavoriteFilters() {
  document.querySelectorAll('[data-favorite-filter][data-favorite-mode]').forEach(button => {
    button.addEventListener('click', () => {
      const cardType = button.dataset.favoriteFilter;
      const mode = button.dataset.favoriteMode;
      if (!favoriteSectionContainers[cardType] || !['all', 'favorites'].includes(mode)) return;
      favoriteFilterModes[cardType] = mode;

      document.querySelectorAll(`[data-favorite-filter="${cardType}"]`).forEach(filterButton => {
        const active = filterButton.dataset.favoriteMode === mode;
        filterButton.classList.toggle('active', active);
        filterButton.setAttribute('aria-pressed', String(active));
      });
      applyFavoriteFilter(cardType);
    });
  });
}

function createActiveEffectId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return `effect-${cryptoApi.randomUUID()}`;
  const randomPart = cryptoApi?.getRandomValues
    ? [...cryptoApi.getRandomValues(new Uint32Array(3))].map(value => value.toString(36)).join('')
    : Math.random().toString(36).slice(2);
  return `effect-${Date.now().toString(36)}-${randomPart}`;
}

function getActiveEffectTypeLabel(type) {
  return {
    positive: 'Positivo',
    negative: 'Negativo',
    neutral: 'Neutro'
  }[type] || 'Neutro';
}

function captureActiveEffects() {
  return [...document.querySelectorAll('#listaEfeitosAtivos .active-effect-card')].map(card => ({
    id: card.dataset.effectId,
    name: card.dataset.effectName,
    type: card.dataset.effectType,
    description: card.dataset.effectDescription,
    duration: card.dataset.effectDuration
  }));
}

function updateActiveEffectCard(card) {
  card.dataset.effectType = ['positive', 'negative', 'neutral'].includes(card.dataset.effectType)
    ? card.dataset.effectType
    : 'neutral';
  card.querySelector('.active-effect-name').textContent = card.dataset.effectName;
  card.querySelector('.active-effect-type').textContent = ` · ${getActiveEffectTypeLabel(card.dataset.effectType)}`;

  const description = card.querySelector('.active-effect-description');
  description.textContent = card.dataset.effectDescription;
  description.hidden = !card.dataset.effectDescription;

  const duration = card.querySelector('.active-effect-duration');
  duration.replaceChildren();
  if (card.dataset.effectDuration) {
    const label = document.createElement('strong');
    label.textContent = 'Duração: ';
    duration.append(label, document.createTextNode(card.dataset.effectDuration));
    duration.hidden = false;
  } else {
    duration.hidden = true;
  }
}

function createActiveEffectCard(effect) {
  const card = document.createElement('article');
  card.className = 'active-effect-card';
  card.dataset.effectId = effect.id;
  card.dataset.effectName = effect.name;
  card.dataset.effectType = effect.type;
  card.dataset.effectDescription = effect.description;
  card.dataset.effectDuration = effect.duration;

  const header = document.createElement('div');
  header.className = 'active-effect-card-header';
  const identity = document.createElement('div');
  identity.className = 'active-effect-identity';
  const name = document.createElement('strong');
  name.className = 'active-effect-name';
  const type = document.createElement('span');
  type.className = 'active-effect-type';
  identity.append(name, type);

  const actions = document.createElement('div');
  actions.className = 'active-effect-card-actions';
  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.textContent = 'Editar';
  editButton.addEventListener('click', () => openActiveEffectForm(card));
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'remove-effect';
  removeButton.textContent = 'Remover';
  removeButton.addEventListener('click', () => requestActiveEffectDeletion(card));
  actions.append(editButton, removeButton);
  header.append(identity, actions);

  const description = document.createElement('p');
  description.className = 'active-effect-description';
  const duration = document.createElement('p');
  duration.className = 'active-effect-duration';
  card.append(header, description, duration);
  updateActiveEffectCard(card);
  return card;
}

function updateActiveEffectsSummary() {
  const cards = [...document.querySelectorAll('#listaEfeitosAtivos .active-effect-card')];
  const count = document.getElementById('activeEffectsCount');
  const markers = document.getElementById('activeEffectsMarkers');
  const empty = document.getElementById('activeEffectsEmpty');
  count.textContent = String(cards.length);
  markers.replaceChildren();

  if (!cards.length) {
    const none = document.createElement('span');
    none.className = 'active-effects-none';
    none.textContent = 'Nenhum efeito ativo';
    markers.appendChild(none);
  } else {
    const markerLimit = window.matchMedia('(max-width: 620px)').matches ? 2 : 3;
    cards.slice(0, markerLimit).forEach(card => {
      const marker = document.createElement('span');
      marker.className = 'active-effect-marker';
      marker.dataset.effectType = card.dataset.effectType;
      marker.textContent = card.dataset.effectName;
      marker.title = card.dataset.effectName;
      markers.appendChild(marker);
    });
    if (cards.length > markerLimit) {
      const overflow = document.createElement('span');
      overflow.className = 'active-effects-overflow';
      overflow.textContent = `+${cards.length - markerLimit}`;
      markers.appendChild(overflow);
    }
  }
  empty.hidden = cards.length > 0;
}

function setActiveEffectsExpanded(expanded) {
  const content = document.getElementById('activeEffectsExpanded');
  const toggle = document.getElementById('alternarEfeitos');
  content.hidden = !expanded;
  toggle.textContent = expanded ? '⌃' : '⌄';
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.setAttribute('aria-label', expanded ? 'Recolher efeitos ativos' : 'Expandir efeitos ativos');
}

function createEffectFormField(labelText, control) {
  const label = document.createElement('label');
  label.append(document.createTextNode(labelText), control);
  return label;
}

function openActiveEffectForm(card = null) {
  const form = document.createElement('div');
  form.className = 'effect-form';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 160;
  nameInput.value = card?.dataset.effectName || '';
  const typeSelect = document.createElement('select');
  [
    ['neutral', 'Neutro'],
    ['positive', 'Positivo'],
    ['negative', 'Negativo']
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    typeSelect.appendChild(option);
  });
  typeSelect.value = card?.dataset.effectType || 'neutral';
  const descriptionInput = document.createElement('textarea');
  descriptionInput.rows = 4;
  descriptionInput.value = card?.dataset.effectDescription || '';
  const durationInput = document.createElement('input');
  durationInput.type = 'text';
  durationInput.value = card?.dataset.effectDuration || '';
  const error = document.createElement('p');
  error.className = 'effect-form-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  form.append(
    createEffectFormField('Nome', nameInput),
    createEffectFormField('Tipo', typeSelect),
    createEffectFormField('Descrição', descriptionInput),
    createEffectFormField('Duração', durationInput),
    error
  );

  openModal({
    title: card ? 'Editar efeito' : 'Adicionar efeito',
    content: form,
    actions: [
      {
        label: card ? 'Salvar alterações' : 'Adicionar efeito',
        close: false,
        onClick: () => {
          const effectName = nameInput.value.trim();
          if (!effectName) {
            error.textContent = 'Informe um nome para salvar o efeito.';
            error.hidden = false;
            nameInput.focus();
            return;
          }

          const effect = {
            id: card?.dataset.effectId || createActiveEffectId(),
            name: effectName,
            type: typeSelect.value,
            description: descriptionInput.value.trim(),
            duration: durationInput.value.trim()
          };

          if (card) {
            card.dataset.effectName = effect.name;
            card.dataset.effectType = effect.type;
            card.dataset.effectDescription = effect.description;
            card.dataset.effectDuration = effect.duration;
            updateActiveEffectCard(card);
          } else {
            document.getElementById('listaEfeitosAtivos').appendChild(createActiveEffectCard(effect));
            setActiveEffectsExpanded(true);
          }
          updateActiveEffectsSummary();
          scheduleSave();
          closeModal();
        }
      },
      { label: 'Cancelar', className: 'secondary' }
    ]
  });
  requestAnimationFrame(() => nameInput.focus());
}

function requestActiveEffectDeletion(card) {
  openModal({
    title: 'Remover efeito?',
    content: createModalContent(
      `“${card.dataset.effectName}”`,
      'Este efeito será removido somente deste personagem.'
    ),
    actions: [
      {
        label: 'Remover efeito',
        className: 'danger',
        onClick: () => {
          card.remove();
          updateActiveEffectsSummary();
          scheduleSave();
          document.getElementById('adicionarEfeitoExpandido')?.focus();
        }
      },
      { label: 'Cancelar', className: 'secondary' }
    ]
  });
}

function renderActiveEffects(effects) {
  const container = document.getElementById('listaEfeitosAtivos');
  container.replaceChildren();
  effects.forEach(effect => container.appendChild(createActiveEffectCard(effect)));
  setActiveEffectsExpanded(false);
  updateActiveEffectsSummary();
}

function bindActiveEffects() {
  document.getElementById('adicionarEfeito').addEventListener('click', () => openActiveEffectForm());
  document.getElementById('adicionarEfeitoExpandido').addEventListener('click', () => openActiveEffectForm());
  document.getElementById('alternarEfeitos').addEventListener('click', () => {
    const expanded = document.getElementById('alternarEfeitos').getAttribute('aria-expanded') === 'true';
    setActiveEffectsExpanded(!expanded);
  });
  const mediaQuery = window.matchMedia('(max-width: 620px)');
  const refreshMarkers = () => updateActiveEffectsSummary();
  if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', refreshMarkers);
  else mediaQuery.addListener(refreshMarkers);
}

function createNoteId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return `note-${cryptoApi.randomUUID()}`;
  const randomPart = cryptoApi?.getRandomValues
    ? [...cryptoApi.getRandomValues(new Uint32Array(3))].map(value => value.toString(36)).join('')
    : Math.random().toString(36).slice(2);
  return `note-${Date.now().toString(36)}-${randomPart}`;
}

function formatNoteDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'data não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function updateNoteSummary(card) {
  const title = card.querySelector('.note-title-input')?.value.trim() || '';
  const content = card.querySelector('.note-content-input')?.value.trim() || '';
  card.querySelector('.note-summary-title').textContent = title || 'Anotação sem título';
  card.querySelector('.note-preview').textContent = content.replace(/\s+/g, ' ') || 'Anotação vazia.';
  const createdTime = card.querySelector('.note-created-at');
  const updatedTime = card.querySelector('.note-updated-at');
  createdTime.dateTime = card.dataset.createdAt;
  createdTime.textContent = formatNoteDate(card.dataset.createdAt);
  updatedTime.dateTime = card.dataset.updatedAt;
  updatedTime.textContent = formatNoteDate(card.dataset.updatedAt);
}

function setNotePinnedState(card, pinned) {
  const button = card.querySelector('.note-pin-button');
  card.dataset.pinned = String(pinned);
  button.textContent = pinned ? '★' : '☆';
  button.setAttribute('aria-pressed', String(pinned));
  button.setAttribute('aria-label', pinned ? 'Desafixar anotação' : 'Fixar anotação');
}

function sortNoteCards() {
  const container = document.getElementById('listaAnotacoes');
  if (!container) return;
  const cards = [...container.querySelectorAll('.note-card')];
  cards.sort((a, b) => {
    const pinnedDifference = Number(b.dataset.pinned === 'true') - Number(a.dataset.pinned === 'true');
    if (pinnedDifference) return pinnedDifference;
    return new Date(b.dataset.updatedAt).getTime() - new Date(a.dataset.updatedAt).getTime();
  });
  cards.forEach(card => container.appendChild(card));
}

function updateNotesEmptyState() {
  const emptyState = document.getElementById('notesEmptyState');
  const hasNotes = Boolean(document.querySelector('#listaAnotacoes .note-card'));
  if (emptyState) emptyState.hidden = hasNotes;
}

function captureNotes() {
  return [...document.querySelectorAll('#listaAnotacoes .note-card')].map(card => ({
    id: card.dataset.noteId,
    title: card.querySelector('.note-title-input')?.value ?? '',
    content: card.querySelector('.note-content-input')?.value ?? '',
    pinned: card.dataset.pinned === 'true',
    createdAt: card.dataset.createdAt,
    updatedAt: card.dataset.updatedAt
  }));
}

function requestNoteDeletion(card) {
  const title = card.querySelector('.note-title-input')?.value.trim() || 'Anotação sem título';
  openModal({
    title: 'Excluir anotação?',
    content: createModalContent(
      `“${title}”`,
      'Esta anotação será removida somente deste personagem.'
    ),
    actions: [
      {
        label: 'Excluir anotação',
        className: 'danger',
        onClick: () => {
          const nextFocus = card.nextElementSibling?.querySelector('summary')
            || card.previousElementSibling?.querySelector('summary')
            || document.getElementById('adicionarAnotacao');
          card.remove();
          updateNotesEmptyState();
          scheduleSave();
          requestAnimationFrame(() => nextFocus?.focus());
        }
      },
      { label: 'Cancelar', className: 'secondary' }
    ]
  });
}

function createNoteCard(note, { open = false } = {}) {
  const template = document.getElementById('templateAnotacao');
  const card = template.content.firstElementChild.cloneNode(true);
  card.dataset.noteId = note.id;
  card.dataset.createdAt = note.createdAt;
  card.dataset.updatedAt = note.updatedAt;
  card.open = open;

  const titleInput = card.querySelector('.note-title-input');
  const contentInput = card.querySelector('.note-content-input');
  titleInput.value = note.title;
  contentInput.value = note.content;
  setNotePinnedState(card, note.pinned === true);
  updateNoteSummary(card);

  [titleInput, contentInput].forEach(field => {
    field.addEventListener('input', () => {
      card.dataset.updatedAt = new Date().toISOString();
      updateNoteSummary(card);
      scheduleSave();
    });
    field.addEventListener('blur', sortNoteCards);
  });

  card.addEventListener('toggle', () => {
    if (!card.open) sortNoteCards();
  });

  card.querySelector('.note-pin-button').addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const pinned = card.dataset.pinned !== 'true';
    setNotePinnedState(card, pinned);
    card.dataset.updatedAt = new Date().toISOString();
    updateNoteSummary(card);
    sortNoteCards();
    scheduleSave();
  });

  card.querySelector('.note-remove-button').addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    requestNoteDeletion(card);
  });

  return card;
}

function renderNotes(notes) {
  const container = document.getElementById('listaAnotacoes');
  if (!container) return;
  container.replaceChildren();
  notes.forEach(note => container.appendChild(createNoteCard(note)));
  sortNoteCards();
  updateNotesEmptyState();
}

function addNewNote() {
  const now = new Date().toISOString();
  const note = {
    id: createNoteId(),
    title: '',
    content: '',
    pinned: false,
    createdAt: now,
    updatedAt: now
  };
  const card = createNoteCard(note, { open: true });
  document.getElementById('listaAnotacoes').prepend(card);
  updateNotesEmptyState();
  scheduleSave();
  card.querySelector('.note-title-input')?.focus();
}

function resetNotesViewNavigation() {
  const sheetLayout = document.querySelector('.sheet-layout');
  const notesView = document.getElementById('notesView');
  const resourceBar = document.querySelector('.mobile-resource-bar');
  const mobileNav = document.querySelector('.mobile-nav');
  if (sheetLayout) sheetLayout.hidden = false;
  if (notesView) notesView.hidden = true;
  if (resourceBar) resourceBar.hidden = false;
  if (mobileNav) mobileNav.hidden = false;
  document.body.classList.remove('notes-view-open');
}

function openNotesView() {
  captureState();
  scheduleSave();
  notesReturnScrollY = window.scrollY;
  document.querySelector('.sheet-layout').hidden = true;
  document.querySelector('.mobile-resource-bar').hidden = true;
  document.querySelector('.mobile-nav').hidden = true;
  document.getElementById('notesView').hidden = false;
  document.body.classList.add('notes-view-open');
  window.scrollTo({ top: 0, behavior: 'auto' });
  requestAnimationFrame(() => document.getElementById('notesViewTitle')?.focus());
}

function closeNotesView() {
  captureState();
  scheduleSave();
  resetNotesViewNavigation();
  requestAnimationFrame(() => {
    window.scrollTo({ top: notesReturnScrollY, behavior: 'auto' });
    document.getElementById('abrirAnotacoes')?.focus();
  });
}

function bindNotes() {
  document.getElementById('abrirAnotacoes').addEventListener('click', openNotesView);
  document.getElementById('voltarDaAnotacoes').addEventListener('click', closeNotesView);
  document.getElementById('adicionarAnotacao').addEventListener('click', addNewNote);
  document.getElementById('adicionarPrimeiraAnotacao').addEventListener('click', addNewNote);
}

function addDynamicCard(containerId, templateId, values = {}, defaultTitle = '', options = {}) {
  const template = document.getElementById(templateId);
  const card = template.content.firstElementChild.cloneNode(true);
  const container = document.getElementById(containerId);
  card.dataset.cardType = containerId === 'listaEquipamentos'
    ? 'equipment'
    : containerId === 'listaHabilidades'
      ? 'ability'
      : 'manifestation';
  card.open = options.startOpen ?? true;
  bindFavoriteButton(card, { favorite: values.favorite === true });

  card.querySelectorAll('[data-field]').forEach(field => {
    if (values[field.dataset.field] !== undefined) field.value = values[field.dataset.field];
    field.addEventListener('input', () => {
      updateCardSummary(card, defaultTitle);
      if (card.dataset.cardType === 'manifestation') {
        setCardFeedback(card, '');
        updateManifestationUseState(card);
      }
      scheduleSave();
    });
  });

  card.querySelector('.remove-card').addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    card.remove();
    applyFavoriteFilter(card.dataset.cardType);
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
        setCardFeedback(card, `PN insuficiente: são necessários ${cost} PN e você possui ${current}.`, 'error');
        return;
      }

      if (cost > 0 && !confirm(`Usar ${name} e gastar ${cost} PN?`)) return;
      applyResourceDelta('pnAtual', -cost, false);
      setCardFeedback(card, `${name} utilizada. Restam ${numberValue('pnAtual')} PN.`, 'success');
      setAdjusterFeedback(`${name} utilizada. Custo: ${cost} PN.`);
    });
  }

  container.appendChild(card);
  updateCardSummary(card, defaultTitle);
  if (card.dataset.cardType === 'manifestation') updateManifestationUseState(card);
  applyFavoriteFilter(card.dataset.cardType);
  return card;
}

function addAutomaticClassAbility(className) {
  const definition = classDefinitions[className];
  if (!definition) return null;

  const template = document.getElementById('templateHabilidade');
  const card = template.content.firstElementChild.cloneNode(true);
  card.classList.add('automatic-class-ability');
  card.dataset.cardType = 'ability';
  card.dataset.automaticClass = className;
  card.open = false;

  const removeButton = card.querySelector('.remove-card');
  removeButton.remove();

  const badge = document.createElement('span');
  badge.className = 'automatic-badge';
  badge.textContent = `${className} · automática`;
  const favoriteButton = card.querySelector('.favorite-card-button');
  card.querySelector('summary').insertBefore(badge, favoriteButton);

  const automaticAbilityId = getAutomaticAbilityFavoriteId(className);
  bindFavoriteButton(card, {
    favorite: state.automaticAbilityFavorites?.[automaticAbilityId] === true,
    automaticAbilityId
  });

  card.querySelectorAll('[data-field]').forEach(field => {
    field.value = definition.ability[field.dataset.field] ?? '';
    field.readOnly = true;
    field.classList.add('automatic-field');
  });

  updateCardSummary(card, definition.ability.nome);
  document.getElementById('listaHabilidades').prepend(card);
  applyFavoriteFilter('ability');
  return card;
}

function syncClassAbility() {
  document.querySelectorAll('.automatic-class-ability').forEach(card => card.remove());
  const className = document.getElementById('classe').value;
  if (classDefinitions[className]) addAutomaticClassAbility(className);
  else applyFavoriteFilter('ability');
}

function getCardFieldValue(card, fieldName) {
  return card.querySelector(`[data-field="${fieldName}"]`)?.value.trim() || '';
}

function createCardMetaItem(label, value) {
  if (!value) return null;
  const item = document.createElement('span');
  item.className = 'card-meta-item';
  item.textContent = label ? `${label}: ${value}` : value;
  return item;
}

function updateCardSummary(card, fallback) {
  const nameInput = card.querySelector('[data-field="nome"]');
  const title = card.querySelector('.card-title');
  if (title) title.textContent = nameInput?.value.trim() || fallback;

  const meta = card.querySelector('.card-meta');
  if (!meta) return;
  meta.innerHTML = '';

  let items = [];
  if (card.dataset.cardType === 'equipment') {
    items = [
      createCardMetaItem('', getCardFieldValue(card, 'tipo')),
      createCardMetaItem('Dano', getCardFieldValue(card, 'dano')),
      createCardMetaItem('Alcance', getCardFieldValue(card, 'alcance')),
      createCardMetaItem('Munição', getCardFieldValue(card, 'municao'))
    ];
  } else if (card.dataset.cardType === 'ability') {
    items = [
      createCardMetaItem('Custo', getCardFieldValue(card, 'custo')),
      createCardMetaItem('Ação', getCardFieldValue(card, 'acao')),
      createCardMetaItem('', getCardFieldValue(card, 'frequencia'))
    ];
  } else {
    const cost = Math.max(0, Number(getCardFieldValue(card, 'custo') || 0));
    items = [
      createCardMetaItem('', cost > 0 ? `${cost} PN` : 'Sem custo'),
      createCardMetaItem('Ação', getCardFieldValue(card, 'acao')),
      createCardMetaItem('Alcance', getCardFieldValue(card, 'alcance'))
    ];
  }

  items.filter(Boolean).forEach(item => meta.appendChild(item));
}

function setCardFeedback(card, message, kind = '') {
  const feedback = card.querySelector('.card-feedback');
  const status = card.querySelector('.card-status');
  [feedback, status].filter(Boolean).forEach(element => {
    element.textContent = message;
    element.dataset.kind = kind;
  });
}

function updateManifestationUseState(card) {
  const button = card.querySelector('.use-manifestation');
  if (!button) return;
  const cost = Math.max(0, Number(card.querySelector('[data-field="custo"]')?.value || 0));
  const current = numberValue('pnAtual');
  const hasEnoughPn = cost <= current;
  button.disabled = !hasEnoughPn;
  button.title = hasEnoughPn
    ? `Usar Manifestação${cost > 0 ? ` e gastar ${cost} PN` : ' sem custo de PN'}`
    : `PN insuficiente: requer ${cost} PN e você possui ${current}`;
  button.setAttribute('aria-label', button.title);
}

function updateAllManifestationUseStates() {
  document.querySelectorAll('.manifestation-card').forEach(updateManifestationUseState);
}

function bindSimpleFields() {
  simpleFieldIds.forEach(id => {
    const element = document.getElementById(id);
    if (!element || ATTRIBUTE_IDS.includes(id)) return;

    if (id === 'nivel') {
      element.dataset.lastValidValue = String(integerBetween(element.value, 1, 11));
      element.addEventListener('blur', () => {
        if (element.value !== '') return;
        const restoredLevel = integerBetween(element.dataset.lastValidValue, 1, 11);
        element.value = restoredLevel;
        element.dataset.lastValidValue = String(restoredLevel);
      });
    }

    element.addEventListener('input', () => {
      if (id === 'nivel' && element.value === '') return;

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
        element.dataset.lastValidValue = element.value;
        const normalizedAttributeIds = normalizeAttributesForLevel();
        updateAttributePointsUI(normalizedAttributeIds.length
          ? 'Ao sair do nível 11, atributos acima de 5 foram ajustados ao limite atual.'
          : '');
        if (normalizedAttributeIds.includes('agilidade')) recalculateDefense();
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
    handleSelectedPhoto(file, event.target);
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
    amountInput.value = '';
  });

  resourceSelect.addEventListener('change', updateResourceAdjusterContext);

  document.querySelectorAll('[data-adjuster-value]').forEach(button => {
    button.addEventListener('click', () => {
      amountInput.value = button.dataset.adjusterValue;
    });
  });

  document.querySelector('[data-adjuster-clear]').addEventListener('click', () => {
    amountInput.value = '';
  });

  amountInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') document.getElementById('reduzirRecurso').click();
  });

  updateResourceAdjusterContext();
}

function updateResourceAdjusterContext() {
  const resourceId = document.getElementById('ajusteRecurso')?.value;
  if (!resourceId || !resourceLabels[resourceId]) return;
  const label = resourceLabels[resourceId];
  const title = document.getElementById('mobileAdjusterTitle');
  const current = document.getElementById('mobileAdjusterCurrent');
  const maximum = document.getElementById('mobileAdjusterMaximum');
  const restoreLabel = document.getElementById('mobileRestoreLabel');

  if (title) title.textContent = `Ajustar ${label}`;
  if (current) current.textContent = numberValue(resourceId);
  if (maximum) maximum.textContent = numberValue(getMaximumId(resourceId));
  if (restoreLabel) restoreLabel.textContent = `Restaurar ${label} ao máximo`;
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
      showMobileSection(button.dataset.mobileTarget);
    });
  });
}

function showMobileSection(target, { scrollToTop = true } = {}) {
  document.querySelectorAll('[data-mobile-target]').forEach(button => {
    button.classList.toggle('active', button.dataset.mobileTarget === target);
  });
  document.querySelectorAll('.mobile-section').forEach(section => {
    section.classList.toggle('active', section.dataset.mobileSection === target);
  });
  if (scrollToTop) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateMobileResource(resourceId) {
  const outputIds = {
    pvAtual: ['mobilePvAtual', 'mobilePvMax'],
    pnAtual: ['mobilePnAtual', 'mobilePnMax'],
    psAtual: ['mobilePsAtual', 'mobilePsMax']
  };
  const outputPair = outputIds[resourceId];
  if (!outputPair) return;
  const [currentOutputId, maximumOutputId] = outputPair;
  const currentOutput = document.getElementById(currentOutputId);
  const maximumOutput = document.getElementById(maximumOutputId);
  if (currentOutput) currentOutput.textContent = numberValue(resourceId);
  if (maximumOutput) maximumOutput.textContent = numberValue(getMaximumId(resourceId));
}

function bindMobileResourceBar() {
  const bar = document.getElementById('mobileResourceBar');
  const toggle = document.getElementById('mobileResourceToggle');
  if (!bar || !toggle) return;
  let isCollapsed = false;

  try {
    isCollapsed = sessionStorage.getItem(RESOURCE_BAR_SESSION_KEY) === 'true';
  } catch (error) {
    console.warn('Não foi possível restaurar o estado da barra de recursos:', error);
  }

  function applyCollapsedState(collapsed) {
    isCollapsed = collapsed;
    bar.classList.toggle('collapsed', isCollapsed);
    document.body.classList.toggle('resource-bar-collapsed', isCollapsed);
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
    toggle.setAttribute('aria-label', isCollapsed ? 'Expandir barra de recursos' : 'Recolher barra de recursos');
    toggle.querySelector('span').textContent = isCollapsed ? '⌄' : '⌃';

    try {
      sessionStorage.setItem(RESOURCE_BAR_SESSION_KEY, String(isCollapsed));
    } catch (error) {
      console.warn('Não foi possível memorizar o estado da barra de recursos:', error);
    }
  }

  toggle.addEventListener('click', () => applyCollapsedState(!isCollapsed));

  document.querySelectorAll('[data-quick-resource]').forEach(button => {
    button.addEventListener('click', () => {
      const resourceId = button.dataset.quickResource;
      showMobileSection('resumo', { scrollToTop: false });
      document.getElementById('ajusteRecurso').value = resourceId;
      updateResourceAdjusterContext();

      requestAnimationFrame(() => {
        const adjuster = document.querySelector('.resource-adjuster');
        adjuster?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    });
  });

  document.querySelector('[data-quick-defense]')?.addEventListener('click', () => {
    showMobileSection('resumo', { scrollToTop: false });
    requestAnimationFrame(() => {
      const defenseCard = document.querySelector('.defense-card');
      if (!defenseCard) return;
      defenseCard.classList.remove('attention-highlight');
      void defenseCard.offsetWidth;
      defenseCard.classList.add('attention-highlight');
      defenseCard.focus({ preventScroll: true });
      defenseCard.scrollIntoView({ block: 'center', behavior: 'smooth' });
      window.setTimeout(() => defenseCard.classList.remove('attention-highlight'), 1800);
    });
  });

  ['pvAtual', 'pnAtual', 'psAtual'].forEach(updateMobileResource);
  applyCollapsedState(isCollapsed);
}

function bindContentNavigation() {
  const mediaQuery = window.matchMedia('(max-width: 1279px)');
  const tabs = [...document.querySelectorAll('[data-content-target]')];
  const panels = [...document.querySelectorAll('[data-content-section]')];
  const validSections = tabs.map(tab => tab.dataset.contentTarget);
  let activeSection = 'equipamentos';

  try {
    const savedSection = sessionStorage.getItem(CONTENT_SECTION_SESSION_KEY);
    if (validSections.includes(savedSection)) activeSection = savedSection;
  } catch (error) {
    console.warn('Não foi possível restaurar a subseção de conteúdo desta sessão:', error);
  }

  function applyContentSection(section, { focusTab = false, scrollToPanel = false } = {}) {
    if (!validSections.includes(section)) section = 'equipamentos';
    activeSection = section;

    tabs.forEach(tab => {
      const isActive = tab.dataset.contentTarget === activeSection;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
      if (isActive && focusTab) tab.focus();
    });

    panels.forEach(panel => {
      const isActive = panel.dataset.contentSection === activeSection;
      panel.classList.toggle('active', isActive);
      panel.hidden = mediaQuery.matches && !isActive;
      panel.setAttribute('aria-hidden', String(mediaQuery.matches && !isActive));
    });

    try {
      sessionStorage.setItem(CONTENT_SECTION_SESSION_KEY, activeSection);
    } catch (error) {
      console.warn('Não foi possível memorizar a subseção de conteúdo desta sessão:', error);
    }

    if (scrollToPanel && mediaQuery.matches) {
      document.querySelector('.content-mobile-tabs')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      applyContentSection(tab.dataset.contentTarget, { scrollToPanel: true });
    });

    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();

      let nextIndex = index;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      applyContentSection(tabs[nextIndex].dataset.contentTarget, { focusTab: true });
    });
  });

  function syncResponsiveState() {
    applyContentSection(activeSection);
  }

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', syncResponsiveState);
  } else {
    mediaQuery.addListener(syncResponsiveState);
  }

  syncResponsiveState();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateImportedSheet(imported) {
  if (!isPlainObject(imported)) return { valid: false, reason: 'invalid', message: 'O arquivo não contém uma ficha de personagem válida.' };
  const version = typeof imported.schemaVersion === 'string' ? imported.schemaVersion.trim() : '';
  if (!/^0\.3(?:$|[.-])/i.test(version)) {
    return {
      valid: false,
      reason: version ? 'incompatible' : 'invalid',
      message: version
        ? `Esta ficha pertence à versão ${version}, que não é compatível com esta versão 0.3.`
        : 'O arquivo não informa uma versão compatível da ficha.'
    };
  }
  if (!isPlainObject(imported.fields) || !isPlainObject(imported.skills)) {
    return { valid: false, reason: 'invalid', message: 'A ficha não possui os campos básicos necessários.' };
  }
  if (!Array.isArray(imported.equipment) || !Array.isArray(imported.abilities) || !Array.isArray(imported.manifestations)) {
    return { valid: false, reason: 'invalid', message: 'As listas de equipamentos, habilidades ou Manifestações estão incompletas.' };
  }
  if (typeof (imported.photo ?? '') !== 'string' || (imported.photo && !imported.photo.startsWith('data:image/'))) {
    return { valid: false, reason: 'invalid', message: 'A foto armazenada no arquivo não possui um formato de imagem válido.' };
  }

  const normalized = {
    schemaVersion: version,
    photo: imported.photo || '',
    fields: { ...imported.fields },
    skills: { ...imported.skills },
    equipment: JSON.parse(JSON.stringify(imported.equipment)),
    abilities: JSON.parse(JSON.stringify(imported.abilities)),
    manifestations: JSON.parse(JSON.stringify(imported.manifestations)),
    automaticAbilityFavorites: {},
    notes: [],
    activeEffects: []
  };
  const corrections = [];
  const knownRootFields = [
    'schemaVersion',
    'photo',
    'fields',
    'skills',
    'equipment',
    'abilities',
    'manifestations',
    'automaticAbilityFavorites',
    'notes',
    'activeEffects'
  ];
  const unknownRootFields = Object.keys(imported).filter(key => !knownRootFields.includes(key));
  if (unknownRootFields.length) corrections.push('Informações desconhecidas fora da ficha foram removidas.');

  if (imported.automaticAbilityFavorites !== undefined) {
    if (!isPlainObject(imported.automaticAbilityFavorites)) {
      corrections.push('Os favoritos das habilidades automáticas foram ajustados.');
    } else {
      const validAutomaticAbilityIds = new Set(
        Object.keys(classDefinitions).map(getAutomaticAbilityFavoriteId)
      );
      for (const [abilityId, favorite] of Object.entries(imported.automaticAbilityFavorites)) {
        if (!validAutomaticAbilityIds.has(abilityId)) {
          corrections.push('Um favorito de habilidade automática desconhecida foi removido.');
          continue;
        }
        if (favorite === true) normalized.automaticAbilityFavorites[abilityId] = true;
        else if (favorite !== false) {
          corrections.push(`O favorito da habilidade automática “${abilityId}” foi ajustado.`);
        }
      }
    }
  }

  if (imported.notes !== undefined) {
    if (!Array.isArray(imported.notes)) {
      corrections.push('As Anotações foram ajustadas para uma lista vazia.');
    } else {
      const noteIds = new Set();
      const normalizationTime = new Date().toISOString();
      imported.notes.slice(0, 500).forEach((note, index) => {
        if (!isPlainObject(note)) {
          corrections.push(`A anotação ${index + 1} era inválida e foi removida.`);
          return;
        }

        let id = typeof note.id === 'string' ? note.id.trim() : '';
        if (!/^note-[a-z0-9-]{6,}$/i.test(id) || noteIds.has(id)) {
          id = createNoteId();
          corrections.push(`O identificador da anotação ${index + 1} foi recriado.`);
        }
        noteIds.add(id);

        function normalizeNoteText(value, fieldLabel) {
          if (value === undefined || value === null) return '';
          if (typeof value === 'string') return value;
          if (typeof value === 'number') {
            corrections.push(`${fieldLabel} da anotação ${index + 1} foi convertido para texto.`);
            return String(value);
          }
          corrections.push(`${fieldLabel} da anotação ${index + 1} foi limpo.`);
          return '';
        }

        const title = normalizeNoteText(note.title, 'O título');
        const content = normalizeNoteText(note.content, 'O conteúdo');
        const pinned = note.pinned === true;
        if (note.pinned !== undefined && note.pinned !== true && note.pinned !== false) {
          corrections.push(`A fixação da anotação ${index + 1} foi ajustada.`);
        }

        const createdDate = new Date(note.createdAt);
        const updatedDate = new Date(note.updatedAt);
        const createdAt = Number.isFinite(createdDate.getTime())
          ? createdDate.toISOString()
          : normalizationTime;
        const updatedAt = Number.isFinite(updatedDate.getTime())
          ? updatedDate.toISOString()
          : createdAt;
        if (!Number.isFinite(createdDate.getTime())) {
          corrections.push(`A data de criação da anotação ${index + 1} foi ajustada.`);
        }
        if (!Number.isFinite(updatedDate.getTime())) {
          corrections.push(`A data de alteração da anotação ${index + 1} foi ajustada.`);
        }

        const knownNoteFields = ['id', 'title', 'content', 'pinned', 'createdAt', 'updatedAt'];
        if (Object.keys(note).some(field => !knownNoteFields.includes(field))) {
          corrections.push(`Campos desconhecidos da anotação ${index + 1} foram removidos.`);
        }

        normalized.notes.push({ id, title, content, pinned, createdAt, updatedAt });
      });
      if (imported.notes.length > 500) {
        corrections.push('A lista de Anotações foi limitada a 500 itens.');
      }
    }
  }

  if (imported.activeEffects !== undefined) {
    if (!Array.isArray(imported.activeEffects)) {
      corrections.push('Os Efeitos ativos foram ajustados para uma lista vazia.');
    } else {
      const effectIds = new Set();
      imported.activeEffects.slice(0, 200).forEach((effect, index) => {
        if (!isPlainObject(effect)) {
          corrections.push(`O efeito ${index + 1} era inválido e foi removido.`);
          return;
        }

        const effectName = ['string', 'number'].includes(typeof effect.name)
          ? String(effect.name).trim()
          : '';
        if (!effectName) {
          corrections.push(`O efeito ${index + 1} não possuía nome e foi removido.`);
          return;
        }

        let id = typeof effect.id === 'string' ? effect.id.trim() : '';
        if (!/^effect-[a-z0-9-]{6,}$/i.test(id) || effectIds.has(id)) {
          id = createActiveEffectId();
          corrections.push(`O identificador do efeito ${index + 1} foi recriado.`);
        }
        effectIds.add(id);

        const validTypes = new Set(['positive', 'negative', 'neutral']);
        const type = validTypes.has(effect.type) ? effect.type : 'neutral';
        if (effect.type !== undefined && !validTypes.has(effect.type)) {
          corrections.push(`O tipo do efeito ${index + 1} foi ajustado para neutro.`);
        }

        function normalizeEffectText(value, fieldLabel) {
          if (value === undefined || value === null) return '';
          if (typeof value === 'string') return value;
          if (typeof value === 'number') {
            corrections.push(`${fieldLabel} do efeito ${index + 1} foi convertido para texto.`);
            return String(value);
          }
          corrections.push(`${fieldLabel} do efeito ${index + 1} foi removido.`);
          return '';
        }

        const description = normalizeEffectText(effect.description, 'A descrição');
        const duration = normalizeEffectText(effect.duration, 'A duração');
        const knownEffectFields = ['id', 'name', 'type', 'description', 'duration'];
        if (Object.keys(effect).some(field => !knownEffectFields.includes(field))) {
          corrections.push(`Campos desconhecidos do efeito ${index + 1} foram removidos.`);
        }
        normalized.activeEffects.push({ id, name: effectName, type, description, duration });
      });
      if (imported.activeEffects.length > 200) {
        corrections.push('A lista de Efeitos ativos foi limitada a 200 itens.');
      }
    }
  }
  const fieldLabels = {
    nivel: 'Nível',
    idade: 'Idade',
    forca: 'Força',
    vigor: 'Vigor',
    agilidade: 'Agilidade',
    intelecto: 'Intelecto',
    presenca: 'Presença',
    pvAtual: 'PV atual',
    pvMax: 'PV máximo',
    pvTemporarios: 'PV temporários',
    pnAtual: 'PN atual',
    pnMax: 'PN máximo',
    psAtual: 'PS atual',
    psMax: 'PS máximo',
    totalis: 'Totalis'
  };

  for (const [fieldId, value] of Object.entries(normalized.fields)) {
    if (!['string', 'number'].includes(typeof value)) {
      return { valid: false, reason: 'invalid', message: `O campo “${fieldId}” contém um valor inválido.` };
    }
    if (typeof value === 'number') {
      normalized.fields[fieldId] = String(value);
      corrections.push(`${fieldLabels[fieldId] || fieldId} foi convertido para o formato atual.`);
    }
  }

  function normalizeNumberField(id, minimum, maximum, fallback = minimum, integer = false) {
    if (normalized.fields[id] === undefined) return;
    const original = normalized.fields[id];
    const parsed = Number(original);
    const numericValue = integer && Number.isFinite(parsed) ? Math.trunc(parsed) : parsed;
    const safeValue = Number.isFinite(numericValue) ? Math.min(maximum, Math.max(minimum, numericValue)) : fallback;
    if (!Number.isFinite(parsed) || parsed !== safeValue) {
      normalized.fields[id] = String(safeValue);
      corrections.push(`${fieldLabels[id] || id} foi ajustado para ${safeValue}.`);
    }
  }

  normalizeNumberField('nivel', 1, 11, 1, true);
  const level = integerBetween(normalized.fields.nivel, 1, 11);
  const attributeMaximum = level === 11 ? 6 : 5;
  ATTRIBUTE_IDS.forEach(id => normalizeNumberField(id, 1, attributeMaximum, 1, true));
  if (level === 11) {
    let apexFound = false;
    ATTRIBUTE_IDS.forEach(id => {
      if (Number(normalized.fields[id]) !== 6) return;
      if (!apexFound) apexFound = true;
      else {
        normalized.fields[id] = '5';
        corrections.push(`${fieldLabels[id]} foi reduzido para 5 porque o Ápice do Nexo já estava aplicado a outro atributo.`);
      }
    });
  }

  const validClasses = new Set(['', ...Object.keys(classDefinitions)]);
  if (!validClasses.has(String(normalized.fields.classe || ''))) {
    normalized.fields.classe = '';
    corrections.push('A classe não era reconhecida e foi desmarcada.');
  }

  ['idade', 'pvAtual', 'pvMax', 'pvTemporarios', 'pnAtual', 'pnMax', 'psAtual', 'psMax', 'totalis']
    .forEach(id => normalizeNumberField(id, 0, Number.MAX_SAFE_INTEGER, 0));
  if (normalized.fields.bonusDefesaEquipamento !== undefined) {
    const defenseBonus = Number(normalized.fields.bonusDefesaEquipamento);
    if (!Number.isFinite(defenseBonus)) {
      normalized.fields.bonusDefesaEquipamento = '0';
      corrections.push('O bônus de Defesa foi ajustado para 0.');
    }
  }

  const validDegrees = new Set(Object.keys(graus));
  for (const [skillName, degree] of Object.entries(normalized.skills)) {
    if (typeof degree !== 'string') {
      return { valid: false, reason: 'invalid', message: `O grau da perícia “${skillName}” é inválido.` };
    }
    if (!validDegrees.has(degree)) {
      normalized.skills[skillName] = 'Sem Domínio';
      corrections.push(`${skillName} voltou para Sem Domínio porque o grau não era reconhecido.`);
    }
  }

  const listSchemas = [
    ['equipment', ['nome', 'tipo', 'dano', 'alcance', 'municao', 'modificacoes', 'descricao'], 'equipamento'],
    ['abilities', ['nome', 'nivel', 'custo', 'acao', 'frequencia', 'alcance', 'duracao', 'efeito'], 'habilidade'],
    ['manifestations', ['nome', 'custo', 'acao', 'alcance', 'alvo', 'duracao', 'teste', 'tipo', 'descricao', 'efeito', 'limitacoes'], 'Manifestação']
  ];

  for (const [listName, allowedFields, label] of listSchemas) {
    if (normalized[listName].length > 500) {
      return { valid: false, reason: 'invalid', message: `A lista de ${label}s é grande demais para ser uma ficha válida.` };
    }
    normalized[listName] = normalized[listName].map((item, index) => {
      if (!isPlainObject(item)) throw new Error(`INVALID_LIST:${label}:${index + 1}`);
      const cleanItem = {};
      for (const field of allowedFields) {
        if (item[field] === undefined) continue;
        if (!['string', 'number'].includes(typeof item[field])) throw new Error(`INVALID_FIELD:${label}:${index + 1}`);
        cleanItem[field] = String(item[field]);
      }
      if (item.favorite === true) cleanItem.favorite = true;
      else if (item.favorite !== undefined && item.favorite !== false) {
        corrections.push(`O favorito do ${label} ${index + 1} foi ajustado.`);
      }
      if (listName === 'abilities' && cleanItem.nivel !== undefined) {
        const abilityLevel = integerBetween(cleanItem.nivel, 1, 11);
        if (Number(cleanItem.nivel) !== abilityLevel) {
          cleanItem.nivel = String(abilityLevel);
          corrections.push(`O nível da habilidade ${index + 1} foi ajustado para ${abilityLevel}.`);
        }
      }
      if (listName === 'manifestations' && cleanItem.custo !== undefined) {
        const manifestationCost = Number(cleanItem.custo);
        const safeCost = Number.isFinite(manifestationCost) ? Math.max(0, manifestationCost) : 0;
        if (!Number.isFinite(manifestationCost) || manifestationCost !== safeCost) {
          cleanItem.custo = String(safeCost);
          corrections.push(`O custo da Manifestação ${index + 1} foi ajustado para ${safeCost} PN.`);
        }
      }
      const removedFields = Object.keys(item).filter(field => ![...allowedFields, 'favorite'].includes(field));
      if (removedFields.length) corrections.push(`Campos desconhecidos foram removidos do ${label} ${index + 1}.`);
      return cleanItem;
    });
  }

  if (!Object.keys(normalized.automaticAbilityFavorites).length) {
    delete normalized.automaticAbilityFavorites;
  }

  return {
    valid: true,
    normalized,
    corrections,
    summary: {
      name: String(normalized.fields.nome || 'Sem nome'),
      className: String(normalized.fields.classe || 'Não informada'),
      level: integerBetween(normalized.fields.nivel, 1, 11),
      version
    }
  };
}

function createImportPreview(validation, options = {}) {
  const wrapper = document.createElement('div');
  const intro = document.createElement('p');
  intro.textContent = options.intro || 'Confira os dados antes de substituir o personagem salvo neste navegador.';
  wrapper.appendChild(intro);

  const summary = document.createElement('dl');
  summary.className = 'modal-summary';
  [
    ['Nome', validation.summary.name],
    ['Classe', validation.summary.className],
    ['Nível', String(validation.summary.level)],
    ['Versão', validation.summary.version]
  ].forEach(([label, value]) => {
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    summary.append(term, description);
  });
  wrapper.appendChild(summary);

  const status = document.createElement('p');
  status.textContent = validation.corrections.length
    ? `${validation.corrections.length} correção(ões) será(ão) aplicada(s) antes da importação:`
    : 'Nenhuma correção será necessária.';
  wrapper.appendChild(status);

  if (validation.corrections.length) {
    const list = document.createElement('ul');
    list.className = 'modal-corrections';
    validation.corrections.slice(0, 12).forEach(correction => {
      const item = document.createElement('li');
      item.textContent = correction;
      list.appendChild(item);
    });
    if (validation.corrections.length > 12) {
      const item = document.createElement('li');
      item.textContent = `E mais ${validation.corrections.length - 12} correção(ões).`;
      list.appendChild(item);
    }
    wrapper.appendChild(list);
  }

  if (options.duplicate) {
    const duplicateWarning = document.createElement('div');
    duplicateWarning.className = 'duplicate-warning';
    const warningTitle = document.createElement('strong');
    warningTitle.textContent = options.duplicate.type === 'exact'
      ? 'Este personagem parece ser uma duplicata exata.'
      : 'Já existe um personagem com este nome e nível.';
    const warningText = document.createElement('p');
    warningText.textContent = 'Você ainda pode adicioná-lo como uma cópia independente.';
    duplicateWarning.append(warningTitle, warningText);
    wrapper.appendChild(duplicateWarning);
  }
  return wrapper;
}

function getValidatedStoredCharacter(id) {
  if (!isValidCharacterId(id)) throw new Error('INVALID_CHARACTER_ID');
  const manager = readCharacterManager();
  if (!manager?.order.includes(id)) throw new Error('CHARACTER_NOT_INDEXED');
  const character = readStoredCharacter(id);
  if (!character) throw new Error('CHARACTER_NOT_FOUND');
  const validation = validateImportedSheet(character);
  if (!validation.valid) throw new Error(`INVALID_STORED_CHARACTER: ${validation.message}`);
  return { character, manager, summary: manager.characters[id] };
}

function downloadStoredCharacter(character) {
  const blob = new Blob([JSON.stringify(character, null, 2)], { type: 'application/json' });
  const characterName = String(character.fields?.nome || '').trim();
  const safeName = (characterName || 'personagem')
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .toLocaleLowerCase('pt-BR');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${safeName || 'personagem'}-cronicas-da-ressonancia.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function exportStoredCharacterById(id, { notify = true } = {}) {
  try {
    const { character } = getValidatedStoredCharacter(id);
    downloadStoredCharacter(character);
    if (notify) showNotification('Backup do personagem preparado para download.');
    return true;
  } catch (error) {
    console.error('Não foi possível exportar o personagem:', error);
    openModal({
      title: 'Personagem não exportado',
      content: createModalContent(
        'Não foi possível preparar o arquivo deste personagem.',
        'O personagem continua salvo e não foi alterado.'
      ),
      actions: [{ label: 'Entendi', className: 'secondary', spanAll: true }]
    });
    return false;
  }
}

function focusCharacterCardAfterManagerUpdate(id) {
  requestAnimationFrame(() => {
    const card = document.querySelector(`.character-card[data-character-id="${CSS.escape(id)}"]`);
    if (!card) return;

    card.focus({ preventScroll: true });
    const bounds = card.getBoundingClientRect();
    const isVisible = (
      bounds.top >= 0
      && bounds.left >= 0
      && bounds.bottom <= window.innerHeight
      && bounds.right <= window.innerWidth
    );
    if (!isVisible) {
      card.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: prefersReducedViewMotion() ? 'auto' : 'smooth'
      });
    }
  });
}

async function duplicateCharacterById(id, actionButton, { closeMobileModal = false } = {}) {
  if (isDuplicatingCharacter) return;
  isDuplicatingCharacter = true;
  actionButton?.setAttribute('aria-busy', 'true');
  if (actionButton) actionButton.disabled = true;

  let previousManager = null;
  let duplicateId = '';
  let recordCreated = false;
  let indexCommitted = false;

  try {
    if (storageMode === 'v4' && activeCharacterId === id) {
      const saved = await saveActiveCharacter();
      if (!saved) throw new Error('ACTIVE_CHARACTER_SAVE_FAILED');
      await refreshActiveCharacterMetadata();
    }

    const stored = getValidatedStoredCharacter(id);
    previousManager = stored.manager;
    const validation = validateImportedSheet(stored.character);
    if (!validation.valid) {
      throw new Error(`INVALID_STORED_CHARACTER: ${validation.message}`);
    }

    const duplicate = cloneCharacterState(validation.normalized);
    const originalName = String(duplicate.fields?.nome || '').trim();
    if (originalName) duplicate.fields.nome = `${originalName} — Cópia`;

    duplicateId = createUniqueCharacterId(previousManager);
    writeStoredCharacter(duplicateId, duplicate);
    recordCreated = true;

    const verifiedDuplicate = readStoredCharacter(duplicateId);
    if (JSON.stringify(verifiedDuplicate) !== JSON.stringify(duplicate)) {
      throw new Error('DUPLICATED_CHARACTER_VERIFICATION_FAILED');
    }

    const duplicatedAt = new Date().toISOString();
    const duplicateSummary = {
      name: originalName ? `${originalName} — Cópia` : '',
      level: integerBetween(duplicate.fields?.nivel, 1, 11),
      thumbnail: stored.summary.thumbnail,
      photoFingerprint: stored.summary.photoFingerprint
        ?? createPhotoFingerprint(duplicate.photo || ''),
      updatedAt: duplicatedAt
    };
    const nextManager = setCharacterSummary(previousManager, duplicateId, duplicateSummary);
    writeCharacterManager(nextManager);

    const verifiedManager = readCharacterManager();
    indexCommitted = Boolean(
      verifiedManager?.order.includes(duplicateId)
      && isValidCharacterSummary(verifiedManager.characters[duplicateId])
      && readStoredCharacter(duplicateId)
    );
    if (!indexCommitted) throw new Error('DUPLICATED_CHARACTER_INDEX_VERIFICATION_FAILED');

    if (closeMobileModal) closeModal();
    closeDesktopCharacterOptions();
    renderCharacterManager();
    showNotification('Personagem duplicado com sucesso.');
    focusCharacterCardAfterManagerUpdate(duplicateId);
  } catch (error) {
    console.error('Não foi possível duplicar o personagem:', error);

    if (!indexCommitted && previousManager) {
      try {
        writeCharacterManager(previousManager);
      } catch (rollbackError) {
        console.error('Não foi possível restaurar o índice após a falha de duplicação:', rollbackError);
      }
    }
    if (!indexCommitted && recordCreated && duplicateId) {
      try {
        removeStoredCharacter(duplicateId);
      } catch (rollbackError) {
        console.error('Não foi possível remover a cópia incompleta:', rollbackError);
      }
    }

    openModal({
      title: 'Personagem não duplicado',
      content: createModalContent(
        'Não foi possível criar a cópia com segurança.',
        'O personagem original e os demais personagens continuam intactos.'
      ),
      actions: [{ label: 'Entendi', className: 'secondary', spanAll: true }]
    });
  } finally {
    isDuplicatingCharacter = false;
    if (actionButton?.isConnected) {
      actionButton.disabled = false;
      actionButton.removeAttribute('aria-busy');
    }
  }
}

function createCharacterDeletionPreview(id, summary) {
  const wrapper = document.createElement('div');
  wrapper.className = 'delete-character-confirmation';
  const portrait = document.createElement('div');
  portrait.className = 'delete-character-portrait';
  const characterName = summary.name || 'Novo personagem';

  if (summary.thumbnail) {
    const image = document.createElement('img');
    image.src = summary.thumbnail;
    image.alt = '';
    portrait.appendChild(image);
  } else {
    const placeholder = document.createElement('span');
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.textContent = getCharacterInitial(characterName);
    portrait.appendChild(placeholder);
  }

  const identity = document.createElement('div');
  identity.className = 'delete-character-identity';
  const name = document.createElement('strong');
  name.textContent = characterName;
  const level = document.createElement('span');
  level.textContent = `Nível ${summary.level}`;
  identity.append(name, level);

  const warning = createModalContent(
    'A remoção acontecerá somente neste navegador e dispositivo.',
    'Sem um arquivo exportado, esta ação não poderá ser desfeita.',
    'Ao escolher exportar e excluir, o navegador preparará o arquivo antes da remoção. Confira depois se o download está disponível entre seus arquivos.'
  );
  warning.className = 'delete-character-warning';
  wrapper.append(portrait, identity, warning);
  wrapper.dataset.characterId = id;
  return wrapper;
}

async function openCharacterDeletionOptions(id) {
  if (isDeletingCharacter) return;
  try {
    if (storageMode === 'v4' && activeCharacterId === id) {
      await saveActiveCharacter();
      await refreshActiveCharacterMetadata();
    }
    const { summary } = getValidatedStoredCharacter(id);
    openModal({
      title: 'Excluir personagem?',
      content: createCharacterDeletionPreview(id, summary),
      actions: [
        {
          label: 'Exportar e excluir',
          onClick: () => {
            if (!exportStoredCharacterById(id, { notify: false })) return;
            showNotification('Backup preparado. Confira o download; a remoção acontecerá em seguida.');
            setTimeout(() => deleteCharacterById(id, { backupPrepared: true }), 1200);
          }
        },
        {
          label: 'Excluir sem backup',
          className: 'danger',
          onClick: () => confirmPermanentCharacterDeletion(id)
        },
        { label: 'Cancelar', className: 'secondary', spanAll: true }
      ]
    });
  } catch (error) {
    console.error('Não foi possível preparar a exclusão:', error);
    openModal({
      title: 'Personagem não encontrado',
      content: createModalContent(
        'Este personagem não pôde ser localizado com segurança.',
        'Nenhum registro foi removido.'
      ),
      actions: [{ label: 'Entendi', className: 'secondary', spanAll: true }]
    });
  }
}

function confirmPermanentCharacterDeletion(id) {
  openModal({
    title: 'Excluir permanentemente este personagem?',
    content: createModalContent(
      'Sem um arquivo exportado, não será possível recuperá-lo.',
      'Nenhuma exclusão acontecerá antes desta confirmação final.'
    ),
    actions: [
      {
        label: 'Confirmar exclusão',
        className: 'danger',
        onClick: () => deleteCharacterById(id)
      },
      {
        label: 'Voltar',
        className: 'secondary',
        onClick: () => openCharacterDeletionOptions(id)
      }
    ]
  });
}

async function deleteCharacterById(id, { backupPrepared = false } = {}) {
  if (isDeletingCharacter) return;
  isDeletingCharacter = true;
  await Promise.resolve();

  let previousManager = null;
  let indexUpdated = false;
  let deletionCommitted = false;
  try {
    const stored = getValidatedStoredCharacter(id);
    previousManager = stored.manager;
    const nextManager = removeCharacterFromManager(previousManager, id);
    const migration = nextManager.migrations[V3_MIGRATION_ID];
    if (migration?.characterId === id && migration.v4ActivatedAt) {
      nextManager.migrations[V3_MIGRATION_ID] = {
        ...migration,
        characterRemovedAt: new Date().toISOString()
      };
    }
    writeCharacterManager(nextManager);
    indexUpdated = true;

    removeStoredCharacter(id);
    if (localStorage.getItem(getCharacterStorageKey(id)) !== null) {
      throw new Error('CHARACTER_DELETE_VERIFICATION_FAILED');
    }

    const storageIssues = inspectCharacterStorage(readCharacterManager());
    if (storageIssues.orphanedCharacterIds.includes(id) || storageIssues.missingCharacterIds.includes(id)) {
      throw new Error('CHARACTER_DELETE_CONSISTENCY_FAILED');
    }
    deletionCommitted = true;

    if (activeCharacterId === id) {
      discardPendingSave();
      activeCharacterId = null;
      storageMode = 'closed';
      resetCharacterView();
    }

    showCharacterManagerView();
    showNotification(
      backupPrepared
        ? 'Personagem removido. O backup foi preparado pelo navegador.'
        : 'Personagem excluído deste navegador.'
    );
  } catch (error) {
    console.error('Não foi possível excluir o personagem:', error);
    if (deletionCommitted) {
      if (activeCharacterId === id) {
        discardPendingSave();
        activeCharacterId = null;
        storageMode = 'closed';
      }
      try {
        showCharacterManagerView();
      } catch (renderError) {
        console.error('O personagem foi excluído, mas o menu não pôde ser atualizado:', renderError);
      }
      showNotification('Personagem excluído. Atualize a página se a galeria não estiver correta.', 'warning', 6500);
      return;
    }
    if (
      indexUpdated
      && previousManager
      && localStorage.getItem(getCharacterStorageKey(id)) !== null
    ) {
      try {
        writeCharacterManager(previousManager);
      } catch (recoveryError) {
        console.error('Não foi possível restaurar o personagem no índice:', recoveryError);
      }
    }
    openModal({
      title: 'Personagem não excluído',
      content: createModalContent(
        'Não foi possível confirmar a remoção com segurança.',
        'O sistema preservou ou tentou recuperar o registro. Os demais personagens não foram alterados.'
      ),
      actions: [{ label: 'Entendi', className: 'secondary', spanAll: true }]
    });
  } finally {
    isDeletingCharacter = false;
  }
}

function exportSheet({ notify = true } = {}) {
  try {
    captureState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const safeName = (document.getElementById('nome').value || 'personagem').trim().replace(/[^\p{L}\p{N}-]+/gu, '-').toLowerCase();
    link.href = URL.createObjectURL(blob);
    link.download = `${safeName || 'personagem'}-cronicas-da-ressonancia.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    if (notify) showNotification('Backup preparado para download.');
    return true;
  } catch (error) {
    console.error(error);
    showNotification('Não foi possível preparar o backup.', 'error');
    return false;
  }
}

function rejectImport(message, incompatible = false) {
  openModal({
    title: incompatible ? 'Versão incompatível' : 'Importação recusada',
    content: createModalContent(message, 'O personagem atual permanece intacto.'),
    actions: [{ label: 'Entendi', className: 'secondary', spanAll: true }]
  });
}

function importSheet(file) {
  if (file.size > 12 * 1024 * 1024) {
    rejectImport('O arquivo é grande demais para ser uma ficha válida.');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => rejectImport('Não foi possível ler o arquivo selecionado.');
  reader.onload = () => {
    let validation;
    try {
      const imported = JSON.parse(reader.result);
      validation = validateImportedSheet(imported);
    } catch (error) {
      if (String(error.message).startsWith('INVALID_')) {
        validation = { valid: false, reason: 'invalid', message: 'Uma das listas da ficha contém dados inválidos.' };
      } else {
        console.error(error);
        validation = { valid: false, reason: 'invalid', message: 'O arquivo não contém um JSON válido.' };
      }
    }
    if (!validation.valid) {
      rejectImport(validation.message, validation.reason === 'incompatible');
      return;
    }

    openModal({
      title: 'Importar personagem?',
      content: createImportPreview(validation),
      actions: [
        {
          label: 'Importar',
          onClick: async () => {
            const previousCharacter = storageMode === 'v4' && activeCharacterId
              ? readStoredCharacter(activeCharacterId)
              : null;
            try {
              if (storageMode === 'v4' && activeCharacterId) {
                writeStoredCharacter(activeCharacterId, validation.normalized);
                await refreshCharacterMetadata(activeCharacterId, validation.normalized);
              } else {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(validation.normalized));
              }
              const successMessage = validation.corrections.length
                ? `Personagem importado. ${validation.corrections.length} correção(ões) foi(ram) aplicada(s).`
                : 'Personagem importado com sucesso.';
              if (storePendingNotice(successMessage)) location.reload();
              else {
                showNotification(successMessage);
                setTimeout(() => location.reload(), 1400);
              }
            } catch (error) {
              console.error(error);
              if (previousCharacter && activeCharacterId) {
                try {
                  writeStoredCharacter(activeCharacterId, previousCharacter);
                  await refreshCharacterMetadata(activeCharacterId, previousCharacter);
                } catch (rollbackError) {
                  console.error('Não foi possível restaurar o personagem após a falha de importação:', rollbackError);
                }
              }
              showNotification('Não foi possível salvar a ficha importada. O personagem atual foi mantido.', 'error', 6500);
            }
          }
        },
        { label: 'Cancelar', className: 'secondary' }
      ]
    });
  };
  reader.readAsText(file);
}

function bindHeaderActions() {
  document.getElementById('exportarFicha').addEventListener('click', () => exportSheet());
  document.getElementById('importarFicha').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) importSheet(file);
    event.target.value = '';
  });
  document.getElementById('excluirPersonagem').addEventListener('click', () => {
    if (activeCharacterId) openCharacterDeletionOptions(activeCharacterId);
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
    setStatus('Erro ao salvar', 'error');
    return {};
  }
}

function init() {
  bindModalSystem();
  buildSkills();
  bindSkillFilters();
  bindSimpleFields();
  bindAttributeControls();
  bindResourceAdjuster();
  bindDynamicButtons();
  bindFavoriteFilters();
  bindActiveEffects();
  bindNotes();
  bindMobileNavigation();
  bindMobileResourceBar();
  bindContentNavigation();
  bindHeaderActions();
  bindCharacterManager();
  captureInitialFieldValues();
  restoreState(loadSavedState());
  if (storageAvailable) setStatus('Salvo neste navegador');
  startV3CharacterMigration();

  try {
    const pendingNotice = sessionStorage.getItem(NOTICE_SESSION_KEY);
    if (pendingNotice) {
      sessionStorage.removeItem(NOTICE_SESSION_KEY);
      showNotification(pendingNotice);
    }
  } catch (error) {
    console.warn('Não foi possível recuperar a mensagem de confirmação:', error);
  }

  window.addEventListener('beforeunload', () => {
    if (hasPendingSave) saveNow();
  });
}

document.addEventListener('DOMContentLoaded', init);
