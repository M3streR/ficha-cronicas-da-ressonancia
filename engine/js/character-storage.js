(function (global) {
  'use strict';
  const DATABASE = 'cronicasRessonanciaCharacters';
  const MANAGER = 'cronicasRessonanciaCharacterManagerV4';
  const CHARACTER = 'cronicasRessonanciaCharacterV4:';
  const SYNC = 'cronicasRessonanciaOnlineCharacterSyncV1:';
  const LEGACY = ['cronicasRessonanciaFichaV1', 'cronicasRessonanciaFichaV3PreAlpha'];
  const cache = new Map();
  const instanceId = global.crypto?.randomUUID?.() || String(Math.random());
  let database, readyPromise, failure, queue = Promise.resolve(), pending = 0, channel, cacheRevision = 0;
  const relevant = key => key === MANAGER || key.startsWith(CHARACTER) || key.startsWith(SYNC) || LEGACY.includes(key);
  const request = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  function completed(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error('CHARACTER_TRANSACTION_ABORTED'));
      tx.onerror = () => {}; // Abort is the authoritative failure of the transaction.
    });
  }
  function assertReady() {
    if (failure) throw failure;
    if (!database) throw new Error('CHARACTER_STORAGE_NOT_READY');
  }
  function transaction(stores, mode) {
    if (mode !== 'readwrite') return database.transaction(stores, mode);
    try { return database.transaction(stores, mode, { durability: 'strict' }); }
    catch (error) { if (error.name !== 'TypeError') throw error; return database.transaction(stores, mode); }
  }
  async function open() {
    if (!global.indexedDB) throw new Error('INDEXEDDB_UNAVAILABLE');
    const req = global.indexedDB.open(DATABASE, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('records');
      req.result.createObjectStore('migration');
    };
    req.onblocked = () => global.dispatchEvent(new CustomEvent('cronicas:character-storage-blocked'));
    database = await request(req);
    database.onversionchange = () => {
      database.close(); failure = new Error('CHARACTER_STORAGE_VERSION_CHANGED');
      global.dispatchEvent(new CustomEvent('cronicas:character-storage-error', { detail: failure }));
    };
  }
  function legacySnapshot() {
    const result = {};
    for (let i = 0; i < global.localStorage.length; i++) {
      const key = global.localStorage.key(i);
      if (key && relevant(key)) result[key] = global.localStorage.getItem(key);
    }
    return result;
  }
  function equal(left, right) { return JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort()); }
  async function migrate() {
    const source = legacySnapshot();
    let tx = database.transaction('migration', 'readonly');
    let done = completed(tx);
    const previous = await request(tx.objectStore('migration').get('legacy'));
    await done;
    if (previous?.status === 'verified') {
      if (!equal(previous.source, source)) throw new Error('LEGACY_STORAGE_CHANGED_AFTER_MIGRATION');
      return;
    }
    // A transaction commits the entire copy and its journal together. No source is removed.
    tx = transaction(['records', 'migration'], 'readwrite');
    done = completed(tx); done.catch(() => {});
    const store = tx.objectStore('records');
    try {
      for (const [key, value] of Object.entries(source)) {
        const existing = await request(store.get(key));
        if (existing !== undefined && existing !== value) throw new Error('CHARACTER_MIGRATION_DIVERGENCE');
        store.put(value, key);
      }
      tx.objectStore('migration').put({ status: 'copied', source }, 'legacy');
      await done;
    } catch (error) { try { tx.abort(); } catch (_) {} await done.catch(() => {}); throw error; }
    tx = database.transaction('records', 'readonly'); done = completed(tx);
    const verified = {};
    for (const key of Object.keys(source)) verified[key] = await request(tx.objectStore('records').get(key));
    await done;
    if (!equal(source, verified) || !equal(source, legacySnapshot())) throw new Error('CHARACTER_MIGRATION_VERIFICATION_FAILED');
    tx = transaction('migration', 'readwrite'); done = completed(tx);
    tx.objectStore('migration').put({ status: 'verified', source, verifiedAt: new Date().toISOString() }, 'legacy');
    await done;
  }
  async function refresh(keys) {
    assertReady();
    const revision = cacheRevision;
    const tx = database.transaction('records', 'readonly'), done = completed(tx);
    const store = tx.objectStore('records');
    const selected = keys || await request(store.getAllKeys());
    const values = await Promise.all(selected.map(key => request(store.get(key))));
    await done;
    if (revision !== cacheRevision) return refresh(keys);
    if (!keys) cache.clear();
    selected.forEach((key, i) => values[i] === undefined ? cache.delete(key) : cache.set(key, values[i]));
  }
  function initialize() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      global.addEventListener('storage', event => {
        if (event.key === null || relevant(event.key)) {
          failure = new Error('LEGACY_STORAGE_CHANGED_AFTER_MIGRATION');
          global.dispatchEvent(new CustomEvent('cronicas:character-storage-error', { detail: failure }));
        }
      });
      await open();
      if (global.navigator?.locks) await global.navigator.locks.request('cronicas:character-storage-migration:v1', migrate);
      else await migrate();
      await refresh();
      const journalTx = database.transaction('migration', 'readonly'), journalDone = completed(journalTx);
      const journal = await request(journalTx.objectStore('migration').get('legacy'));
      await journalDone;
      if (!equal(journal.source, legacySnapshot())) throw new Error('LEGACY_STORAGE_CHANGED_AFTER_MIGRATION');
      if (global.BroadcastChannel) {
        channel = new global.BroadcastChannel('cronicas:character-storage:v1');
        channel.onmessage = async event => {
          const data = event.data;
          if (data?.instanceId === instanceId || !Array.isArray(data?.keys) || !data.keys.every(key => typeof key === 'string' && relevant(key))) return;
          try { await refresh(data.keys); global.dispatchEvent(new CustomEvent('cronicas:character-storage-refreshed', { detail: data.keys })); }
          catch (error) { global.dispatchEvent(new CustomEvent('cronicas:character-storage-error', { detail: error })); }
        };
      }
    })().catch(error => { failure = error; throw error; });
    return readyPromise;
  }
  function get(key) { assertReady(); return cache.get(key) ?? null; }
  function entries() { assertReady(); return [...cache.entries()]; }
  function commit(puts = {}, deletes = [], authorize = () => true, options = {}) {
    if ((Object.hasOwn(puts, MANAGER) || deletes.includes(MANAGER)) && !options.managerPatch && !options.addCharacter) {
      return Promise.reject(new Error('CHARACTER_MANAGER_PATCH_REQUIRED'));
    }
    // Refused calls never join the persistence queue or poison a later handover.
    try {
      if (!authorize()) return Promise.reject(new Error('CHARACTER_EDIT_NOT_AUTHORIZED'));
    } catch (error) { return Promise.reject(error); }
    const affected = [...Object.keys(puts), ...deletes].filter(key => key.startsWith(CHARACTER) || key.startsWith(SYNC)).map(key => key.slice(key.startsWith(CHARACTER) ? CHARACTER.length : SYNC.length));
    if (options.managerPatch) {
      const { base, next } = options.managerPatch;
      for (const id of new Set([...(base?.order || []), ...next.order])) {
        if (JSON.stringify(base?.characters?.[id]) !== JSON.stringify(next.characters[id])) affected.push(id);
      }
    }
    const observersPresent = () => affected.some(id => ['observer', 'waiting'].includes(global.CharacterEditAuthority?.getState?.(id)?.mode));
    if (observersPresent()) return Promise.reject(new Error('CHARACTER_EDIT_NOT_AUTHORIZED'));
    pending++;
    const result = queue.catch(() => {}).then(async () => {
      await initialize(); assertReady();
      if (observersPresent()) throw new Error('CHARACTER_EDIT_NOT_AUTHORIZED');
      if (!authorize()) throw new Error('CHARACTER_EDIT_NOT_AUTHORIZED');
      const tx = transaction('records', 'readwrite'), done = completed(tx);
      done.catch(() => {});
      const store = tx.objectStore('records');
      try {
      if (options.dirtyId) {
        const key = SYNC + options.dirtyId;
        const current = await request(store.get(key));
        if (current) puts[key] = JSON.stringify({ ...JSON.parse(current), dirty: true });
      }
      if (options.addCharacter) {
        const { id, summary, active } = options.addCharacter;
        if (await request(store.get(CHARACTER + id)) !== undefined) {
          tx.abort(); await done;
        }
        const serialized = await request(store.get(MANAGER));
        const manager = serialized ? JSON.parse(serialized) : { storageVersion: 1, activeCharacterId: null, order: [], characters: {}, migrations: {} };
        manager.order.push(id);
        manager.characters[id] = summary;
        if (active) manager.activeCharacterId = id;
        puts[MANAGER] = JSON.stringify(manager);
      }
      if (options.managerPatch) {
        const { base, next } = options.managerPatch;
        const serialized = await request(store.get(MANAGER));
        const current = serialized ? JSON.parse(serialized) : { storageVersion: 1, activeCharacterId: null, order: [], characters: {}, migrations: {} };
        const previous = base || { order: [], characters: {}, migrations: {}, activeCharacterId: null };
        for (const id of new Set([...previous.order, ...next.order])) {
          if (JSON.stringify(previous.characters[id]) === JSON.stringify(next.characters[id])) continue;
          if (JSON.stringify(current.characters[id]) !== JSON.stringify(previous.characters[id]) && JSON.stringify(current.characters[id]) !== JSON.stringify(next.characters[id])) {
            tx.abort(); await done;
          }
          if (next.characters[id]) { current.characters[id] = next.characters[id]; if (!current.order.includes(id)) current.order.push(id); }
          else { delete current.characters[id]; current.order = current.order.filter(value => value !== id); }
        }
        if (next.activeCharacterId !== previous.activeCharacterId) current.activeCharacterId = next.activeCharacterId;
        if (current.activeCharacterId && !current.order.includes(current.activeCharacterId)) current.activeCharacterId = null;
        for (const [id, value] of Object.entries(next.migrations || {})) if (JSON.stringify(previous.migrations?.[id]) !== JSON.stringify(value)) current.migrations[id] = value;
        puts[MANAGER] = JSON.stringify(current);
      }
      if (!authorize() || observersPresent()) { tx.abort(); await done; }
      for (const [key, value] of Object.entries(puts)) store.put(value, key);
      deletes.forEach(key => store.delete(key));
      await done;
      } catch (error) { try { tx.abort(); } catch (_) {} await done.catch(() => {}); throw error; }
      const keys = [...Object.keys(puts), ...deletes];
      cacheRevision++;
      Object.entries(puts).forEach(([key, value]) => cache.set(key, value));
      deletes.forEach(key => cache.delete(key));
      channel?.postMessage({ instanceId, keys });
    }).finally(() => { pending--; });
    queue = result;
    return result;
  }
  function message(error) {
    if (error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014) return 'Não há espaço suficiente neste dispositivo. Nenhuma ficha antiga foi apagada; exporte um backup antes de gerenciar o espaço.';
    if (/INVALID_CHARACTER_PHOTO/.test(error?.message)) return 'A imagem da ficha não pôde ser lida. Verifique a imagem no arquivo original; os personagens existentes foram preservados.';
    if (/INDEXEDDB_UNAVAILABLE|SecurityError/.test(error?.message || error?.name)) return 'O navegador não disponibilizou o banco local. Verifique as permissões de armazenamento; os dados antigos permanecem preservados.';
    if (/LEGACY_STORAGE_CHANGED/.test(error?.message)) return 'Uma versão antiga do site alterou o armazenamento anterior. Feche as outras abas e preserve um backup antes de revisar a migração; nenhuma versão foi sobrescrita.';
    if (/CHARACTER_MIGRATION_DIVERGENCE|CHARACTER_MIGRATION_VERIFICATION_FAILED/.test(error?.message)) return 'As versões do armazenamento antigo e do banco novo não coincidem. A migração foi interrompida para preservar ambas. Exporte a recuperação antes de revisar os registros.';
    if (/CHARACTER_STORAGE_VERSION_CHANGED/.test(error?.message)) return 'Outra versão do site atualizou o banco local. Preserve um backup das alterações ainda não salvas e reabra a versão atualizada.';
    return 'Não foi possível confirmar a gravação no banco local. Os dados anteriores permanecem disponíveis; mantenha esta aba aberta e exporte suas alterações.';
  }
  async function recoverySnapshot() {
    const result = { format: 'cronicas-character-storage-recovery-v1', createdAt: new Date().toISOString(), localStorage: legacySnapshot(), indexedDB: {} };
    if (database) {
      const tx = database.transaction('records', 'readonly'), done = completed(tx), store = tx.objectStore('records');
      const keys = await request(store.getAllKeys());
      for (const key of keys) result.indexedDB[key] = await request(store.get(key));
      await done;
    }
    return result;
  }
  async function acknowledgeLegacyChanges() {
    if (failure?.message !== 'LEGACY_STORAGE_CHANGED_AFTER_MIGRATION' || !database) throw new Error('INVALID_STORAGE_RECOVERY_ACTION');
    const source = legacySnapshot();
    const tx = transaction('migration', 'readwrite'), done = completed(tx), store = tx.objectStore('migration');
    const previous = await request(store.get('legacy'));
    if (previous?.status !== 'verified') { tx.abort(); await done; }
    store.put({ ...previous, initialSource: previous.initialSource || previous.source, source, legacyAcknowledgedAt: new Date().toISOString() }, 'legacy');
    await done;
  }
  global.CharacterStorage = Object.freeze({ initialize, get, entries, refresh, commit, recoverySnapshot, acknowledgeLegacyChanges, flush: () => queue, isPending: () => pending > 0, message, keys: { manager: MANAGER, character: CHARACTER, sync: SYNC }, databaseName: DATABASE });
})(window);
