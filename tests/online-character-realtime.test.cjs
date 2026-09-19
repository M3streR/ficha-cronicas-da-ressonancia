const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'chronicles-collaboration.js'), 'utf8');
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const wait = (milliseconds = 180) => new Promise(resolve => setTimeout(resolve, milliseconds));

function sharedSnapshot(name) {
  return {
    schemaVersion: '0.3-pre-alpha',
    fields: { nome: name, nivel: '1', classe: 'Vanguarda' },
    skills: {}, equipment: [], abilities: [], manifestations: [], automaticAbilityFavorites: {}, activeEffects: [],
    criticalStates: { dyingRounds: 0, losingMindRounds: 0, resonantRecoveryDefensePenalty: false }
  };
}

function localCharacter(name) {
  return {
    ...sharedSnapshot(name),
    notes: [{ title: 'Privada', text: 'Somente local' }],
    photo: 'data:image/png;base64,original-local'
  };
}

function createHarness(options = {}) {
  let sequence = 1;
  let local = options.local || localCharacter('Inicial');
  const listeners = new Map();
  const documentListeners = new Map();
  const announcements = [];
  const channels = [];
  const removedChannels = [];
  const storageValues = new Map();
  const server = {
    row: options.row === undefined ? null : copy(options.row),
    selects: 0,
    timestamp() {
      return `2026-09-19T12:00:00.${String(sequence++).padStart(6, '0')}+00:00`;
    }
  };

  class Query {
    constructor(table) { this.table = table; this.filters = []; }
    select() { return this; }
    eq(column, value) { this.filters.push([column, value]); return this; }
    maybeSingle() {
      assert.equal(this.table, 'online_characters');
      server.selects += 1;
      const matches = server.row && this.filters.every(([column, value]) => server.row[column] === value);
      return Promise.resolve({ data: matches ? copy(server.row) : null, error: null });
    }
  }

  class Channel {
    constructor(name) { this.name = name; this.bindings = []; this.status = null; }
    on(kind, filter, callback) {
      assert.equal(kind, 'postgres_changes');
      this.bindings.push({ filter, callback });
      return this;
    }
    subscribe(callback) {
      this.status = callback;
      callback?.('SUBSCRIBED');
      return this;
    }
    emit(event) {
      this.bindings.filter(binding => binding.filter.event === event).forEach(binding => binding.callback({
        eventType: event,
        new: { id: server.row?.id },
        old: { id: options.oldRemoteId || 'remote-1' }
      }));
    }
  }

  const client = {
    from: table => new Query(table),
    channel(name) { const channel = new Channel(name); channels.push(channel); return channel; },
    removeChannel(channel) { removedChannels.push(channel); return Promise.resolve('ok'); }
  };

  const authorityState = { mode: options.authorityMode || 'editor', canMutate: options.authorityMode !== 'observer' };
  const authority = {
    getState: () => ({ ...authorityState }),
    beginOperation(localId, operation) {
      return authorityState.canMutate ? { localId, operation, generation: 1 } : null;
    },
    authorizeWrite: (_localId, token) => authorityState.canMutate && Boolean(token),
    endOperation() {},
    activate(_localId, activation = {}) {
      authorityState.mode = activation.restricted ? 'restricted' : 'editor';
      authorityState.canMutate = true;
    },
    announce(type, localId, payload) { announcements.push({ type, localId, payload: copy(payload) }); }
  };

  function addListener(registry, type, listener) {
    const values = registry.get(type) || [];
    values.push(listener);
    registry.set(type, values);
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
    CharacterEditAuthority: authority,
    CronicasSupabase: {
      authenticated: true,
      ready: Promise.resolve(),
      getUser: async () => ({ id: 'owner-1' }),
      client
    },
    ChroniclesLocalCharacters: {
      list: () => [{
        id: 'local-1', name: local.fields.nome, level: 1, className: 'Vanguarda', thumbnail: 'thumb', character: copy(local)
      }],
      async replace(localId, character, replaceOptions) {
        assert.equal(localId, 'local-1');
        assert.equal(replaceOptions.operation, 'realtime-reconcile');
        assert.ok(replaceOptions.authorityToken);
        local = copy(character);
        return copy(local);
      }
    },
    localStorage: {
      getItem: key => storageValues.get(key) || null,
      setItem: (key, value) => storageValues.set(key, String(value)),
      removeItem: key => storageValues.delete(key)
    },
    navigator: { onLine: true },
    addEventListener(type, listener) { addListener(listeners, type, listener); },
    dispatchEvent(event) { emit(listeners, event.type, event.detail); },
    setTimeout,
    clearTimeout,
    console
  };
  const context = vm.createContext({
    window, document, console, setTimeout, clearTimeout, Intl, Date, JSON, Map, Set, Promise,
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  });
  vm.runInContext(source, context, { filename: 'chronicles-collaboration.js' });

  return {
    api: window.ChroniclesCollaboration,
    server,
    channels,
    announcements,
    removedChannels,
    get local() { return copy(local); },
    setLocal(character) { local = copy(character); },
    setAuthority(mode, canMutate = !['observer', 'closed'].includes(mode)) {
      authorityState.mode = mode;
      authorityState.canMutate = canMutate;
    },
    emitWindow(type, detail = {}) { emit(listeners, type, detail); }
  };
}

