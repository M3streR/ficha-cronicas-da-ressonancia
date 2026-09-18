const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const collaborationSource = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'chronicles-collaboration.js'),
  'utf8'
);

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function snapshot(name = 'Personagem') {
  return {
    schemaVersion: '0.3-pre-alpha',
    fields: { nome: name, nivel: '1', classe: 'Vanguarda' },
    skills: {},
    equipment: [],
    abilities: [],
    manifestations: [],
    automaticAbilityFavorites: {},
    activeEffects: [],
    criticalStates: {
      dyingRounds: 0,
      losingMindRounds: 0,
      resonantRecoveryDefensePenalty: false
    }
  };
}

function localCharacter(name = 'Personagem') {
  return {
    ...snapshot(name),
    notes: [{ title: 'Privada', text: 'Não compartilhar' }],
    photo: 'data:image/png;base64,original-local'
  };
}

function createServer(initialRow = null) {
  let sequence = 1;
  const server = {
    row: copy(initialRow),
    selectCount: 0,
    updateCount: 0,
    insertCount: 0,
    lostUpdateResult: false,
    throwAfterUpdateCommit: false,
    throwBeforeUpdate: false,
    nextSelectError: null,
    nextUpdateError: null,
    lastUpdateFilters: null,
    timestamp() {
      const micros = String(sequence++).padStart(6, '0');
      return `2026-09-18T12:00:00.${micros}+00:00`;
    }
  };
  return server;
}

function createClient(server) {
  class Query {
    constructor(table) {
      this.table = table;
      this.operation = null;
      this.payload = null;
      this.filters = [];
    }

    select() {
      if (!this.operation) this.operation = 'select';
      return this;
    }

    insert(payload) {
      this.operation = 'insert';
      this.payload = copy(payload);
      return this;
    }

    update(payload) {
      this.operation = 'update';
      this.payload = copy(payload);
      return this;
    }

    eq(column, value) {
      this.filters.push([column, value]);
      return this;
    }

    matches(row) {
      return Boolean(row) && this.filters.every(([column, value]) => row[column] === value);
    }

    async execute() {
      assert.equal(this.table, 'online_characters');
      if (this.operation === 'select') {
        server.selectCount += 1;
        if (server.nextSelectError) {
          const error = server.nextSelectError;
          server.nextSelectError = null;
          return { data: null, error };
        }
        return { data: this.matches(server.row) ? copy(server.row) : null, error: null };
      }
      if (this.operation === 'insert') {
        server.insertCount += 1;
        if (server.row) return { data: null, error: { code: '23505', message: 'duplicate' } };
        server.row = {
          id: 'remote-1',
          created_at: server.timestamp(),
          updated_at: server.timestamp(),
          ...copy(this.payload)
        };
        return { data: copy(server.row), error: null };
      }
      if (this.operation === 'update') {
        server.updateCount += 1;
        server.lastUpdateFilters = copy(this.filters);
        if (server.nextUpdateError) {
          const error = server.nextUpdateError;
          server.nextUpdateError = null;
          return { data: null, error };
        }
        if (server.throwBeforeUpdate) {
          server.throwBeforeUpdate = false;
          throw new Error('network unavailable before update');
        }
        if (!this.matches(server.row)) return { data: null, error: null };
        server.row = { ...server.row, ...copy(this.payload), updated_at: server.timestamp() };
        if (server.throwAfterUpdateCommit) {
          server.throwAfterUpdateCommit = false;
          throw new Error('network response lost');
        }
        if (server.lostUpdateResult) {
          server.lostUpdateResult = false;
          return { data: null, error: null };
        }
        return { data: copy(server.row), error: null };
      }
      throw new Error(`Operação inesperada: ${this.operation}`);
    }

    maybeSingle() { return this.execute(); }
    single() { return this.execute(); }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
  }

  return { from: table => new Query(table) };
}

function createStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

