const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const flush = () => new Promise(resolve => setImmediate(resolve));
function load(file, window, document) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js',file),'utf8'),{window,document,console,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},Blob,setTimeout,clearTimeout});
}
test('combat: delayed discovery cannot remove a newer subscription or resurrect one after reset', async()=>{
  const requests=[],channels=new Set();
  const client={from(){
    let resolve;const promise=new Promise(r=>resolve=r);requests.push(resolve);
    const builder=new Proxy({}, {get(_,key){return key==='then'?promise.then.bind(promise):()=>builder;}});return builder;
  }, channel(topic){const c={topic,on(){return this;},subscribe(){channels.add(this);return this;}};return c;},removeChannel(c){channels.delete(c);}};
  const document={getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return [];}};
  const window={setTimeout,clearTimeout,addEventListener(){},CronicasSupabase:{ready:Promise.resolve(),getUser:async()=>({id:'u'}),client}};
  load('chronicles-online-combat.js',window,document);
  const api=window.ChroniclesOnlineCombat;
  api.applyDetailMode({id:'online:a',remoteId:'a',storage:'online'});await flush();
  api.applyDetailMode({id:'online:b',remoteId:'b',storage:'online'});await flush();
  requests[1]({data:[{id:'combat-b',chronicle_id:'b',active:true}],error:null});await flush();
  requests[0]({data:[],error:null});await flush();
  assert.ok([...channels].some(c=>c.topic==='online-combat-detail:combat-b'));
  assert.ok([...channels].every(c=>!c.topic.endsWith(':a')));
  api.applyDetailMode({id:'online:c',remoteId:'c',storage:'online'});await flush();api.reset();
  requests[2]({data:[{id:'combat-c',chronicle_id:'c',active:true}],error:null});await flush();
  assert.equal(channels.size,0);
});
test('cover: reserve before upload; immutable paths; failure remains collectible',async()=>{
  const calls=[];
  const window={addEventListener(){},crypto:{randomUUID:()=> 'random'},dispatchEvent(){}};
  load('chronicle-covers.js',window,{});
  const cover={blob:new Blob(['image'],{type:'image/webp'}),width:960,height:540};
  const client={from(){return{insert:async p=>{calls.push(['reserve',p]);return{};}}},storage:{from(){return{upload:async(p,b,o)=>{calls.push(['upload',p,o]);return{error:Error('network')};}}}}};
  await assert.rejects(window.ChronicleCovers.upload(client,'owner','chronicle',cover),/ONLINE_COVER_UPLOAD_FAILED/);
  assert.equal(calls[0][0],'reserve');assert.equal(calls[1][0],'upload');assert.equal(calls[1][2].upsert,false);
  assert.equal(calls[0][1].path,calls[1][1]);
  assert.throws(()=>window.ChronicleCovers.validate({...cover,blob:new Blob(['svg'],{type:'image/svg+xml'})}),/INVALID_TYPE/);
  assert.throws(()=>window.ChronicleCovers.validate({...cover,width:0}),/INVALID_DIMENSIONS/);
});
test('cover: download failure preserves access to Chronicle; cleanup failures are reported',async()=>{
  const events=[],notifications=[];
  const window={addEventListener(){},dispatchEvent:e=>events.push(e),showNotification:t=>notifications.push(t)};
  load('chronicle-covers.js',window,{});
  const client={storage:{from(){return{download:async()=>({error:Error('offline')})}}},functions:{invoke:async()=>({error:Error('offline')})}};
  assert.equal(await window.ChronicleCovers.download(client,{id:'online:a',coverPath:'a/b/c'}),null);
  assert.equal(events[0].type,'cronicas:cover-error');
  assert.equal(await window.ChronicleCovers.cleanup(client,{notify:true}),false);
  assert.equal(notifications.length,2);
});
test('cover: a concurrent mutation gets a sweep after an in-flight login sweep',async()=>{
  let firstResolve,calls=0;
  const window={addEventListener(){}};load('chronicle-covers.js',window,{});
  const client={functions:{invoke:async()=>{calls++;if(calls===1)return new Promise(r=>firstResolve=r);return{data:{removed:1,failed:0}};}}};
  const first=window.ChronicleCovers.cleanup(client);const second=window.ChronicleCovers.cleanup(client);
  firstResolve({data:{removed:0,failed:0}});
  assert.deepEqual(await Promise.all([first,second]),[true,true]);assert.equal(calls,2);
});

test('chronicle index: concurrent reads share one Online request and reuse the session cache',async()=>{
  let queryCount=0,resolveQuery;
  const stored=new Map(),events=[];
  const row={id:'11111111-1111-4111-8111-111111111111',owner_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Online',synopsis:'',type:'campaign',cover_path:null,cover_width:null,cover_height:null,created_at:'2026-09-11T00:00:00Z',updated_at:'2026-09-11T00:00:00.123456Z'};
  const client={from(){queryCount++;const builder={select(){return builder;},order(){return new Promise(resolve=>{resolveQuery=resolve;});}};return builder;},channel(){return{on(){return this;},subscribe(){return this;}}},removeChannel(){}};
  const window={setTimeout,clearTimeout,addEventListener(){},dispatchEvent:event=>events.push(event),sessionStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},CronicasSupabase:{ready:Promise.resolve(),authenticated:true,getUser:async()=>({id:row.owner_id}),client}};
  const document={readyState:'loading',addEventListener(){},getElementById(){return null;}};
  load('chronicles-online.js',window,document);
  const local={listChronicles:async()=>[{id:'local',name:'Local',type:'campaign',createdAt:'2026-09-10T00:00:00Z'}]};
  const router=window.ChroniclesOnline.createRouter(local);
  const first=router.listChronicles();const second=router.listChronicles();await flush();
  assert.equal(queryCount,1);
  resolveQuery({data:[row],error:null});
  const [left,right]=await Promise.all([first,second]);
  assert.equal(left.length,2);assert.equal(right.length,2);
  const cached=await router.listChronicles();
  assert.equal(cached.length,2);assert.equal(queryCount,1);
  assert.equal(events.length,0);
});

test('reusable invite remains active after use until a terminal condition',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../js/chronicles-sharing.js'),'utf8');
  const match=source.match(/function inviteStatus\(invite\) \{[\s\S]*?\n  \}/);
  assert.ok(match);
  const inviteStatus=vm.runInNewContext(`(${match[0]})`,{Date});
  assert.equal(JSON.stringify(inviteStatus({multi_use:true,use_count:3,used_at:'2026-09-11T00:00:00Z'})),JSON.stringify({label:'Ativo',kind:'active'}));
  assert.equal(JSON.stringify(inviteStatus({multi_use:true,use_count:10,max_uses:10})),JSON.stringify({label:'Limite atingido',kind:'limited'}));
  assert.equal(JSON.stringify(inviteStatus({multi_use:true,use_count:3,revoked_at:'2026-09-11T00:00:00Z'})),JSON.stringify({label:'Revogado',kind:'revoked'}));
});