function publishedRow(character, server, id = 'remote-1') {
  return {
    id,
    owner_id: 'owner-1',
    source_local_id: 'local-1',
    name: character.fields.nome,
    level: 1,
    class_name: 'Vanguarda',
    signature: '',
    thumbnail: 'data:image/webp;base64,thumbnail',
    snapshot: sharedSnapshot(character.fields.nome),
    created_at: server.timestamp(),
    updated_at: server.timestamp()
  };
}

async function openPublishedHarness() {
  const harness = createHarness();
  harness.server.row = publishedRow(harness.local, harness.server);
  await harness.api.resolveCharacterForOpen('local-1', harness.local);
  const started = await harness.api.startCharacterRealtime('local-1');
  assert.equal(started.started, true);
  return harness;
}

test('UPDATE invalida, relê o Supabase e atualiza ficha limpa preservando dados locais', async () => {
  const harness = await openPublishedHarness();
  harness.server.row.snapshot.fields.nome = 'Confirmada em outro dispositivo';
  harness.server.row.name = 'Confirmada em outro dispositivo';
  harness.server.row.updated_at = harness.server.timestamp();
  harness.channels.at(-1).emit('UPDATE');
  await wait();

  assert.equal(harness.local.fields.nome, 'Confirmada em outro dispositivo');
  assert.deepEqual(harness.local.notes, localCharacter('x').notes);
  assert.equal(harness.local.photo, localCharacter('x').photo);
  assert.equal(harness.api.getCharacterSyncState('local-1').state, 'synced');
  assert.equal(harness.announcements.filter(item => item.type === 'remote-reconciled').length, 1);
});

test('eventos duplicados e fora de ordem apenas relêem a autoridade e não criam loop', async () => {
  const harness = await openPublishedHarness();
  harness.server.row.snapshot.fields.nome = 'Versão final';
  harness.server.row.name = 'Versão final';
  harness.server.row.updated_at = harness.server.timestamp();
  const channel = harness.channels.at(-1);
  channel.emit('UPDATE');
  channel.emit('UPDATE');
  channel.emit('UPDATE');
  await wait(260);
  const reconciled = harness.announcements.filter(item => item.type === 'remote-reconciled');
  assert.equal(harness.local.fields.nome, 'Versão final');
  assert.equal(reconciled.length, 1);
  assert.ok(harness.server.selects <= 3, 'eventos próximos são consolidados');
});

test('ficha dirty nunca é substituída e mudança externa vira conflito sem modal', async () => {
  const harness = await openPublishedHarness();
  const draft = localCharacter('Meu rascunho');
  harness.setLocal(draft);
  await harness.api.queueCharacterSync('local-1', draft, { defer: true });
  harness.server.row.snapshot.fields.nome = 'Versão externa';
  harness.server.row.name = 'Versão externa';
  harness.server.row.updated_at = harness.server.timestamp();
  harness.channels.at(-1).emit('UPDATE');
  await wait();

  assert.equal(harness.local.fields.nome, 'Meu rascunho');
  assert.equal(harness.api.getCharacterSyncState('local-1').state, 'conflict');
  assert.equal(harness.announcements.some(item => item.type === 'conflict-created'), true);
});

test('UPDATE do próprio save reconhece resposta perdida e limpa dirty', async () => {
  const harness = await openPublishedHarness();
  const draft = localCharacter('Save já confirmado');
  harness.setLocal(draft);
  await harness.api.queueCharacterSync('local-1', draft, { defer: true });
  harness.server.row.snapshot = sharedSnapshot('Save já confirmado');
  harness.server.row.name = 'Save já confirmado';
  harness.server.row.thumbnail = 'thumb';
  harness.server.row.updated_at = harness.server.timestamp();
  harness.channels.at(-1).emit('UPDATE');
  await wait();

  assert.equal(harness.local.fields.nome, 'Save já confirmado');
  assert.equal(harness.api.getCharacterSyncState('local-1').state, 'synced');
  const acknowledgement = harness.announcements.find(item => item.type === 'remote-reconciled');
  assert.equal(acknowledgement?.payload?.acknowledged, true);
});

