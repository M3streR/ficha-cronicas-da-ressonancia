const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('concorrência preserva o timestamp bruto com microssegundos', async () => {
  const stamp = '2026-09-04 03:00:31.197605+00';
  const row = { id:'22222222-2222-4222-8222-222222222222', owner_id:'11111111-1111-4111-8111-111111111111', name:'Online', synopsis:'', type:'campaign', created_at:'2026-09-04T03:00:00Z', updated_at:stamp };
  const result = { data:[row], error:null };
  const builder = new Proxy({}, { get(_target, property) { if (property === 'then') return (resolve,reject)=>Promise.resolve(result).then(resolve,reject); return () => builder; } });
  const listeners = {};
  const document = { readyState:'loading', addEventListener(){}, getElementById(){return null;}, querySelector(){return null;} };
  const window = { document, setTimeout, addEventListener:(name,fn)=>{listeners[name]=fn;}, dispatchEvent(){}, CustomEvent:class{}, CronicasSupabase:{ ready:Promise.resolve(), authenticated:true, getUser:async()=>({id:row.owner_id}), client:{ from:()=>builder, channel:()=>({on(){return this;},subscribe(){return this;}}), removeChannel(){} } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','js','chronicles-online.js'),'utf8'), { window, document, console, Promise, Map, WeakMap, Set, Date, Number, String, Object, TypeError, Error, CustomEvent:window.CustomEvent });
  const records = await window.ChroniclesOnline.listChronicles();
  assert.equal(records[0].updatedAt, stamp);
});
