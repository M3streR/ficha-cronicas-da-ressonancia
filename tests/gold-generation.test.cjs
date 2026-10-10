const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/gold-generation.js'), 'utf8'), { window });
const api = window.GoldGeneration;
const config = { enabled: true, calculation: 'numeric', aspect: 'Alvos', normalValue: '2', enhancedValue: '', basePnCost: '3' };
const unlocked = () => ({ ...api.normalizeState(), unlocked: true, active: true });

test('ficha antiga e cópia começam sem desbloqueio; duplicação preserva configurações dormentes', () => {
  assert.equal(api.normalizeState().unlocked, false);
  const state = unlocked(); state.round = 8; state.availableFromRound = 9;
  state.officialEnhancements['Vanguarda:1'] = config;
  const copy = api.duplicate(state);
  assert.equal(copy.unlocked, false); assert.equal(copy.active, false);
  assert.equal(copy.round, 8); assert.equal(copy.officialEnhancements['Vanguarda:1'].aspect, 'Alvos');
  assert.equal(state.round, 8);
});
test('custo é base +2 e somente o aspecto declarado é dobrado', () => {
  const result = api.use(unlocked(), config, undefined, 12);
  assert.equal(result.pn, 7); assert.equal(result.info.result, '4'); assert.equal(result.info.totalCost, 5);
  assert.equal(config.normalValue, '2');
  assert.equal(api.enhancement(config, 0).totalCost, 2);
  assert.equal(api.enhancement({ ...config, normalValue: '2,5' }, 1).result, '5');
});
test('contadores legados são inativos; usos sucessivos debitam PN sem bloquear por rodada', () => {
  const state = unlocked(); state.round = 1; state.availableFromRound = 100;
  const first = api.use(state, config, 3, 16);
  const second = api.use(first.state, config, 3, first.pn);
  assert.equal(first.pn, 11); assert.equal(second.pn, 6);
  assert.equal(second.state.round, 1); assert.equal(second.state.availableFromRound, 100);
  const restored = api.normalizeState(JSON.parse(JSON.stringify(second.state)));
  restored.active = false; assert.throws(() => api.use(restored, config, 3, 6));
  restored.active = true; assert.equal(api.use(restored, config, 3, 6).pn, 1);
  assert.throws(() => api.use(restored, config, 3, 1), /PN insuficiente/);
  assert.equal(Object.hasOwn(api.normalizeState(), 'round'), false);
  assert.equal(Object.hasOwn(api.normalizeState(), 'availableFromRound'), false);
});
test('efeito complexo usa resultado explícito, nunca interpreta descrição ou custo textual', () => {
  const manual = { ...config, calculation: 'manual', normalValue: '2d8', enhancedValue: '4d8' };
  assert.equal(api.enhancement(manual).result, '4d8');
  assert.throws(() => api.enhancement({ ...config, normalValue: '2d8' }));
  assert.throws(() => api.enhancement({ ...config, basePnCost: '3 PN adicionais' }));
  assert.throws(() => api.enhancement({ ...manual, enhancedValue: '' }));
});
test('PN insuficiente, modo inativo e metadados inválidos não podem consumir recursos', () => {
  assert.throws(() => api.use(unlocked(), config, 3, 4));
  assert.throws(() => api.use(api.normalizeState(), config, 0, 30));
  assert.throws(() => api.use(unlocked(), { ...config, enabled: false }, 0, 30));
  assert.throws(() => api.normalizeState({ version: 2 }));
  assert.throws(() => api.configuration({ normalValue: {} }));
  assert.throws(() => api.normalizeState({ officialEnhancements: JSON.parse('{"__proto__": {}}') }));
});