test('DELETE relê o servidor e registra publicação removida sem republicar', async () => {
  const harness = await openPublishedHarness();
  harness.server.row = null;
  harness.channels.at(-1).emit('DELETE');
  await wait();
  const state = harness.api.getCharacterSyncState('local-1');
  assert.equal(state.state, 'conflict');
  assert.equal(state.conflictReason, 'remote-deleted');
});

test('republicação com novo remoteId é classificada como substituição', async () => {
  const harness = await openPublishedHarness();
  harness.server.row = publishedRow(harness.local, harness.server, 'remote-2');
  harness.channels.at(-1).emit('INSERT');
  await wait();
  const state = harness.api.getCharacterSyncState('local-1');
  assert.equal(state.state, 'conflict');
  assert.equal(state.conflictReason, 'publication-replaced');
});

test('INSERT detecta primeira publicação e recria filtros para o remoteId confirmado', async () => {
  const harness = createHarness();
  await harness.api.resolveCharacterForOpen('local-1', harness.local);
  await harness.api.startCharacterRealtime('local-1');
  harness.server.row = publishedRow(harness.local, harness.server);
  harness.channels.at(-1).emit('INSERT');
  await wait(240);

  assert.equal(harness.api.getCharacterSyncState('local-1').state, 'synced');
  assert.ok(harness.channels.length >= 2, 'a primeira publicação recria a subscription com o id remoto');
  assert.equal(harness.api.getCharacterRealtimeState().remoteId, 'remote-1');
  assert.deepEqual(
    harness.channels.at(-1).bindings.map(binding => binding.filter.event),
    ['INSERT', 'UPDATE', 'DELETE']
  );
});

test('conflito resolvido em outro dispositivo só é limpo após releitura equivalente', async () => {
  const harness = await openPublishedHarness();
  const draft = localCharacter('Escolha Local confirmada fora');
  harness.setLocal(draft);
  await harness.api.queueCharacterSync('local-1', draft, { defer: true });
  harness.server.row.snapshot = sharedSnapshot('Outra versão');
  harness.server.row.name = 'Outra versão';
  harness.server.row.updated_at = harness.server.timestamp();
  harness.channels.at(-1).emit('UPDATE');
  await wait();
  assert.equal(harness.api.getCharacterSyncState('local-1').state, 'conflict');

  harness.server.row.snapshot = sharedSnapshot('Escolha Local confirmada fora');
  harness.server.row.name = 'Escolha Local confirmada fora';
  harness.server.row.thumbnail = 'thumb';
  harness.server.row.updated_at = harness.server.timestamp();
  harness.channels.at(-1).emit('UPDATE');
  await wait();
  assert.equal(harness.api.getCharacterSyncState('local-1').state, 'synced');
  assert.equal(
    harness.announcements.some(item => item.type === 'remote-reconciled' && item.payload.conflictResolved),
    true
  );
});

test('somente a instância editora assina e callback antigo é invalidado ao parar', async () => {
  const observer = createHarness({ authorityMode: 'observer' });
  observer.server.row = publishedRow(observer.local, observer.server);
  const refused = await observer.api.startCharacterRealtime('local-1');
  assert.equal(refused.started, false);
  assert.equal(observer.channels.length, 0);

  const editor = await openPublishedHarness();
  const oldChannel = editor.channels.at(-1);
  const selectsBefore = editor.server.selects;
  editor.api.stopCharacterRealtime('local-1');
  oldChannel.emit('UPDATE');
  await wait();
  assert.equal(editor.server.selects, selectsBefore);
  assert.equal(editor.removedChannels.includes(oldChannel), true);
});

test('offline remove subscription e online recria sem depender do evento perdido', async () => {
  const harness = await openPublishedHarness();
  const first = harness.channels.at(-1);
  harness.emitWindow('offline');
  assert.equal(harness.removedChannels.includes(first), true);
  harness.server.row.snapshot.fields.nome = 'Mudou enquanto offline';
  harness.server.row.name = 'Mudou enquanto offline';
  harness.server.row.updated_at = harness.server.timestamp();
  harness.emitWindow('online');
  await wait(240);
  assert.ok(harness.channels.length >= 2);
  harness.channels.at(-1).emit('UPDATE');
  await wait();
  assert.equal(harness.local.fields.nome, 'Mudou enquanto offline');
});

test('logout remove subscription e login recria uma única subscription ativa', async () => {
  const harness = await openPublishedHarness();
  const first = harness.channels.at(-1);
  harness.emitWindow('cronicas:auth-change', { user: null });
  assert.equal(harness.removedChannels.includes(first), true);
  harness.emitWindow('cronicas:auth-change', { user: { id: 'owner-1' } });
  await wait();
  assert.ok(harness.channels.length >= 2);
  assert.equal(harness.api.getCharacterRealtimeState().localId, 'local-1');
});
