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

const resourceVisualSnapshots = new Map();
const resourceFeedbackTimers = new WeakMap();

const simpleFieldIds = [
  'nome', 'patente', 'idade', 'tipoNexo', 'nivel', 'assinatura', 'classe', 'formaConjuracao',
  'pvAtual', 'pvMax', 'pvTemporarios', 'pnAtual', 'pnMax', 'psAtual', 'psMax',
  'forca', 'vigor', 'agilidade', 'intelecto', 'presenca',
  'bonusDefesaEquipamento', 'protecaoPrincipal'
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
let classAutomationNoticeTimer;
let isAddingOfficialCondition = false;
let isAddingOfficialEquipment = false;
let notificationTimer;
let modalReturnFocus = null;
let notesReturnScrollY = 0;
let quickDiceReturnFocus = null;
let quickDiceAnimationTimer;
let chronicleCreationCover = null;
let chronicleCreationPreviewUrl = '';
let chronicleFormMode = 'create';
let chronicleFormOriginal = null;
let chronicleFormVisualIndex = 0;
let chronicleFormCoverAction = 'keep';
let chronicleFormSessionToken = 0;
let chronicleCoverProcessingToken = 0;
let isChronicleCoverProcessing = false;
let chroniclesRenderToken = 0;
let isCreatingChronicle = false;
let isUpdatingChronicle = false;
let isDeletingChronicle = false;
let isOpeningChronicle = false;
let activeChronicleId = null;
let activeChronicleRecord = null;
let activeChronicleVisualIndex = 0;
let chronicleReturnFocusId = '';
let chronicleDetailCoverUrl = '';
let chronicleDetailRenderToken = 0;
let chronicleActionsReturnFocus = null;
let chronicleCastRenderToken = 0;
let chronicleCastOpeningToken = 0;
let isOpeningChronicleCast = false;
let chronicleCastIds = [];
let chronicleCastDirectory = [];
let chronicleCastOriginalIds = new Set();
let chronicleCastDraftIds = new Set();
let chronicleCastReturnFocus = null;
let chronicleCastBaseUpdatedAt = '';
let isChronicleCastManagementOpen = false;
let isLoadingChronicleCast = false;
let isSavingChronicleCast = false;
let chronicleParticipantsRenderToken = 0;
let chronicleParticipantEditorToken = 0;
let chronicleParticipantEditor = null;
let isParticipantMutationPending = false;
const chronicleCardObjectUrls = new Map();
const initialFieldValues = {};
const equipmentCatalogModificationsByCard = new WeakMap();

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
  void window.RollHistory?.open(id);
  queueCharacterMetadataRefresh(id, cloneCharacterState(character));
  return character;
}

async function closeCharacter() {
  await saveActiveCharacter();
  window.RollHistory?.close();
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
  shell.dataset.characterEntry = id;

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
  if (!cardList) return [];
  closeDesktopCharacterOptions();
  cardList.querySelectorAll('[data-character-entry]').forEach(card => card.remove());
  const manager = readCharacterManager();
  const characterIds = manager?.order || [];
  const characterCards = document.createDocumentFragment();

  characterIds.forEach(id => {
    characterCards.appendChild(createCharacterCard(id, manager.characters[id]));
  });
  cardList.appendChild(characterCards);
  return characterIds;
}

function showManagerSection(sectionId = 'characters', { focusPanel = false } = {}) {
  if (window.MasterShieldUI?.requestExit(() => showManagerSection(sectionId, { focusPanel }))) return;
  if (window.ConfrontationsUI?.requestExit(() => showManagerSection(sectionId, { focusPanel }))) return;
  if (chronicleParticipantEditor || isParticipantMutationPending) {
    requestChronicleParticipantExit(() => showManagerSection(sectionId, { focusPanel }));
    return;
  }
  const buttons = [...document.querySelectorAll('[data-manager-section]')];
  const panels = [...document.querySelectorAll('[data-manager-panel]')];
  const managerView = document.getElementById('characterManagerView');
  const targetPanel = panels.find(panel => panel.dataset.managerPanel === sectionId)
    || panels.find(panel => panel.dataset.managerPanel === 'characters');
  if (!targetPanel) return;

  const activeSection = targetPanel.dataset.managerPanel;
  const previousSection = managerView?.dataset.activeEnvironment;
  if (previousSection === 'chronicles' && activeSection !== 'chronicles') {
    resetChronicleCreationForm();
    teardownChroniclesIndex();
    teardownChronicleDetail();
  }
  if (managerView) managerView.dataset.activeEnvironment = activeSection;
  buttons.forEach(button => {
    const isActive = button.dataset.managerSection === activeSection;
    button.classList.toggle('active', isActive);
    if (isActive) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  panels.forEach(panel => {
    panel.hidden = panel !== targetPanel;
  });

  if (activeSection !== 'characters') closeDesktopCharacterOptions();
  if (activeSection === 'chronicles') void showChroniclesIndex();
  if (focusPanel) requestAnimationFrame(() => targetPanel.focus());
}

function showCharacterSheetView() {
  closeQuickDice({ restoreFocus: false });
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
  showManagerSection('characters');
  sheetView.hidden = true;
  sheetView.classList.remove('view-leaving');
  managerView.hidden = false;
  document.body.classList.add('manager-view-open');
  window.scrollTo({ top: 0, behavior: 'auto' });
  await enterView(managerView);

  const focusTarget = focusCharacterId
    ? document.querySelector(`[data-character-id="${CSS.escape(focusCharacterId)}"]`)
    : null;
  (focusTarget || document.getElementById('managerCreateCharacter'))?.focus();
  clearViewTransitionState(trigger, managerView, sheetView);
}

function showCharacterManagerView(focusCharacterId = '') {
  closeQuickDice({ restoreFocus: false });
  renderCharacterManager();
  showManagerSection('characters');
  document.getElementById('characterSheetView').hidden = true;
  document.getElementById('characterManagerView').hidden = false;
  document.body.classList.add('manager-view-open');
  window.scrollTo({ top: 0, behavior: 'auto' });

  requestAnimationFrame(() => {
    const focusTarget = focusCharacterId
      ? document.querySelector(`[data-character-id="${CSS.escape(focusCharacterId)}"]`)
      : null;
    (focusTarget || document.getElementById('managerCreateCharacter'))?.focus();
  });
}

async function returnToCharacterManager() {
  if (isViewTransitioning) return;
  closeQuickDice({ restoreFocus: false });
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

const CHRONICLE_COVER_LIMITS = Object.freeze({
  sourceBytes: 12 * 1024 * 1024,
  sourcePixels: 60_000_000,
  width: 960,
  height: 540,
  targetBytes: 300 * 1024,
  maximumBytes: 450 * 1024,
  minimumWidth: 360
});

function getChroniclesStorage() {
  if (!window.ChroniclesStorage) throw new Error('CHRONICLES_STORAGE_UNAVAILABLE');
  const base = window.ChroniclesOnline?.createRouter(window.ChroniclesStorage) || window.ChroniclesStorage;
  if (activeChronicleRecord?.storage === 'online' && window.ChroniclesOnlineCombat?.storage) {
    return Object.freeze({ ...base, ...window.ChroniclesOnlineCombat.storage });
  }
  return base;
}

function revokeChronicleCreationPreviewUrl() {
  if (!chronicleCreationPreviewUrl) return;
  URL.revokeObjectURL(chronicleCreationPreviewUrl);
  chronicleCreationPreviewUrl = '';
}

function revokeChronicleCardObjectUrls() {
  chronicleCardObjectUrls.forEach(url => URL.revokeObjectURL(url));
  chronicleCardObjectUrls.clear();
}

function teardownChroniclesIndex() {
  chroniclesRenderToken += 1;
  revokeChronicleCardObjectUrls();
  document.getElementById('chroniclesRecordGrid')?.replaceChildren();
}

function setChronicleFormFeedback(message = '', kind = '') {
  const feedback = document.getElementById('chronicleFormFeedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.dataset.kind = kind;
}

function setChronicleFormMode(mode) {
  chronicleFormMode = mode === 'edit' ? 'edit' : 'create';
  const isEdit = chronicleFormMode === 'edit';
  const view = document.getElementById('chronicleCreateView');
  if (view) view.dataset.mode = chronicleFormMode;
  document.getElementById('backToChroniclesIndex').textContent = isEdit
    ? '← Cancelar e voltar para a Crônica'
    : '← Voltar para Crônicas';
  document.getElementById('chronicleFormKicker').textContent = isEdit
    ? 'Atualizar registro narrativo'
    : 'Novo registro narrativo';
  document.getElementById('chronicleCreateTitle').textContent = isEdit
    ? 'Editar Crônica'
    : 'Nova Crônica';
  document.getElementById('chronicleFormDescription').textContent = isEdit
    ? 'Atualize a apresentação desta história. As alterações só serão aplicadas ao salvar.'
    : 'Defina a apresentação inicial da história. O interior da Crônica será desenvolvido em uma próxima etapa.';
  document.getElementById('createChronicleButton').textContent = isEdit
    ? 'Salvar alterações'
    : 'Criar Crônica';
  document.getElementById('chronicleDangerZone').hidden = !isEdit;
}

function resetChronicleCreationForm() {
  const form = document.getElementById('chronicleCreateForm');
  if (!form) return;
  chronicleFormSessionToken += 1;
  chronicleCoverProcessingToken += 1;
  isChronicleCoverProcessing = false;
  form.reset();
  form.querySelectorAll('[aria-invalid="true"]').forEach(element => element.removeAttribute('aria-invalid'));
  revokeChronicleCreationPreviewUrl();
  chronicleCreationCover = null;
  chronicleFormOriginal = null;
  chronicleFormVisualIndex = 0;
  chronicleFormCoverAction = 'keep';
  setChronicleFormMode('create');
  window.ChroniclesOnline?.setFormStorage('local');

  const preview = document.getElementById('chronicleCoverPreview');
  const image = document.getElementById('chronicleCoverPreviewImage');
  const placeholder = document.getElementById('chronicleCoverPlaceholder');
  const removeButton = document.getElementById('removeChronicleCover');
  const selectLabel = document.getElementById('chronicleCoverSelectLabel');
  const status = document.getElementById('chronicleCoverStatus');
  const input = document.getElementById('chronicleCoverInput');
  const select = input?.closest('label');
  const submitButton = document.getElementById('createChronicleButton');
  if (preview) preview.dataset.hasCover = 'false';
  if (image) {
    image.removeAttribute('src');
    image.hidden = true;
  }
  if (placeholder) placeholder.hidden = false;
  if (removeButton) removeButton.hidden = true;
  if (selectLabel) selectLabel.textContent = 'Adicionar imagem';
  if (status) status.textContent = '';
  if (input) {
    input.disabled = false;
    input.value = '';
  }
  select?.removeAttribute('aria-busy');
  if (submitButton && !isCreatingChronicle && !isUpdatingChronicle && !isDeletingChronicle) {
    submitButton.disabled = false;
    submitButton.removeAttribute('aria-busy');
  }
  setChronicleFormFeedback();
}

function formatChronicleFileSize(bytes) {
  return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
}

function setChronicleCreationCover(cover, { action = 'replace', statusLabel = 'Capa pronta' } = {}) {
  revokeChronicleCreationPreviewUrl();
  chronicleCreationCover = action === 'replace' ? cover : null;
  if (chronicleFormMode === 'edit') chronicleFormCoverAction = action;
  chronicleCreationPreviewUrl = URL.createObjectURL(cover.blob);

  const preview = document.getElementById('chronicleCoverPreview');
  const image = document.getElementById('chronicleCoverPreviewImage');
  const placeholder = document.getElementById('chronicleCoverPlaceholder');
  preview.dataset.hasCover = 'true';
  image.src = chronicleCreationPreviewUrl;
  image.hidden = false;
  placeholder.hidden = true;
  document.getElementById('removeChronicleCover').hidden = false;
  document.getElementById('chronicleCoverSelectLabel').textContent = 'Substituir imagem';
  document.getElementById('chronicleCoverStatus').textContent = (
    `${statusLabel} · ${cover.width} × ${cover.height} · ${formatChronicleFileSize(cover.blob.size)}`
  );
}

function removeChronicleCreationCover() {
  revokeChronicleCreationPreviewUrl();
  chronicleCreationCover = null;
  if (chronicleFormMode === 'edit') chronicleFormCoverAction = 'remove';
  const input = document.getElementById('chronicleCoverInput');
  if (input) input.value = '';
  const preview = document.getElementById('chronicleCoverPreview');
  const image = document.getElementById('chronicleCoverPreviewImage');
  preview.dataset.hasCover = 'false';
  image.removeAttribute('src');
  image.hidden = true;
  document.getElementById('chronicleCoverPlaceholder').hidden = false;
  document.getElementById('removeChronicleCover').hidden = true;
  document.getElementById('chronicleCoverSelectLabel').textContent = 'Adicionar imagem';
  document.getElementById('chronicleCoverStatus').textContent = '';
}

function loadChronicleCoverImage(file) {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    const finish = callback => {
      URL.revokeObjectURL(sourceUrl);
      callback();
    };
    image.onload = () => finish(() => resolve(image));
    image.onerror = () => finish(() => reject(new Error('CHRONICLE_COVER_DECODE_FAILED')));
    image.src = sourceUrl;
  });
}

function canvasToImageBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) reject(new Error('CHRONICLE_COVER_ENCODE_FAILED'));
      else resolve(blob);
    }, type, quality);
  });
}

async function encodeChronicleCover(canvas) {
  const webp = await canvasToImageBlob(canvas, 'image/webp', 0.82);
  if (webp.type === 'image/webp') {
    if (webp.size <= CHRONICLE_COVER_LIMITS.targetBytes) return webp;
    return canvasToImageBlob(canvas, 'image/webp', 0.78);
  }

  const jpeg = await canvasToImageBlob(canvas, 'image/jpeg', 0.82);
  if (jpeg.size <= CHRONICLE_COVER_LIMITS.targetBytes) return jpeg;
  return canvasToImageBlob(canvas, 'image/jpeg', 0.78);
}

async function prepareChronicleCover(file) {
  if (!file?.type?.startsWith('image/')) throw new TypeError('CHRONICLE_COVER_INVALID_TYPE');
  if (!file.size || file.size > CHRONICLE_COVER_LIMITS.sourceBytes) {
    throw new RangeError('CHRONICLE_COVER_SOURCE_TOO_LARGE');
  }

  const image = await loadChronicleCoverImage(file);
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('CHRONICLE_COVER_INVALID_DIMENSIONS');
  if (image.naturalWidth * image.naturalHeight > CHRONICLE_COVER_LIMITS.sourcePixels) {
    throw new RangeError('CHRONICLE_COVER_SOURCE_TOO_LARGE');
  }

  const targetRatio = 16 / 9;
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const sourceWidth = sourceRatio > targetRatio
    ? image.naturalHeight * targetRatio
    : image.naturalWidth;
  const sourceHeight = sourceRatio > targetRatio
    ? image.naturalHeight
    : image.naturalWidth / targetRatio;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;

  let outputWidth = Math.min(CHRONICLE_COVER_LIMITS.width, Math.floor(sourceWidth));
  let lastCandidate = null;

  while (outputWidth >= 1) {
    const outputHeight = Math.max(1, Math.round(outputWidth / targetRatio));
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('CHRONICLE_COVER_CANVAS_UNAVAILABLE');
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      outputWidth,
      outputHeight
    );

    lastCandidate = await encodeChronicleCover(canvas);
    if (lastCandidate.size <= CHRONICLE_COVER_LIMITS.targetBytes) {
      return { blob: lastCandidate, width: outputWidth, height: outputHeight };
    }
    if (outputWidth <= CHRONICLE_COVER_LIMITS.minimumWidth) break;
    outputWidth = Math.max(CHRONICLE_COVER_LIMITS.minimumWidth, Math.floor(outputWidth * 0.84));
  }

  if (lastCandidate && lastCandidate.size <= CHRONICLE_COVER_LIMITS.maximumBytes) {
    return {
      blob: lastCandidate,
      width: outputWidth,
      height: Math.max(1, Math.round(outputWidth / targetRatio))
    };
  }
  throw new RangeError('CHRONICLE_COVER_COMPRESSED_TOO_LARGE');
}

function getChronicleCoverErrorMessage(error) {
  if (error?.message === 'CHRONICLE_COVER_INVALID_TYPE') return 'Escolha um arquivo de imagem válido.';
  if (error?.message === 'CHRONICLE_COVER_SOURCE_TOO_LARGE') return 'A imagem original é grande demais. Escolha um arquivo de até 12 MB e 60 megapixels.';
  if (error?.message === 'CHRONICLE_COVER_COMPRESSED_TOO_LARGE') return 'Não foi possível reduzir a capa ao limite seguro de armazenamento.';
  return 'Não foi possível preparar essa imagem. Escolha outro arquivo.';
}

async function handleChronicleCoverSelection(file, input) {
  const status = document.getElementById('chronicleCoverStatus');
  const select = input.closest('label');
  const submitButton = document.getElementById('createChronicleButton');
  const sessionToken = chronicleFormSessionToken;
  const processingToken = ++chronicleCoverProcessingToken;
  isChronicleCoverProcessing = true;
  select.setAttribute('aria-busy', 'true');
  input.disabled = true;
  submitButton.disabled = true;
  status.textContent = 'Preparando a capa…';
  try {
    const cover = await prepareChronicleCover(file);
    if (
      sessionToken !== chronicleFormSessionToken
      || processingToken !== chronicleCoverProcessingToken
    ) return;
    setChronicleCreationCover(cover);
  } catch (error) {
    if (
      sessionToken !== chronicleFormSessionToken
      || processingToken !== chronicleCoverProcessingToken
    ) return;
    console.error('Não foi possível preparar a capa da Crônica:', error);
    status.textContent = getChronicleCoverErrorMessage(error);
    showNotification(status.textContent, 'error');
  } finally {
    if (
      sessionToken !== chronicleFormSessionToken
      || processingToken !== chronicleCoverProcessingToken
    ) return;
    isChronicleCoverProcessing = false;
    input.disabled = false;
    input.value = '';
    select.removeAttribute('aria-busy');
    if (!isCreatingChronicle && !isUpdatingChronicle && !isDeletingChronicle) {
      submitButton.disabled = false;
    }
  }
}

function getChronicleTypeLabel(type) {
  return type === 'campaign' ? 'Campanha' : 'One-shot';
}

function formatChronicleDate(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Data não disponível';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short'
  }).format(new Date(timestamp));
}

function populateChronicleOverview(chronicle) {
  document.getElementById('chronicleOverviewType').textContent = getChronicleTypeLabel(chronicle.type);
  document.getElementById('chronicleOverviewCreatedAt').textContent = formatChronicleDate(chronicle.createdAt);
  document.getElementById('chronicleOverviewUpdatedAt').textContent = formatChronicleDate(chronicle.updatedAt);
}

