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
test('recurso acompanha JSON e cópias sem depender de conta ou ID do navegador',()=>{
 assert.equal(api.eligible(original),true);
 const prepared=api.initialize(original);
 prepared.manifestations[0].nome='Edição preservada';
 assert.equal(api.eligible(plain(prepared)),true);
 assert.equal(api.eligible({fields:{nome:'Coyote Summers',assinatura:'Fantasmagoria'},manifestations:[]}),false);
 assert.equal(api.eligible({localId:'qualquer-id',ownerId:'qualquer-conta'}),false);
 const partial=plain(original);partial.manifestations.pop();
 assert.equal(api.eligible(partial),false);
 assert.equal(api.eligible({coyoteEyes:{version:999}}),false);
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
