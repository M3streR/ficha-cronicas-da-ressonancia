const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const window = {addEventListener(){}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../js/enchantments.js'),'utf8'), { window, document: {}, JSON, Object });
const api = window.Enchantments;
const sample = (id='one') => ({id,name:'Selo',principle:'Estrutura',grade:'I',action:'Reforçar',target:'Proteção',customTarget:'',description:'Parágrafo 1.\n\nParágrafo 2.'});
test('modelo aceita cinco Princípios, três Graus e fórmula derivada', () => {
  for (const principle of Object.keys(api.principles)) for (const grade of ['I','II','III']) {
    const item = api.validate([{...sample(),principle,grade}])[0];
    assert.equal(api.formula(item),`${principle} + Reforçar + Proteção`);
    assert.equal(item.description,sample().description);
  }
});
test('lista ausente é compatível; quarto registro e IDs duplicados são recusados', () => {
  assert.equal(api.validate(undefined).length,0);
  assert.equal(api.validate([sample('a'),sample('b'),sample('c')]).length,3);
  assert.throws(()=>api.validate([sample('a'),sample('b'),sample('c'),sample('d')]));
  assert.throws(()=>api.validate([sample(),sample()]));
});
test('campos obrigatórios e alvo personalizado são validados sem lista rígida de Ações', () => {
  for (const field of ['name','principle','grade','action','target','description','id']) assert.throws(()=>api.validate([{...sample(),[field]:''}]));
  assert.throws(()=>api.validate([{...sample(),target:'Personalizado'}]));
  const item=api.validate([{...sample(),target:'Personalizado',customTarget:'Um objeto especial',action:'Texto livre'}])[0];
  assert.equal(api.formula(item),'Estrutura + Texto livre + Um objeto especial');
});
