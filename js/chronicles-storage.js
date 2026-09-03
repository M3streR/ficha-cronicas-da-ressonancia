(function initializeChroniclesStorage(global) {
'use strict';

  const DATABASE_NAME = 'cronicasRessonanciaChronicles';
  const DATABASE_VERSION = 6;
  const CHRONICLES_STORE = 'chronicles';
  const COVERS_STORE = 'chronicleCovers';
  const CAST_LINKS_STORE = 'chronicleCastLinks';
  const PARTICIPANTS_STORE = 'chronicleParticipants';
  const CONFRONTATIONS_STORE = 'chronicleConfrontations';
  const COMBAT_LINKS_STORE = 'confrontationCharacterLinks';
  const ADVERSARIES_STORE = 'confrontationAdversaries';
  const MASTER_NOTES_STORE = 'chronicleMasterNotes';
  const ROLLS = 'rollRecords', CHARACTER_ROLLS = 'characterRollLinks', CHRONICLE_ROLLS = 'chronicleRollLinks';
  const MASTER_ACCESS = 'chronicleMasterAccess', INVESTIGATION = 'chronicleInvestigationEntries', JOURNAL = 'chronicleJournalEntries';
  const HISTORY_STORES = [ROLLS, CHARACTER_ROLLS, CHRONICLE_ROLLS];
  const RECORD_SCHEMA_VERSION = 1;
  const MAX_COVER_BYTES = 450 * 1024;
  const ALLOWED_TYPES = new Set(['campaign', 'oneshot']);

  let databasePromise;

  function requestAsPromise(request) {
    return new Promise((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error || new Error('INDEXEDDB_REQUEST_FAILED')), { once: true });
    });
  }

  function transactionAsPromise(transaction) {
    return new Promise((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true });
      transaction.addEventListener('abort', () => reject(transaction.error || new Error('INDEXEDDB_TRANSACTION_ABORTED')), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error || new Error('INDEXEDDB_TRANSACTION_FAILED')), { once: true });
    });
  }

  function openDatabase() {
    if (!('indexedDB' in global)) return Promise.reject(new Error('INDEXEDDB_UNAVAILABLE'));
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
      const request = global.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      let wasBlocked = false;

      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(CHRONICLES_STORE)) {
          const chronicles = database.createObjectStore(CHRONICLES_STORE, { keyPath: 'id' });
          chronicles.createIndex('createdAt', 'createdAt', { unique: false });
          chronicles.createIndex('updatedAt', 'updatedAt', { unique: false });
          chronicles.createIndex('type', 'type', { unique: false });
        }
        if (!database.objectStoreNames.contains(COVERS_STORE)) {
          database.createObjectStore(COVERS_STORE, { keyPath: 'chronicleId' });
        }
        if (!database.objectStoreNames.contains(CAST_LINKS_STORE)) {
          const castLinks = database.createObjectStore(CAST_LINKS_STORE, {
            keyPath: ['chronicleId', 'characterId']
          });
          castLinks.createIndex('chronicleId', 'chronicleId', { unique: false });
          castLinks.createIndex('characterId', 'characterId', { unique: false });
        }
        if (!database.objectStoreNames.contains(PARTICIPANTS_STORE)) {
          const participants = database.createObjectStore(PARTICIPANTS_STORE, { keyPath: 'id' });
          participants.createIndex('chronicleId', 'chronicleId', { unique: false });
        }
        if (!database.objectStoreNames.contains(CONFRONTATIONS_STORE)) {
          database.createObjectStore(CONFRONTATIONS_STORE, { keyPath: 'id' })
            .createIndex('chronicleId', 'chronicleId', { unique: false });
        }
        if (!database.objectStoreNames.contains(COMBAT_LINKS_STORE)) {
          database.createObjectStore(COMBAT_LINKS_STORE, { keyPath: ['confrontationId', 'characterId'] })
            .createIndex('confrontationId', 'confrontationId', { unique: false });
        }
        if (!database.objectStoreNames.contains(ADVERSARIES_STORE)) {
          database.createObjectStore(ADVERSARIES_STORE, { keyPath: 'id' })
            .createIndex('confrontationId', 'confrontationId', { unique: false });
        }
        if (!database.objectStoreNames.contains(MASTER_NOTES_STORE)) {
          database.createObjectStore(MASTER_NOTES_STORE, { keyPath: 'chronicleId' });
        }
        if (!database.objectStoreNames.contains(ROLLS)) database.createObjectStore(ROLLS, { keyPath: 'id' });
        for (const [name, owner] of [[CHARACTER_ROLLS, 'characterId'], [CHRONICLE_ROLLS, 'chronicleId']]) {
          if (database.objectStoreNames.contains(name)) continue;
          const store = database.createObjectStore(name, { keyPath: [owner, 'rollId'] });
          store.createIndex('owner', owner);
          store.createIndex('chronology', [owner, 'createdAt', 'rollId']);
          store.createIndex('rollId', 'rollId');
        }
        if (!database.objectStoreNames.contains(MASTER_ACCESS)) database.createObjectStore(MASTER_ACCESS, { keyPath: 'chronicleId' });
        for (const name of [INVESTIGATION, JOURNAL]) {
          if (!database.objectStoreNames.contains(name)) {
            const store = database.createObjectStore(name, { keyPath: 'id' });
            store.createIndex('chronicleId', 'chronicleId');
            store.createIndex('chronology', ['chronicleId', 'createdAt', 'id']);
          }
        }
      });

      request.addEventListener('success', () => {
        const database = request.result;
        if (wasBlocked) {
          database.close();
          return;
        }
        database.addEventListener('versionchange', () => {
          database.close();
          databasePromise = undefined;
        });
        resolve(database);
      }, { once: true });

      request.addEventListener('blocked', () => {
        wasBlocked = true;
        databasePromise = undefined;
        reject(new Error('INDEXEDDB_UPGRADE_BLOCKED'));
      }, { once: true });

      request.addEventListener('error', () => {
        databasePromise = undefined;
        reject(request.error || new Error('INDEXEDDB_OPEN_FAILED'));
      }, { once: true });
    });

    return databasePromise;
  }

  function createChronicleId() {
    if (typeof global.crypto?.randomUUID === 'function') return global.crypto.randomUUID();
    if (typeof global.crypto?.getRandomValues !== 'function') throw new Error('SECURE_RANDOM_UNAVAILABLE');
    const bytes = new Uint8Array(16);
    global.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
  }

  function normalizeStoredChronicle(record) {
    if (!record || typeof record !== 'object') return null;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const type = typeof record.type === 'string' ? record.type : '';
    if (!id || !name || !ALLOWED_TYPES.has(type)) return null;

    const createdAt = Number.isFinite(Date.parse(record.createdAt))
      ? new Date(record.createdAt).toISOString()
      : new Date(0).toISOString();
    const updatedAt = Number.isFinite(Date.parse(record.updatedAt))
      ? new Date(record.updatedAt).toISOString()
      : createdAt;

    return {
      id,
      schemaVersion: RECORD_SCHEMA_VERSION,
      name,
      synopsis: typeof record.synopsis === 'string' ? record.synopsis : '',
      type,
      hasCover: record.hasCover === true,
      createdAt,
      updatedAt
    };
  }

  function normalizeCover(cover) {
    if (!cover) return null;
    if (!(cover.blob instanceof Blob) || !cover.blob.type.startsWith('image/')) {
      throw new TypeError('INVALID_CHRONICLE_COVER');
    }
    if (!cover.blob.size || cover.blob.size > MAX_COVER_BYTES) {
      throw new RangeError('CHRONICLE_COVER_TOO_LARGE');
    }
    const width = Number.parseInt(cover.width, 10);
    const height = Number.parseInt(cover.height, 10);
    if (!Number.isFinite(width) || width < 1 || !Number.isFinite(height) || height < 1) {
      throw new TypeError('INVALID_CHRONICLE_COVER_DIMENSIONS');
    }
    return {
      blob: cover.blob,
      mimeType: cover.blob.type,
      width,
      height
    };
  }

  function normalizeChronicleFields(input) {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const synopsis = typeof input?.synopsis === 'string' ? input.synopsis.trim() : '';
    const type = typeof input?.type === 'string' ? input.type : '';
    if (!name || name.length > 120) throw new TypeError('INVALID_CHRONICLE_NAME');
    if (synopsis.length > 1200) throw new TypeError('INVALID_CHRONICLE_SYNOPSIS');
    if (!ALLOWED_TYPES.has(type)) throw new TypeError('INVALID_CHRONICLE_TYPE');
    return { name, synopsis, type };
  }

  function normalizeCharacterIds(characterIds) {
    if (!Array.isArray(characterIds)) throw new TypeError('INVALID_CHRONICLE_CAST');
    const normalizedIds = [];
    const knownIds = new Set();
    for (const value of characterIds) {
      const id = typeof value === 'string' ? value.trim() : '';
      if (!/^[a-zA-Z0-9_-]{12,128}$/.test(id)) {
        throw new TypeError('INVALID_CHRONICLE_CAST_CHARACTER_ID');
      }
      if (!knownIds.has(id)) {
        knownIds.add(id);
        normalizedIds.push(id);
      }
    }
    return normalizedIds;
  }

  function abortTransaction(transaction) {
    try {
      transaction.abort();
    } catch (_error) {
      // A transação pode já ter sido abortada pelo próprio IndexedDB.
    }
  }

  async function createChronicle(input) {
    const { name, synopsis, type } = normalizeChronicleFields(input);

    const normalizedCover = normalizeCover(input.cover);
    const timestamp = new Date().toISOString();
    const record = {
      id: createChronicleId(),
      schemaVersion: RECORD_SCHEMA_VERSION,
      name,
      synopsis,
      type,
      hasCover: Boolean(normalizedCover),
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const database = await openDatabase();
    const transaction = database.transaction([CHRONICLES_STORE, COVERS_STORE], 'readwrite');
    transaction.objectStore(CHRONICLES_STORE).add(record);
    if (normalizedCover) {
      transaction.objectStore(COVERS_STORE).add({
        chronicleId: record.id,
        ...normalizedCover,
        updatedAt: timestamp
      });
    }
    await transactionAsPromise(transaction);
    return { ...record };
  }

  async function updateChronicle(chronicleId, input, options = {}) {
    const id = typeof chronicleId === 'string' ? chronicleId.trim() : '';
    if (!id) throw new TypeError('INVALID_CHRONICLE_ID');
    const { name, synopsis, type } = normalizeChronicleFields(input);
    const coverAction = options.coverAction || 'keep';
    if (!['keep', 'replace', 'remove'].includes(coverAction)) {
      throw new TypeError('INVALID_CHRONICLE_COVER_ACTION');
    }
    const normalizedCover = coverAction === 'replace' ? normalizeCover(options.cover) : null;
    const expectedUpdatedAt = typeof options.expectedUpdatedAt === 'string'
      ? options.expectedUpdatedAt
      : '';

    const database = await openDatabase();
    const transaction = database.transaction([CHRONICLES_STORE, COVERS_STORE], 'readwrite');
    const completion = transactionAsPromise(transaction);
    const chronicles = transaction.objectStore(CHRONICLES_STORE);
    const covers = transaction.objectStore(COVERS_STORE);

    try {
      const [storedRecord, storedCover] = await Promise.all([
        requestAsPromise(chronicles.get(id)),
        requestAsPromise(covers.get(id))
      ]);
      const current = normalizeStoredChronicle(storedRecord);
      if (!storedRecord) throw new Error('CHRONICLE_NOT_FOUND');
      if (!current) throw new Error('CHRONICLE_INVALID_RECORD');
      if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) {
        throw new Error('CHRONICLE_UPDATE_CONFLICT');
      }

      const timestamp = new Date(
        Math.max(Date.now(), Date.parse(current.updatedAt) + 1)
      ).toISOString();
      const storedCoverIsValid = Boolean(
        storedCover
        && storedCover.blob instanceof Blob
        && storedCover.blob.type.startsWith('image/')
      );
      let hasCover = storedCoverIsValid;

      if (coverAction === 'replace') {
        covers.put({
          chronicleId: id,
          ...normalizedCover,
          updatedAt: timestamp
        });
        hasCover = true;
      } else if (coverAction === 'remove') {
        covers.delete(id);
        hasCover = false;
      } else if (storedCover && !storedCoverIsValid) {
        covers.delete(id);
      }

      const updatedRecord = {
        id,
        schemaVersion: RECORD_SCHEMA_VERSION,
        name,
        synopsis,
        type,
        hasCover,
        createdAt: current.createdAt,
        updatedAt: timestamp
      };
      chronicles.put(updatedRecord);
      await completion;
      return { ...updatedRecord };
    } catch (error) {
      abortTransaction(transaction);
      try {
        await completion;
      } catch (_transactionError) {
        // O erro original descreve melhor a causa para a camada de interface.
      }
      throw error;
    }
  }

  async function deleteChronicle(chronicleId) {
    const id = typeof chronicleId === 'string' ? chronicleId.trim() : '';
    if (!id) throw new TypeError('INVALID_CHRONICLE_ID');

    const database = await openDatabase();
    const transaction = database.transaction([CHRONICLES_STORE, COVERS_STORE, CAST_LINKS_STORE, PARTICIPANTS_STORE,
      CONFRONTATIONS_STORE, COMBAT_LINKS_STORE, ADVERSARIES_STORE, MASTER_NOTES_STORE,
      MASTER_ACCESS, INVESTIGATION, JOURNAL, ...HISTORY_STORES], 'readwrite');
    const completion = transactionAsPromise(transaction);
    const chronicles = transaction.objectStore(CHRONICLES_STORE);
    const covers = transaction.objectStore(COVERS_STORE);
    const castLinks = transaction.objectStore(CAST_LINKS_STORE);
    const participants = transaction.objectStore(PARTICIPANTS_STORE);

    try {
      const storedRecord = await requestAsPromise(chronicles.get(id));
      const current = normalizeStoredChronicle(storedRecord);
      if (!storedRecord) throw new Error('CHRONICLE_NOT_FOUND');
      if (!current) throw new Error('CHRONICLE_INVALID_RECORD');
      const castLinkKeys = await requestAsPromise(castLinks.index('chronicleId').getAllKeys(id));
      const participantKeys = await requestAsPromise(participants.index('chronicleId').getAllKeys(id));
      const confrontationKeys = await requestAsPromise(transaction.objectStore(CONFRONTATIONS_STORE).index('chronicleId').getAllKeys(id));
      for (const confrontationId of confrontationKeys) await deleteConfrontationChildren(transaction, confrontationId);
      confrontationKeys.forEach(key => transaction.objectStore(CONFRONTATIONS_STORE).delete(key));
      chronicles.delete(id);
      covers.delete(id);
      transaction.objectStore(MASTER_NOTES_STORE).delete(id);
      transaction.objectStore(MASTER_ACCESS).delete(id);
      for (const name of [INVESTIGATION, JOURNAL]) {
        const store = transaction.objectStore(name);
        const keys = await requestAsPromise(store.index('chronicleId').getAllKeys(id));
        keys.forEach(key => store.delete(key));
      }
      await removeHistoryLinks(transaction, CHRONICLE_ROLLS, id);
      castLinkKeys.forEach(key => castLinks.delete(key));
      participantKeys.forEach(key => participants.delete(key));
      await completion;
      return current;
    } catch (error) {
      abortTransaction(transaction);
      try {
        await completion;
      } catch (_transactionError) {
        // O erro original descreve melhor a causa para a camada de interface.
      }
      throw error;
    }
  }

  async function listChronicles() {
    const database = await openDatabase();
    const transaction = database.transaction(CHRONICLES_STORE, 'readonly');
    const completion = transactionAsPromise(transaction);
    const records = await requestAsPromise(transaction.objectStore(CHRONICLES_STORE).getAll());
    await completion;
    return records
      .map(normalizeStoredChronicle)
      .filter(Boolean)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async function getChronicle(chronicleId) {
    const id = typeof chronicleId === 'string' ? chronicleId.trim() : '';
    if (!id) return null;
    const database = await openDatabase();
    const transaction = database.transaction(CHRONICLES_STORE, 'readonly');
    const completion = transactionAsPromise(transaction);
    const record = await requestAsPromise(transaction.objectStore(CHRONICLES_STORE).get(id));
    await completion;
    return normalizeStoredChronicle(record);
  }

  async function getChronicleCover(chronicleId) {
    const id = typeof chronicleId === 'string' ? chronicleId.trim() : '';
    if (!id) return null;
    const database = await openDatabase();
    const transaction = database.transaction(COVERS_STORE, 'readonly');
    const completion = transactionAsPromise(transaction);
    const record = await requestAsPromise(transaction.objectStore(COVERS_STORE).get(id));
    await completion;
    if (!record || !(record.blob instanceof Blob) || !record.blob.type.startsWith('image/')) return null;
    return {
      blob: record.blob,
      mimeType: typeof record.mimeType === 'string' ? record.mimeType : record.blob.type,
      width: Number.parseInt(record.width, 10) || 0,
      height: Number.parseInt(record.height, 10) || 0
    };
  }

  async function listChronicleCastIds(chronicleId) {
    const id = typeof chronicleId === 'string' ? chronicleId.trim() : '';
    if (!id) throw new TypeError('INVALID_CHRONICLE_ID');
    const database = await openDatabase();
    const transaction = database.transaction(CAST_LINKS_STORE, 'readonly');
    const completion = transactionAsPromise(transaction);
    const records = await requestAsPromise(
      transaction.objectStore(CAST_LINKS_STORE).index('chronicleId').getAll(id)
    );
    await completion;
    return normalizeCharacterIds(records.map(record => record?.characterId));
  }

  async function replaceChronicleCast(chronicleId, characterIds, options = {}) {
    const id = typeof chronicleId === 'string' ? chronicleId.trim() : '';
    if (!id) throw new TypeError('INVALID_CHRONICLE_ID');
    const normalizedIds = normalizeCharacterIds(characterIds);
    const expectedUpdatedAt = typeof options.expectedUpdatedAt === 'string'
      ? options.expectedUpdatedAt
      : '';

    const database = await openDatabase();
    const transaction = database.transaction([CHRONICLES_STORE, CAST_LINKS_STORE], 'readwrite');
    const completion = transactionAsPromise(transaction);
    const chronicles = transaction.objectStore(CHRONICLES_STORE);
    const castLinks = transaction.objectStore(CAST_LINKS_STORE);

    try {
      const [storedRecord, existingKeys] = await Promise.all([
        requestAsPromise(chronicles.get(id)),
        requestAsPromise(castLinks.index('chronicleId').getAllKeys(id))
      ]);
      const current = normalizeStoredChronicle(storedRecord);
      if (!storedRecord) throw new Error('CHRONICLE_NOT_FOUND');
      if (!current) throw new Error('CHRONICLE_INVALID_RECORD');
      if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) {
        throw new Error('CHRONICLE_UPDATE_CONFLICT');
      }

      const existingIds = new Set(existingKeys.map(key => key[1]));
      if (existingIds.size === normalizedIds.length && normalizedIds.every(characterId => existingIds.has(characterId))) {
        await completion;
        return { chronicle: { ...current }, characterIds: [...normalizedIds] };
      }

      existingKeys.forEach(key => castLinks.delete(key));
      normalizedIds.forEach(characterId => {
        castLinks.add({ chronicleId: id, characterId });
      });

      const updatedAt = new Date(
        Math.max(Date.now(), Date.parse(current.updatedAt) + 1)
      ).toISOString();
      const updatedChronicle = {
        ...current,
        updatedAt
      };
      chronicles.put(updatedChronicle);
      await completion;
      return {
        chronicle: { ...updatedChronicle },
        characterIds: [...normalizedIds]
      };
    } catch (error) {
      abortTransaction(transaction);
      try {
        await completion;
      } catch (_transactionError) {
        // O erro original descreve melhor a causa para a camada de interface.
      }
      throw error;
    }
  }

  function normalizeParticipantName(name) {
    const normalized = typeof name === 'string' ? name.trim() : '';
    if (!normalized || normalized.length > 120) throw new TypeError('INVALID_PARTICIPANT_NAME');
    return normalized;
  }

  function normalizeStoredParticipant(record) {
    if (!record || typeof record !== 'object') return null;
    if (typeof record.id !== 'string' || !/^[a-zA-Z0-9_-]{12,128}$/.test(record.id)) return null;
    if (typeof record.chronicleId !== 'string' || !record.chronicleId.trim()) return null;
    if (typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))) return null;
    if (typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt))) return null;
    try {
      return {
        id: record.id,
        chronicleId: record.chronicleId,
        name: normalizeParticipantName(record.name),
        createdAt: new Date(record.createdAt).toISOString(),
        updatedAt: new Date(record.updatedAt).toISOString()
      };
    } catch (_error) {
      return null;
    }
  }

  async function readChronicleParticipants(chronicleId, participantId) {
    const id = typeof chronicleId === 'string' ? chronicleId.trim() : '';
    if (!id) throw new TypeError('INVALID_CHRONICLE_ID');
    const database = await openDatabase();
    const transaction = database.transaction([CHRONICLES_STORE, PARTICIPANTS_STORE], 'readonly');
    const completion = transactionAsPromise(transaction);
    try {
      const store = transaction.objectStore(PARTICIPANTS_STORE);
      const [chronicle, records] = await Promise.all([
        requestAsPromise(transaction.objectStore(CHRONICLES_STORE).get(id)),
        requestAsPromise(participantId === undefined ? store.index('chronicleId').getAll(id) : store.get(participantId))
      ]);
      if (!chronicle) throw new Error('CHRONICLE_NOT_FOUND');
      if (!normalizeStoredChronicle(chronicle)) throw new Error('CHRONICLE_INVALID_RECORD');
      await completion;
      return records;
    } catch (error) {
      abortTransaction(transaction);
      try { await completion; } catch (_transactionError) { /* Preserve the original error. */ }
      throw error;
    }
  }

  async function listChronicleParticipants(chronicleId) {
    const records = await readChronicleParticipants(chronicleId);
    const participants = records.map(normalizeStoredParticipant).filter(Boolean);
    participants.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return { participants, invalidCount: records.length - participants.length };
  }

  async function getChronicleParticipant(chronicleId, participantId) {
    if (typeof participantId !== 'string' || !participantId) throw new TypeError('INVALID_PARTICIPANT_ID');
    const record = await readChronicleParticipants(chronicleId, participantId);
    if (!record || record.chronicleId !== chronicleId) return null;
    const participant = normalizeStoredParticipant(record);
    if (!participant) throw new Error('PARTICIPANT_INVALID_RECORD');
    return participant;
  }

  // All mutations share the parent store lock, including concurrent Chronicle deletion.
  async function mutateChronicleParticipant(mode, chronicleId, participantId, input, options = {}) {
    const id = typeof chronicleId === 'string' ? chronicleId.trim() : '';
    if (!id) throw new TypeError('INVALID_CHRONICLE_ID');
    const name = mode === 'delete' ? '' : normalizeParticipantName(input?.name);
    if (mode !== 'create' && (typeof participantId !== 'string' || !participantId)) {
      throw new TypeError('INVALID_PARTICIPANT_ID');
    }
    if (mode !== 'create' && (typeof options.expectedUpdatedAt !== 'string' || !options.expectedUpdatedAt)) {
      throw new TypeError('PARTICIPANT_VERSION_REQUIRED');
    }
    const database = await openDatabase();
    const transaction = database.transaction([CHRONICLES_STORE, PARTICIPANTS_STORE], 'readwrite');
    const completion = transactionAsPromise(transaction);
    const chronicles = transaction.objectStore(CHRONICLES_STORE);
    const participants = transaction.objectStore(PARTICIPANTS_STORE);
    try {
      const storedChronicle = await requestAsPromise(chronicles.get(id));
      const chronicle = normalizeStoredChronicle(storedChronicle);
      if (!storedChronicle) throw new Error('CHRONICLE_NOT_FOUND');
      if (!chronicle) throw new Error('CHRONICLE_INVALID_RECORD');
      let current = null;
      if (mode !== 'create') {
        const stored = await requestAsPromise(participants.get(participantId));
        if (!stored || stored.chronicleId !== id) throw new Error('PARTICIPANT_NOT_FOUND');
        current = normalizeStoredParticipant(stored);
        if (!current) throw new Error('PARTICIPANT_INVALID_RECORD');
        if (current.updatedAt !== options.expectedUpdatedAt) throw new Error('PARTICIPANT_UPDATE_CONFLICT');
        if (mode === 'update' && name === current.name) {
          await completion;
          return { participant: current, chronicle };
        }
      }
      const timestamp = new Date(Math.max(
        Date.now(), Date.parse(chronicle.updatedAt) + 1,
        current ? Date.parse(current.updatedAt) + 1 : 0
      )).toISOString();
      const participant = mode === 'delete' ? current : {
        id: current?.id || createChronicleId(),
        chronicleId: id,
        name,
        createdAt: current?.createdAt || timestamp,
        updatedAt: timestamp
      };
      if (mode === 'create') participants.add(participant);
      else if (mode === 'update') participants.put(participant);
      else participants.delete(participantId);
      const updatedChronicle = { ...chronicle, updatedAt: timestamp };
      chronicles.put(updatedChronicle);
      await completion;
      return { participant, chronicle: updatedChronicle };
    } catch (error) {
      abortTransaction(transaction);
      try { await completion; } catch (_transactionError) { /* Preserve the original error. */ }
      throw error;
    }
  }

  function createChronicleParticipant(chronicleId, input) {
    return mutateChronicleParticipant('create', chronicleId, null, input);
  }

  function updateChronicleParticipant(chronicleId, participantId, input, options) {
    return mutateChronicleParticipant('update', chronicleId, participantId, input, options);
  }

  function deleteChronicleParticipant(chronicleId, participantId, options) {
    return mutateChronicleParticipant('delete', chronicleId, participantId, null, options);
  }

  function confrontationFields(input) {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const description = typeof input?.description === 'string' ? input.description.trim() : '';
    if (!name || name.length > 120) throw new TypeError('INVALID_CONFRONTATION_NAME');
    if (description.length > 1200) throw new TypeError('INVALID_CONFRONTATION_DESCRIPTION');
    return { name, description };
  }

  function validateEntity(record, parentKey) {
    if (!record || typeof record.id !== 'string' || !/^[a-zA-Z0-9_-]{12,128}$/.test(record.id)
      || typeof record[parentKey] !== 'string' || !record[parentKey]
      || typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))
      || typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt))) {
      throw new Error('CONFRONTATION_INVALID_RECORD');
    }
    return record;
  }

  function confrontationRecord(record) {
    validateEntity(record, 'chronicleId');
    if (record.active !== undefined && typeof record.active !== 'boolean') throw new Error('CONFRONTATION_INVALID_RECORD');
    // Legacy records remain intact on disk and are available in Combates, never auto-started.
    return { id: record.id, chronicleId: record.chronicleId, ...confrontationFields(record),
      active: record.active === true, createdAt: record.createdAt, updatedAt: record.updatedAt };
  }

  function adversaryFields(input) {
    const name = confrontationFields({ name: input?.name }).name;
    const values = {};
    for (const key of ['pvCurrent', 'pvMax', 'defense']) {
      const raw = input?.[key];
      if (raw === undefined || raw === null || raw === '') continue;
      if (typeof raw !== 'number' || !Number.isSafeInteger(raw)) throw new TypeError('INVALID_ADVERSARY_NUMBERS');
      values[key] = raw;
    }
    if ((values.pvCurrent === undefined) !== (values.pvMax === undefined)
      || (values.pvCurrent !== undefined && (values.pvCurrent < 0 || values.pvMax < 1))) {
      throw new TypeError('INVALID_ADVERSARY_PV');
    }
    // Valores acima do máximo são preservados; reduzir o máximo não aplica dano.
    return { name, ...values };
  }

  function adversaryRecord(record) {
    validateEntity(record, 'confrontationId');
    return { id: record.id, confrontationId: record.confrontationId, ...adversaryFields(record),
      createdAt: record.createdAt, updatedAt: record.updatedAt };
  }

  async function runConfrontationTransaction(stores, mode, work) {
    const db = await openDatabase();
    const tx = db.transaction([...new Set(stores)], mode);
    const completion = transactionAsPromise(tx);
    try {
      const result = await work(tx);
      await completion;
      return result;
    } catch (error) {
      abortTransaction(tx);
      try { await completion; } catch (_abort) { /* Retain validation/conflict errors. */ }
      throw error;
    }
  }

  async function readConfrontationContext(tx, id) {
    if (typeof id !== 'string' || !id) throw new TypeError('INVALID_CONFRONTATION_ID');
    const raw = await requestAsPromise(tx.objectStore(CONFRONTATIONS_STORE).get(id));
    if (!raw) throw new Error('CONFRONTATION_NOT_FOUND');
    const confrontation = confrontationRecord(raw);
    const chronicle = normalizeStoredChronicle(await requestAsPromise(tx.objectStore(CHRONICLES_STORE).get(confrontation.chronicleId)));
    if (!chronicle) throw new Error('CHRONICLE_NOT_FOUND');
    return { confrontation, chronicle };
  }

  function nextConfrontationTimestamp(...records) {
    return new Date(Math.max(Date.now(), ...records.map(record => Date.parse(record.updatedAt) + 1))).toISOString();
  }

  function checkConfrontationVersion(record, expectedUpdatedAt) {
    if (!expectedUpdatedAt || expectedUpdatedAt !== record.updatedAt) throw new Error('CONFRONTATION_UPDATE_CONFLICT');
  }

  function touchConfrontation(tx, context, timestamp) {
    const confrontation = { ...context.confrontation, updatedAt: timestamp };
    const chronicle = { ...context.chronicle, updatedAt: timestamp };
    tx.objectStore(CONFRONTATIONS_STORE).put(confrontation);
    tx.objectStore(CHRONICLES_STORE).put(chronicle);
    return { confrontation, chronicle };
  }

  async function listConfrontations(chronicleId) {
    return runConfrontationTransaction([CHRONICLES_STORE, CONFRONTATIONS_STORE], 'readonly', async tx => {
      if (!normalizeStoredChronicle(await requestAsPromise(tx.objectStore(CHRONICLES_STORE).get(chronicleId)))) throw new Error('CHRONICLE_NOT_FOUND');
      const rows = await requestAsPromise(tx.objectStore(CONFRONTATIONS_STORE).index('chronicleId').getAll(chronicleId));
      return rows.map(confrontationRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    });
  }

  async function getConfrontation(id) {
    return runConfrontationTransaction([CHRONICLES_STORE, CONFRONTATIONS_STORE], 'readonly', async tx => (await readConfrontationContext(tx, id)).confrontation);
  }

  async function createConfrontation(chronicleId, input, composition = null) {
    const fields = confrontationFields(input);
    const selected = composition ? normalizeCharacterIds(composition.characterIds) : [];
    const enemies = composition ? composition.adversaries.map(adversaryFields) : [];
    if (composition && !selected.length && !enemies.length) throw new Error('EMPTY_CONFRONTATION');
    return runConfrontationTransaction([CHRONICLES_STORE, CONFRONTATIONS_STORE, CAST_LINKS_STORE, COMBAT_LINKS_STORE, ADVERSARIES_STORE], 'readwrite', async tx => {
      const chronicle = normalizeStoredChronicle(await requestAsPromise(tx.objectStore(CHRONICLES_STORE).get(chronicleId)));
      if (!chronicle) throw new Error('CHRONICLE_NOT_FOUND');
      for (const characterId of selected) {
        if (!await requestAsPromise(tx.objectStore(CAST_LINKS_STORE).get([chronicleId, characterId]))) throw new Error('CHARACTER_NOT_IN_CAST');
      }
      const timestamp = nextConfrontationTimestamp(chronicle);
      const record = { id: createChronicleId(), chronicleId, ...fields, active: false, createdAt: timestamp, updatedAt: timestamp };
      tx.objectStore(CONFRONTATIONS_STORE).add(record);
      selected.forEach(characterId => tx.objectStore(COMBAT_LINKS_STORE).add({ confrontationId: record.id, characterId }));
      enemies.forEach(enemy => tx.objectStore(ADVERSARIES_STORE).add({ id: createChronicleId(), confrontationId: record.id, ...enemy, createdAt: timestamp, updatedAt: timestamp }));
      tx.objectStore(CHRONICLES_STORE).put({ ...chronicle, updatedAt: timestamp });
      return record;
    });
  }

  async function setConfrontationActive(id, active, { expectedUpdatedAt } = {}) {
    if (typeof active !== 'boolean') throw new TypeError('INVALID_CONFRONTATION_ACTIVE');
    return runConfrontationTransaction([CHRONICLES_STORE, CONFRONTATIONS_STORE, COMBAT_LINKS_STORE, ADVERSARIES_STORE], 'readwrite', async tx => {
      const context = await readConfrontationContext(tx, id);
      if (context.confrontation.active === active) return context.confrontation;
      checkConfrontationVersion(context.confrontation, expectedUpdatedAt);
      if (active) {
        const siblings = await requestAsPromise(tx.objectStore(CONFRONTATIONS_STORE).index('chronicleId').getAll(context.chronicle.id));
        if (siblings.some(item => item.id !== id && item.active === true)) throw new Error('ACTIVE_CONFRONTATION_EXISTS');
        const characters = await requestAsPromise(tx.objectStore(COMBAT_LINKS_STORE).index('confrontationId').count(id));
        const enemies = await requestAsPromise(tx.objectStore(ADVERSARIES_STORE).index('confrontationId').count(id));
        if (!characters && !enemies) throw new Error('EMPTY_CONFRONTATION');
      }
      context.confrontation = { ...context.confrontation, active };
      return touchConfrontation(tx, context, nextConfrontationTimestamp(context.confrontation, context.chronicle)).confrontation;
    });
  }

  async function updateConfrontation(id, input, { expectedUpdatedAt } = {}) {
    const fields = confrontationFields(input);
    return runConfrontationTransaction([CHRONICLES_STORE, CONFRONTATIONS_STORE], 'readwrite', async tx => {
      const context = await readConfrontationContext(tx, id);
      checkConfrontationVersion(context.confrontation, expectedUpdatedAt);
      if (fields.name === context.confrontation.name && fields.description === context.confrontation.description) return context.confrontation;
      const timestamp = nextConfrontationTimestamp(context.confrontation, context.chronicle);
      context.confrontation = { ...context.confrontation, ...fields };
      return touchConfrontation(tx, context, timestamp).confrontation;
    });
  }

  async function listConfrontationCharacterIds(id) {
    return runConfrontationTransaction([CHRONICLES_STORE, CONFRONTATIONS_STORE, COMBAT_LINKS_STORE], 'readonly', async tx => {
      await readConfrontationContext(tx, id);
      const keys = await requestAsPromise(tx.objectStore(COMBAT_LINKS_STORE).index('confrontationId').getAllKeys(id));
      return normalizeCharacterIds(keys.map(key => key[1]));
    });
  }

  async function replaceConfrontationCharacters(id, characterIds, { expectedCharacterIds } = {}) {
    const selected = normalizeCharacterIds(characterIds);
    const expected = normalizeCharacterIds(expectedCharacterIds);
    const sameSet = (a, b) => a.length === b.length && a.every(value => b.includes(value));
    return runConfrontationTransaction([CHRONICLES_STORE, CONFRONTATIONS_STORE, CAST_LINKS_STORE, COMBAT_LINKS_STORE], 'readwrite', async tx => {
      const context = await readConfrontationContext(tx, id);
      const links = tx.objectStore(COMBAT_LINKS_STORE);
      const keys = await requestAsPromise(links.index('confrontationId').getAllKeys(id));
      const previous = keys.map(key => key[1]);
      if (!sameSet(previous, expected)) throw new Error('COMBAT_SELECTION_CONFLICT');
      for (const characterId of selected.filter(value => !previous.includes(value))) {
        const member = await requestAsPromise(tx.objectStore(CAST_LINKS_STORE).get([context.chronicle.id, characterId]));
        if (!member) throw new Error('CHARACTER_NOT_IN_CAST');
      }
      if (sameSet(previous, selected)) return context.confrontation;
      keys.filter(key => !selected.includes(key[1])).forEach(key => links.delete(key));
      selected.filter(value => !previous.includes(value)).forEach(characterId => links.add({ confrontationId: id, characterId }));
      return touchConfrontation(tx, context, nextConfrontationTimestamp(context.confrontation, context.chronicle)).confrontation;
    });
  }

  async function listConfrontationAdversaries(id) {
    return runConfrontationTransaction([CHRONICLES_STORE, CONFRONTATIONS_STORE, ADVERSARIES_STORE], 'readonly', async tx => {
      await readConfrontationContext(tx, id);
      const rows = await requestAsPromise(tx.objectStore(ADVERSARIES_STORE).index('confrontationId').getAll(id));
      return rows.map(adversaryRecord).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    });
  }

  async function mutateAdversary(mode, confrontationId, id, input, { expectedUpdatedAt } = {}) {
    const fields = mode === 'delete' ? null : adversaryFields(input);
    return runConfrontationTransaction([CHRONICLES_STORE, CONFRONTATIONS_STORE, ADVERSARIES_STORE], 'readwrite', async tx => {
      const context = await readConfrontationContext(tx, confrontationId);
      const store = tx.objectStore(ADVERSARIES_STORE);
      let current;
      if (mode !== 'create') {
        const raw = await requestAsPromise(store.get(id));
        if (!raw || raw.confrontationId !== confrontationId) throw new Error('ADVERSARY_NOT_FOUND');
        current = adversaryRecord(raw);
        if (!expectedUpdatedAt || current.updatedAt !== expectedUpdatedAt) throw new Error('ADVERSARY_UPDATE_CONFLICT');
        if (mode === 'update' && JSON.stringify(adversaryFields(current)) === JSON.stringify(fields)) return current;
      }
      const timestamp = nextConfrontationTimestamp(context.confrontation, context.chronicle, ...(current ? [current] : []));
      const record = mode === 'delete' ? current : { id: current?.id || createChronicleId(), confrontationId,
        ...fields, createdAt: current?.createdAt || timestamp, updatedAt: timestamp };
      if (mode === 'create') store.add(record);
      else if (mode === 'update') store.put(record);
      else store.delete(id);
      touchConfrontation(tx, context, timestamp);
      return record;
    });
  }

  async function deleteConfrontationChildren(tx, id) {
    for (const name of [COMBAT_LINKS_STORE, ADVERSARIES_STORE]) {
      const store = tx.objectStore(name);
      const keys = await requestAsPromise(store.index('confrontationId').getAllKeys(id));
      keys.forEach(key => store.delete(key));
    }
  }

  async function deleteConfrontation(id, { expectedUpdatedAt } = {}) {
    return runConfrontationTransaction([CHRONICLES_STORE, CONFRONTATIONS_STORE, COMBAT_LINKS_STORE, ADVERSARIES_STORE], 'readwrite', async tx => {
      const context = await readConfrontationContext(tx, id);
      checkConfrontationVersion(context.confrontation, expectedUpdatedAt);
      await deleteConfrontationChildren(tx, id);
      tx.objectStore(CONFRONTATIONS_STORE).delete(id);
      tx.objectStore(CHRONICLES_STORE).put({ ...context.chronicle, updatedAt: nextConfrontationTimestamp(context.chronicle) });
      return context.confrontation;
    });
  }

  function normalizeMasterNote(record, chronicleId) {
    if (record === undefined) return null;
    if (!record || record.chronicleId !== chronicleId || typeof record.content !== 'string'
      || record.content.length > 50000 || typeof record.updatedAt !== 'string'
      || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error('MASTER_NOTE_INVALID_RECORD');
    return { chronicleId, content: record.content, updatedAt: record.updatedAt };
  }

  // Private content is deliberately absent from all public Chronicle readers.
  async function masterNoteOperation(chronicleId, change) {
    if (typeof chronicleId !== 'string' || !chronicleId.trim()) throw new TypeError('INVALID_CHRONICLE_ID');
    return runConfrontationTransaction([CHRONICLES_STORE, MASTER_NOTES_STORE], change ? 'readwrite' : 'readonly', async tx => {
      const parent = await requestAsPromise(tx.objectStore(CHRONICLES_STORE).get(chronicleId));
      if (!parent) throw new Error('CHRONICLE_NOT_FOUND');
      if (!normalizeStoredChronicle(parent)) throw new Error('CHRONICLE_INVALID_RECORD');
      const store = tx.objectStore(MASTER_NOTES_STORE);
      const current = normalizeMasterNote(await requestAsPromise(store.get(chronicleId)), chronicleId);
      if (!change) return current;
      if ((current?.updatedAt ?? null) !== change.expectedUpdatedAt) throw new Error('MASTER_NOTE_UPDATE_CONFLICT');
      if ((current?.content ?? '') === change.content) return current;
      const updatedAt = new Date(Math.max(Date.now(), current ? Date.parse(current.updatedAt) + 1 : 0)).toISOString();
      const note = { chronicleId, content: change.content, updatedAt };
      store.put(note);
      // Do not touch the public Chronicle timestamp for a private edit.
      return note;
    });
  }

  function getChronicleMasterNote(chronicleId) {
    return masterNoteOperation(chronicleId);
  }

  function saveChronicleMasterNote(chronicleId, content, options = {}) {
    if (typeof content !== 'string' || content.length > 50000) return Promise.reject(new TypeError('INVALID_MASTER_NOTE_CONTENT'));
    if (!Object.prototype.hasOwnProperty.call(options, 'expectedUpdatedAt')
      || (options.expectedUpdatedAt !== null && (typeof options.expectedUpdatedAt !== 'string'
        || !Number.isFinite(Date.parse(options.expectedUpdatedAt))))) {
      return Promise.reject(new TypeError('MASTER_NOTE_VERSION_REQUIRED'));
    }
    return masterNoteOperation(chronicleId, { content, expectedUpdatedAt: options.expectedUpdatedAt });
  }

  // v6: private repositories and immutable events. Character localStorage is never mutated here.
  const timestampAfter = current => new Date(Math.max(Date.now(), Date.parse(current || '') + 1 || 0)).toISOString();
  function requiredId(id) {
    if (typeof id !== 'string' || !id.trim() || id.length > 200) throw new TypeError('INVALID_ID');
    return id;
  }
  async function requireChronicle(tx, id) {
    requiredId(id);
    const raw = await requestAsPromise(tx.objectStore(CHRONICLES_STORE).get(id));
    if (!raw) throw new Error('CHRONICLE_NOT_FOUND');
    if (!normalizeStoredChronicle(raw)) throw new Error('CHRONICLE_INVALID_RECORD');
  }
  function checkPrivateVersion(record, options) {
    if (!options || !Object.hasOwn(options, 'expectedUpdatedAt')) throw new Error('PRIVATE_VERSION_REQUIRED');
    if ((record?.updatedAt ?? null) !== options.expectedUpdatedAt) throw new Error('PRIVATE_UPDATE_CONFLICT');
  }
  async function listCharacterChronicles(characterId) {
    requiredId(characterId);
    return runConfrontationTransaction([CHRONICLES_STORE, CAST_LINKS_STORE], 'readonly', async tx => {
      const links = await requestAsPromise(tx.objectStore(CAST_LINKS_STORE).index('characterId').getAll(characterId));
      const records = await Promise.all(links.map(link => requestAsPromise(tx.objectStore(CHRONICLES_STORE).get(link.chronicleId))));
      return records.map(normalizeStoredChronicle).filter(Boolean).sort((a,b) => a.name.localeCompare(b.name));
    });
  }
  function accessRecord(raw) {
    if (raw === undefined) return null;
    if (!raw || raw.schemeVersion !== 1 || raw.algorithm !== 'PBKDF2-SHA-256' || raw.iterations !== 600000
      || !/^[0-9a-f]{32}$/.test(raw.salt) || !/^[0-9a-f]{64}$/.test(raw.verifier)
      || !Number.isFinite(Date.parse(raw.updatedAt))) throw new Error('MASTER_ACCESS_INVALID');
    return { chronicleId: requiredId(raw.chronicleId), schemeVersion: 1, algorithm: raw.algorithm,
      iterations: raw.iterations, salt: raw.salt, verifier: raw.verifier, updatedAt: raw.updatedAt };
  }
  async function getMasterAccess(id) {
    return runConfrontationTransaction([CHRONICLES_STORE, MASTER_ACCESS], 'readonly', async tx => {
      await requireChronicle(tx, id); return accessRecord(await requestAsPromise(tx.objectStore(MASTER_ACCESS).get(id)));
    });
  }
  async function setMasterAccess(id, config, options) {
    return runConfrontationTransaction([CHRONICLES_STORE, MASTER_ACCESS], 'readwrite', async tx => {
      await requireChronicle(tx, id);
      const store = tx.objectStore(MASTER_ACCESS), current = await requestAsPromise(store.get(id));
      checkPrivateVersion(current, options);
      const record = accessRecord({ ...config, chronicleId: id, updatedAt: timestampAfter(current?.updatedAt) });
      store.put(record); return record;
    });
  }
  async function resetMasterAccess(id, options) {
    return runConfrontationTransaction([CHRONICLES_STORE, MASTER_ACCESS], 'readwrite', async tx => {
      await requireChronicle(tx, id);
      const store = tx.objectStore(MASTER_ACCESS), current = await requestAsPromise(store.get(id));
      checkPrivateVersion(current, options); store.delete(id);
    });
  }
  function privateStore(kind) {
    if (kind === 'investigation') return INVESTIGATION;
    if (kind === 'journal') return JOURNAL;
    throw new Error('INVALID_PRIVATE_KIND');
  }
  function privateFields(kind, input) {
    if (typeof input?.title !== 'string' || !input.title.trim() || input.title.trim().length > 120
      || typeof input.content !== 'string' || input.content.length > 50000) throw new Error('INVALID_PRIVATE_CONTENT');
    const fields = { title: input.title.trim(), content: input.content };
    if (kind === 'investigation') {
      if (typeof input.revealed !== 'boolean') throw new Error('INVALID_PRIVATE_CONTENT');
      fields.revealed = input.revealed;
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date))
        || new Date(input.date).toISOString().slice(0, 10) !== input.date) throw new Error('INVALID_PRIVATE_DATE');
      fields.date = input.date;
    }
    return fields;
  }
  function privateRecord(kind, raw, chronicleId) {
    if (!raw || raw.chronicleId !== chronicleId || !Number.isFinite(Date.parse(raw.createdAt))
      || !Number.isFinite(Date.parse(raw.updatedAt))) throw new Error('PRIVATE_INVALID_RECORD');
    return { id: requiredId(raw.id), chronicleId, ...privateFields(kind, raw), createdAt: raw.createdAt, updatedAt: raw.updatedAt };
  }
  async function listPrivateEntries(kind, id) {
    const name = privateStore(kind);
    return runConfrontationTransaction([CHRONICLES_STORE, name], 'readonly', async tx => {
      await requireChronicle(tx, id);
      const rows = await requestAsPromise(tx.objectStore(name).index('chronicleId').getAll(id));
      return rows.map(row => privateRecord(kind, row, id)).sort((a,b) =>
        (b.date || b.createdAt).localeCompare(a.date || a.createdAt) || b.id.localeCompare(a.id));
    });
  }
  async function savePrivateEntry(kind, chronicleId, id, input, options) {
    const name = privateStore(kind), fields = privateFields(kind, input);
    return runConfrontationTransaction([CHRONICLES_STORE, name], 'readwrite', async tx => {
      await requireChronicle(tx, chronicleId);
      const store = tx.objectStore(name);
      const raw = id ? await requestAsPromise(store.get(requiredId(id))) : undefined;
      if (id && !raw) throw new Error('PRIVATE_NOT_FOUND');
      const current = raw ? privateRecord(kind, raw, chronicleId) : null;
      checkPrivateVersion(current, options);
      if (current && JSON.stringify(privateFields(kind, current)) === JSON.stringify(fields)) return current;
      const now = timestampAfter(current?.updatedAt);
      const record = { id: id || createChronicleId(), chronicleId, ...fields, createdAt: current?.createdAt || now, updatedAt: now };
      if (current) store.put(record); else store.add(record);
      return record;
    });
  }
  async function deletePrivateEntry(kind, chronicleId, id, options) {
    const name = privateStore(kind);
    return runConfrontationTransaction([CHRONICLES_STORE, name], 'readwrite', async tx => {
      await requireChronicle(tx, chronicleId);
      const store = tx.objectStore(name), raw = await requestAsPromise(store.get(requiredId(id)));
      const current = privateRecord(kind, raw, chronicleId);
      checkPrivateVersion(current, options); store.delete(id);
    });
  }
  function rollRecord(input) {
    const result = input?.result;
    if (input?.schemaVersion !== 1 || typeof input.characterName !== 'string' || input.characterName.length > 5000
      || !Number.isFinite(Date.parse(input.createdAt)) || input.source !== 'quick-dice' || input.category !== 'expression'
      || input.resolution !== 'sum' || typeof result?.expression !== 'string' || result.expression.length > 32
      || !Number.isInteger(result.quantity) || result.quantity < 1 || result.quantity > 100
      || !Number.isInteger(result.faces) || result.faces < 2 || result.faces > 1000
      || !Number.isInteger(result.modifier) || Math.abs(result.modifier) > 100000
      || !Array.isArray(result.rolls) || result.rolls.length !== result.quantity
      || result.rolls.some(value => !Number.isInteger(value) || value < 1 || value > result.faces)
      || result.diceTotal !== result.rolls.reduce((a,b) => a+b,0) || result.total !== result.diceTotal + result.modifier) {
      throw new Error('INVALID_ROLL_RECORD');
    }
    // resolution is explicit: future min/max/zero-dice rules need a versioned validator, never a reinterpretation of 2d20.
    return { id: requiredId(input.id), schemaVersion: 1, characterId: requiredId(input.characterId),
      characterName: input.characterName, createdAt: input.createdAt, source: 'quick-dice', category: 'expression', resolution: 'sum',
      result: { expression: result.expression, quantity: result.quantity, faces: result.faces, modifier: result.modifier,
        rolls: [...result.rolls], diceTotal: result.diceTotal, total: result.total } };
  }
  async function collectRoll(tx, id) {
    const counts = await Promise.all([CHARACTER_ROLLS, CHRONICLE_ROLLS].map(name =>
      requestAsPromise(tx.objectStore(name).index('rollId').count(id))));
    if (!counts.some(Boolean)) tx.objectStore(ROLLS).delete(id);
  }
  async function removeHistoryLinks(tx, name, ownerId, keep = 0) {
    const store = tx.objectStore(name), index = store.index('chronology');
    const range = IDBKeyRange.bound([ownerId], [ownerId, []]);
    const count = await requestAsPromise(index.count(range)), remove = Math.max(0, count - keep);
    const ids = [];
    if (remove) await new Promise((resolve, reject) => {
      const request = index.openCursor(range, 'next');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || ids.length >= remove) { resolve(); return; }
        ids.push(cursor.value.rollId); cursor.delete(); cursor.continue();
      };
    });
    for (const id of ids) await collectRoll(tx, id);
  }
  async function appendRoll(input, chronicleId = null) {
    const record = rollRecord(input);
    if (chronicleId !== null) requiredId(chronicleId);
    return runConfrontationTransaction([...HISTORY_STORES, CHRONICLES_STORE, CAST_LINKS_STORE], 'readwrite', async tx => {
      const store = tx.objectStore(ROLLS), previous = await requestAsPromise(store.get(record.id));
      if (previous) {
        if (JSON.stringify(rollRecord(previous)) !== JSON.stringify(record)) throw new Error('ROLL_ID_CONFLICT');
        const linked = chronicleId ? await requestAsPromise(tx.objectStore(CHRONICLE_ROLLS).get([chronicleId, record.id])) : null;
        return { record: previous, chronicleLinked: Boolean(linked), alreadySaved: true };
      }
      let linked = false;
      if (chronicleId) {
        const parent = await requestAsPromise(tx.objectStore(CHRONICLES_STORE).get(chronicleId));
        const cast = await requestAsPromise(tx.objectStore(CAST_LINKS_STORE).get([chronicleId, record.characterId]));
        linked = Boolean(normalizeStoredChronicle(parent) && cast);
      }
      store.add(record);
      tx.objectStore(CHARACTER_ROLLS).add({ characterId: record.characterId, rollId: record.id, createdAt: record.createdAt });
      if (linked) tx.objectStore(CHRONICLE_ROLLS).add({ chronicleId, rollId: record.id, createdAt: record.createdAt });
      await removeHistoryLinks(tx, CHARACTER_ROLLS, record.characterId, 500);
      if (linked) await removeHistoryLinks(tx, CHRONICLE_ROLLS, chronicleId, 2000);
      return { record, chronicleLinked: linked, alreadySaved: false };
    });
  }
  function historyStore(scope) {
    if (scope === 'character') return CHARACTER_ROLLS;
    if (scope === 'chronicle') return CHRONICLE_ROLLS;
    throw new Error('INVALID_HISTORY_SCOPE');
  }
  async function listRollHistory(scope, ownerId, { before = null, limit = 50, characterId = '', category = '', includeDestinations = false } = {}) {
    const name = historyStore(scope); requiredId(ownerId);
    limit = Math.max(1, Math.min(50, Math.trunc(limit) || 50));
    const withDestinations = scope === 'character' && includeDestinations;
    const stores = withDestinations ? [ROLLS, name, CHRONICLE_ROLLS, CHRONICLES_STORE] : [ROLLS, name];
    return runConfrontationTransaction(stores, 'readonly', async tx => {
      const end = before ? [ownerId, before.createdAt, before.id] : [ownerId, []];
      const range = IDBKeyRange.bound([ownerId], end, false, Boolean(before));
      const records = []; let cursorKey = null, more = false;
      await new Promise((resolve, reject) => {
        const request = tx.objectStore(name).index('chronology').openCursor(range, 'prev');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { resolve(); return; }
          const read = tx.objectStore(ROLLS).get(cursor.value.rollId);
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            let record;
            try { record = read.result ? rollRecord(read.result) : null; } catch (error) { reject(error); return; }
            if (record && (!characterId || record.characterId === characterId) && (!category || record.category === category)) {
              if (records.length === limit) { more = true; resolve(); return; }
              records.push(record); cursorKey = { createdAt: record.createdAt, id: record.id };
            }
            cursor.continue();
          };
        };
      });
      // Read-only presentation metadata. Never rewrite the event or infer a past destination
      // from current Elenco membership: only surviving roll links are authoritative here.
      const destinations = {};
      if (withDestinations) {
        const chronicles = new Map();
        await Promise.all(records.map(async record => {
          const links = await requestAsPromise(tx.objectStore(CHRONICLE_ROLLS).index('rollId').getAll(record.id));
          destinations[record.id] = await Promise.all(links.map(async link => {
            if (!chronicles.has(link.chronicleId)) chronicles.set(link.chronicleId, requestAsPromise(tx.objectStore(CHRONICLES_STORE).get(link.chronicleId)));
            const chronicle = await chronicles.get(link.chronicleId);
            return { id: link.chronicleId, name: chronicle?.name || 'Crônica indisponível' };
          }));
        }));
      }
      return { records, next: more ? cursorKey : null, ...(withDestinations ? { destinations } : {}) };
    });
  }
  async function clearRollHistory(scope, ownerId) {
    const name = historyStore(scope); requiredId(ownerId);
    return runConfrontationTransaction(HISTORY_STORES, 'readwrite', tx => removeHistoryLinks(tx, name, ownerId));
  }
  async function listRollActors(scope, ownerId) {
    const name = historyStore(scope); requiredId(ownerId);
    return runConfrontationTransaction([ROLLS, name], 'readonly', tx => new Promise((resolve, reject) => {
      const actors = new Map(), range = IDBKeyRange.bound([ownerId], [ownerId, []]);
      const request = tx.objectStore(name).index('chronology').openCursor(range, 'prev');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve([...actors.values()].sort((a,b) => a.name.localeCompare(b.name))); return; }
        const read = tx.objectStore(ROLLS).get(cursor.value.rollId);
        read.onerror = () => reject(read.error);
        read.onsuccess = () => {
          try {
            const record = read.result ? rollRecord(read.result) : null;
            if (record && !actors.has(record.characterId)) actors.set(record.characterId, { id: record.characterId, name: record.characterName });
            cursor.continue();
          } catch (error) { reject(error); }
        };
      };
    }));
  }

  global.ChroniclesStorage = Object.freeze({
    listCharacterChronicles, getMasterAccess, setMasterAccess, resetMasterAccess,
    listPrivateEntries, savePrivateEntry, deletePrivateEntry,
    appendRoll, listRollHistory, clearRollHistory, listRollActors,
    getChronicleMasterNote, saveChronicleMasterNote,
    listConfrontations, getConfrontation, createConfrontation, updateConfrontation, deleteConfrontation, setConfrontationActive,
    listConfrontationCharacterIds, replaceConfrontationCharacters, listConfrontationAdversaries,
    createConfrontationAdversary: (confrontationId, input) => mutateAdversary('create', confrontationId, null, input),
    updateConfrontationAdversary: (confrontationId, id, input, options) => mutateAdversary('update', confrontationId, id, input, options),
    deleteConfrontationAdversary: (confrontationId, id, options) => mutateAdversary('delete', confrontationId, id, null, options),
    listChronicleParticipants,
    getChronicleParticipant,
    createChronicleParticipant,
    updateChronicleParticipant,
    deleteChronicleParticipant,
    createChronicle,
    updateChronicle,
    deleteChronicle,
    listChronicles,
    getChronicle,
    getChronicleCover,
    listChronicleCastIds,
    replaceChronicleCast
  });
})(window);