function createEnvironment(server, getLocal, storage = createStorage(), options = {}) {
  const listeners = new Map();
  const documentListeners = new Map();
  const backups = [];
  const serviceState = {
    backups,
    replaced: null,
    authenticated: options.authenticated !== false,
    userId: options.userId || 'owner-1'
  };
  function addListener(registry, type, listener) {
    const current = registry.get(type) || new Set();
    current.add(listener);
    registry.set(type, current);
  }
  function emit(registry, type, detail = {}) {
    (registry.get(type) || []).forEach(listener => listener({ type, detail }));
  }
  const document = {
    hidden: false,
    getElementById: () => null,
    createElement: () => ({}),
    addEventListener(type, listener) { addListener(documentListeners, type, listener); }
  };
  const window = {
    localStorage: storage,
    navigator: { onLine: options.online !== false },
    CronicasSupabase: {
      get authenticated() { return serviceState.authenticated; },
      ready: Promise.resolve(),
      getUser: async () => serviceState.authenticated ? { id: serviceState.userId } : null,
      client: createClient(server)
    },
    ChroniclesLocalCharacters: {
      list: () => [getLocal(), ...backups.map(item => item.entry)],
      async createConflictBackup(request) {
        const id = `backup-${backups.length + 1}-identifier`;
        backups.push({
          request: copy(request),
          entry: {
            id,
            name: request.character.fields?.nome || 'Backup',
            level: 1,
            className: request.character.fields?.classe || '',
            thumbnail: '',
            character: copy(request.character)
          }
        });
        return { id, name: backups.at(-1).entry.name, createdAt: request.createdAt };
      },
      async replace(localId, character) {
        serviceState.replaced = { localId, character: copy(character) };
        options.onReplace?.(copy(character));
        return copy(character);
      }
    },
    addEventListener(type, listener) { addListener(listeners, type, listener); },
    dispatchEvent(event) { emit(listeners, event.type, event.detail); },
    setTimeout,
    clearTimeout,
    console
  };
  const context = vm.createContext({
    window,
    document,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    console,
    setTimeout,
    clearTimeout,
    Intl,
    Date,
    JSON,
    Map,
    Set,
    Promise
  });
  vm.runInContext(collaborationSource, context, { filename: 'chronicles-collaboration.js' });
  serviceState.emit = (type, detail = {}) => emit(listeners, type, detail);
  serviceState.setOnline = online => {
    window.navigator.onLine = online;
    emit(listeners, online ? 'online' : 'offline');
  };
  serviceState.setAuthenticated = (authenticated, userId = serviceState.userId) => {
    serviceState.authenticated = authenticated;
    serviceState.userId = userId;
    emit(listeners, 'cronicas:auth-change', { user: authenticated ? { id: userId } : null });
  };
  serviceState.setVisible = visible => {
    document.hidden = !visible;
    emit(documentListeners, 'visibilitychange');
  };
  return { api: window.ChroniclesCollaboration, storage, serviceState };
}

function publishedRow(character, server) {
  return {
    id: 'remote-1',
    owner_id: 'owner-1',
    source_local_id: 'local-1',
    name: character.fields.nome,
    level: 1,
    class_name: 'Vanguarda',
    signature: '',
    thumbnail: 'data:image/webp;base64,thumbnail',
    snapshot: snapshot(character.fields.nome),
    created_at: server.timestamp(),
    updated_at: server.timestamp()
  };
}

test('Supabase prevalece ao abrir ficha publicada e preserva notes/foto somente locais', async () => {
  let local = localCharacter('Versão inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const { api } = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }));

  const first = await api.resolveCharacterForOpen('local-1', local);
  assert.equal(first.fromServer, true);

  server.row.snapshot.fields.nome = 'Versão oficial do servidor';
  server.row.name = 'Versão oficial do servidor';
  server.row.updated_at = server.timestamp();
  const resolved = await api.resolveCharacterForOpen('local-1', local);

  assert.equal(resolved.character.fields.nome, 'Versão oficial do servidor');
  assert.deepEqual(resolved.character.notes, local.notes);
  assert.equal(resolved.character.photo, local.photo);
});

test('duas abas não permitem que escrita antiga sobrescreva versão mais nova', async () => {
  let localA = localCharacter('Inicial');
  let localB = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(localA, server);
  const entry = local => ({ id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local });
  const tabA = createEnvironment(server, () => entry(localA));
  const tabB = createEnvironment(server, () => entry(localB));

  await tabA.api.resolveCharacterForOpen('local-1', localA);
  await tabB.api.resolveCharacterForOpen('local-1', localB);
  localA = localCharacter('Alterada na aba A');
  assert.equal((await tabA.api.synchronizePublishedCharacter('local-1', localA)).ok, true);

  localB = localCharacter('Alterada na aba B');
  const stale = await tabB.api.synchronizePublishedCharacter('local-1', localB);
  assert.equal(stale.conflict, true);
  assert.equal(server.row.snapshot.fields.nome, 'Alterada na aba A');
  assert.equal(server.updateCount, 1);
});

test('autosaves concorrentes usam uma fila por personagem e enviam apenas o estado mais recente', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const { api } = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }));
  await api.resolveCharacterForOpen('local-1', local);

  const previous = localCharacter('Primeira edição');
  local = localCharacter('Edição final');
  const first = api.queueCharacterSync('local-1', previous, { immediate: true });
  const second = api.queueCharacterSync('local-1', local, { immediate: true });
  const [resultA, resultB] = await Promise.all([first, second]);

  assert.equal(resultA.ok, true);
  assert.equal(resultB.ok, true);
  assert.equal(server.updateCount, 1);
  assert.equal(server.row.snapshot.fields.nome, 'Edição final');
  assert.equal('notes' in server.row.snapshot, false);
  assert.equal('photo' in server.row.snapshot, false);
});