function setChronicleCastFeedback(message = '', kind = '', { manager = false } = {}) {
  const feedback = document.getElementById(manager ? 'chronicleCastManagerFeedback' : 'chronicleCastFeedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.dataset.kind = kind;
}

function getChronicleCharacterDirectory() {
  const entries = [];
  const byId = new Map();
  let manager;
  try {
    manager = readCharacterManager();
  } catch (error) {
    console.error('Não foi possível ler o índice de personagens para o Elenco:', error);
    return { entries, byId, unavailable: true };
  }
  if (!manager) return { entries, byId, unavailable: false };

  manager.order.forEach((id, managerIndex) => {
    const summary = manager.characters[id];
    try {
      const character = readStoredCharacter(id);
      if (!character || !isPlainObject(character.fields)) return;
      const fields = character.fields;
      const name = String(fields.nome || '').trim() || 'Novo personagem';
      const entry = {
        id,
        managerIndex,
        name,
        normalizedName: normalizeFilterText(name),
        level: integerBetween(fields.nivel, 1, 11),
        thumbnail: summary.photoFingerprint === createPhotoFingerprint(character.photo || '')
          ? summary.thumbnail
          : (typeof character.photo === 'string' && character.photo.startsWith('data:image/') ? character.photo : ''),
        className: String(fields.classe || '').trim(),
        signature: String(fields.assinatura || '').trim()
      };
      entries.push(entry);
      byId.set(id, entry);
    } catch (error) {
      console.warn(`O personagem ${id} não pôde ser resolvido para o Elenco:`, error);
    }
  });

  return { entries, byId, unavailable: false };
}

globalThis.ChroniclesLocalCharacters = Object.freeze({
  list() {
    const directory = getChronicleCharacterDirectory();
    if (directory.unavailable) throw new Error('LOCAL_CHARACTER_DIRECTORY_UNAVAILABLE');
    const manager = readCharacterManager();
    return directory.entries.map(entry => ({
      ...entry,
      thumbnail: manager?.characters?.[entry.id]?.thumbnail || '',
      character: readStoredCharacter(entry.id)
    }));
  }
});

function createChronicleCastPortrait(entry, className) {
  const portrait = document.createElement('span');
  portrait.className = className;
  if (entry?.thumbnail) {
    const image = document.createElement('img');
    image.src = entry.thumbnail;
    image.alt = '';
    portrait.appendChild(image);
  } else {
    const placeholder = document.createElement('span');
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.textContent = entry ? getCharacterInitial(entry.name) : '◇';
    portrait.appendChild(placeholder);
  }
  return portrait;
}

function createChronicleCastMember(entry, index) {
  const member = document.createElement('article');
  member.className = 'chronicle-cast-member';
  member.dataset.characterId = entry.id;
  member.setAttribute('aria-label', `${entry.name}, nível ${entry.level}`);

  const number = document.createElement('span');
  number.className = 'chronicle-cast-member-index';
  number.setAttribute('aria-hidden', 'true');
  number.textContent = String(index + 1).padStart(2, '0');

  const identity = document.createElement('div');
  identity.className = 'chronicle-cast-member-identity';
  const name = document.createElement('h4');
  name.textContent = entry.name;
  const details = document.createElement('p');
  const detailParts = [`Nível ${entry.level}`, entry.className, entry.signature].filter(Boolean);
  details.textContent = detailParts.join(' · ');
  identity.append(name, details);

  member.append(number, createChronicleCastPortrait(entry, 'chronicle-cast-member-portrait'), identity);
  return member;
}

function createChronicleCastUnavailable(index) {
  const member = document.createElement('article');
  member.className = 'chronicle-cast-member is-unavailable';
  const number = document.createElement('span');
  number.className = 'chronicle-cast-member-index';
  number.setAttribute('aria-hidden', 'true');
  number.textContent = String(index + 1).padStart(2, '0');
  const identity = document.createElement('div');
  identity.className = 'chronicle-cast-member-identity';
  const name = document.createElement('h4');
  name.textContent = 'Personagem indisponível';
  const details = document.createElement('p');
  details.textContent = 'A referência foi preservada, mas a ficha original não pôde ser localizada neste navegador.';
  identity.append(name, details);
  member.append(number, createChronicleCastPortrait(null, 'chronicle-cast-member-portrait'), identity);
  return member;
}

function updateChronicleCastCount(count) {
  const counter = document.getElementById('chronicleCastCount');
  counter.textContent = String(count).padStart(2, '0');
  counter.setAttribute('aria-label', count === 1 ? '1 personagem no Elenco' : `${count} personagens no Elenco`);
}

function getChronicleCastErrorMessage(error) {
  if (error?.message === 'CHRONICLE_UPDATE_CONFLICT') {
    return 'Esta Crônica foi alterada em outra aba. Sua seleção continua aberta e não foi sobrescrita.';
  }
  if (error?.message === 'CHRONICLE_NOT_FOUND' || error?.message === 'CHRONICLE_INVALID_RECORD') {
    return 'Esta Crônica não está mais disponível. Sua seleção não foi descartada.';
  }
  if (error?.message === 'INDEXEDDB_UPGRADE_BLOCKED') {
    return 'Outra aba antiga está impedindo a atualização do arquivo de Crônicas. Feche-a e tente novamente.';
  }
  return 'Não foi possível atualizar o Elenco. A seleção atual foi preservada.';
}

async function renderChronicleCast() {
  if (activeChronicleRecord?.storage === 'online') {
    await window.ChroniclesCollaboration?.renderCast(activeChronicleRecord);
    return;
  }
  if (!activeChronicleId || isChronicleCastManagementOpen) return;
  const chronicleId = activeChronicleId;
  const renderToken = ++chronicleCastRenderToken;
  const list = document.getElementById('chronicleCastList');
  const empty = document.getElementById('chronicleCastEmpty');
  isLoadingChronicleCast = true;
  list.setAttribute('aria-busy', 'true');
  list.replaceChildren();
  empty.hidden = true;
  setChronicleCastFeedback('Carregando Elenco…');

  try {
    const ids = await getChroniclesStorage().listChronicleCastIds(chronicleId);
    if (renderToken !== chronicleCastRenderToken || activeChronicleId !== chronicleId) return;
    const directory = getChronicleCharacterDirectory();
    const linkedIds = new Set(ids);
    const availableEntries = directory.entries.filter(entry => linkedIds.has(entry.id));
    const unavailableIds = ids.filter(id => !directory.byId.has(id));
    const fragment = document.createDocumentFragment();
    availableEntries.forEach((entry, index) => {
      fragment.appendChild(createChronicleCastMember(entry, index));
    });
    unavailableIds.forEach((_id, index) => {
      fragment.appendChild(createChronicleCastUnavailable(availableEntries.length + index));
    });

    chronicleCastIds = [...ids];
    chronicleCastDirectory = directory.entries;
    list.replaceChildren(fragment);
    updateChronicleCastCount(ids.length);
    empty.hidden = ids.length !== 0;
    if (directory.unavailable) {
      setChronicleCastFeedback('O índice de personagens não pôde ser lido. Os vínculos foram preservados.', 'warning');
    } else if (unavailableIds.length) {
      setChronicleCastFeedback(
        unavailableIds.length === 1
          ? '1 vínculo está indisponível. A referência permanece até sua remoção manual.'
          : `${unavailableIds.length} vínculos estão indisponíveis. As referências permanecem até sua remoção manual.`,
        'warning'
      );
    } else {
      setChronicleCastFeedback();
    }
  } catch (error) {
    if (renderToken !== chronicleCastRenderToken || activeChronicleId !== chronicleId) return;
    console.error('Não foi possível carregar o Elenco:', error);
    updateChronicleCastCount(0);
    setChronicleCastFeedback(getChronicleCastErrorMessage(error), 'error');
  } finally {
    if (renderToken === chronicleCastRenderToken) {
      isLoadingChronicleCast = false;
      list.removeAttribute('aria-busy');
    }
  }
}

function areCharacterIdSetsEqual(left, right) {
  return left.size === right.size && [...left].every(id => right.has(id));
}

function isChronicleCastManagementDirty() {
  return isChronicleCastManagementOpen
    && !areCharacterIdSetsEqual(chronicleCastOriginalIds, chronicleCastDraftIds);
}

function updateChronicleCastSelectionCount() {
  const count = chronicleCastDraftIds.size;
  document.getElementById('chronicleCastSelectionCount').textContent = count === 1
    ? '1 selecionado'
    : `${count} selecionados`;
}

function createChronicleCastSelectionOption(entry) {
  const label = document.createElement('label');
  label.className = 'chronicle-cast-selection-option';
  label.dataset.characterId = entry.id;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = chronicleCastDraftIds.has(entry.id);
  input.setAttribute('aria-label', `Incluir ${entry.name} no Elenco`);
  input.addEventListener('change', () => {
    if (input.checked) chronicleCastDraftIds.add(entry.id);
    else chronicleCastDraftIds.delete(entry.id);
    label.dataset.selected = String(input.checked);
    updateChronicleCastSelectionCount();
  });

  const identity = document.createElement('span');
  identity.className = 'chronicle-cast-selection-identity';
  const name = document.createElement('strong');
  name.textContent = entry.name;
  const details = document.createElement('span');
  details.textContent = [`Nível ${entry.level}`, entry.className, entry.signature].filter(Boolean).join(' · ');
  identity.append(name, details);
  label.dataset.selected = String(input.checked);
  label.append(input, createChronicleCastPortrait(entry, 'chronicle-cast-selection-portrait'), identity);
  return label;
}

function createChronicleCastUnavailableOption(id, index) {
  const label = document.createElement('label');
  label.className = 'chronicle-cast-selection-option is-unavailable';
  label.dataset.characterId = id;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = chronicleCastDraftIds.has(id);
  input.setAttribute('aria-label', `Manter vínculo indisponível ${index + 1}`);
  input.addEventListener('change', () => {
    if (input.checked) chronicleCastDraftIds.add(id);
    else chronicleCastDraftIds.delete(id);
    label.dataset.selected = String(input.checked);
    updateChronicleCastSelectionCount();
  });
  const identity = document.createElement('span');
  identity.className = 'chronicle-cast-selection-identity';
  const name = document.createElement('strong');
  name.textContent = `Referência indisponível ${index + 1}`;
  const details = document.createElement('span');
  details.textContent = 'Desmarque para remover este vínculo ao salvar.';
  identity.append(name, details);
  label.dataset.selected = String(input.checked);
  label.append(input, createChronicleCastPortrait(null, 'chronicle-cast-selection-portrait'), identity);
  return label;
}

function renderChronicleCastManagementList() {
  const list = document.getElementById('chronicleCastSelectionList');
  const query = normalizeFilterText(document.getElementById('chronicleCastSearch').value.trim());
  const fragment = document.createDocumentFragment();
  const visibleEntries = chronicleCastDirectory.filter(entry => !query || entry.normalizedName.includes(query));
  visibleEntries.forEach(entry => fragment.appendChild(createChronicleCastSelectionOption(entry)));

  const availableIds = new Set(chronicleCastDirectory.map(entry => entry.id));
  const unavailableIds = [...new Set([...chronicleCastOriginalIds, ...chronicleCastDraftIds])]
    .filter(id => !availableIds.has(id));
  if (!query) {
    unavailableIds.forEach((id, index) => fragment.appendChild(createChronicleCastUnavailableOption(id, index)));
  }

  list.replaceChildren(fragment);
  const noResults = document.getElementById('chronicleCastNoResults');
  noResults.textContent = query
    ? 'Nenhum personagem corresponde à busca.'
    : 'Nenhum personagem está disponível neste navegador.';
  noResults.hidden = Boolean(visibleEntries.length || (!query && unavailableIds.length));
  updateChronicleCastSelectionCount();
}

function createChronicleRecordElement(chronicle, index) {
  const card = document.createElement('article');
  card.className = 'chronicle-record chronicle-record-real';
  card.dataset.chronicleId = chronicle.id;
  card.tabIndex = -1;

  const cover = document.createElement('div');
  cover.className = 'chronicle-record-cover';
  const coverImage = document.createElement('img');
  coverImage.alt = '';
  coverImage.hidden = true;
  const coverPlaceholder = document.createElement('span');
  coverPlaceholder.className = 'chronicle-record-cover-placeholder';
  coverPlaceholder.setAttribute('aria-hidden', 'true');
  coverPlaceholder.textContent = '◇';
  cover.append(coverImage, coverPlaceholder);

  const copy = document.createElement('div');
  copy.className = 'chronicle-record-copy';
  const metadata = document.createElement('div');
  metadata.className = 'chronicle-record-metadata';
  const recordIndex = document.createElement('span');
  recordIndex.className = 'chronicle-record-index';
  recordIndex.textContent = String(index + 1).padStart(2, '0');
  recordIndex.setAttribute('aria-hidden', 'true');
  const type = document.createElement('span');
  type.className = 'chronicle-record-type';
  type.textContent = getChronicleTypeLabel(chronicle.type);
  metadata.append(recordIndex, type);

  const name = document.createElement('h4');
  name.textContent = chronicle.name;
  name.title = chronicle.name;
  copy.append(metadata, name);
  if (chronicle.synopsis) {
    const synopsis = document.createElement('p');
    synopsis.className = 'chronicle-record-synopsis';
    synopsis.textContent = chronicle.synopsis;
    copy.appendChild(synopsis);
  }

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'chronicle-record-open';
  openButton.setAttribute('aria-label', `Abrir Crônica ${chronicle.name}`);
  const mark = document.createElement('span');
  mark.className = 'chronicle-record-mark';
  mark.setAttribute('aria-hidden', 'true');
  openButton.appendChild(mark);
  openButton.addEventListener('click', () => {
    void openChronicleDetail(chronicle.id, index + 1, openButton);
  });

  card.append(cover, copy, openButton);
  window.ChroniclesOnline?.decorateRecord(card, metadata, chronicle);
  return { card, coverImage, coverPlaceholder, openButton };
}

async function renderChroniclesIndex({ focusId = '' } = {}) {
  const grid = document.getElementById('chroniclesRecordGrid');
  const emptyState = document.getElementById('chroniclesEmptyState');
  const count = document.getElementById('chroniclesRecordCount');
  if (!grid || !emptyState || !count) return;

  const renderToken = ++chroniclesRenderToken;
  revokeChronicleCardObjectUrls();
  grid.replaceChildren();
  grid.hidden = true;
  emptyState.hidden = true;
  grid.setAttribute('aria-busy', 'true');
  count.textContent = '—';
  count.setAttribute('aria-label', 'Carregando registros');

  try {
    const chronicles = await getChroniclesStorage().listChronicles();
    if (renderToken !== chroniclesRenderToken) return;

    const cards = chronicles.map((chronicle, index) => {
      const parts = createChronicleRecordElement(chronicle, index);
      grid.appendChild(parts.card);
      return { chronicle, ...parts };
    });

    count.textContent = String(chronicles.length).padStart(2, '0');
    count.setAttribute('aria-label', `${chronicles.length} ${chronicles.length === 1 ? 'registro' : 'registros'}`);
    grid.hidden = chronicles.length === 0;
    emptyState.hidden = chronicles.length !== 0;
    emptyState.querySelector('strong').textContent = 'Nenhuma Crônica registrada.';
    emptyState.querySelector('span').textContent = 'Quando o arquivo for iniciado, suas histórias aparecerão aqui.';

    if (focusId) {
      requestAnimationFrame(() => {
        const target = grid.querySelector(
          `[data-chronicle-id="${CSS.escape(focusId)}"] .chronicle-record-open`
        );
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({
          block: 'nearest',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        });
      });
    }

    await Promise.all(cards.map(async ({ chronicle, coverImage, coverPlaceholder }) => {
      if (!chronicle.hasCover) return;
      try {
        const cover = await getChroniclesStorage().getChronicleCover(chronicle.id);
        if (!cover || renderToken !== chroniclesRenderToken || !coverImage.isConnected) return;
        const objectUrl = URL.createObjectURL(cover.blob);
        chronicleCardObjectUrls.set(chronicle.id, objectUrl);
        coverImage.src = objectUrl;
        coverImage.hidden = false;
        coverPlaceholder.hidden = true;
      } catch (error) {
        console.warn(`Não foi possível carregar a capa da Crônica ${chronicle.id}:`, error);
      }
    }));
  } catch (error) {
    if (renderToken !== chroniclesRenderToken) return;
    console.error('Não foi possível listar as Crônicas:', error);
    emptyState.hidden = false;
    emptyState.querySelector('strong').textContent = 'Não foi possível acessar o arquivo de Crônicas.';
    emptyState.querySelector('span').textContent = 'Seus personagens permanecem intactos. Tente novamente neste navegador.';
    count.textContent = '—';
    count.setAttribute('aria-label', 'Registros indisponíveis');
    showNotification('Não foi possível acessar as Crônicas neste navegador.', 'error');
  } finally {
    if (renderToken === chroniclesRenderToken) grid.removeAttribute('aria-busy');
  }
}

function setChroniclesSubview(activeView) {
  if (activeView !== 'detail') {
    chronicleCastOpeningToken += 1;
    isOpeningChronicleCast = false;
  }
  const views = {
    index: document.getElementById('chroniclesIndexView'),
    create: document.getElementById('chronicleCreateView'),
    detail: document.getElementById('chronicleDetailView'),
    confrontation: document.getElementById('confrontationView'),
    shield: document.getElementById('chronicleMasterShieldView')
  };
  Object.entries(views).forEach(([viewName, element]) => {
    if (element) element.hidden = viewName !== activeView;
  });
}

function revokeChronicleDetailCoverUrl() {
  if (!chronicleDetailCoverUrl) return;
  URL.revokeObjectURL(chronicleDetailCoverUrl);
  chronicleDetailCoverUrl = '';
}

function resetChronicleDetailContent() {
  const image = document.getElementById('chronicleDetailCoverImage');
  const placeholder = document.getElementById('chronicleDetailCoverPlaceholder');
  revokeChronicleDetailCoverUrl();
  if (image) {
    image.removeAttribute('src');
    image.hidden = true;
  }
  if (placeholder) placeholder.hidden = false;
  const title = document.getElementById('chronicleDetailTitle');
  const synopsis = document.getElementById('chronicleDetailSynopsis');
  if (title) title.textContent = '';
  if (synopsis) {
    synopsis.textContent = '';
    synopsis.hidden = true;
  }
  const index = document.getElementById('chronicleDetailIndex');
  const type = document.getElementById('chronicleDetailType');
  if (index) index.textContent = '';
  if (type) type.textContent = '';
  ['chronicleOverviewType', 'chronicleOverviewCreatedAt', 'chronicleOverviewUpdatedAt'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.textContent = '';
  });
}

function closeChronicleCastManagement({ restoreFocus = true, render = true } = {}) {
  if (!isChronicleCastManagementOpen) return;
  const returnTarget = chronicleCastReturnFocus;
  isChronicleCastManagementOpen = false;
  chronicleCastReturnFocus = null;
  chronicleCastOriginalIds = new Set();
  chronicleCastDraftIds = new Set();
  chronicleCastBaseUpdatedAt = '';
  document.getElementById('chronicleCastConsultView').hidden = false;
  document.getElementById('chronicleCastManagerView').hidden = true;
  document.getElementById('chronicleCastSearch').value = '';
  document.getElementById('chronicleCastSelectionList').replaceChildren();
  setChronicleCastFeedback('', '', { manager: true });
  if (render && activeChronicleId) void renderChronicleCast();
  if (restoreFocus) {
    const hiddenMobileAction = returnTarget?.closest('#chronicleActionsPanel')
      && window.matchMedia('(max-width: 1100px)').matches
      && !document.getElementById('chronicleActionsPanel').classList.contains('is-open');
    const target = !hiddenMobileAction && returnTarget?.isConnected && returnTarget.getClientRects().length
      ? returnTarget
      : document.getElementById('chroniclePanelCast');
    target?.focus();
  }
}

function resetChronicleCastState() {
  chronicleCastRenderToken += 1;
  chronicleCastOpeningToken += 1;
  isOpeningChronicleCast = false;
  closeChronicleCastManagement({ restoreFocus: false, render: false });
  chronicleCastIds = [];
  chronicleCastDirectory = [];
  isLoadingChronicleCast = false;
  updateChronicleCastCount(0);
  document.getElementById('chronicleCastList').replaceChildren();
  document.getElementById('chronicleCastEmpty').hidden = true;
  document.getElementById('chronicleCastNoResults').hidden = true;
  setChronicleCastFeedback();
}

