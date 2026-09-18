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
    updateCount: 0,
    insertCount: 0,
    lostUpdateResult: false,
    throwAfterUpdateCommit: false,
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

function createEnvironment(server, getLocal, storage = createStorage()) {
  const listeners = new Map();
  const window = {
    localStorage: storage,
    CronicasSupabase: {
      authenticated: true,
      ready: Promise.resolve(),
      getUser: async () => ({ id: 'owner-1' }),
      client: createClient(server)
    },
    ChroniclesLocalCharacters: { list: () => [getLocal()] },
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatchEvent() {},
    setTimeout,
    clearTimeout,
    console
  };
  const context = vm.createContext({
    window,
    document: { getElementById: () => null, createElement: () => ({}) },
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
  return { api: window.ChroniclesCollaboration, storage };
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