test('notes e foto original permanecem locais e não alteram updated_at Online', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const originalUpdatedAt = server.row.updated_at;
  const { api } = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda',
    thumbnail: server.row.thumbnail, character: local
  }));
  await api.resolveCharacterForOpen('local-1', local);

  local.notes = [{ title: 'Outra nota privada', text: 'Continua apenas neste navegador' }];
  local.photo = 'data:image/png;base64,outra-original-local';
  const result = await api.synchronizePublishedCharacter('local-1', local);

  assert.equal(result.ok, true);
  assert.equal(result.unchanged, true);
  assert.equal(server.updateCount, 0);
  assert.equal(server.row.updated_at, originalUpdatedAt);
  assert.equal('notes' in server.row.snapshot, false);
  assert.equal('photo' in server.row.snapshot, false);
});

test('resposta perdida é reconhecida pelo conteúdo salvo sem repetir ou conflitar', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const { api } = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }));
  await api.resolveCharacterForOpen('local-1', local);

  local = localCharacter('Salva apesar da resposta perdida');
  const expectedVersion = server.row.updated_at;
  server.lostUpdateResult = true;
  const result = await api.synchronizePublishedCharacter('local-1', local);

  assert.equal(result.ok, true);
  assert.equal(result.acknowledged, true);
  assert.equal(server.updateCount, 1);
  assert.equal(server.row.snapshot.fields.nome, 'Salva apesar da resposta perdida');
  assert.deepEqual(
    server.lastUpdateFilters.find(([column]) => column === 'updated_at'),
    ['updated_at', expectedVersion],
    'o token deve manter o timestamp bruto, inclusive microssegundos'
  );
});

test('retry da mesma fila confirma save aplicado quando a conexão cai após o commit', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const { api } = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }));
  await api.resolveCharacterForOpen('local-1', local);

  local = localCharacter('Commit concluído, resposta perdida');
  server.throwAfterUpdateCommit = true;
  const firstAttempt = await api.synchronizePublishedCharacter('local-1', local);
  assert.equal(firstAttempt.ok, false);
  assert.equal(server.row.snapshot.fields.nome, 'Commit concluído, resposta perdida');

  await new Promise(resolve => setTimeout(resolve, 1700));
  assert.equal(server.updateCount, 1, 'o retry reconhece o conteúdo remoto sem repetir a escrita');
  assert.equal(api.getCharacterSyncState('local-1').state, 'synced');
});

test('exclusão remota bloqueia republicação automática', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const { api } = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }));
  await api.resolveCharacterForOpen('local-1', local);

  server.row = null;
  local = localCharacter('Edição local posterior');
  const result = await api.synchronizePublishedCharacter('local-1', local);

  assert.equal(result.conflict, true);
  assert.equal(server.insertCount, 0);
  assert.equal(server.row, null);
});

test('personagem somente Local não é publicado pelo autosave', async () => {
  const local = localCharacter('Somente Local');
  const server = createServer();
  const { api } = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }));

  const opened = await api.resolveCharacterForOpen('local-1', local);
  const result = await api.synchronizePublishedCharacter('local-1', local);

  assert.equal(opened.published, false);
  assert.equal(result.localOnly, true);
  assert.equal(server.insertCount, 0);
  assert.equal(server.updateCount, 0);
});

