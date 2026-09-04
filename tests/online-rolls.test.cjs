const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const USER = '11111111-1111-4111-8111-111111111111';
const CHRONICLE = '22222222-2222-4222-8222-222222222222';
const CHARACTER = '33333333-3333-4333-8333-333333333333';
const COMBAT = '44444444-4444-4444-8444-444444444444';

function queryFor(table) {
  const rows = {
    online_characters: [{ id: CHARACTER }],
    chronicle_cast_members: [{ chronicle_id: CHRONICLE, character_id: CHARACTER }],
    chronicles: [{ id: CHRONICLE, name: 'Crônica Online' }],
    chronicle_confrontations: [{ id: COMBAT, chronicle_id: CHRONICLE, name: 'Batalha' }],
    confrontation_character_links: [{ confrontation_id: COMBAT, character_id: CHARACTER }]
  }[table] || [];
  const result = { data: rows, error: null };
  const builder = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return () => builder;
    }
  });
  return builder;
}

function loadModule() {
  const rpcCalls = [];
  const window = {
    CronicasSupabase: {
      ready: Promise.resolve(),
      getUser: async () => ({ id: USER }),
      client: {
        from: queryFor,
        rpc: async (name, payload) => { rpcCalls.push({ name, payload }); return { data: payload.p_id, error: null }; }
      }
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'chronicles-online-rolls.js'), 'utf8');
  vm.runInNewContext(source, { window, console, Map, Set, Promise, Number, Array, String, Object, Date, RegExp, Error });
  return { api: window.ChroniclesOnlineRolls, rpcCalls };
}

test('destinos combinam Local, Crônica Online e combate ativo sem envio global', async () => {
  const { api } = loadModule();
  const base = {
    listCharacterChronicles: async () => [{ id: 'local-chronicle', name: 'Crônica Local' }],
    appendRoll: async () => ({ characterLinked: true, chronicleLinked: false }),
    listRollHistory: async () => ({ records: [], next: null, destinations: {} }),
    listRollActors: async () => [], clearRollHistory: async () => true
  };
  const destinations = await api.createRouter(base).listCharacterChronicles('local-character-01');
  assert.deepEqual(Array.from(destinations, item => item.name), ['Crônica Local', 'Crônica Online', 'Crônica Online · Combate ativo']);
  assert.match(destinations[1].id, /^online-roll:/);
  assert.match(destinations[2].id, /^online-combat-roll:/);
});

test('registro online reutiliza ID e resultado e preserva histórico local', async () => {
  const { api, rpcCalls } = loadModule();
  const localWrites = [];
  const base = {
    listCharacterChronicles: async () => [],
    appendRoll: async (record, destination) => { localWrites.push({ record, destination }); return { characterLinked: true }; },
    listRollHistory: async () => ({ records: [], next: null, destinations: {} }),
    listRollActors: async () => [], clearRollHistory: async () => true
  };
  const record = { id: '55555555-5555-4555-8555-555555555555', characterName: 'Caçador', source: 'quick-dice', category: 'expression', resolution: 'sum', result: { expression: '2d20+4', quantity: 2, faces: 20, rolls: [7, 13], diceTotal: 20, modifier: 4, total: 24 } };
  const destination = `online-combat-roll:${CHRONICLE}:${COMBAT}:${CHARACTER}`;
  const result = await api.createRouter(base).appendRoll(record, destination);
  assert.equal(localWrites.length, 1);
  assert.equal(localWrites[0].destination, null);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'append_online_roll');
  assert.equal(rpcCalls[0].payload.p_id, record.id);
  assert.deepEqual(Array.from(rpcCalls[0].payload.p_rolls), [7, 13]);
  assert.equal(rpcCalls[0].payload.p_total, 24);
  assert.equal(result.online, true);
});