function requestChronicleCastManagementExit(onDiscard, { restoreFocus = false } = {}) {
  if (!isChronicleCastManagementOpen) {
    onDiscard?.();
    return;
  }
  if (isSavingChronicleCast) {
    setChronicleCastFeedback('Aguarde o término do salvamento antes de sair.', 'warning', { manager: true });
    document.getElementById('saveChronicleCast').focus();
    return;
  }
  if (!isChronicleCastManagementDirty()) {
    closeChronicleCastManagement({ restoreFocus, render: false });
    onDiscard?.();
    return;
  }

  openModal({
    title: 'Descartar alterações no Elenco?',
    content: createModalContent(
      'A seleção atual ainda não foi salva.',
      'Os vínculos armazenados permanecerão como estavam antes do gerenciamento.'
    ),
    actions: [
      {
        label: 'Descartar alterações',
        className: 'danger',
        onClick: () => {
          closeChronicleCastManagement({ restoreFocus, render: false });
          onDiscard?.();
        }
      },
      { label: 'Continuar editando', className: 'secondary' }
    ]
  });
}

async function openChronicleCastManagement(trigger) {
  if (activeChronicleRecord?.storage === 'online') {
    closeChronicleActions({ restoreFocus: false });
    setChronicleDetailSection('cast', { skipCastGuard: true, skipCastRender: true });
    await window.ChroniclesCollaboration?.openCastManager(activeChronicleRecord);
    return;
  }
  if (window.MasterShieldUI?.requestExit(() => void openChronicleCastManagement(trigger))) return;
  if (window.ConfrontationsUI?.requestExit(() => void openChronicleCastManagement(trigger))) return;
  if (chronicleParticipantEditor || isParticipantMutationPending) {
    requestChronicleParticipantExit(() => void openChronicleCastManagement(trigger));
    return;
  }
  if (isChronicleCastManagementOpen) {
    closeChronicleActions({ restoreFocus: false });
    document.getElementById('chronicleCastSearch').focus();
    return;
  }
  if (
    !activeChronicleId
    || isOpeningChronicleCast
    || isSavingChronicleCast
  ) return;
  const chronicleId = activeChronicleId;
  // Gerenciar tem prioridade sobre uma consulta ainda carregando.
  chronicleCastRenderToken += 1;
  isLoadingChronicleCast = false;
  document.getElementById('chronicleCastList').removeAttribute('aria-busy');
  closeChronicleActions({ restoreFocus: false });
  setChronicleDetailSection('cast', { skipCastGuard: true, skipCastRender: true });
  const openingToken = ++chronicleCastOpeningToken;
  isOpeningChronicleCast = true;
  chronicleCastReturnFocus = trigger || document.getElementById('manageChronicleCast');
  trigger?.setAttribute('aria-busy', 'true');
  if (trigger) trigger.disabled = true;
  setChronicleCastFeedback('Preparando personagens…');

  try {
    const storage = getChroniclesStorage();
    const chronicle = await storage.getChronicle(chronicleId);
    const ids = await storage.listChronicleCastIds(chronicleId);
    const current = await storage.getChronicle(chronicleId);
    if (activeChronicleId !== chronicleId || openingToken !== chronicleCastOpeningToken) return;
    if (!chronicle) throw new Error('CHRONICLE_NOT_FOUND');
    if (!current || current.updatedAt !== chronicle.updatedAt) throw new Error('CHRONICLE_UPDATE_CONFLICT');

    activeChronicleRecord = chronicle;
    populateChronicleOverview(chronicle);
    chronicleCastIds = [...ids];
    chronicleCastOriginalIds = new Set(ids);
    chronicleCastDraftIds = new Set(ids);
    chronicleCastBaseUpdatedAt = chronicle.updatedAt;
    const directory = getChronicleCharacterDirectory();
    chronicleCastDirectory = directory.entries;
    isChronicleCastManagementOpen = true;
    document.getElementById('chronicleCastConsultView').hidden = true;
    document.getElementById('chronicleCastManagerView').hidden = false;
    document.getElementById('chronicleCastSearch').value = '';
    ['chronicleCastSearch', 'saveChronicleCast', 'cancelChronicleCastManagement'].forEach(id => {
      document.getElementById(id).disabled = false;
    });
    setChronicleCastFeedback();
    setChronicleCastFeedback(
      directory.unavailable ? 'O índice de personagens não pôde ser lido. Nenhum vínculo foi alterado.' : '',
      directory.unavailable ? 'warning' : '',
      { manager: true }
    );
    renderChronicleCastManagementList();
    requestAnimationFrame(() => {
      if (isChronicleCastManagementOpen && openingToken === chronicleCastOpeningToken) {
        document.getElementById('chronicleCastSearch').focus();
      }
    });
  } catch (error) {
    if (openingToken !== chronicleCastOpeningToken || activeChronicleId !== chronicleId) return;
    console.error('Não foi possível abrir o gerenciamento de Elenco:', error);
    const message = getChronicleCastErrorMessage(error);
    setChronicleCastFeedback(message, 'error');
    showNotification(message, 'error', 7000);
  } finally {
    if (openingToken === chronicleCastOpeningToken) isOpeningChronicleCast = false;
    if (trigger?.isConnected) {
      trigger.disabled = false;
      trigger.removeAttribute('aria-busy');
    }
  }
}

async function saveChronicleCastManagement() {
  if (activeChronicleRecord?.storage === 'online') {
    await window.ChroniclesCollaboration?.closeCastManager({ render: true });
    document.getElementById('chroniclePanelCast')?.focus({ preventScroll: true });
    return;
  }
  if (!isChronicleCastManagementOpen || isSavingChronicleCast || !activeChronicleId) return;
  if (!isChronicleCastManagementDirty()) {
    closeChronicleCastManagement({ restoreFocus: false, render: true });
    requestAnimationFrame(() => document.getElementById('chroniclePanelCast')?.focus());
    return;
  }

  const currentDirectory = getChronicleCharacterDirectory();
  const missingNewIds = [...chronicleCastDraftIds].filter(id => (
    !chronicleCastOriginalIds.has(id) && !currentDirectory.byId.has(id)
  ));
  if (currentDirectory.unavailable || missingNewIds.length) {
    setChronicleCastFeedback(
      currentDirectory.unavailable
        ? 'O índice de personagens não pôde ser conferido. A seleção permanece aberta.'
        : 'Um personagem selecionado não está mais disponível. A seleção permanece aberta para revisão.',
      'error',
      { manager: true }
    );
    return;
  }

  const chronicleId = activeChronicleId;
  const selectedIds = [...chronicleCastDraftIds];
  const saveButton = document.getElementById('saveChronicleCast');
  const cancelButton = document.getElementById('cancelChronicleCastManagement');
  const search = document.getElementById('chronicleCastSearch');
  isSavingChronicleCast = true;
  saveButton.disabled = true;
  saveButton.setAttribute('aria-busy', 'true');
  cancelButton.disabled = true;
  search.disabled = true;
  document.querySelectorAll('#chronicleCastSelectionList input').forEach(input => {
    input.disabled = true;
  });
  setChronicleCastFeedback('Salvando Elenco…', '', { manager: true });

  try {
    const result = await getChroniclesStorage().replaceChronicleCast(
      chronicleId,
      selectedIds,
      { expectedUpdatedAt: chronicleCastBaseUpdatedAt }
    );
    if (activeChronicleId !== chronicleId) {
      showNotification('Elenco atualizado com sucesso.');
      return;
    }
    activeChronicleRecord = result.chronicle;
    chronicleCastIds = [...result.characterIds];
    populateChronicleOverview(result.chronicle);
    closeChronicleCastManagement({ restoreFocus: false, render: false });
    await renderChronicleCast();
    document.getElementById('chroniclePanelCast').focus({ preventScroll: true });
    showNotification('Elenco atualizado com sucesso.');
  } catch (error) {
    console.error('Não foi possível salvar o Elenco:', error);
    const message = getChronicleCastErrorMessage(error);
    setChronicleCastFeedback(message, 'error', { manager: true });
    showNotification(message, 'error', 7500);
  } finally {
    isSavingChronicleCast = false;
    saveButton.disabled = false;
    saveButton.removeAttribute('aria-busy');
    cancelButton.disabled = false;
    search.disabled = false;
    document.querySelectorAll('#chronicleCastSelectionList input').forEach(input => {
      input.disabled = false;
    });
  }
}

function participantFeedback(message = '', kind = '', form = false) {
  const element = document.getElementById(form ? 'chronicleParticipantFormFeedback' : 'chronicleParticipantsFeedback');
  element.textContent = message;
  element.dataset.kind = kind;
}

function participantErrorMessage(error, editing = false) {
  const messages = {
    PARTICIPANT_UPDATE_CONFLICT: editing
      ? 'Este participante foi alterado em outra aba. Sua edição foi mantida. Cancele e abra novamente para conferir a versão atual.'
      : 'Este participante foi alterado em outra aba. Reabra a aba Participantes para conferir a versão atual antes de removê-lo.',
    PARTICIPANT_NOT_FOUND: 'Este participante não está mais disponível. Nenhuma alteração foi salva.',
    PARTICIPANT_INVALID_RECORD: 'O registro deste participante não pôde ser lido com segurança.',
    INVALID_PARTICIPANT_NAME: 'Informe um nome com até 120 caracteres.',
    CHRONICLE_NOT_FOUND: 'Esta Crônica não está mais disponível.',
    CHRONICLE_INVALID_RECORD: 'A Crônica não pôde ser lida com segurança.'
  };
  return messages[error?.message] || 'Não foi possível concluir a operação. Nenhuma alteração parcial foi salva. Tente novamente.';
}

function syncParticipantControls() {
  const panel = document.getElementById('chroniclePanelParticipants');
  panel.setAttribute('aria-busy', String(isParticipantMutationPending));
  panel.querySelectorAll('button, input').forEach(element => {
    element.disabled = isParticipantMutationPending;
  });
  if (chronicleParticipantEditor?.loading) {
    document.getElementById('chronicleParticipantName').disabled = true;
    document.getElementById('saveChronicleParticipant').disabled = true;
  }
}

function focusParticipant(id) {
  const row = [...document.querySelectorAll('#chronicleParticipantsList [data-participant-id]')]
    .find(element => element.dataset.participantId === id);
  (row || document.querySelector('[data-chronicle-detail-tab="participants"]'))?.focus({ preventScroll: true });
}

function closeChronicleParticipantEditor({ restoreFocus = false } = {}) {
  const id = chronicleParticipantEditor?.id;
  chronicleParticipantEditorToken += 1;
  chronicleParticipantEditor = null;
  document.getElementById('chronicleParticipantForm').hidden = true;
  document.getElementById('chronicleParticipantForm').reset();
  document.getElementById('chronicleParticipantName').removeAttribute('aria-invalid');
  participantFeedback('', '', true);
  syncParticipantControls();
  if (restoreFocus) focusParticipant(id);
}

function resetChronicleParticipantsState() {
  chronicleParticipantsRenderToken += 1;
  closeChronicleParticipantEditor();
  document.getElementById('chronicleParticipantsList').replaceChildren();
  document.getElementById('chronicleParticipantsEmpty').hidden = true;
  participantFeedback();
}

function requestChronicleParticipantExit(onDiscard) {
  if (isParticipantMutationPending) {
    participantFeedback('Aguarde o término do salvamento antes de sair.', 'warning', !!chronicleParticipantEditor);
    return;
  }
  const editor = chronicleParticipantEditor;
  const dirty = editor && !editor.loading
    && document.getElementById('chronicleParticipantName').value.trim() !== editor.originalName;
  const leave = () => {
    if (chronicleParticipantEditor !== editor || isParticipantMutationPending) return;
    closeChronicleParticipantEditor();
    onDiscard?.();
  };
  if (!dirty) { leave(); return; }
  closeChronicleActions({ restoreFocus: false });
  openModal({
    title: 'Descartar alterações do participante?',
    content: 'O nome preenchido ainda não foi salvo.',
    actions: [
      { label: 'Continuar editando', className: 'secondary' },
      { label: 'Descartar alterações', className: 'danger', onClick: leave }
    ]
  });
}

