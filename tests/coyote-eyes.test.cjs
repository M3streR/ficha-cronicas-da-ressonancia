const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const original = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/coyote-test.json'),'utf8'));
const window = {crypto:require('node:crypto').webcrypto};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/gold-generation.js'),'utf8'),{window});
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/coyote-eyes.js'),'utf8'),{window});
const api=window.CoyoteEyes;
const plain=value=>JSON.parse(JSON.stringify(value));
test('original íntegro, incluindo custo 02, nomes, vazios e quebras de linha',()=>{
 const result=api.initialize(original);
 assert.deepEqual(original.manifestations,require('./fixtures/coyote-test.json').manifestations);
 assert.deepEqual(plain(result.manifestations.map(({coyoteRecordId,...record})=>record)),original.manifestations);
 assert.equal(result.manifestations[2].custo,'02');
 assert.equal(result.coyoteEyes.blockedRightRecordId,result.manifestations[2].coyoteRecordId);
 assert.deepEqual(plain(result.fields),original.fields);
});
test('inicialização única preserva edições e conjunto vazio sem regenerar',()=>{
 const data=api.initialize(original); data.coyoteEyes.confidentManifestations=[];
 const again=api.initialize(data);
 assert.deepEqual(plain(again.coyoteEyes.confidentManifestations),[]);
 assert.equal(again.coyoteEyes.blockedRightRecordId,data.coyoteEyes.blockedRightRecordId);
 data.manifestations[2].nome='Nome editado';
 assert.equal(api.initialize(data).manifestations[2].nome,'Nome editado');
});
test('não infere o registro original pelo nome nem seleciona duplicatas ambíguas',()=>{
 const altered=plain(original); altered.manifestations[2].efeito='Outra habilidade';
 assert.throws(()=>api.initialize(altered),/confirmada/);
 altered.manifestations.push(original.manifestations[2],original.manifestations[2]);
 assert.throws(()=>api.initialize(altered),/confirmada/);
});
test('vinculação confirmada exige identidade original e proprietário; cópias não herdam acesso',()=>{
 const context={localId:'test-coyote',ownerId:'test-owner'};
 assert.equal(api.eligible(context),false);
 assert.equal(api.eligible(context,[context]),true);
 assert.equal(api.eligible({...context,ownerId:'other'},[context]),false);
 assert.equal(api.eligible({...context,localId:'copy'},[context]),false);
 const confirmed={localId:'0049dc8f-fd8d-4d9a-8475-f046ac4de106',ownerId:'066d66c0-d5e7-48a9-81c7-35b593d0648b'};
 assert.equal(api.eligible(confirmed),true);
 assert.equal(api.eligible({...confirmed,ownerId:'other-account'}),false);
 assert.equal(api.eligible({...confirmed,localId:'imported-copy'}),false);
});
test('registros Confiante têm custos corretos, textos definidos e nenhuma automação/configuração',()=>{
 const records=plain(api.initialConfident());
 assert.deepEqual(records.map(r=>r.custo),['3','2','2']);
 assert.match(records[0].descricao,/1d6 de dano adicional/);
 assert.match(records[1].descricao,/6 metros/);
 assert.match(records[2].descricao,/Vontade contra o Limiar/);
 records.forEach(r=>{assert.equal(r.acao,'');assert.equal(r.signatureEnhancement,undefined);});
});
test('normalização preserva conjuntos, restrição por identidade e configurações explícitas',()=>{
 const eyes=api.initialize(original).coyoteEyes;
 eyes.confidentManifestations[0].signatureEnhancement={enabled:true,calculation:'numeric',aspect:'Alvos',normalValue:'1',enhancedValue:'2',basePnCost:'3'};
 assert.deepEqual(plain(api.normalize(eyes)),plain(eyes));
 assert.equal(api.normalize(undefined),undefined);
 assert.throws(()=>api.normalize({...eyes,version:2}));
 assert.throws(()=>api.normalize({...eyes,activeEye:'left'}));
 assert.throws(()=>api.normalize({...eyes,confidentManifestations:[{custo:'-1'}]}));
});