test('motivo do conflito comum e legado sobrevive a refresh', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const storage = createStorage();
  const entry = () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  });
  const first = createEnvironment(server, entry, storage);
  await first.api.resolveCharacterForOpen('local-1', local);
  server.row.snapshot.fields.nome = 'Servidor alterado';
  server.row.name = 'Servidor alterado';
  server.row.updated_at = server.timestamp();
  local = localCharacter('Local alterado');
  assert.equal((await first.api.synchronizePublishedCharacter('local-1', local)).conflict, true);

  const persisted = JSON.parse(storage.getItem('cronicasRessonanciaOnlineCharacterSyncV1:local-1'));
  assert.equal(persisted.conflictReason, 'remote-changed');
  assert.ok(Number.isFinite(Date.parse(persisted.conflictDetectedAt)));
  const reopened = createEnvironment(server, entry, storage);
  assert.equal((await reopened.api.getCharacterConflict('local-1')).reason, 'remote-changed');

  const legacyStorage = createStorage();
  const legacy = createEnvironment(server, entry, legacyStorage);
  assert.equal((await legacy.api.resolveCharacterForOpen('local-1', local)).conflict, true);
  assert.equal((await legacy.api.getCharacterConflict('local-1')).reason, 'legacy-no-base');
});

test('Usar Online cria backup Local e preserva notes e foto original', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const environment = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }), createStorage(), { onReplace: character => { local = character; } });
  await environment.api.resolveCharacterForOpen('local-1', local);
  server.row.snapshot.fields.nome = 'Versão Online escolhida';
  server.row.name = 'Versão Online escolhida';
  server.row.updated_at = server.timestamp();
  local = localCharacter('Versão Local descartada');
  await environment.api.synchronizePublishedCharacter('local-1', local);

  const result = await environment.api.resolveCharacterConflict('local-1', 'use-online');
  assert.equal(result.ok, true);
  assert.equal(environment.serviceState.backups.length, 1);
  assert.equal(environment.serviceState.backups[0].request.kind, 'local');
  assert.equal(environment.serviceState.backups[0].request.character.fields.nome, 'Versão Local descartada');
  assert.ok(Number.isFinite(Date.parse(environment.serviceState.backups[0].request.createdAt)));
  assert.equal(environment.serviceState.replaced.character.fields.nome, 'Versão Online escolhida');
  assert.deepEqual(environment.serviceState.replaced.character.notes, localCharacter().notes);
  assert.equal(environment.serviceState.replaced.character.photo, localCharacter().photo);
  const metadata = JSON.parse(environment.storage.getItem('cronicasRessonanciaOnlineCharacterSyncV1:local-1'));
  assert.equal(metadata.conflict, false);
  assert.equal(metadata.baseUpdatedAt, server.row.updated_at);
});

test('Manter Local cria backup Online e usa CAS com o updated_at relido', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const environment = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }));
  await environment.api.resolveCharacterForOpen('local-1', local);
  server.row.snapshot.fields.nome = 'Versão Online anterior';
  server.row.name = 'Versão Online anterior';
  server.row.updated_at = server.timestamp();
  local = localCharacter('Minha versão escolhida');
  await environment.api.synchronizePublishedCharacter('local-1', local);
  const expectedVersion = server.row.updated_at;

  const result = await environment.api.resolveCharacterConflict('local-1', 'keep-local');
  assert.equal(result.ok, true);
  assert.equal(environment.serviceState.backups.length, 1);
  assert.equal(environment.serviceState.backups[0].request.kind, 'online');
  assert.equal(environment.serviceState.backups[0].request.character.fields.nome, 'Versão Online anterior');
  assert.deepEqual(server.lastUpdateFilters.find(([column]) => column === 'updated_at'), ['updated_at', expectedVersion]);
  assert.equal(server.row.snapshot.fields.nome, 'Minha versão escolhida');
  assert.equal('notes' in server.row.snapshot, false);
  assert.equal('photo' in server.row.snapshot, false);
});

test('retry da resolução não duplica backup idêntico', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const environment = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }));
  await environment.api.resolveCharacterForOpen('local-1', local);
  server.row.snapshot.fields.nome = 'Online';
  server.row.name = 'Online';
  server.row.updated_at = server.timestamp();
  local = localCharacter('Local');
  await environment.api.synchronizePublishedCharacter('local-1', local);

  server.throwBeforeUpdate = true;
  await assert.rejects(environment.api.resolveCharacterConflict('local-1', 'keep-local'), /network unavailable/);
  assert.equal(environment.serviceState.backups.length, 1);
  assert.equal((await environment.api.resolveCharacterConflict('local-1', 'keep-local')).ok, true);
  assert.equal(environment.serviceState.backups.length, 1);
});