async function renderChronicleParticipants() {
  if (activeChronicleRecord?.storage === 'online') {
    await window.ChroniclesCollaboration?.renderParticipants(activeChronicleRecord);
    return;
  }
  if (!activeChronicleId || isParticipantMutationPending) return;
  const chronicleId = activeChronicleId;
  const token = ++chronicleParticipantsRenderToken;
  participantFeedback('Carregando participantes…');
  try {
    const { participants, invalidCount } = await getChroniclesStorage().listChronicleParticipants(chronicleId);
    if (token !== chronicleParticipantsRenderToken || activeChronicleId !== chronicleId) return;
    const list = document.getElementById('chronicleParticipantsList');
    list.replaceChildren();
    participants.forEach((participant, index) => {
      const row = document.createElement('li');
      row.className = 'chronicle-participant-row';
      row.dataset.participantId = participant.id;
      row.tabIndex = -1;
      const number = document.createElement('span');
      number.className = 'chronicle-participant-number';
      number.textContent = String(index + 1).padStart(2, '0');
      number.setAttribute('aria-hidden', 'true');
      const identity = document.createElement('div');
      identity.className = 'chronicle-participant-identity';
      const name = document.createElement('h4');
      name.textContent = participant.name;
      const label = document.createElement('span');
      label.textContent = 'Participante';
      identity.append(name, label);
      const actions = document.createElement('div');
      actions.className = 'chronicle-participant-row-actions';
      [['Editar', 'secondary', () => void openChronicleParticipantEditor(participant.id)],
        ['Remover', 'danger', () => confirmChronicleParticipantRemoval(participant)]].forEach(([text, style, handler]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn ${style}`;
        button.textContent = text;
        button.setAttribute('aria-label', `${text} ${participant.name}, participante ${index + 1}`);
        button.addEventListener('click', handler);
        actions.append(button);
      });
      row.append(number, identity, actions);
      list.append(row);
    });
    document.getElementById('chronicleParticipantsEmpty').hidden = !!(participants.length || invalidCount);
    participantFeedback(invalidCount ? 'Há registros que não puderam ser lidos. Eles foram preservados no armazenamento.' : '', invalidCount ? 'warning' : '');
    syncParticipantControls();
  } catch (error) {
    if (token === chronicleParticipantsRenderToken && activeChronicleId === chronicleId) {
      document.getElementById('chronicleParticipantsEmpty').hidden = true;
      participantFeedback(participantErrorMessage(error), 'error');
    }
  }
}

async function openChronicleParticipantEditor(id = null) {
  if (window.MasterShieldUI?.requestExit(() => void openChronicleParticipantEditor(id))) return;
  if (!activeChronicleId || isParticipantMutationPending) return;
  if (chronicleParticipantEditor) {
    requestChronicleParticipantExit(() => void openChronicleParticipantEditor(id));
    return;
  }
  const chronicleId = activeChronicleId;
  const token = ++chronicleParticipantEditorToken;
  chronicleParticipantEditor = { id, chronicleId, originalName: '', loading: !!id };
  const form = document.getElementById('chronicleParticipantForm');
  form.reset();
  form.hidden = false;
  document.getElementById('chronicleParticipantFormTitle').textContent = id ? 'Editar participante' : 'Adicionar participante';
  document.getElementById('saveChronicleParticipant').textContent = id ? 'Salvar alterações' : 'Salvar participante';
  participantFeedback(id ? 'Carregando participante…' : '', '', true);
  syncParticipantControls();
  try {
    if (id) {
      const participant = await getChroniclesStorage().getChronicleParticipant(chronicleId, id);
      if (token !== chronicleParticipantEditorToken || chronicleId !== activeChronicleId) return;
      if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');
      chronicleParticipantEditor = { id, chronicleId, originalName: participant.name, updatedAt: participant.updatedAt, loading: false };
      document.getElementById('chronicleParticipantName').value = participant.name;
    }
    participantFeedback('', '', true);
    syncParticipantControls();
    document.getElementById('chronicleParticipantName').focus();
  } catch (error) {
    if (token === chronicleParticipantEditorToken && chronicleId === activeChronicleId) {
      participantFeedback(participantErrorMessage(error, true), 'error', true);
      document.getElementById('cancelChronicleParticipant').focus();
    }
  }
}

async function saveChronicleParticipant(event) {
  event.preventDefault();
  const editor = chronicleParticipantEditor;
  if (!editor || editor.loading || isParticipantMutationPending) return;
  const input = document.getElementById('chronicleParticipantName');
  const name = input.value.trim();
  if (!name || name.length > 120) {
    input.setAttribute('aria-invalid', 'true');
    participantFeedback('Informe um nome com até 120 caracteres.', 'error', true);
    input.focus();
    return;
  }
  const token = chronicleParticipantEditorToken;
  isParticipantMutationPending = true;
  chronicleParticipantsRenderToken += 1;
  syncParticipantControls();
  participantFeedback('Salvando participante…', '', true);
  let saved = null;
  try {
    const storage = getChroniclesStorage();
    saved = editor.id
      ? await storage.updateChronicleParticipant(editor.chronicleId, editor.id, { name }, { expectedUpdatedAt: editor.updatedAt })
      : await storage.createChronicleParticipant(editor.chronicleId, { name });
    if (token !== chronicleParticipantEditorToken || activeChronicleId !== editor.chronicleId) return;
    activeChronicleRecord = saved.chronicle;
    populateChronicleOverview(saved.chronicle);
    closeChronicleParticipantEditor();
    showNotification('Participante salvo.');
  } catch (error) {
    if (token === chronicleParticipantEditorToken && activeChronicleId === editor.chronicleId) {
      participantFeedback(participantErrorMessage(error, true), 'error', true);
    }
  } finally {
    isParticipantMutationPending = false;
    syncParticipantControls();
  }
  if (!saved && token === chronicleParticipantEditorToken && activeChronicleId === editor.chronicleId) input.focus();
  if (saved && activeChronicleId === editor.chronicleId) {
    await renderChronicleParticipants();
    if (activeChronicleId === editor.chronicleId && !chronicleParticipantEditor
      && !document.getElementById('chroniclePanelParticipants').hidden) focusParticipant(saved.participant.id);
  }
}

function confirmChronicleParticipantRemoval(participant) {
  if (isParticipantMutationPending || activeChronicleId !== participant.chronicleId) return;
  if (chronicleParticipantEditor) {
    requestChronicleParticipantExit(() => confirmChronicleParticipantRemoval(participant));
    return;
  }
  closeChronicleActions({ restoreFocus: false });
  openModal({
    title: 'Remover participante?',
    content: createModalContent(`Remover “${participant.name}” desta Crônica?`, 'Somente este registro de participante será excluído.'),
    actions: [
      { label: 'Cancelar', className: 'secondary' },
      { label: 'Remover participante', className: 'danger', onClick: () => void removeChronicleParticipant(participant) }
    ]
  });
}

async function removeChronicleParticipant(participant) {
  if (isParticipantMutationPending || activeChronicleId !== participant.chronicleId) return;
  isParticipantMutationPending = true;
  chronicleParticipantsRenderToken += 1;
  syncParticipantControls();
  participantFeedback('Removendo participante…');
  let removed = false;
  try {
    const result = await getChroniclesStorage().deleteChronicleParticipant(participant.chronicleId, participant.id, { expectedUpdatedAt: participant.updatedAt });
    if (activeChronicleId !== participant.chronicleId) return;
    activeChronicleRecord = result.chronicle;
    populateChronicleOverview(result.chronicle);
    removed = true;
    showNotification('Participante removido.');
  } catch (error) {
    if (activeChronicleId === participant.chronicleId) participantFeedback(participantErrorMessage(error), 'error');
  } finally {
    isParticipantMutationPending = false;
    syncParticipantControls();
  }
  if (removed && activeChronicleId === participant.chronicleId) {
    await renderChronicleParticipants();
    if (activeChronicleId === participant.chronicleId
      && !chronicleParticipantEditor
      && !document.getElementById('chroniclePanelParticipants').hidden) focusParticipant(null);
  }
}

function closeChronicleActions({ restoreFocus = true } = {}) {
  const panel = document.getElementById('chronicleActionsPanel');
  const backdrop = document.getElementById('chronicleActionsBackdrop');
  const trigger = document.getElementById('openChronicleActions');
  panel?.classList.remove('is-open');
  panel?.removeAttribute('role');
  panel?.removeAttribute('aria-modal');
  if (backdrop) backdrop.hidden = true;
  trigger?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('chronicle-actions-open');
  const returnTarget = chronicleActionsReturnFocus;
  chronicleActionsReturnFocus = null;
  if (restoreFocus && returnTarget?.isConnected) returnTarget.focus();
}

function teardownChronicleDetail() {
  window.ChroniclesCollaboration?.reset();
  window.MasterShieldUI?.reset();
  window.ConfrontationsUI?.reset();
  chronicleDetailRenderToken += 1;
  closeChronicleActions({ restoreFocus: false });
  resetChronicleCastState();
  resetChronicleParticipantsState();
  resetChronicleDetailContent();
  activeChronicleId = null;
  activeChronicleRecord = null;
  activeChronicleVisualIndex = 0;
  chronicleReturnFocusId = '';
  setChronicleDetailSection('overview', { skipCastGuard: true });
}

function setChronicleDetailSection(
  sectionId,
  { focusTab = false, skipCastGuard = false, skipCastRender = false } = {}
) {
  if (sectionId !== 'cast' && activeChronicleRecord?.storage === 'online') {
    void window.ChroniclesCollaboration?.closeCastManager({ render: false });
  }
  if (window.MasterShieldUI?.requestExit(() => setChronicleDetailSection(sectionId, { focusTab, skipCastGuard, skipCastRender }))) return;
  if (sectionId !== 'encounters' && window.ConfrontationsUI?.requestExit(() => setChronicleDetailSection(sectionId, { focusTab, skipCastGuard, skipCastRender }))) return;
  if (sectionId !== 'participants' && (chronicleParticipantEditor || isParticipantMutationPending)) {
    requestChronicleParticipantExit(() => setChronicleDetailSection(sectionId, { focusTab, skipCastGuard, skipCastRender }));
    return;
  }
  if (!skipCastGuard && isChronicleCastManagementOpen && sectionId !== 'cast') {
    requestChronicleCastManagementExit(() => {
      setChronicleDetailSection(sectionId, { focusTab, skipCastGuard: true, skipCastRender });
    });
    return;
  }
  const tabs = [...document.querySelectorAll('[data-chronicle-detail-tab]')];
  const panels = [...document.querySelectorAll('[data-chronicle-detail-panel]')];
  const targetTab = tabs.find(tab => tab.dataset.chronicleDetailTab === sectionId) || tabs[0];
  if (!targetTab) return;
  const activeSection = targetTab.dataset.chronicleDetailTab;
  if (activeSection !== 'cast') {
    chronicleCastOpeningToken += 1;
    isOpeningChronicleCast = false;
  }
  tabs.forEach(tab => {
    const isActive = tab === targetTab;
    tab.setAttribute('aria-selected', String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });
  panels.forEach(panel => {
    panel.hidden = panel.dataset.chronicleDetailPanel !== activeSection;
  });
  if (focusTab) targetTab.focus();
  if (activeSection === 'cast' && !isChronicleCastManagementOpen && !skipCastRender) {
    void renderChronicleCast();
  }
  if (activeSection === 'participants') void renderChronicleParticipants();
  if (activeSection === 'encounters') {
    if (activeChronicleRecord?.storage === 'online') void window.ChroniclesOnlineCombat?.render(activeChronicleRecord);
    else void window.ConfrontationsUI?.renderIndex();
  }
}

function populateChronicleDetail(chronicle, visualIndex, cover) {
  document.getElementById('chronicleDetailIndex').textContent = String(visualIndex).padStart(2, '0');
  document.getElementById('chronicleDetailType').textContent = getChronicleTypeLabel(chronicle.type);
  document.getElementById('chronicleDetailTitle').textContent = chronicle.name;
  populateChronicleOverview(chronicle);
  window.ChroniclesOnline?.applyDetailMode(chronicle);

  const synopsis = document.getElementById('chronicleDetailSynopsis');
  synopsis.textContent = chronicle.synopsis;
  synopsis.hidden = !chronicle.synopsis;

  const image = document.getElementById('chronicleDetailCoverImage');
  const placeholder = document.getElementById('chronicleDetailCoverPlaceholder');
  revokeChronicleDetailCoverUrl();
  if (cover?.blob) {
    chronicleDetailCoverUrl = URL.createObjectURL(cover.blob);
    image.src = chronicleDetailCoverUrl;
    image.hidden = false;
    placeholder.hidden = true;
  } else {
    image.removeAttribute('src');
    image.hidden = true;
    placeholder.hidden = false;
  }
}

async function openChronicleDetail(chronicleId, visualIndex, trigger) {
  if (window.MasterShieldUI?.requestExit(() => void openChronicleDetail(chronicleId, visualIndex, trigger))) return;
  if (isOpeningChronicle || !chronicleId) return;
  isOpeningChronicle = true;
  teardownChronicleDetail();
  chronicleReturnFocusId = chronicleId;
  const renderToken = ++chronicleDetailRenderToken;
  trigger.disabled = true;
  trigger.setAttribute('aria-busy', 'true');

  try {
    const [chronicle, cover] = await Promise.all([
      getChroniclesStorage().getChronicle(chronicleId),
      getChroniclesStorage().getChronicleCover(chronicleId)
    ]);
    if (renderToken !== chronicleDetailRenderToken) return;
    if (!chronicle) throw new Error('CHRONICLE_NOT_FOUND');

    activeChronicleId = chronicle.id;
    activeChronicleRecord = chronicle;
    activeChronicleVisualIndex = visualIndex;
    populateChronicleDetail(chronicle, visualIndex, chronicle.hasCover ? cover : null);
    setChronicleDetailSection('overview');
    teardownChroniclesIndex();
    setChroniclesSubview('detail');
    document.getElementById('managerChroniclesPanel').scrollIntoView({ block: 'start', behavior: 'auto' });
    requestAnimationFrame(() => document.getElementById('chronicleDetailTitle')?.focus());
  } catch (error) {
    if (renderToken !== chronicleDetailRenderToken) return;
    console.error('Não foi possível abrir a Crônica:', error);
    showNotification(
      error?.message === 'CHRONICLE_NOT_FOUND'
        ? 'Esta Crônica não está mais disponível.'
        : 'Não foi possível abrir esta Crônica neste navegador.',
      'error',
      6500
    );
  } finally {
    isOpeningChronicle = false;
    trigger.disabled = false;
    trigger.removeAttribute('aria-busy');
  }
}

async function returnToChroniclesIndex({ skipCastGuard = false } = {}) {
  if (window.MasterShieldUI?.requestExit(() => void returnToChroniclesIndex({ skipCastGuard }))) return;
  if (window.ConfrontationsUI?.requestExit(() => void returnToChroniclesIndex({ skipCastGuard }))) return;
  if (chronicleParticipantEditor || isParticipantMutationPending) {
    requestChronicleParticipantExit(() => void returnToChroniclesIndex({ skipCastGuard }));
    return;
  }
  if (!skipCastGuard && isChronicleCastManagementOpen) {
    requestChronicleCastManagementExit(() => {
      void returnToChroniclesIndex({ skipCastGuard: true });
    });
    return;
  }
  const focusId = chronicleReturnFocusId || activeChronicleId || '';
  teardownChronicleDetail();
  await showChroniclesIndex({ focusId });
}

function openChronicleActions() {
  if (!window.matchMedia('(max-width: 1100px)').matches) return;
  const panel = document.getElementById('chronicleActionsPanel');
  const backdrop = document.getElementById('chronicleActionsBackdrop');
  const trigger = document.getElementById('openChronicleActions');
  if (!panel || panel.classList.contains('is-open')) return;
  chronicleActionsReturnFocus = trigger;
  panel.classList.add('is-open');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  backdrop.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  document.body.classList.add('chronicle-actions-open');
  window.setTimeout(() => {
    if (panel.classList.contains('is-open')) document.getElementById('closeChronicleActions')?.focus();
  }, 50);
}

function isChronicleEditDirty() {
  if (chronicleFormMode !== 'edit' || !chronicleFormOriginal) return false;
  const selectedType = document.querySelector('input[name="chronicleType"]:checked')?.value || '';
  return (
    document.getElementById('chronicleName').value.trim() !== chronicleFormOriginal.name
    || document.getElementById('chronicleSynopsis').value.trim() !== chronicleFormOriginal.synopsis
    || selectedType !== chronicleFormOriginal.type
    || chronicleFormCoverAction !== 'keep'
    || isChronicleCoverProcessing
  );
}

async function returnToChronicleDetailFromForm() {
  const chronicleId = activeChronicleId || chronicleFormOriginal?.id || '';
  const fallbackVisualIndex = chronicleFormVisualIndex || activeChronicleVisualIndex || 1;
  resetChronicleCreationForm();
  if (!chronicleId) {
    await showChroniclesIndex();
    return;
  }
  try {
    const [chronicle, cover, chronicles] = await Promise.all([
      getChroniclesStorage().getChronicle(chronicleId),
      getChroniclesStorage().getChronicleCover(chronicleId),
      getChroniclesStorage().listChronicles()
    ]);
    if (!chronicle) throw new Error('CHRONICLE_NOT_FOUND');
    const currentIndex = chronicles.findIndex(item => item.id === chronicle.id);
    const visualIndex = currentIndex >= 0 ? currentIndex + 1 : fallbackVisualIndex;
    activeChronicleId = chronicle.id;
    activeChronicleRecord = chronicle;
    activeChronicleVisualIndex = visualIndex;
    populateChronicleDetail(chronicle, visualIndex, chronicle.hasCover ? cover : null);
    setChroniclesSubview('detail');
    document.getElementById('managerChroniclesPanel').scrollIntoView({ block: 'start', behavior: 'auto' });
    requestAnimationFrame(() => document.getElementById('chronicleDetailTitle')?.focus());
  } catch (error) {
    console.error('Não foi possível retornar à Crônica:', error);
    await showChroniclesIndex();
    showNotification('A Crônica não está mais disponível. O índice foi atualizado.', 'warning', 6500);
  }
}

function requestChronicleFormExit() {
  if (chronicleFormMode !== 'edit') {
    void showChroniclesIndex().then(() => document.getElementById('openChronicleCreation')?.focus());
    return;
  }
  if (!isChronicleEditDirty()) {
    void returnToChronicleDetailFromForm();
    return;
  }
  openModal({
    title: 'Descartar alterações?',
    content: createModalContent(
      'As alterações feitas nesta edição ainda não foram salvas.',
      'A Crônica armazenada continuará como estava antes da edição.'
    ),
    actions: [
      {
        label: 'Descartar alterações',
        className: 'danger',
        onClick: () => {
          void returnToChronicleDetailFromForm();
        }
      },
      { label: 'Continuar editando', className: 'secondary' }
    ]
  });
}

async function openChronicleEditor({ skipCastGuard = false } = {}) {
  if (window.MasterShieldUI?.requestExit(() => void openChronicleEditor({ skipCastGuard }))) return;
  if (window.ConfrontationsUI?.requestExit(() => void openChronicleEditor({ skipCastGuard }))) return;
  if (chronicleParticipantEditor || isParticipantMutationPending) {
    requestChronicleParticipantExit(() => void openChronicleEditor({ skipCastGuard }));
    return;
  }
  if (!skipCastGuard && isChronicleCastManagementOpen) {
    requestChronicleCastManagementExit(() => {
      void openChronicleEditor({ skipCastGuard: true });
    });
    return;
  }
  if (!activeChronicleId || isUpdatingChronicle || isDeletingChronicle) return;
  chronicleCastOpeningToken += 1;
  isOpeningChronicleCast = false;
  const chronicleId = activeChronicleId;
  const actionButton = document.getElementById('editChronicleAction');
  closeChronicleActions({ restoreFocus: false });
  actionButton.disabled = true;
  actionButton.setAttribute('aria-busy', 'true');

  try {
    const [chronicle, cover] = await Promise.all([
      getChroniclesStorage().getChronicle(chronicleId),
      getChroniclesStorage().getChronicleCover(chronicleId)
    ]);
    if (activeChronicleId !== chronicleId) return;
    if (!chronicle) throw new Error('CHRONICLE_NOT_FOUND');

    const visualIndex = activeChronicleVisualIndex || 1;
    activeChronicleRecord = chronicle;
    populateChronicleDetail(chronicle, visualIndex, chronicle.hasCover ? cover : null);
    resetChronicleCreationForm();
    setChronicleFormMode('edit');
    chronicleFormOriginal = { ...chronicle };
    window.ChroniclesOnline?.setFormStorage(chronicle.storage || 'local', { locked: true });
    chronicleFormVisualIndex = visualIndex;
    chronicleFormCoverAction = 'keep';
    document.getElementById('chronicleName').value = chronicle.name;
    document.getElementById('chronicleSynopsis').value = chronicle.synopsis;
    document.querySelector(`input[name="chronicleType"][value="${chronicle.type}"]`).checked = true;
    if (cover?.blob) {
      setChronicleCreationCover(cover, { action: 'keep', statusLabel: 'Capa atual' });
    }
    setChroniclesSubview('create');
    document.getElementById('managerChroniclesPanel').scrollIntoView({ block: 'start', behavior: 'auto' });
    requestAnimationFrame(() => document.getElementById('chronicleCreateTitle')?.focus());
  } catch (error) {
    console.error('Não foi possível abrir a edição da Crônica:', error);
    const message = error?.message === 'CHRONICLE_NOT_FOUND'
      ? 'Esta Crônica não está mais disponível.'
      : 'Não foi possível abrir a edição desta Crônica.';
    showNotification(message, 'error', 6500);
    if (error?.message === 'CHRONICLE_NOT_FOUND') await showChroniclesIndex();
  } finally {
    if (actionButton.isConnected) {
      actionButton.disabled = false;
      actionButton.removeAttribute('aria-busy');
    }
  }
}

async function showChroniclesIndex({ focusId = '' } = {}) {
  if (window.MasterShieldUI?.requestExit(() => void showChroniclesIndex({ focusId }))) return;
  resetChronicleCreationForm();
  teardownChronicleDetail();
  setChroniclesSubview('index');
  await renderChroniclesIndex({ focusId });
}

function openChronicleCreation() {
  if (window.MasterShieldUI?.requestExit(openChronicleCreation)) return;
  teardownChroniclesIndex();
  resetChronicleCreationForm();
  teardownChronicleDetail();
  setChroniclesSubview('create');
  document.getElementById('managerChroniclesPanel').scrollIntoView({ block: 'start', behavior: 'auto' });
  requestAnimationFrame(() => document.getElementById('chronicleCreateTitle')?.focus());
}

function validateChronicleCreationForm() {
  const nameInput = document.getElementById('chronicleName');
  const typeFieldset = document.getElementById('chronicleTypeFieldset');
  const selectedType = document.querySelector('input[name="chronicleType"]:checked');
  nameInput.removeAttribute('aria-invalid');
  typeFieldset.removeAttribute('aria-invalid');

  if (!nameInput.value.trim()) {
    nameInput.setAttribute('aria-invalid', 'true');
    setChronicleFormFeedback('Informe o nome da Crônica.', 'error');
    nameInput.focus();
    return null;
  }
  if (!selectedType) {
    typeFieldset.setAttribute('aria-invalid', 'true');
    setChronicleFormFeedback('Escolha Campanha ou One-shot.', 'error');
    typeFieldset.querySelector('input')?.focus();
    return null;
  }

  setChronicleFormFeedback();
  return {
    name: nameInput.value.trim(),
    synopsis: document.getElementById('chronicleSynopsis').value.trim(),
    type: selectedType.value,
    cover: chronicleCreationCover
  };
}

function getChronicleStorageErrorMessage(error) {
  const onlineMessage = window.ChroniclesOnline?.getErrorMessage(error);
  if (onlineMessage) return onlineMessage;
  if (error?.name === 'QuotaExceededError' || error?.message === 'CHRONICLE_COVER_TOO_LARGE') {
    return 'Não há espaço suficiente para salvar esta Crônica e sua capa neste navegador.';
  }
  if (error?.message === 'INDEXEDDB_UNAVAILABLE') {
    return 'O armazenamento necessário para Crônicas não está disponível neste navegador.';
  }
  if (error?.message === 'CHRONICLE_UPDATE_CONFLICT') {
    return 'Esta Crônica foi alterada em outra aba. Suas alterações continuam neste formulário e não foram sobrescritas.';
  }
  if (error?.message === 'CHRONICLE_NOT_FOUND' || error?.message === 'CHRONICLE_INVALID_RECORD') {
    return 'A Crônica original não está mais disponível para uma atualização segura. Suas alterações continuam neste formulário.';
  }
  return 'Não foi possível salvar a Crônica. Os dados preenchidos foram mantidos nesta tela.';
}

async function submitChronicleUpdate(event) {
  event.preventDefault();
  if (isUpdatingChronicle || isChronicleCoverProcessing || !chronicleFormOriginal) return;
  const payload = validateChronicleCreationForm();
  if (!payload) return;

  const chronicleId = chronicleFormOriginal.id;
  const formSessionToken = chronicleFormSessionToken;
  const expectedUpdatedAt = chronicleFormOriginal.updatedAt;
  const coverAction = chronicleFormCoverAction;
  const replacementCover = chronicleCreationCover;
  const submitButton = document.getElementById('createChronicleButton');
  isUpdatingChronicle = true;
  submitButton.disabled = true;
  submitButton.setAttribute('aria-busy', 'true');
  setChronicleFormFeedback('Salvando alterações…');

  try {
    const chronicle = await getChroniclesStorage().updateChronicle(
      chronicleId,
      payload,
      {
        coverAction,
        cover: replacementCover,
        expectedUpdatedAt
      }
    );
    const [cover, chronicles] = await Promise.all([
      chronicle.hasCover
        ? getChroniclesStorage().getChronicleCover(chronicle.id)
        : Promise.resolve(null),
      getChroniclesStorage().listChronicles()
    ]);
    const currentIndex = chronicles.findIndex(item => item.id === chronicle.id);
    const visualIndex = currentIndex >= 0 ? currentIndex + 1 : chronicleFormVisualIndex || 1;
    if (
      formSessionToken !== chronicleFormSessionToken
      || document.getElementById('characterManagerView')?.dataset.activeEnvironment !== 'chronicles'
    ) {
      showNotification('Crônica atualizada com sucesso.');
      return;
    }
    activeChronicleId = chronicle.id;
    activeChronicleRecord = chronicle;
    activeChronicleVisualIndex = visualIndex;
    populateChronicleDetail(chronicle, visualIndex, cover);
    resetChronicleCreationForm();
    setChroniclesSubview('detail');
    document.getElementById('managerChroniclesPanel').scrollIntoView({ block: 'start', behavior: 'auto' });
    requestAnimationFrame(() => document.getElementById('chronicleDetailTitle')?.focus());
    showNotification('Crônica atualizada com sucesso.');
  } catch (error) {
    console.error('Não foi possível atualizar a Crônica:', error);
    const message = getChronicleStorageErrorMessage(error);
    setChronicleFormFeedback(message, 'error');
    showNotification(message, 'error', 7500);
  } finally {
    isUpdatingChronicle = false;
    submitButton.disabled = false;
    submitButton.removeAttribute('aria-busy');
  }
}

function submitChronicleForm(event) {
  if (chronicleFormMode === 'edit') {
    void submitChronicleUpdate(event);
    return;
  }
  void submitChronicleCreation(event);
}

function openChronicleDeletionConfirmation() {
  if (chronicleFormMode !== 'edit' || !chronicleFormOriginal || isDeletingChronicle) return;
  const storedName = chronicleFormOriginal.name;
  const content = createModalContent(
    `A Crônica “${storedName}” e sua capa serão removidas deste navegador.`,
    isChronicleEditDirty()
      ? 'As alterações ainda não salvas também serão descartadas.'
      : 'Esta ação não poderá ser desfeita nesta versão.'
  );
  openModal({
    title: 'Excluir Crônica?',
    content,
    actions: [
      {
        label: 'Excluir Crônica',
        className: 'danger',
        onClick: () => {
          void deleteActiveChronicle();
        }
      },
      { label: 'Cancelar', className: 'secondary' }
    ]
  });
}

async function deleteActiveChronicle() {
  if (isDeletingChronicle || chronicleFormMode !== 'edit' || !chronicleFormOriginal) return;
  const chronicleId = chronicleFormOriginal.id;
  const deleteButton = document.getElementById('deleteChronicleButton');
  const submitButton = document.getElementById('createChronicleButton');
  isDeletingChronicle = true;
  deleteButton.disabled = true;
  deleteButton.setAttribute('aria-busy', 'true');
  submitButton.disabled = true;
  setChronicleFormFeedback('Excluindo Crônica…');
  let deletionCommitted = false;

  try {
    await getChroniclesStorage().deleteChronicle(chronicleId);
    deletionCommitted = true;
    resetChronicleCreationForm();
    teardownChronicleDetail();
    setChroniclesSubview('index');
    await renderChroniclesIndex();
    const recordsTitle = document.getElementById('chroniclesRecordsTitle');
    recordsTitle?.focus({ preventScroll: true });
    recordsTitle?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    showNotification('Crônica excluída com sucesso.');
  } catch (error) {
    console.error('Não foi possível excluir a Crônica:', error);
    if (deletionCommitted) {
      resetChronicleCreationForm();
      teardownChronicleDetail();
      setChroniclesSubview('index');
      await renderChroniclesIndex();
      showNotification('A Crônica foi excluída, mas não foi possível concluir toda a atualização visual.', 'warning', 7500);
    } else {
      const message = error?.message === 'CHRONICLE_NOT_FOUND'
        ? 'Esta Crônica não está mais disponível. Nenhum outro registro foi alterado.'
        : 'Não foi possível excluir a Crônica. O registro e a capa foram preservados.';
      setChronicleFormFeedback(message, 'error');
      showNotification(message, 'error', 7000);
    }
  } finally {
    isDeletingChronicle = false;
    if (deleteButton.isConnected) {
      deleteButton.disabled = false;
      deleteButton.removeAttribute('aria-busy');
    }
    if (submitButton.isConnected && !isChronicleCoverProcessing) {
      submitButton.disabled = false;
    }
  }
}

async function submitChronicleCreation(event) {
  event.preventDefault();
  if (isCreatingChronicle) return;
  const payload = validateChronicleCreationForm();
  if (!payload) return;

  const submitButton = document.getElementById('createChronicleButton');
  isCreatingChronicle = true;
  submitButton.disabled = true;
  submitButton.setAttribute('aria-busy', 'true');
  setChronicleFormFeedback('Salvando Crônica…');

  try {
    const chronicle = await getChroniclesStorage().createChronicle(payload);
    await showChroniclesIndex({ focusId: chronicle.id });
    showNotification('Crônica criada com sucesso.');
  } catch (error) {
    console.error('Não foi possível criar a Crônica:', error);
    const message = getChronicleStorageErrorMessage(error);
    setChronicleFormFeedback(message, 'error');
    showNotification(message, 'error', 6500);
  } finally {
    isCreatingChronicle = false;
    submitButton.disabled = false;
    submitButton.removeAttribute('aria-busy');
  }
}

function openChronicleMasterShield() {
  if (!activeChronicleId) return;
  closeChronicleActions({ restoreFocus: false });
  if (chronicleParticipantEditor || isParticipantMutationPending) {
    requestChronicleParticipantExit(openChronicleMasterShield); return;
  }
  if (isChronicleCastManagementOpen) {
    requestChronicleCastManagementExit(openChronicleMasterShield); return;
  }
  if (window.ConfrontationsUI?.requestExit(openChronicleMasterShield)) return;
  window.ConfrontationsUI?.reset();
  const section = document.querySelector('[data-chronicle-detail-tab][aria-selected="true"]')?.dataset.chronicleDetailTab || 'overview';
  void window.MasterShieldUI.open(section);
}

function bindChronicles() {
  window.MasterShieldUI.initialize({
    storage: getChroniclesStorage,
    chronicleId: () => activeChronicleId,
    directory: getChronicleCharacterDirectory,
    portrait: createChronicleCastPortrait,
    date: formatChronicleDate,
    type: getChronicleTypeLabel,
    confirm: openModal,
    closeActions: () => closeChronicleActions({ restoreFocus: false }),
    showView: setChroniclesSubview,
    navigate: async (section, battleId, restoreTrigger) => {
      const id = activeChronicleId;
      setChroniclesSubview('detail');
      setChronicleDetailSection(section, { focusTab: !restoreTrigger });
      if (restoreTrigger) {
        const target = window.matchMedia('(max-width: 1100px)').matches
          ? document.getElementById('openChronicleActions') : document.getElementById('openMasterShield');
        target.focus({ preventScroll: true });
      }
      if (battleId) {
        if (activeChronicleRecord?.storage === 'online') await window.ChroniclesOnlineCombat?.render(activeChronicleRecord);
        else await window.ConfrontationsUI.open(battleId);
        return;
      }
      try {
        const chronicle = await getChroniclesStorage().getChronicle(id);
        if (id !== activeChronicleId) return;
        if (!chronicle) { await showChroniclesIndex(); return; }
        activeChronicleRecord = chronicle;
        populateChronicleOverview(chronicle);
      } catch (_error) {
        if (id !== activeChronicleId) return;
        showNotification('Não foi possível atualizar o resumo da Crônica. Tente novamente.', 'error');
      }
    }
  });
  document.getElementById('openMasterShield').addEventListener('click', openChronicleMasterShield);
  window.ConfrontationsUI.initialize({
    storage: getChroniclesStorage,
    chronicleId: () => activeChronicleId,
    directory: () => activeChronicleRecord?.storage === 'online'
      ? (window.ChroniclesOnlineCombat?.directory() || { entries: [], byId: new Map(), unavailable: true })
      : getChronicleCharacterDirectory(),
    readCharacter: id => activeChronicleRecord?.storage === 'online'
      ? window.ChroniclesOnlineCombat?.readCharacter(id)
      : readStoredCharacter(id),
    portrait: createChronicleCastPortrait,
    confirm: openModal,
    notify: showNotification,
    closeActions: () => closeChronicleActions({ restoreFocus: false }),
    showView: setChroniclesSubview,
    canPrepare: () => Boolean(window.MasterShieldUI?.isUnlocked),
    executeCombat: id => window.MasterShieldUI.executeCombat(id),
    chronicleUpdated: chronicle => {
      if (chronicle.id !== activeChronicleId) return;
      activeChronicleRecord = chronicle;
      populateChronicleOverview(chronicle);
    },
    returnToList: async () => {
      const id = activeChronicleId;
      const chronicle = await getChroniclesStorage().getChronicle(id);
      const cover = chronicle?.hasCover ? await getChroniclesStorage().getChronicleCover(id) : null;
      if (id !== activeChronicleId) return;
      if (!chronicle) { await showChroniclesIndex(); return; }
      activeChronicleRecord = chronicle;
      populateChronicleDetail(chronicle, activeChronicleVisualIndex, cover);
      setChroniclesSubview('detail');
      setChronicleDetailSection('encounters');
    }
  });
  document.getElementById('chronicleParticipantForm').addEventListener('submit', saveChronicleParticipant);
  document.getElementById('cancelChronicleParticipant').addEventListener('click', () => {
    if (!isParticipantMutationPending) closeChronicleParticipantEditor({ restoreFocus: true });
  });
  document.getElementById('chronicleParticipantName').addEventListener('input', event => {
    event.target.removeAttribute('aria-invalid');
  });
  document.getElementById('openChronicleCreation').addEventListener('click', openChronicleCreation);
  document.getElementById('backToChroniclesIndex').addEventListener('click', requestChronicleFormExit);
  document.getElementById('chronicleCreateForm').addEventListener('submit', submitChronicleForm);
  document.getElementById('removeChronicleCover').addEventListener('click', removeChronicleCreationCover);
  document.getElementById('deleteChronicleButton').addEventListener('click', openChronicleDeletionConfirmation);
  document.getElementById('chronicleCoverInput').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) void handleChronicleCoverSelection(file, event.target);
  });
  document.getElementById('chronicleName').addEventListener('input', event => {
    if (event.target.value.trim()) event.target.removeAttribute('aria-invalid');
  });
  document.querySelectorAll('input[name="chronicleType"]').forEach(input => {
    input.addEventListener('change', () => document.getElementById('chronicleTypeFieldset').removeAttribute('aria-invalid'));
  });
  document.getElementById('backFromChronicleDetail').addEventListener('click', () => {
    void returnToChroniclesIndex();
  });
  document.querySelectorAll('[data-chronicle-detail-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      setChronicleDetailSection(tab.dataset.chronicleDetailTab);
    });
    tab.addEventListener('keydown', event => {
      const tabs = [...document.querySelectorAll('[data-chronicle-detail-tab]')];
      const currentIndex = tabs.indexOf(event.currentTarget);
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabs.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabs.length - 1;
      else return;
      event.preventDefault();
      setChronicleDetailSection(tabs[nextIndex].dataset.chronicleDetailTab, { focusTab: true });
    });
  });

  document.getElementById('openChronicleActions').addEventListener('click', openChronicleActions);
  document.getElementById('manageChronicleCast').addEventListener('click', event => {
    void openChronicleCastManagement(event.currentTarget);
  });
  document.getElementById('chronicleCastSearch').addEventListener('input', event => {
    if (window.ChroniclesCollaboration?.handleCastSearch(event.currentTarget.value)) return;
    renderChronicleCastManagementList();
  });
  document.getElementById('cancelChronicleCastManagement').addEventListener('click', () => {
    requestChronicleCastManagementExit(() => {
      void renderChronicleCast();
    }, { restoreFocus: true });
  });
  document.getElementById('saveChronicleCast').addEventListener('click', () => {
    void saveChronicleCastManagement();
  });
  document.getElementById('editChronicleAction').addEventListener('click', () => {
    void openChronicleEditor();
  });
  document.getElementById('closeChronicleActions').addEventListener('click', () => closeChronicleActions());
  document.getElementById('chronicleActionsBackdrop').addEventListener('click', () => closeChronicleActions());
  document.getElementById('chronicleActionsPanel').addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeChronicleActions();
      return;
    }
    if (event.key !== 'Tab' || !event.currentTarget.classList.contains('is-open')) return;
    const focusable = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
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

  const compactActionsQuery = window.matchMedia('(max-width: 1100px)');
  compactActionsQuery.addEventListener('change', event => {
    if (!event.matches) closeChronicleActions({ restoreFocus: false });
  });
  window.addEventListener('pagehide', () => {
    revokeChronicleCreationPreviewUrl();
    revokeChronicleCardObjectUrls();
    revokeChronicleDetailCoverUrl();
  });
}

function bindCharacterManager() {
  document.getElementById('managerCreateCharacter').addEventListener('click', createNewCharacter);
  document.querySelectorAll('[data-manager-section]').forEach(button => {
    button.addEventListener('click', () => {
      const targetSection = button.dataset.managerSection;
      if (
        isChronicleCastManagementOpen
        && document.getElementById('characterManagerView')?.dataset.activeEnvironment === 'chronicles'
      ) {
        requestChronicleCastManagementExit(() => {
          showManagerSection(targetSection, { focusPanel: true });
        });
        return;
      }
      showManagerSection(targetSection, { focusPanel: true });
    });
  });
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

const QUICK_DICE_LIMITS = Object.freeze({
  expressionLength: 32,
  quantity: 100,
  faces: 1000,
  modifier: 100000
});

function parseDiceExpression(expression) {
  const original = String(expression ?? '');
  if (original.length > 64) {
    return { valid: false, message: 'Expressão inválida. Ex.: 1d20+3' };
  }

  const compact = original.replace(/\s+/g, '');
  if (!compact || compact.length > QUICK_DICE_LIMITS.expressionLength) {
    return { valid: false, message: 'Expressão inválida. Ex.: 1d20+3' };
  }

  const match = /^([1-9]\d{0,2})[dD]([1-9]\d{0,3})([+-]\d{1,6})?$/.exec(compact);
  if (!match) {
    return { valid: false, message: 'Expressão inválida. Ex.: 1d20+3' };
  }

  const quantity = Number(match[1]);
  const faces = Number(match[2]);
  const modifier = match[3] ? Number(match[3]) : 0;

  if (quantity < 1 || quantity > QUICK_DICE_LIMITS.quantity) {
    return { valid: false, message: 'Use entre 1 e 100 dados.' };
  }
  if (faces < 2 || faces > QUICK_DICE_LIMITS.faces) {
    return { valid: false, message: 'Use dados com 2 a 1000 faces.' };
  }
  if (!Number.isSafeInteger(modifier) || Math.abs(modifier) > QUICK_DICE_LIMITS.modifier) {
    return { valid: false, message: 'Use um modificador entre -100000 e +100000.' };
  }

  const modifierNotation = modifier === 0 ? '' : `${modifier > 0 ? '+' : ''}${modifier}`;
  return {
    valid: true,
    expression: `${quantity}d${faces}${modifierNotation}`,
    quantity,
    faces,
    modifier
  };
}

function rollDie(faces) {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const values = new Uint32Array(1);
    const range = 0x100000000;
    const limit = Math.floor(range / faces) * faces;
    do {
      cryptoApi.getRandomValues(values);
    } while (values[0] >= limit);
    return (values[0] % faces) + 1;
  }
  return Math.floor(Math.random() * faces) + 1;
}

function rollDiceExpression(parsedExpression, randomizer = rollDie) {
  if (!parsedExpression?.valid) throw new TypeError('INVALID_DICE_EXPRESSION');
  const rolls = Array.from(
    { length: parsedExpression.quantity },
    () => randomizer(parsedExpression.faces)
  );
  const diceTotal = rolls.reduce((total, value) => total + value, 0);
  return {
    expression: parsedExpression.expression,
    quantity: parsedExpression.quantity,
    faces: parsedExpression.faces,
    modifier: parsedExpression.modifier,
    rolls,
    diceTotal,
    total: diceTotal + parsedExpression.modifier
  };
}

function formatDiceResult(result) {
  const modifierText = result.modifier === 0
    ? ''
    : `${result.modifier > 0 ? '+' : '−'}${Math.abs(result.modifier)}`;
  let calculationText = result.rolls.join(' + ');
  if (result.modifier > 0) calculationText += ` + ${result.modifier}`;
  if (result.modifier < 0) calculationText += ` − ${Math.abs(result.modifier)}`;
  return {
    rollsText: result.rolls.join(', '),
    modifierText,
    calculationText,
    totalText: String(result.total)
  };
}

function getDiceRollHighlights(rolls) {
  if (!Array.isArray(rolls) || rolls.length <= 1) {
    return { minimum: null, maximum: null };
  }
  const minimum = Math.min(...rolls);
  const maximum = Math.max(...rolls);
  if (minimum === maximum) return { minimum: null, maximum: null };
  return { minimum, maximum };
}

function renderQuickDiceRollValues(rolls) {
  const container = document.getElementById('quickDiceRolls');
  if (!container) return;
  const { minimum, maximum } = getDiceRollHighlights(rolls);
  const fragment = document.createDocumentFragment();

  rolls.forEach((value, index) => {
    if (index > 0) fragment.appendChild(document.createTextNode(', '));
    const roll = document.createElement('span');
    roll.className = 'quick-dice-roll-value';
    if (value === maximum) roll.classList.add('is-highest');
    if (value === minimum) roll.classList.add('is-lowest');
    roll.textContent = String(value);
    fragment.appendChild(roll);
  });

  container.replaceChildren(fragment);
}

function announceQuickDice(message) {
  const announcement = document.getElementById('quickDiceAnnouncement');
  if (!announcement) return;
  announcement.textContent = '';
  requestAnimationFrame(() => {
    announcement.textContent = message;
  });
}

function closeQuickDice({ restoreFocus = true } = {}) {
  const tool = document.getElementById('quickDiceTool');
  const toggle = document.getElementById('quickDiceToggle');
  const panel = document.getElementById('quickDicePanel');
  if (!tool || !toggle || !panel) return;

  const wasOpen = !panel.hidden;
  panel.hidden = true;
  tool.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
  if (wasOpen && restoreFocus && quickDiceReturnFocus?.isConnected) quickDiceReturnFocus.focus();
  quickDiceReturnFocus = null;
}

function openQuickDice() {
  const tool = document.getElementById('quickDiceTool');
  const toggle = document.getElementById('quickDiceToggle');
  const panel = document.getElementById('quickDicePanel');
  const input = document.getElementById('quickDiceExpression');
  if (!tool || !toggle || !panel || !input) return;

  quickDiceReturnFocus = toggle;
  panel.hidden = false;
  tool.classList.add('is-open');
  toggle.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function renderQuickDiceError(message) {
  const error = document.getElementById('quickDiceError');
  const result = document.getElementById('quickDiceResult');
  error.textContent = message;
  error.hidden = false;
  result.hidden = true;
  announceQuickDice(message);
}

function animateQuickDiceResult() {
  const toggle = document.getElementById('quickDiceToggle');
  const result = document.getElementById('quickDiceResult');
  clearTimeout(quickDiceAnimationTimer);
  toggle.classList.remove('is-rolling');
  result.classList.remove('is-revealing');
  requestAnimationFrame(() => {
    toggle.classList.add('is-rolling');
    result.classList.add('is-revealing');
  });
  quickDiceAnimationTimer = window.setTimeout(() => {
    toggle.classList.remove('is-rolling');
    result.classList.remove('is-revealing');
  }, 420);
}

function performQuickDiceRoll() {
  if (window.RollHistory && !window.RollHistory.beforeRoll()) return null;
  const input = document.getElementById('quickDiceExpression');
  const parsed = parseDiceExpression(input.value);
  if (!parsed.valid) {
    renderQuickDiceError(parsed.message);
    return null;
  }

  const result = rollDiceExpression(parsed);
  const formatted = formatDiceResult(result);
  const error = document.getElementById('quickDiceError');
  const resultContainer = document.getElementById('quickDiceResult');
  const modifierRow = document.getElementById('quickDiceModifierRow');

  input.value = parsed.expression;
  error.hidden = true;
  document.getElementById('quickDiceCalculation').textContent = formatted.calculationText;
  renderQuickDiceRollValues(result.rolls);
  document.getElementById('quickDiceModifier').textContent = formatted.modifierText;
  modifierRow.hidden = result.modifier === 0;
  document.getElementById('quickDiceTotal').value = formatted.totalText;
  resultContainer.hidden = false;
  animateQuickDiceResult();

  const modifierAnnouncement = result.modifier === 0
    ? ''
    : `, modificador ${formatted.modifierText}`;
  announceQuickDice(
    `Rolagem ${result.expression}. Dados: ${formatted.rollsText}${modifierAnnouncement}. Total: ${formatted.totalText}.`
  );
  window.RollHistory?.record(result);
  return result;
}

function bindQuickDice() {
  window.RollHistory?.initialize({ storage: getChroniclesStorage, confirm: openModal, notify: showNotification, createId: createCharacterId,
    name: () => document.getElementById('nome').value || 'Sem nome',
    inSheet: () => !document.getElementById('characterSheetView').hidden });
  const tool = document.getElementById('quickDiceTool');
  const toggle = document.getElementById('quickDiceToggle');
  const panel = document.getElementById('quickDicePanel');
  const form = document.getElementById('quickDiceForm');

  toggle.addEventListener('click', () => {
    if (panel.hidden) openQuickDice();
    else closeQuickDice();
  });
  document.getElementById('quickDiceClose').addEventListener('click', () => closeQuickDice());
  form.addEventListener('submit', event => {
    event.preventDefault();
    performQuickDiceRoll();
  });
  document.addEventListener('pointerdown', event => {
    if (!panel.hidden && !tool.contains(event.target)) closeQuickDice();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      closeQuickDice();
    }
  });
}

function calculateResonanceThreshold(level, intellect) {
  const safeLevel = integerBetween(level, 1, 11);
  const safeIntellect = integerBetween(intellect, 1, safeLevel === 11 ? 6 : 5);
  return 15 + safeIntellect + Math.ceil(safeLevel / 2);
}

function updateResonanceThreshold() {
  const output = document.getElementById('limiarRessonancia');
  const levelInput = document.getElementById('nivel');
  const intellectInput = document.getElementById('intelecto');
  if (!output || !levelInput || !intellectInput) return;
  if (levelInput.value === '' || intellectInput.value === '') return;

  const value = calculateResonanceThreshold(levelInput.value, intellectInput.value);
  output.value = String(value);
  output.setAttribute('aria-label', `Limiar de Ressonância: ${value}`);
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
  closeQuickDice();
  const overlay = document.getElementById('modalOverlay');
  const titleElement = document.getElementById('modalTitle');
  const description = document.getElementById('modalDescription');
  const actionsContainer = document.getElementById('modalActions');
  if (overlay.hidden) modalReturnFocus = document.activeElement;
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
  delete state.fields.totalis;

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
      if (card.dataset.cardType === 'equipment') {
        const catalogId = card.dataset.catalogId;
        if (EQUIPMENT_CATALOG_BY_ID.has(catalogId)) data.catalogId = catalogId;
        const catalogModifications = getEquipmentCatalogModifications(card);
        if (catalogModifications.length) data.catalogModifications = catalogModifications;
      }
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

function clearResourceFeedback(card) {
  if (!card) return;
  const timer = resourceFeedbackTimers.get(card);
  if (timer) window.clearTimeout(timer);
  resourceFeedbackTimers.delete(card);
  card.classList.remove('resource-increased', 'resource-decreased');
}

function updateResourceChangeFeedback(resourceId, card, current) {
  const temporary = resourceId === 'pvAtual' ? numberValue('pvTemporarios') : 0;
  const visualValue = current + temporary;
  const previousValue = resourceVisualSnapshots.get(resourceId);
  resourceVisualSnapshots.set(resourceId, visualValue);

  if (!card || isRestoring || previousValue === undefined || visualValue === previousValue) {
    if (isRestoring) clearResourceFeedback(card);
    return;
  }

  clearResourceFeedback(card);
  void card.offsetWidth;
  card.classList.add(visualValue > previousValue ? 'resource-increased' : 'resource-decreased');

  const timer = window.setTimeout(() => {
    clearResourceFeedback(card);
  }, 420);
  resourceFeedbackTimers.set(card, timer);
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

  updateResourceChangeFeedback(resourceId, card, current);

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
  updateResonanceThreshold();

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

function classAutomationResultChanged(previousSnapshot, maximums) {
  const previousMaximums = previousSnapshot ? computeClassMaximums(previousSnapshot) : null;
  if (Boolean(previousMaximums) !== Boolean(maximums)) return true;
  if (!previousMaximums || !maximums) return false;
  return ['pvMax', 'pnMax', 'psMax'].some(id => previousMaximums[id] !== maximums[id]);
}

function hideClassAutomationStatus() {
  const status = document.getElementById('classAutomationStatus');
  if (!status) return;

  window.clearTimeout(classAutomationNoticeTimer);
  classAutomationNoticeTimer = null;
  status.hidden = true;
  status.classList.remove('active', 'warning');
  status.replaceChildren();
}

function updateClassAutomationStatus(snapshot, maximums, { announce = false } = {}) {
  const status = document.getElementById('classAutomationStatus');
  if (!status || !announce) return;

  window.clearTimeout(classAutomationNoticeTimer);
  status.replaceChildren();
  const title = document.createElement('strong');
  const message = document.createElement('span');

  if (!maximums) {
    status.classList.remove('active', 'warning');
    title.textContent = 'Automação de classe desativada';
    message.textContent = 'Os máximos de PV, PN e PS podem ser editados manualmente.';
  } else {
    const overMaximum = [
      ['PV', numberValue('pvAtual'), maximums.pvMax],
      ['PN', numberValue('pnAtual'), maximums.pnMax],
      ['PS', numberValue('psAtual'), maximums.psMax]
    ].filter(([, current, maximum]) => current > maximum);

    const warning = overMaximum.length
      ? ` Atenção: ${overMaximum.map(([label]) => label).join(', ')} atual está acima do novo máximo e foi preservado.`
      : ' Os valores atuais não são recuperados automaticamente.';

    status.classList.add('active');
    status.classList.toggle('warning', overMaximum.length > 0);
    title.textContent = `${snapshot.classe} · Nível ${snapshot.nivel}`;
    message.textContent = `Máximos atualizados: ${maximums.pvMax} PV · ${maximums.pnMax} PN · ${maximums.psMax} PS.${warning}`;
  }

  status.append(title, message);
  status.hidden = false;
  classAutomationNoticeTimer = window.setTimeout(hideClassAutomationStatus, status.classList.contains('warning') ? 7000 : 4800);
}

function recalculateClassResources({ trigger = 'manual', previous = lastAutomationSnapshot } = {}) {
  const snapshot = getAutomationSnapshot();
  const maximums = computeClassMaximums(snapshot);
  const shouldAnnounce = trigger !== 'restore' && classAutomationResultChanged(previous, maximums);
  if (trigger === 'restore') hideClassAutomationStatus();
  updateCalculatedFieldState(Boolean(maximums));

  if (!maximums) {
    updateClassAutomationStatus(snapshot, null, { announce: shouldAnnounce });
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

  updateClassAutomationStatus(snapshot, maximums, { announce: shouldAnnounce });
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
  if (input.id === 'intelecto') updateResonanceThreshold();
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

const CONDITION_CATALOG = [
  {
    id: 'physical',
    label: 'Físicas',
    conditions: [
      {
        id: 'sangrando',
        name: 'Sangrando',
        description: 'Um ferimento aberto continua provocando perda de sangue.',
        effect: 'Sofre dano ao final de seus turnos enquanto permanecer Sangrando. O dano é determinado pela fonte. Caso nenhum valor seja informado, utilize 1d4 de dano por turno.',
        resistance: 'Normalmente não possui resistência inicial.',
        recovery: 'Uma Ação Padrão + Medicina contra a DT responsável pelo sangramento pode encerrá-lo. Certas formas de cura também podem remover a condição.'
      },
      {
        id: 'queimando',
        name: 'Queimando',
        description: 'O personagem, suas roupas ou equipamentos estão em chamas.',
        effect: 'Sofre dano de fogo ao final de cada turno. Caso a fonte não determine o dano, utilize 1d4 de dano por turno.',
        resistance: 'Normalmente Reflexos quando houver possibilidade de evitar ser incendiado.',
        recovery: 'Pode gastar uma Ação Padrão e realizar Reflexos ou Atletismo contra a DT da fonte para apagar as chamas.\n\nÁgua suficiente ou outro método apropriado pode remover a condição automaticamente.'
      },
      {
        id: 'enfraquecido',
        name: 'Enfraquecido',
        description: 'O corpo perdeu parte de sua força e resistência.',
        effect: '-1d20 em testes relacionados a Força e Vigor.',
        resistance: 'Normalmente Fortitude.',
        recovery: 'Fortitude, descanso, tratamento ou remoção do efeito responsável.'
      },
      {
        id: 'exausto',
        name: 'Exausto',
        description: 'O personagem ultrapassou seus limites físicos.',
        effect: '• -1d20 em testes físicos.\n• Deslocamento reduzido pela metade.',
        resistance: 'Normalmente não existe.',
        recovery: 'Exige descanso adequado, tratamento ou uma habilidade especificamente capaz de remover Exaustão.'
      },
      {
        id: 'imobilizado',
        name: 'Imobilizado',
        description: 'O personagem não consegue sair de sua posição atual.',
        effect: 'Seu deslocamento se torna 0.\n\nAinda pode realizar ações compatíveis com sua situação.',
        resistance: 'Depende da fonte.',
        recovery: 'Normalmente exige Ação Padrão + Atletismo, Acrobacia, Fortitude ou Ressonância, conforme a natureza do efeito.'
      },
      {
        id: 'agarrado',
        name: 'Agarrado',
        description: 'O personagem está sendo fisicamente segurado.',
        effect: 'Não pode se afastar voluntariamente da fonte do agarrão.\n\nAinda pode atacar, utilizar Manifestações e realizar outras ações compatíveis.',
        recovery: 'Pode gastar uma Ação Padrão para realizar Atletismo ou Acrobacia, contra uma DT ou em uma disputa contra quem o segura.'
      },
      {
        id: 'caido',
        name: 'Caído',
        description: 'O personagem está no chão.',
        effect: 'Permanece deitado e certas ações podem ser dificultadas conforme a situação.',
        recovery: 'Levantar-se exige uma Ação de Movimento.'
      },
      {
        id: 'lento',
        name: 'Lento',
        description: 'A capacidade de movimentação foi prejudicada.',
        effect: 'Deslocamento reduzido pela metade.',
        resistance: 'Depende da fonte.',
        recovery: 'Normalmente termina junto do efeito responsável ou através do teste especificado por ele.'
      },
      {
        id: 'envenenado',
        name: 'Envenenado',
        description: 'Uma substância nociva está ativa no organismo.',
        effect: 'Cada veneno possui suas próprias consequências, podendo causar dano, penalidades ou outras Condições.',
        resistance: 'Normalmente Fortitude contra a DT do veneno.',
        recovery: 'Pode exigir novos testes de Fortitude, Medicina, antídotos ou tratamento específico.'
      }
    ]
  },
  {
    id: 'sensory',
    label: 'Sensoriais',
    conditions: [
      {
        id: 'cego',
        name: 'Cego',
        description: 'O personagem não consegue enxergar adequadamente.',
        effect: '• -1d20 em testes dependentes da visão.\n• Testes exclusivamente visuais podem falhar automaticamente.\n\nOutros sentidos ainda podem ser utilizados.',
        resistance: 'Pode utilizar Reflexos, Fortitude, Vontade ou Ressonância, dependendo da causa.',
        recovery: 'Depende da fonte da cegueira.'
      },
      {
        id: 'surdo',
        name: 'Surdo',
        description: 'O personagem perdeu sua capacidade auditiva.',
        effect: '• Falha automaticamente em testes exclusivamente auditivos.\n• Sofre -1d20 quando a audição for uma parte importante da percepção.',
        resistance: 'Normalmente Fortitude, mas pode variar.',
        recovery: 'Depende da origem.'
      },
      {
        id: 'desorientado',
        name: 'Desorientado',
        description: 'O personagem perdeu temporariamente sua percepção espacial ou equilíbrio.',
        effect: '-1d20 em:\n\n• Percepção;\n• Iniciativa;\n• Reflexos.',
        resistance: 'Normalmente Fortitude ou Reflexos, dependendo da fonte.',
        recovery: 'Quando permitido, realiza novamente o teste contra a DT responsável.'
      }
    ]
  },
  {
    id: 'mental',
    label: 'Mentais',
    conditions: [
      {
        id: 'abalado',
        name: 'Abalado',
        description: 'O personagem está emocionalmente desestabilizado.',
        effect: '-1d20 em Vontade e em testes diretamente relacionados a manter controle emocional.',
        resistance: 'Normalmente Vontade.',
        recovery: 'Quando permitido, pode repetir Vontade ao final do turno.'
      },
      {
        id: 'assustado',
        name: 'Assustado',
        description: 'O personagem está dominado pelo medo de uma fonte específica.',
        effect: '• Não pode se aproximar voluntariamente da fonte de seu medo.\n• -1d20 em testes diretamente contra ela.',
        resistance: 'Vontade.',
        recovery: 'Normalmente pode repetir Vontade ao final de seu turno.'
      },
      {
        id: 'confuso',
        name: 'Confuso',
        description: 'O personagem possui dificuldade para interpretar corretamente aquilo que acontece.',
        effect: '• Não pode realizar Reações.\n• -1d20 em testes diretamente ligados a raciocínio, interpretação ou decisões imediatas, quando aplicável.',
        resistance: 'Normalmente Vontade.',
        recovery: 'Quando permitido, pode repetir Vontade ao final do turno.'
      },
      {
        id: 'provocado',
        name: 'Provocado',
        description: 'Um adversário conseguiu concentrar a atenção ou agressividade do personagem sobre si.',
        effect: '-1d20 em ataques e ações ofensivas contra qualquer alvo que não seja quem provocou o personagem.\n\nProvocado não obriga o personagem a atacar.',
        resistance: 'Normalmente Vontade.',
        recovery: 'Quando permitido, pode repetir Vontade ao final do turno.'
      }
    ]
  },
  {
    id: 'control',
    label: 'Controle',
    conditions: [
      {
        id: 'atordoado',
        name: 'Atordoado',
        description: 'O personagem perdeu momentaneamente sua capacidade de reagir normalmente.',
        effect: '• Não pode realizar Reações.\n• -1d20 em todos os seus testes.',
        resistance: 'Normalmente Fortitude. Efeitos mentais podem utilizar Vontade.',
        recovery: 'Depende da fonte. Quando permitido, pode repetir o teste ao final do turno.'
      },
      {
        id: 'incapacitado',
        name: 'Incapacitado',
        description: 'O personagem está temporariamente incapaz de agir.',
        effect: 'Não pode realizar:\n\n• Ação Padrão;\n• Ação de Movimento;\n• Reações.\n\nPermanece consciente caso nenhum outro efeito determine o contrário.',
        resistance: 'Depende da fonte.',
        recovery: 'Normalmente ocorre ao final da duração ou através do teste determinado pelo efeito.'
      },
      {
        id: 'inconsciente',
        name: 'Inconsciente',
        description: 'O personagem perdeu completamente a consciência.',
        effect: '• Não pode realizar ações.\n• Não pode realizar Reações.\n• Não percebe normalmente o ambiente.\n• Testes que dependam de consciência ou percepção ativa falham automaticamente.',
        resistance: 'Depende da causa.',
        recovery: 'Tempo, tratamento, cura, intervenção externa ou regra específica da fonte.'
      },
      {
        id: 'vulneravel',
        name: 'Vulnerável',
        description: 'As defesas do personagem foram comprometidas.',
        effect: '-2 de Defesa.',
        resistance: 'Depende da fonte.',
        recovery: 'Normalmente termina quando sua duração acaba ou quando a causa é removida.'
      }
    ]
  },
  {
    id: 'nexus',
    label: 'Nexo',
    conditions: [
      {
        id: 'nexo-instavel',
        name: 'Nexo Instável',
        description: 'O fluxo entre o personagem e seu Nexo tornou-se irregular.',
        effect: '-1d20 em testes realizados para utilizar Manifestações.\n\nManifestações que não exigem teste continuam funcionando normalmente, salvo indicação contrária.',
        resistance: 'Ressonância.',
        recovery: 'Quando permitido, pode repetir Ressonância ao final do turno.'
      },
      {
        id: 'nexo-bloqueado',
        name: 'Nexo Bloqueado',
        description: 'A conexão com o próprio Nexo foi temporariamente interrompida ou severamente restringida.',
        effect: 'O personagem não pode utilizar:\n\n• Manifestações;\n• habilidades que exijam PN;\n• efeitos que dependam diretamente da ativação consciente do Nexo.\n\nEfeitos já ativos não necessariamente desaparecem.',
        resistance: 'Normalmente Ressonância.',
        recovery: 'Depende da fonte do bloqueio.',
        note: 'Nexo Bloqueado é uma Condição extremamente poderosa e deve aparecer apenas em efeitos específicos.'
      },
      {
        id: 'ressonancia-exposta',
        name: 'Ressonância Exposta',
        description: 'As defesas naturais do Nexo foram temporariamente enfraquecidas.',
        effect: '-1d20 para resistir a efeitos que atuem diretamente sobre o Nexo ou Ressonância.\n\nNão aumenta automaticamente o dano sofrido por ataques comuns.',
        resistance: 'Ressonância.',
        recovery: 'Quando permitido, pode repetir Ressonância ao final do turno.'
      },
      {
        id: 'silenciado',
        name: 'Silenciado',
        description: 'O personagem perdeu temporariamente a capacidade de utilizar adequadamente sua voz.',
        effect: '• Não consegue falar normalmente.\n• Manifestações cuja Forma de Conjuração dependa de voz, fala ou canto não podem ser utilizadas.\n\nOutras formas de conjuração continuam funcionando normalmente.',
        resistance: 'Normalmente Vontade ou Ressonância, conforme a fonte.',
        recovery: 'Depende do efeito responsável.'
      }
    ]
  }
];

const CONDITION_REPETITION_RULE = 'A mesma Condição normalmente não se acumula. Uma nova aplicação pode renovar sua duração ou substituir a anterior, conforme o efeito responsável.';

const EQUIPMENT_CATALOG_GROUPS = [
  {
    id: 'weapon-melee',
    section: 'weapons',
    label: 'Corpo a Corpo',
    itemLabel: 'Arma Corpo a Corpo',
    items: [
      ['weapon-melee-faca', 'Faca', '1d4', ['weapon', 'melee', 'melee-cutting']],
      ['weapon-melee-adaga', 'Adaga', '1d6', ['weapon', 'melee', 'melee-cutting']],
      ['weapon-melee-soqueira', 'Soqueira', '1d4', ['weapon', 'melee']],
      ['weapon-melee-manoplas', 'Manoplas', '1d6', ['weapon', 'melee']],
      ['weapon-melee-bastao', 'Bastão', '1d6', ['weapon', 'melee']],
      ['weapon-melee-pe-de-cabra', 'Pé de Cabra', '1d6', ['weapon', 'melee']],
      ['weapon-melee-facao', 'Facão', '1d8', ['weapon', 'melee', 'melee-cutting']],
      ['weapon-melee-corrente', 'Corrente', '1d6', ['weapon', 'melee']],
      ['weapon-melee-lanca', 'Lança', '1d8', ['weapon', 'melee']],
      ['weapon-melee-martelo', 'Martelo', '1d10', ['weapon', 'melee']],
      ['weapon-melee-machado', 'Machado', '1d10', ['weapon', 'melee', 'melee-cutting']],
      ['weapon-melee-espada', 'Espada', '1d10', ['weapon', 'melee', 'melee-cutting']],
      ['weapon-melee-foice', 'Foice', '2d6', ['weapon', 'melee', 'melee-cutting']],
      ['weapon-melee-katana', 'Katana', '2d6', ['weapon', 'melee', 'melee-cutting']]
    ].map(([id, name, damage, tags]) => ({ id, name, kind: 'weapon', category: 'Arma Corpo a Corpo', damage, tags }))
  },
  {
    id: 'weapon-ranged',
    section: 'weapons',
    label: 'Disparo',
    itemLabel: 'Arma de Disparo',
    items: [
      ['weapon-ranged-arco', 'Arco', '1d8', ['weapon', 'ranged', 'bow']],
      ['weapon-ranged-besta-uma-mao', 'Besta de uma Mão', '1d8', ['weapon', 'ranged', 'crossbow']],
      ['weapon-ranged-besta', 'Besta', '1d10', ['weapon', 'ranged', 'crossbow']],
      ['weapon-ranged-arco-composto', 'Arco Composto', '2d6', ['weapon', 'ranged', 'bow']]
    ].map(([id, name, damage, tags]) => ({ id, name, kind: 'weapon', category: 'Arma de Disparo', damage, tags }))
  },
  {
    id: 'weapon-firearm',
    section: 'weapons',
    label: 'Armas de Fogo',
    itemLabel: 'Arma de Fogo',
    items: [
      ['weapon-firearm-revolver', 'Revólver', '2d6', []],
      ['weapon-firearm-pistola', 'Pistola', '1d12', ['silencer-compatible', 'magazine-compatible']],
      ['weapon-firearm-escopeta-cano-duplo', 'Escopeta de Cano Duplo', '4d6', []],
      ['weapon-firearm-escopeta', 'Escopeta', '3d6', []],
      ['weapon-firearm-carabina', 'Carabina', '2d10', ['silencer-compatible', 'magazine-compatible']],
      ['weapon-firearm-submetralhadora', 'Submetralhadora', '3d6', ['silencer-compatible', 'magazine-compatible']],
      ['weapon-firearm-fuzil', 'Fuzil', '3d8', ['silencer-compatible', 'magazine-compatible']],
      ['weapon-firearm-rifle-precisao', 'Rifle de Precisão', '3d10', ['silencer-compatible', 'magazine-compatible']],
      ['weapon-firearm-metralhadora', 'Metralhadora', '4d8', []]
    ].map(([id, name, damage, extraTags]) => ({
      id,
      name,
      kind: 'weapon',
      category: 'Arma de Fogo',
      damage,
      tags: ['weapon', 'firearm', ...extraTags]
    }))
  },
  {
    id: 'protections',
    section: 'protections',
    label: 'Proteções',
    itemLabel: 'Proteção',
    items: [
      {
        id: 'protection-light',
        name: 'Proteção Leve',
        kind: 'protection',
        category: 'Proteção',
        bonus: '+2 de Defesa',
        effect: 'Concede +2 de Defesa.',
        tags: ['protection', 'protection-light']
      },
      {
        id: 'protection-heavy',
        name: 'Proteção Pesada',
        kind: 'protection',
        category: 'Proteção',
        bonus: '+5 de Defesa',
        effect: 'Concede +5 de Defesa.',
        tags: ['protection', 'protection-heavy']
      },
      {
        id: 'protection-shield',
        name: 'Escudo',
        kind: 'protection',
        category: 'Proteção',
        bonus: '+2 de Defesa',
        effect: 'Concede +2 de Defesa enquanto estiver empunhado.',
        ruleLabel: 'Contra-ataque',
        rule: 'Quando um ataque corpo a corpo não consegue superar sua Defesa enquanto você está empunhando um escudo, você recebe +2 em seu próximo ataque contra esse inimigo, desde que o ataque seja realizado até o final do seu próximo turno.',
        tags: ['protection', 'shield']
      }
    ]
  },
  {
    id: 'general-items',
    section: 'general',
    label: 'Itens Gerais',
    itemLabel: 'Item Geral',
    items: [
      ['general-backpack', 'Mochila', '+2 espaços', 'Aumenta em 2 a quantidade de espaços disponíveis no inventário.'],
      ['general-flashlight', 'Lanterna', '+1 em Percepção', 'Aplica-se a testes realizados em ambientes escuros ou com pouca iluminação.'],
      ['general-rope', 'Corda', '+2 em Atletismo', 'Aplica-se a testes para escalar, descer ou atravessar locais com o auxílio da corda.'],
      ['general-medical-kit', 'Kit Médico', '+2 em Medicina', 'Aplica-se a testes para estabilizar ou tratar ferimentos.'],
      ['general-investigation-kit', 'Kit de Investigação', '+2 em Investigação', 'Aplica-se ao examinar cenas, objetos ou vestígios.'],
      ['general-professional-tools', 'Ferramentas Profissionais', '+3 em Profissão', 'Aplica-se a reparos, manutenção ou tarefas técnicas compatíveis com a profissão.'],
      ['general-lockpick-kit', 'Kit de Arrombamento', '+2 em Crime', 'Aplica-se a testes para abrir fechaduras ou desarmar mecanismos simples.'],
      ['general-binoculars', 'Binóculos', '+2 em Percepção', 'Aplica-se ao observar pessoas, objetos ou locais a grandes distâncias.'],
      ['general-communicator', 'Comunicador', '+1 em Tática', 'Aplica-se ao coordenar ações com aliados que também possuam comunicação ativa.'],
      ['general-filter-mask', 'Máscara Filtrante', '+2 em Vigor', 'Aplica-se a testes contra fumaça, gases e substâncias inaláveis.'],
      ['general-camouflage-clothing', 'Roupa de Camuflagem', '+2 em Furtividade', 'Aplica-se quando a camuflagem combina com o ambiente.'],
      ['general-camera', 'Câmera', '+1 em Investigação', 'Aplica-se ao registrar e analisar pistas visuais de uma cena.'],
      ['general-multitool', 'Canivete Multiuso', '+1 em Profissão', 'Aplica-se a reparos e tarefas manuais simples quando não há ferramentas adequadas.']
    ].map(([id, name, bonus, effect]) => ({
      id,
      name,
      kind: 'general',
      category: 'Item Geral',
      bonus,
      effect,
      tags: ['general']
    }))
  }
];

const EQUIPMENT_CATALOG_ITEMS = EQUIPMENT_CATALOG_GROUPS.flatMap(group => group.items);
const EQUIPMENT_CATALOG_BY_ID = new Map(EQUIPMENT_CATALOG_ITEMS.map(item => [item.id, item]));

const EQUIPMENT_MODIFICATION_CATALOG = [
  { id: 'afiada', name: 'Afiada', compatibility: 'Arma corpo a corpo cortante', effect: 'Concede +1 de dano.', compatibleTags: ['melee-cutting'] },
  { id: 'equilibrada', name: 'Equilibrada', compatibility: 'Arma corpo a corpo ou de disparo', effect: 'Concede +1 no teste de ataque.', compatibleTags: ['melee', 'ranged'] },
  { id: 'empunhadura-reforcada', name: 'Empunhadura Reforçada', compatibility: 'Arma corpo a corpo', effect: 'Concede +2 em testes para resistir a desarmes ou manter a arma empunhada.', compatibleTags: ['melee'] },
  { id: 'corda-reforcada', name: 'Corda Reforçada', compatibility: 'Arco ou besta', effect: 'Concede +1 de dano aos disparos.', compatibleTags: ['bow', 'crossbow'] },
  { id: 'mecanismo-rapido', name: 'Mecanismo Rápido', compatibility: 'Besta ou arma de fogo', effect: 'A primeira recarga realizada em cada combate pode ser feita como ação livre.', compatibleTags: ['crossbow', 'firearm'] },
  { id: 'mira', name: 'Mira', compatibility: 'Arma de disparo ou arma de fogo', effect: 'Concede +1 no teste de ataque contra alvos distantes.', compatibleTags: ['ranged', 'firearm'] },
  { id: 'silenciador', name: 'Silenciador', compatibility: 'Arma de fogo compatível', effect: 'Reduz o ruído dos disparos e dificulta que a posição do usuário seja identificada. (+2 no teste de furtividade após atirar)', compatibleTags: ['silencer-compatible'] },
  { id: 'cano-reforcado', name: 'Cano Reforçado', compatibility: 'Arma de fogo', effect: 'Concede +1 de dano.', compatibleTags: ['firearm'] },
  { id: 'carregador-ampliado', name: 'Carregador Ampliado', compatibility: 'Arma de fogo compatível', effect: 'Aumenta em 50% a quantidade de disparos realizados antes de uma recarga.', compatibleTags: ['magazine-compatible'] },
  { id: 'reforco-interno', name: 'Reforço Interno', compatibility: 'Proteção leve ou pesada', effect: 'Concede +1 de Defesa.', compatibleTags: ['protection-light', 'protection-heavy'] },
  { id: 'ajuste-flexivel', name: 'Ajuste Flexível', compatibility: 'Proteção leve', effect: 'Concede +1 em testes de Reflexos.', compatibleTags: ['protection-light'] },
  { id: 'bolsos-adicionais', name: 'Bolsos Adicionais', compatibility: 'Proteção leve ou pesada', effect: 'Concede +1 espaço no inventário.', compatibleTags: ['protection-light', 'protection-heavy'] },
  { id: 'revestimento-filtrante', name: 'Revestimento Filtrante', compatibility: 'Proteção leve ou pesada', effect: 'Concede +2 em testes de Vigor contra fumaça, gases e substâncias inaláveis.', compatibleTags: ['protection-light', 'protection-heavy'] },
  { id: 'borda-reforcada', name: 'Borda Reforçada', compatibility: 'Escudo', effect: 'Aumenta de +2 para +3 o bônus recebido no contra-ataque do escudo.', compatibleTags: ['shield'] }
];

const EQUIPMENT_MODIFICATION_BY_ID = new Map(
  EQUIPMENT_MODIFICATION_CATALOG.map(modification => [modification.id, modification])
);
const MAX_EQUIPMENT_CATALOG_MODIFICATIONS = 2;

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

function createEffectSourceChoice(title, description, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'effect-source-choice';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const summary = document.createElement('span');
  summary.textContent = description;
  button.append(heading, summary);
  button.addEventListener('click', onClick);
  return button;
}

function openEffectAdditionMenu() {
  const content = document.createElement('div');
  content.className = 'effect-source-menu';
  const introduction = document.createElement('p');
  introduction.textContent = 'Escolha como deseja adicionar o efeito ao personagem.';
  const choices = document.createElement('div');
  choices.className = 'effect-source-options';
  choices.append(
    createEffectSourceChoice('Condições', 'Selecionar uma Condição oficial.', () => openConditionCatalog()),
    createEffectSourceChoice('Efeito personalizado', 'Criar um efeito livre com suas próprias informações.', () => openActiveEffectForm())
  );
  content.append(introduction, choices);

  openModal({
    title: 'Adicionar efeito',
    content,
    actions: [{ label: 'Cancelar', className: 'secondary', spanAll: true }]
  });
  requestAnimationFrame(() => choices.querySelector('button')?.focus());
}

function filterConditionCatalog(catalog, query) {
  const normalizedQuery = normalizeFilterText(query);
  let visibleConditions = 0;

  catalog.querySelectorAll('.condition-category').forEach(section => {
    let visibleInCategory = 0;
    section.querySelectorAll('[data-condition-id]').forEach(button => {
      const matches = !normalizedQuery || button.dataset.conditionSearch.includes(normalizedQuery);
      button.hidden = !matches;
      if (matches) visibleInCategory += 1;
    });
    section.hidden = visibleInCategory === 0;
    visibleConditions += visibleInCategory;
  });

  const emptyState = catalog.querySelector('.condition-search-empty');
  if (emptyState) emptyState.hidden = visibleConditions > 0;
  return visibleConditions;
}

function createConditionCatalogContent() {
  const catalog = document.createElement('div');
  catalog.className = 'condition-catalog';
  const introduction = document.createElement('p');
  introduction.className = 'condition-catalog-introduction';
  introduction.textContent = 'Selecione uma Condição para visualizar seus dados antes de adicioná-la.';
  const search = document.createElement('label');
  search.className = 'condition-search';
  const searchLabel = document.createElement('span');
  searchLabel.className = 'sr-only';
  searchLabel.textContent = 'Pesquisar condição por nome ou descrição';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Pesquisar condição...';
  searchInput.autocomplete = 'off';
  searchInput.setAttribute('aria-label', 'Pesquisar condição por nome ou descrição');
  searchInput.addEventListener('input', () => filterConditionCatalog(catalog, searchInput.value));
  search.append(searchLabel, searchInput);
  const repetitionNote = document.createElement('p');
  repetitionNote.className = 'condition-catalog-note';
  repetitionNote.textContent = CONDITION_REPETITION_RULE;
  catalog.append(introduction, search, repetitionNote);

  CONDITION_CATALOG.forEach(category => {
    const section = document.createElement('section');
    section.className = 'condition-category';
    const heading = document.createElement('h3');
    heading.textContent = category.label;
    const list = document.createElement('div');
    list.className = 'condition-category-list';
    category.conditions.forEach(condition => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'condition-catalog-item';
      button.dataset.conditionId = condition.id;
      button.dataset.conditionSearch = normalizeFilterText(`${condition.name} ${condition.description}`);
      button.textContent = condition.name;
      button.addEventListener('click', () => openConditionDetails(condition));
      list.appendChild(button);
    });
    section.append(heading, list);
    catalog.appendChild(section);
  });
  const emptyState = document.createElement('p');
  emptyState.className = 'condition-search-empty';
  emptyState.textContent = 'Nenhuma Condição encontrada.';
  emptyState.setAttribute('role', 'status');
  emptyState.hidden = true;
  catalog.appendChild(emptyState);
  return catalog;
}

function openConditionCatalog({ focusConditionId = '' } = {}) {
  const content = createConditionCatalogContent();
  openModal({
    title: 'Condições',
    content,
    actions: [
      { label: 'Voltar', className: 'secondary', close: false, onClick: openEffectAdditionMenu },
      { label: 'Cancelar', className: 'secondary', spanAll: true }
    ]
  });
  requestAnimationFrame(() => {
    const searchInput = content.querySelector('.condition-search input');
    const buttons = [...content.querySelectorAll('[data-condition-id]')];
    const target = buttons.find(button => button.dataset.conditionId === focusConditionId);
    if (target) target.focus();
    else searchInput?.focus();
  });
}

function createConditionDetailSection(labelText, contentText, className = '') {
  if (!contentText) return null;
  const section = document.createElement('section');
  section.className = `condition-detail-section${className ? ` ${className}` : ''}`;
  const label = document.createElement('h3');
  label.textContent = labelText;
  const content = document.createElement('p');
  content.textContent = contentText;
  section.append(label, content);
  return section;
}

function createConditionDetailContent(condition) {
  const detail = document.createElement('div');
  detail.className = 'condition-detail';
  const name = document.createElement('strong');
  name.className = 'condition-detail-name';
  name.textContent = condition.name;
  const description = document.createElement('p');
  description.className = 'condition-detail-description';
  description.textContent = condition.description;
  detail.append(name, description);
  [
    createConditionDetailSection('Efeito', condition.effect),
    createConditionDetailSection('Resistência', condition.resistance),
    createConditionDetailSection('Recuperação', condition.recovery),
    createConditionDetailSection('Observação', condition.note, 'condition-detail-note')
  ].filter(Boolean).forEach(section => detail.appendChild(section));
  return detail;
}

function buildOfficialConditionDescription(condition) {
  return [
    condition.description,
    `EFEITO\n${condition.effect}`,
    condition.resistance ? `RESISTÊNCIA\n${condition.resistance}` : '',
    condition.recovery ? `RECUPERAÇÃO\n${condition.recovery}` : '',
    condition.note ? `OBSERVAÇÃO\n${condition.note}` : ''
  ].filter(Boolean).join('\n\n');
}

function findActiveEffectByName(name) {
  const normalizedName = normalizeFilterText(name);
  return [...document.querySelectorAll('#listaEfeitosAtivos .active-effect-card')]
    .find(card => normalizeFilterText(card.dataset.effectName) === normalizedName) || null;
}

function commitOfficialCondition(condition) {
  if (isAddingOfficialCondition) return;
  isAddingOfficialCondition = true;
  try {
    const effect = {
      id: createActiveEffectId(),
      name: condition.name,
      type: 'negative',
      description: buildOfficialConditionDescription(condition),
      duration: ''
    };
    document.getElementById('listaEfeitosAtivos').appendChild(createActiveEffectCard(effect));
    setActiveEffectsExpanded(true);
    updateActiveEffectsSummary();
    scheduleSave();
    closeModal();
    showNotification(`${condition.name} foi adicionado aos Efeitos Ativos.`);
  } finally {
    requestAnimationFrame(() => {
      isAddingOfficialCondition = false;
    });
  }
}

function openRepeatedConditionWarning(condition, existingCard) {
  openModal({
    title: 'Condição já ativa',
    content: createModalContent(`“${condition.name}” já está ativo.`, CONDITION_REPETITION_RULE),
    actions: [
      {
        label: 'Editar existente',
        close: false,
        onClick: () => openActiveEffectForm(existingCard)
      },
      {
        label: 'Adicionar mesmo assim',
        className: 'secondary',
        close: false,
        onClick: () => commitOfficialCondition(condition)
      },
      { label: 'Cancelar', className: 'secondary' }
    ]
  });
}

function requestOfficialConditionAddition(condition) {
  const existingCard = findActiveEffectByName(condition.name);
  if (existingCard) {
    openRepeatedConditionWarning(condition, existingCard);
    return;
  }
  commitOfficialCondition(condition);
}

function openConditionDetails(condition) {
  openModal({
    title: 'Detalhes da Condição',
    content: createConditionDetailContent(condition),
    actions: [
      {
        label: 'Voltar',
        className: 'secondary',
        close: false,
        onClick: () => openConditionCatalog({ focusConditionId: condition.id })
      },
      {
        label: 'Adicionar',
        close: false,
        onClick: () => requestOfficialConditionAddition(condition)
      }
    ]
  });
}

function getEquipmentCatalogGroup(groupId) {
  return EQUIPMENT_CATALOG_GROUPS.find(group => group.id === groupId) || null;
}

function isEquipmentModifiable(equipment) {
  return equipment?.kind === 'weapon' || equipment?.kind === 'protection';
}

function isEquipmentModificationCompatible(equipment, modification) {
  if (!equipment || !modification || !isEquipmentModifiable(equipment)) return false;
  const tags = new Set(equipment.tags || []);
  return modification.compatibleTags.some(tag => tags.has(tag));
}

function isCustomEquipmentCard(card) {
  return card?.dataset.equipmentKind === 'custom'
    || !EQUIPMENT_CATALOG_BY_ID.has(card?.dataset.catalogId);
}

function canEquipmentCardUseCatalogModifications(card) {
  if (isCustomEquipmentCard(card)) return true;
  return isEquipmentModifiable(EQUIPMENT_CATALOG_BY_ID.get(card?.dataset.catalogId));
}

function isEquipmentModificationAllowedForCard(card, modification) {
  if (!modification) return false;
  if (isCustomEquipmentCard(card)) return true;
  return isEquipmentModificationCompatible(
    EQUIPMENT_CATALOG_BY_ID.get(card?.dataset.catalogId),
    modification
  );
}

function normalizeEquipmentCatalogModificationIds(
  catalogId,
  value,
  { allowAnyKnownModification = false } = {}
) {
  const equipment = EQUIPMENT_CATALOG_BY_ID.get(catalogId);
  if ((!equipment && !allowAnyKnownModification) || !Array.isArray(value)) return [];
  const normalized = [];
  value.forEach(modificationId => {
    if (typeof modificationId !== 'string' || normalized.length >= MAX_EQUIPMENT_CATALOG_MODIFICATIONS) return;
    const modification = EQUIPMENT_MODIFICATION_BY_ID.get(modificationId);
    if (!modification || normalized.includes(modificationId)) return;
    if (equipment && !isEquipmentModificationCompatible(equipment, modification)) return;
    normalized.push(modificationId);
  });
  return normalized;
}

function createEquipmentCatalogButton(equipment, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'condition-catalog-item equipment-catalog-item';
  button.dataset.equipmentCatalogId = equipment.id;
  const name = document.createElement('strong');
  name.textContent = equipment.name;
  const meta = document.createElement('span');
  meta.textContent = equipment.damage || equipment.bonus || equipment.category;
  button.append(name, meta);
  button.addEventListener('click', onClick);
  return button;
}

function openEquipmentAdditionMenu() {
  const content = document.createElement('div');
  content.className = 'effect-source-menu equipment-source-menu';
  const introduction = document.createElement('p');
  introduction.textContent = 'Escolha como deseja adicionar o equipamento ao Inventário.';
  const choices = document.createElement('div');
  choices.className = 'effect-source-options equipment-source-options';
  choices.append(
    createEffectSourceChoice('Armas', 'Corpo a Corpo, Disparo e Armas de Fogo.', openWeaponCatalogMenu),
    createEffectSourceChoice('Proteções', 'Proteção Leve, Proteção Pesada e Escudo.', () => openEquipmentCatalogGroup('protections')),
    createEffectSourceChoice('Itens Gerais', 'Ferramentas e equipamentos para missões.', () => openEquipmentCatalogGroup('general-items')),
    createEffectSourceChoice('Item Personalizado', 'Criar um equipamento livre com os campos atuais.', addCustomEquipmentFromMenu)
  );
  content.append(introduction, choices);
  openModal({
    title: 'Adicionar equipamento',
    content,
    actions: [{ label: 'Cancelar', className: 'secondary', spanAll: true }]
  });
  requestAnimationFrame(() => choices.querySelector('button')?.focus());
}

function openWeaponCatalogMenu() {
  const content = document.createElement('div');
  content.className = 'effect-source-menu equipment-source-menu';
  const introduction = document.createElement('p');
  introduction.textContent = 'Selecione a categoria da arma.';
  const choices = document.createElement('div');
  choices.className = 'effect-source-options equipment-source-options';
  EQUIPMENT_CATALOG_GROUPS.filter(group => group.section === 'weapons').forEach(group => {
    choices.appendChild(createEffectSourceChoice(
      group.label,
      `${group.items.length} equipamento${group.items.length === 1 ? '' : 's'}.`,
      () => openEquipmentCatalogGroup(group.id)
    ));
  });
  content.append(introduction, choices);
  openModal({
    title: 'Armas',
    content,
    actions: [
      { label: 'Voltar', className: 'secondary', close: false, onClick: openEquipmentAdditionMenu },
      { label: 'Cancelar', className: 'secondary' }
    ]
  });
  requestAnimationFrame(() => choices.querySelector('button')?.focus());
}

function createEquipmentCatalogGroupContent(group) {
  const catalog = document.createElement('div');
  catalog.className = 'condition-catalog equipment-catalog';
  const introduction = document.createElement('p');
  introduction.className = 'condition-catalog-introduction';
  introduction.textContent = 'Selecione um equipamento para visualizar seus dados antes de adicioná-lo.';
  const section = document.createElement('section');
  section.className = 'condition-category equipment-category';
  const heading = document.createElement('h3');
  heading.textContent = group.label;
  const list = document.createElement('div');
  list.className = 'condition-category-list equipment-catalog-list';
  group.items.forEach(equipment => {
    list.appendChild(createEquipmentCatalogButton(
      equipment,
      () => openEquipmentDetails(equipment, group.id)
    ));
  });
  section.append(heading, list);
  catalog.append(introduction, section);
  return catalog;
}

function openEquipmentCatalogGroup(groupId, { focusEquipmentId = '' } = {}) {
  const group = getEquipmentCatalogGroup(groupId);
  if (!group) return;
  const content = createEquipmentCatalogGroupContent(group);
  openModal({
    title: group.label,
    content,
    actions: [
      {
        label: 'Voltar',
        className: 'secondary',
        close: false,
        onClick: group.section === 'weapons' ? openWeaponCatalogMenu : openEquipmentAdditionMenu
      },
      { label: 'Cancelar', className: 'secondary' }
    ]
  });
  requestAnimationFrame(() => {
    const buttons = [...content.querySelectorAll('[data-equipment-catalog-id]')];
    const target = buttons.find(button => button.dataset.equipmentCatalogId === focusEquipmentId) || buttons[0];
    target?.focus();
  });
}

function createEquipmentDetailContent(equipment) {
  const detail = document.createElement('div');
  detail.className = 'condition-detail equipment-detail';
  const name = document.createElement('strong');
  name.className = 'condition-detail-name';
  name.textContent = equipment.name;
  detail.appendChild(name);
  [
    createConditionDetailSection('Categoria', equipment.category),
    createConditionDetailSection('Dano', equipment.damage),
    createConditionDetailSection('Bônus', equipment.bonus),
    createConditionDetailSection('Efeito', equipment.effect),
    createConditionDetailSection(equipment.ruleLabel || 'Regra adicional', equipment.rule, 'condition-detail-note')
  ].filter(Boolean).forEach(section => detail.appendChild(section));
  return detail;
}

function openEquipmentDetails(equipment, groupId) {
  openModal({
    title: 'Detalhes do equipamento',
    content: createEquipmentDetailContent(equipment),
    actions: [
      {
        label: 'Voltar',
        className: 'secondary',
        close: false,
        onClick: () => openEquipmentCatalogGroup(groupId, { focusEquipmentId: equipment.id })
      },
      {
        label: 'Adicionar',
        close: false,
        onClick: () => addOfficialEquipment(equipment)
      }
    ]
  });
}

function buildOfficialEquipmentDescription(equipment) {
  return [
    equipment.bonus ? `BÔNUS\n${equipment.bonus}` : '',
    equipment.effect ? `EFEITO\n${equipment.effect}` : '',
    equipment.rule ? `${String(equipment.ruleLabel || 'REGRA ADICIONAL').toLocaleUpperCase('pt-BR')}\n${equipment.rule}` : ''
  ].filter(Boolean).join('\n\n');
}

function addOfficialEquipment(equipment) {
  if (isAddingOfficialEquipment) return;
  isAddingOfficialEquipment = true;
  try {
    const values = {
      nome: equipment.name,
      tipo: equipment.category,
      dano: equipment.damage || '',
      descricao: buildOfficialEquipmentDescription(equipment),
      catalogId: equipment.id
    };
    const card = addDynamicCard('listaEquipamentos', 'templateEquipamento', values, 'Novo equipamento');
    scheduleSave();
    closeModal();
    showNotification(`${equipment.name} foi adicionado ao Inventário.`);
    requestAnimationFrame(() => card.scrollIntoView({
      block: 'nearest',
      behavior: prefersReducedViewMotion() ? 'auto' : 'smooth'
    }));
  } finally {
    requestAnimationFrame(() => {
      isAddingOfficialEquipment = false;
    });
  }
}

function addCustomEquipmentFromMenu() {
  const card = addDynamicCard('listaEquipamentos', 'templateEquipamento', {}, 'Novo equipamento');
  scheduleSave();
  closeModal();
  requestAnimationFrame(() => card.querySelector('[data-field="nome"]')?.focus());
}

function getEquipmentCatalogModifications(card) {
  return [...(equipmentCatalogModificationsByCard.get(card) || [])];
}

function setEquipmentCatalogModifications(card, modificationIds) {
  const normalized = normalizeEquipmentCatalogModificationIds(
    card.dataset.catalogId,
    modificationIds,
    { allowAnyKnownModification: isCustomEquipmentCard(card) }
  );
  equipmentCatalogModificationsByCard.set(card, normalized);
  return normalized;
}

function renderEquipmentCatalogModifications(card) {
  const panel = card.querySelector('.equipment-catalog-modifications');
  if (!panel) return;
  const equipment = EQUIPMENT_CATALOG_BY_ID.get(card.dataset.catalogId);
  const isModifiable = canEquipmentCardUseCatalogModifications(card);
  panel.hidden = !isModifiable;
  if (!isModifiable) {
    card.dataset.modificationCount = '0';
    return;
  }

  const installedIds = getEquipmentCatalogModifications(card);
  card.dataset.modificationCount = String(installedIds.length);
  const count = panel.querySelector('.equipment-modifications-count');
  const empty = panel.querySelector('.equipment-modifications-empty');
  const list = panel.querySelector('.equipment-modifications-list');
  const addButton = panel.querySelector('.equipment-add-modification');
  count.textContent = `${installedIds.length} / ${MAX_EQUIPMENT_CATALOG_MODIFICATIONS}`;
  empty.hidden = installedIds.length > 0;
  list.replaceChildren();

  installedIds.forEach(modificationId => {
    const modification = EQUIPMENT_MODIFICATION_BY_ID.get(modificationId);
    if (!modification) return;
    const row = document.createElement('div');
    row.className = 'equipment-modification-row';
    const information = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = modification.name;
    const effect = document.createElement('small');
    effect.textContent = modification.effect;
    information.append(name, effect);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn secondary equipment-remove-modification';
    remove.textContent = 'Remover';
    remove.setAttribute('aria-label', `Remover ${modification.name}`);
    remove.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      setEquipmentCatalogModifications(card, installedIds.filter(id => id !== modificationId));
      renderEquipmentCatalogModifications(card);
      scheduleSave();
    });
    row.append(information, remove);
    list.appendChild(row);
  });

  const atLimit = installedIds.length >= MAX_EQUIPMENT_CATALOG_MODIFICATIONS;
  addButton.disabled = atLimit;
  addButton.textContent = atLimit ? 'Limite de modificações atingido' : '+ Adicionar modificação';
  addButton.setAttribute('aria-label', atLimit
    ? `Limite de ${MAX_EQUIPMENT_CATALOG_MODIFICATIONS} modificações atingido`
    : `Adicionar modificação a ${getCardFieldValue(card, 'nome') || equipment?.name || 'item personalizado'}`);
  updateCardSummary(card, 'Novo equipamento');
}

function initializeEquipmentCatalogCard(card, values) {
  const equipment = EQUIPMENT_CATALOG_BY_ID.get(values.catalogId);
  if (equipment) card.dataset.catalogId = equipment.id;
  card.dataset.equipmentKind = equipment?.kind || 'custom';
  setEquipmentCatalogModifications(card, values.catalogModifications);
  const addButton = card.querySelector('.equipment-add-modification');
  addButton?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openEquipmentModificationCatalog(card);
  });
  renderEquipmentCatalogModifications(card);
}

function createEquipmentModificationCatalogContent(card) {
  const equipment = EQUIPMENT_CATALOG_BY_ID.get(card.dataset.catalogId);
  const isCustom = isCustomEquipmentCard(card);
  const installedIds = getEquipmentCatalogModifications(card);
  const catalog = document.createElement('div');
  catalog.className = 'condition-catalog equipment-modification-catalog';
  const introduction = document.createElement('p');
  introduction.className = 'condition-catalog-introduction';
  const equipmentName = getCardFieldValue(card, 'nome') || equipment?.name || 'este item personalizado';
  introduction.textContent = isCustom
    ? `Escolha livremente as modificações adequadas a ${equipmentName}.`
    : `Modificações compatíveis com ${equipmentName}.`;
  const list = document.createElement('div');
  list.className = 'condition-category-list equipment-catalog-list';
  EQUIPMENT_MODIFICATION_CATALOG.filter(modification => (
    isEquipmentModificationAllowedForCard(card, modification)
  )).forEach(modification => {
    const installed = installedIds.includes(modification.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'condition-catalog-item equipment-catalog-item';
    button.dataset.equipmentModificationId = modification.id;
    button.disabled = installed;
    const name = document.createElement('strong');
    name.textContent = modification.name;
    const meta = document.createElement('span');
    meta.textContent = installed ? 'Instalada' : modification.compatibility;
    button.append(name, meta);
    button.addEventListener('click', () => openEquipmentModificationDetails(card, modification));
    list.appendChild(button);
  });
  catalog.append(introduction, list);
  return catalog;
}

function openEquipmentModificationCatalog(card, { focusModificationId = '' } = {}) {
  if (!card?.isConnected) return;
  const installedIds = getEquipmentCatalogModifications(card);
  if (installedIds.length >= MAX_EQUIPMENT_CATALOG_MODIFICATIONS) {
    showNotification('Este equipamento já possui duas modificações.', 'warning');
    return;
  }
  const content = createEquipmentModificationCatalogContent(card);
  openModal({
    title: isCustomEquipmentCard(card) ? 'Modificações disponíveis' : 'Modificações compatíveis',
    content,
    actions: [{ label: 'Cancelar', className: 'secondary', spanAll: true }]
  });
  requestAnimationFrame(() => {
    const buttons = [...content.querySelectorAll('[data-equipment-modification-id]:not(:disabled)')];
    const target = buttons.find(button => button.dataset.equipmentModificationId === focusModificationId) || buttons[0];
    target?.focus();
  });
}

function createEquipmentModificationDetailContent(modification) {
  const detail = document.createElement('div');
  detail.className = 'condition-detail equipment-detail';
  const name = document.createElement('strong');
  name.className = 'condition-detail-name';
  name.textContent = modification.name;
  detail.append(
    name,
    createConditionDetailSection('Compatibilidade', modification.compatibility),
    createConditionDetailSection('Efeito', modification.effect)
  );
  return detail;
}

function openEquipmentModificationDetails(card, modification) {
  openModal({
    title: 'Detalhes da modificação',
    content: createEquipmentModificationDetailContent(modification),
    actions: [
      {
        label: 'Voltar',
        className: 'secondary',
        close: false,
        onClick: () => openEquipmentModificationCatalog(card, { focusModificationId: modification.id })
      },
      {
        label: 'Instalar',
        close: false,
        onClick: () => installEquipmentCatalogModification(card, modification.id)
      }
    ]
  });
}

function installEquipmentCatalogModification(card, modificationId) {
  if (!card?.isConnected) {
    closeModal();
    showNotification('O equipamento não está mais disponível.', 'error');
    return;
  }
  const equipment = EQUIPMENT_CATALOG_BY_ID.get(card.dataset.catalogId);
  const modification = EQUIPMENT_MODIFICATION_BY_ID.get(modificationId);
  const installedIds = getEquipmentCatalogModifications(card);
  if (!isEquipmentModificationAllowedForCard(card, modification)) {
    showNotification('Esta modificação não é compatível com o equipamento.', 'error');
    return;
  }
  if (installedIds.includes(modificationId)) {
    showNotification('Esta modificação já está instalada.', 'warning');
    return;
  }
  if (installedIds.length >= MAX_EQUIPMENT_CATALOG_MODIFICATIONS) {
    showNotification('Este equipamento já possui duas modificações.', 'warning');
    return;
  }
  setEquipmentCatalogModifications(card, [...installedIds, modificationId]);
  renderEquipmentCatalogModifications(card);
  scheduleSave();
  closeModal();
  showNotification(`${modification.name} foi instalada.`);
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
  document.getElementById('adicionarEfeito').addEventListener('click', openEffectAdditionMenu);
  document.getElementById('adicionarEfeitoExpandido').addEventListener('click', openEffectAdditionMenu);
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
      if (card.dataset.cardType === 'equipment' && field.dataset.field === 'nome') {
        renderEquipmentCatalogModifications(card);
      }
      if (card.dataset.cardType === 'manifestation') {
        setCardFeedback(card, '');
        updateManifestationUseState(card);
      }
      scheduleSave();
    });
  });

  if (card.dataset.cardType === 'equipment') initializeEquipmentCatalogCard(card, values);

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
    const officialEquipment = EQUIPMENT_CATALOG_BY_ID.get(card.dataset.catalogId);
    const modificationCount = Math.max(0, Number(card.dataset.modificationCount || 0));
    items = [
      createCardMetaItem('', getCardFieldValue(card, 'tipo') || officialEquipment?.category),
      createCardMetaItem('Dano', getCardFieldValue(card, 'dano') || officialEquipment?.damage),
      createCardMetaItem('', officialEquipment?.bonus),
      createCardMetaItem('Alcance', getCardFieldValue(card, 'alcance')),
      createCardMetaItem('Munição', getCardFieldValue(card, 'municao')),
      createCardMetaItem('', modificationCount ? `${modificationCount} mod.` : '')
    ];
  } else if (card.dataset.cardType === 'ability') {
    items = [
      createCardMetaItem('', getCardFieldValue(card, 'nivel') ? `Nível ${getCardFieldValue(card, 'nivel')}` : ''),
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
        updateResonanceThreshold();
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
      if (id === 'pvTemporarios') {
        element.value = Math.max(0, Number(element.value || 0));
        updateResourceUI('pvAtual');
      }

      if (id === 'nivel') {
        element.value = integerBetween(element.value, 1, 11);
        element.dataset.lastValidValue = element.value;
        const normalizedAttributeIds = normalizeAttributesForLevel();
        updateAttributePointsUI(normalizedAttributeIds.length
          ? 'Ao sair do nível 11, atributos acima de 5 foram ajustados ao limite atual.'
          : '');
        if (normalizedAttributeIds.includes('agilidade')) recalculateDefense();
        updateResonanceThreshold();
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

function setCharacterUtilitiesExpanded(expanded) {
  const content = document.getElementById('characterUtilityExpanded');
  const toggle = document.getElementById('alternarFerramentasPersonagem');
  if (!content || !toggle) return;

  const shouldReturnFocus = !expanded && content.contains(document.activeElement);
  content.hidden = !expanded;
  toggle.textContent = expanded ? '⌃' : '⌄';
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.setAttribute('aria-label', expanded ? 'Recolher Controle de Combate' : 'Expandir Controle de Combate');
  if (shouldReturnFocus) toggle.focus();
}

function bindCharacterUtilities() {
  const toggle = document.getElementById('alternarFerramentasPersonagem');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    setCharacterUtilitiesExpanded(toggle.getAttribute('aria-expanded') !== 'true');
  });
  setCharacterUtilitiesExpanded(false);
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
  document.getElementById('adicionarEquipamento').addEventListener('click', openEquipmentAdditionMenu);

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
      setCharacterUtilitiesExpanded(true);

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
  if (Object.prototype.hasOwnProperty.call(normalized.fields, 'totalis')) {
    delete normalized.fields.totalis;
    corrections.push('O campo Totalis foi removido porque não faz mais parte da ficha.');
  }
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
    psMax: 'PS máximo'
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

  ['idade', 'pvAtual', 'pvMax', 'pvTemporarios', 'pnAtual', 'pnMax', 'psAtual', 'psMax']
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
      const additionalAllowedFields = [];
      if (listName === 'equipment') {
        additionalAllowedFields.push('catalogId', 'catalogModifications');
        if (item.catalogId !== undefined) {
          if (typeof item.catalogId === 'string' && EQUIPMENT_CATALOG_BY_ID.has(item.catalogId)) {
            cleanItem.catalogId = item.catalogId;
          } else {
            corrections.push(`A origem oficial do equipamento ${index + 1} não era reconhecida e foi removida.`);
          }
        }
        if (item.catalogModifications !== undefined) {
          if (!Array.isArray(item.catalogModifications)) {
            corrections.push(`As modificações estruturadas do equipamento ${index + 1} foram ajustadas.`);
          } else {
            const normalizedModificationIds = normalizeEquipmentCatalogModificationIds(
              cleanItem.catalogId,
              item.catalogModifications,
              { allowAnyKnownModification: !cleanItem.catalogId }
            );
            if (JSON.stringify(normalizedModificationIds) !== JSON.stringify(item.catalogModifications)) {
              corrections.push(cleanItem.catalogId
                ? `As modificações do equipamento ${index + 1} foram ajustadas às regras de compatibilidade e limite.`
                : `As modificações do item personalizado ${index + 1} foram ajustadas ao catálogo e ao limite.`);
            }
            if (normalizedModificationIds.length) cleanItem.catalogModifications = normalizedModificationIds;
          }
        }
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
      const removedFields = Object.keys(item).filter(field => ![
        ...allowedFields,
        ...additionalAllowedFields,
        'favorite'
      ].includes(field));
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
    // Presentation only: keep imported schemaVersion and storage identifiers unchanged.
    ['Versão', String(validation.summary.version).replace(/pr[eé][\s_-]*alpha/gi, 'Alpha')]
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
    'Os históricos de rolagens serão preservados. A exportação da ficha não inclui esses históricos.',
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
      content: (() => {
        const preview = createImportPreview(validation);
        const notice = document.createElement('p');
        notice.textContent = 'Importar sobre esta ficha mantém sua identidade, seus vínculos e o histórico de rolagens já existente. Para outra identidade, importe pelo gerenciador.';
        preview.append(notice); return preview;
      })(),
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
  bindQuickDice();
  buildSkills();
  bindSkillFilters();
  bindSimpleFields();
  bindAttributeControls();
  bindCharacterUtilities();
  bindResourceAdjuster();
  bindDynamicButtons();
  bindFavoriteFilters();
  bindActiveEffects();
  bindNotes();
  bindMobileNavigation();
  bindMobileResourceBar();
  bindContentNavigation();
  bindHeaderActions();
  bindChronicles();
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