test('publicação removida exige manter Local ou republicar explicitamente', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const storage = createStorage();
  const entry = () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  });
  const environment = createEnvironment(server, entry, storage);
  await environment.api.resolveCharacterForOpen('local-1', local);
  server.row = null;
  local = localCharacter('Preservado Local');
  await environment.api.synchronizePublishedCharacter('local-1', local);
  const details = await environment.api.getCharacterConflict('local-1');
  assert.equal(details.reason, 'remote-deleted');
  assert.deepEqual([...details.actions], ['keep-local-only', 'republish']);
  assert.equal((await environment.api.resolveCharacterConflict('local-1', 'keep-local-only')).ok, true);
  assert.equal(storage.getItem('cronicasRessonanciaOnlineCharacterSyncV1:local-1'), null);
  assert.equal(server.insertCount, 0);

  const republishStorage = createStorage();
  server.row = publishedRow(local, server);
  const republish = createEnvironment(server, entry, republishStorage);
  await republish.api.resolveCharacterForOpen('local-1', local);
  server.row = null;
  await republish.api.synchronizePublishedCharacter('local-1', local);
  assert.equal((await republish.api.resolveCharacterConflict('local-1', 'republish')).ok, true);
  assert.equal(server.insertCount, 1);
});

test('conta incorreta e publicação substituída nunca recebem sobrescrita', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const storage = createStorage();
  const entry = () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  });
  const owner = createEnvironment(server, entry, storage);
  await owner.api.resolveCharacterForOpen('local-1', local);
  const wrongAccount = createEnvironment(server, entry, storage, { userId: 'owner-2' });
  assert.equal((await wrongAccount.api.resolveCharacterForOpen('local-1', local)).conflict, true);
  const accountConflict = await wrongAccount.api.getCharacterConflict('local-1');
  assert.equal(accountConflict.reason, 'owner-mismatch');
  assert.deepEqual([...accountConflict.actions], []);
  assert.equal((await wrongAccount.api.resolveCharacterConflict('local-1', 'keep-local')).ok, false);
  assert.equal(server.updateCount, 0);

  const replacementStorage = createStorage();
  const replacement = createEnvironment(server, entry, replacementStorage);
  await replacement.api.resolveCharacterForOpen('local-1', local);
  server.row = { ...server.row, id: 'remote-2', updated_at: server.timestamp() };
  assert.equal((await replacement.api.resolveCharacterForOpen('local-1', local)).conflict, true);
  const replacementConflict = await replacement.api.getCharacterConflict('local-1');
  assert.equal(replacementConflict.reason, 'publication-replaced');
  assert.deepEqual([...replacementConflict.actions], ['use-online']);
  assert.equal((await replacement.api.resolveCharacterConflict('local-1', 'keep-local')).ok, false);
  assert.equal(server.updateCount, 0);
});

test('voltar à conta proprietária reclassifica o conflito e libera resolução segura', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const storage = createStorage();
  const entry = () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  });
  const owner = createEnvironment(server, entry, storage);
  await owner.api.resolveCharacterForOpen('local-1', local);
  const wrongAccount = createEnvironment(server, entry, storage, { userId: 'owner-2' });
  await wrongAccount.api.resolveCharacterForOpen('local-1', local);

  server.row.snapshot.fields.nome = 'Versão da conta proprietária';
  server.row.name = 'Versão da conta proprietária';
  server.row.updated_at = server.timestamp();
  local = localCharacter('Versão Local preservada');
  const signedBackIn = createEnvironment(server, entry, storage);
  const details = await signedBackIn.api.getCharacterConflict('local-1');
  assert.equal(details.reason, 'remote-changed');
  assert.deepEqual([...details.actions], ['use-online', 'keep-local']);
});

test('publicação que reaparece é reclassificada antes de oferecer ações', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const storage = createStorage();
  const entry = () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  });
  const environment = createEnvironment(server, entry, storage);
  await environment.api.resolveCharacterForOpen('local-1', local);
  const original = copy(server.row);
  server.row = null;
  await environment.api.synchronizePublishedCharacter('local-1', local);
  server.row = { ...original, updated_at: server.timestamp() };

  const reopened = createEnvironment(server, entry, storage);
  const details = await reopened.api.getCharacterConflict('local-1');
  assert.equal(details.reason, 'remote-changed');
  assert.deepEqual([...details.actions], ['use-online', 'keep-local']);
});

test('publicação inconsistente é preservada sem oferecer sobrescrita', async () => {
  const local = localCharacter('Local preservado');
  const server = createServer();
  server.row = publishedRow(local, server);
  const storage = createStorage();
  const entry = () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  });
  const original = createEnvironment(server, entry, storage);
  await original.api.resolveCharacterForOpen('local-1', local);
  server.row.snapshot = { fields: { nome: 'Dados incompletos' } };
  server.row.updated_at = server.timestamp();

  const reopened = createEnvironment(server, entry, storage);
  assert.equal((await reopened.api.resolveCharacterForOpen('local-1', local)).conflict, true);
  const details = await reopened.api.getCharacterConflict('local-1');
  assert.equal(details.reason, 'publication-inconsistent');
  assert.deepEqual([...details.actions], []);
  assert.equal((await reopened.api.resolveCharacterConflict('local-1', 'keep-local')).ok, false);
  assert.equal(server.updateCount, 0);
});

test('edição offline permanece Local e sincroniza com comparação de versão ao reconectar', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const environment = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }));
  await environment.api.resolveCharacterForOpen('local-1', local);

  environment.serviceState.setOnline(false);
  local = localCharacter('Editada offline');
  const deferred = await environment.api.queueCharacterSync('local-1', local, { immediate: true });
  assert.equal(deferred.offline, true);
  assert.equal(server.updateCount, 0);
  assert.equal(environment.api.getCharacterSyncState('local-1').state, 'offline');

  environment.serviceState.setOnline(true);
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(server.row.snapshot.fields.nome, 'Editada offline');
  assert.equal(server.updateCount, 1);
  assert.equal(environment.api.getCharacterSyncState('local-1').state, 'synced');
});

test('refresh e reabertura retomam dirty persistido sem outbox adicional', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const storage = createStorage();
  const entry = () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  });
  const first = createEnvironment(server, entry, storage);
  await first.api.resolveCharacterForOpen('local-1', local);
  first.serviceState.setOnline(false);
  local = localCharacter('Persistida antes de fechar');
  await first.api.queueCharacterSync('local-1', local, { defer: true });

  const metadataBefore = JSON.parse(storage.getItem('cronicasRessonanciaOnlineCharacterSyncV1:local-1'));
  assert.equal(metadataBefore.dirty, true);
  const reopened = createEnvironment(server, entry, storage);
  await reopened.api.resumePendingCharacterSync('startup');
  assert.equal(server.row.snapshot.fields.nome, 'Persistida antes de fechar');
  assert.equal(server.updateCount, 1);
  const metadataAfter = JSON.parse(storage.getItem('cronicasRessonanciaOnlineCharacterSyncV1:local-1'));
  assert.equal(metadataAfter.dirty, false);
});

test('mudança remota descoberta em background persiste conflito sem sobrescrever', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const storage = createStorage();
  const environment = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }), storage);
  await environment.api.resolveCharacterForOpen('local-1', local);
  environment.serviceState.setOnline(false);
  local = localCharacter('Minha edição offline');
  await environment.api.queueCharacterSync('local-1', local, { defer: true });
  server.row.snapshot.fields.nome = 'Servidor mais novo';
  server.row.name = 'Servidor mais novo';
  server.row.updated_at = server.timestamp();

  environment.serviceState.setOnline(true);
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(server.updateCount, 0);
  assert.equal(server.row.snapshot.fields.nome, 'Servidor mais novo');
  assert.equal(environment.api.getCharacterSyncState('local-1').state, 'conflict');
  const metadata = JSON.parse(storage.getItem('cronicasRessonanciaOnlineCharacterSyncV1:local-1'));
  assert.equal(metadata.conflict, true);
  assert.equal(metadata.conflictReason, 'remote-changed');
});

test('gatilhos simultâneos de retomada são consolidados pela fila do personagem', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const environment = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }));
  await environment.api.resolveCharacterForOpen('local-1', local);
  environment.serviceState.setOnline(false);
  local = localCharacter('Uma única gravação');
  await environment.api.queueCharacterSync('local-1', local, { defer: true });

  environment.serviceState.setOnline(true);
  environment.serviceState.emit('pageshow');
  environment.serviceState.setVisible(true);
  environment.serviceState.setAuthenticated(true, 'owner-1');
  await new Promise(resolve => setTimeout(resolve, 220));
  assert.equal(server.updateCount, 1);
  assert.equal(server.row.snapshot.fields.nome, 'Uma única gravação');
});

test('erro transitório recebe retry e navigator online não presume servidor acessível', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const environment = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }));
  await environment.api.resolveCharacterForOpen('local-1', local);
  local = localCharacter('Após indisponibilidade temporária');
  server.nextSelectError = { status: 503, message: 'temporarily unavailable' };
  const first = await environment.api.synchronizePublishedCharacter('local-1', local);
  assert.equal(first.failureKind, 'transient');
  assert.equal(first.retryScheduled, true);
  assert.equal(environment.api.getCharacterSyncState('local-1').state, 'reconnecting');
  await new Promise(resolve => setTimeout(resolve, 1700));
  assert.equal(server.row.snapshot.fields.nome, 'Após indisponibilidade temporária');
  assert.equal(environment.api.getCharacterSyncState('local-1').state, 'synced');
});

test('permissão negada persiste falha permanente e não entra em retry infinito', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const storage = createStorage();
  const environment = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }), storage);
  await environment.api.resolveCharacterForOpen('local-1', local);
  local = localCharacter('Não autorizada');
  server.nextSelectError = { status: 403, code: '42501', message: 'permission denied' };
  const result = await environment.api.synchronizePublishedCharacter('local-1', local);
  assert.equal(result.failureKind, 'permission');
  assert.equal(result.retryScheduled, false);
  const countAfterFailure = server.selectCount;
  await environment.api.resumePendingCharacterSync('pageshow');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(server.selectCount, countAfterFailure);
  assert.equal(environment.api.getCharacterSyncState('local-1').state, 'permanent-error');
  const metadata = JSON.parse(storage.getItem('cronicasRessonanciaOnlineCharacterSyncV1:local-1'));
  assert.equal(metadata.lastFailureKind, 'permission');
});

test('logout mantém pendência e login do proprietário retoma com segurança', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const environment = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }));
  await environment.api.resolveCharacterForOpen('local-1', local);
  environment.serviceState.setAuthenticated(false);
  local = localCharacter('Editada durante logout');
  const pending = await environment.api.queueCharacterSync('local-1', local, { immediate: true });
  assert.equal(pending.authRequired, true);
  assert.equal(environment.api.getCharacterSyncState('local-1').state, 'auth-required');

  environment.serviceState.setAuthenticated(true, 'owner-1');
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(server.row.snapshot.fields.nome, 'Editada durante logout');
  assert.equal(environment.api.getCharacterSyncState('local-1').state, 'synced');
});

test('retomada em outra conta preserva o trabalho Local e abre conflito de propriedade', async () => {
  let local = localCharacter('Inicial');
  const server = createServer();
  server.row = publishedRow(local, server);
  const storage = createStorage();
  const entry = () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  });
  const owner = createEnvironment(server, entry, storage);
  await owner.api.resolveCharacterForOpen('local-1', local);
  owner.serviceState.setOnline(false);
  local = localCharacter('Trabalho Local preservado');
  await owner.api.queueCharacterSync('local-1', local, { defer: true });

  const wrongAccount = createEnvironment(server, entry, storage, { userId: 'owner-2' });
  await wrongAccount.api.resumePendingCharacterSync('auth-change');
  assert.equal(server.updateCount, 0);
  assert.equal(wrongAccount.api.getCharacterSyncState('local-1').state, 'conflict');
  const metadata = JSON.parse(storage.getItem('cronicasRessonanciaOnlineCharacterSyncV1:local-1'));
  assert.equal(metadata.conflictReason, 'owner-mismatch');
  assert.equal(local.fields.nome, 'Trabalho Local preservado');
});

test('retomada ignora personagem somente Local', async () => {
  const local = localCharacter('Somente Local');
  const server = createServer();
  const environment = createEnvironment(server, () => ({
    id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: local
  }));
  await environment.api.resumePendingCharacterSync('startup');
  assert.equal(server.selectCount, 0);
  assert.equal(server.updateCount, 0);
});
