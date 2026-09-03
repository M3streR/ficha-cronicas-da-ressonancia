/* Run with node; requires Playwright. Uses a fresh browser profile and isolated DB fixtures. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const checks = [];
const check = (value, label) => { assert.ok(value, label); checks.push(label); console.log('OK', label); };
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.webp':'image/webp' };
const server = http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = await fs.readFile(file); res.writeHead(200, {'Content-Type':mime[path.extname(file)]||'application/octet-stream'}); res.end(data);
  } catch (_) { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport:{width:1366,height:950}, reducedMotion:'reduce' });
  const page = await context.newPage(), errors=[];
  await fs.mkdir(path.join(__dirname,'artifacts'),{recursive:true});
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type()==='error' && !message.text().includes('404')) errors.push(message.text()); });
  page.on('dialog', dialog => dialog.accept());
  try {
    await page.goto(url + '/index.html');
    await page.waitForFunction(() => typeof createEmptyCharacterState === 'function' && !!window.RollHistory);
    check(await page.locator('.chronicle-actions-list button').count() === 3,'Exatamente três ações globais');
    check(await page.locator('#newConfrontationAction,#newConfrontationEmpty,#addChronicleParticipantEmpty,#manageChronicleCastAction').count() === 0,'Atalhos redundantes removidos');
    const upgrades = await page.evaluate(async () => {
      const source = await fetch('js/chronicles-storage.js').then(r=>r.text());
      const req = r => new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const done = t=>new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onabort=()=>reject(t.error);});
      const liveApi = window.ChroniclesStorage, out=[];
      const stamp='2026-01-01T00:00:00.000Z';
      const fixtures={ chronicles:{id:'c',schemaVersion:1,name:'Preservada',type:'campaign',synopsis:'',hasCover:true,createdAt:stamp,updatedAt:stamp},
        chronicleCovers:{chronicleId:'c',blob:new Blob(['original-cover'],{type:'image/webp'}),width:960,height:540},
        chronicleCastLinks:{chronicleId:'c',characterId:'p'}, chronicleParticipants:{id:'person',chronicleId:'c',name:'Pessoa',createdAt:stamp,updatedAt:stamp},
        chronicleConfrontations:{id:'battle',chronicleId:'c',name:'Combate',description:'',createdAt:stamp,updatedAt:stamp},
        confrontationCharacterLinks:{confrontationId:'battle',characterId:'p'},
        confrontationAdversaries:{id:'enemy',confrontationId:'battle',name:'Adversário',createdAt:stamp,updatedAt:stamp},
        chronicleMasterNotes:{chronicleId:'c',content:'Nota antiga\nSegundo parágrafo',updatedAt:stamp} };
      for(const version of [1,2,3,4,5]) {
        const name='v6-upgrade-'+version+'-'+crypto.randomUUID();
        const opening=indexedDB.open(name,version);
        opening.onupgradeneeded=()=>{
          const d=opening.result, c=d.createObjectStore('chronicles',{keyPath:'id'}); for(const key of ['createdAt','updatedAt','type']) c.createIndex(key,key);
          d.createObjectStore('chronicleCovers',{keyPath:'chronicleId'});
          if(version>=2){const s=d.createObjectStore('chronicleCastLinks',{keyPath:['chronicleId','characterId']});for(const key of ['chronicleId','characterId'])s.createIndex(key,key);}
          if(version>=3)d.createObjectStore('chronicleParticipants',{keyPath:'id'}).createIndex('chronicleId','chronicleId');
          if(version>=4){d.createObjectStore('chronicleConfrontations',{keyPath:'id'}).createIndex('chronicleId','chronicleId');d.createObjectStore('confrontationCharacterLinks',{keyPath:['confrontationId','characterId']}).createIndex('confrontationId','confrontationId');d.createObjectStore('confrontationAdversaries',{keyPath:'id'}).createIndex('confrontationId','confrontationId');}
          if(version>=5)d.createObjectStore('chronicleMasterNotes',{keyPath:'chronicleId'});
        };
        const old=await req(opening), names=[...old.objectStoreNames], tx=old.transaction(names,'readwrite');
        names.forEach(n=>tx.objectStore(n).add(fixtures[n])); await done(tx);old.close();
        (0,eval)(source.replace("'cronicasRessonanciaChronicles'",JSON.stringify(name)));
        await ChroniclesStorage.getChronicle('c');
        const upgraded=await req(indexedDB.open(name));
        if(upgraded.version!==6 || upgraded.objectStoreNames.length!==14)throw Error('Invalid upgrade');
        for(const n of names){const actual=(await req(upgraded.transaction(n).objectStore(n).getAll()))[0];if(n==='chronicleCovers'){if(await actual.blob.text()!=='original-cover')throw Error('Cover lost');}else if(JSON.stringify(actual)!==JSON.stringify(fixtures[n]))throw Error('Changed '+n);}
        out.push('v'+version+' → v6: '+names.length+' stores preservadas'); upgraded.close();
      }
      window.ChroniclesStorage=liveApi;return out;
    }); upgrades.forEach(label=>check(true,label));
    const ids = await page.evaluate(async () => {
      const character=createEmptyCharacterState();character.fields.nome='Dylann';character.fields.classe='Atirador';character.fields.nivel=2;
      const id='character-v6-test';writeStoredCharacter(id,character);let manager=readCharacterManager()||createEmptyCharacterManager();manager=setCharacterSummary(manager,id,await createCharacterSummary(character));writeCharacterManager(manager);renderCharacterManager();
      const api=ChroniclesStorage,c=await api.createChronicle({name:'Crônica Alpha',type:'campaign',synopsis:'Teste'}),other=await api.createChronicle({name:'Outra Crônica',type:'oneshot',synopsis:''});
      await api.replaceChronicleCast(c.id,[id]);await api.createChronicleParticipant(c.id,{name:'Felipe'});
      const battle=await api.createConfrontation(c.id,{name:'Confronto de teste',description:'Contexto'});
      await api.saveChronicleMasterNote(c.id,'Nota original\nPreservada',{expectedUpdatedAt:null});
      return {character:id,chronicle:c.id,other:other.id,battle:battle.id};
    });
    const storageChecks = await page.evaluate(async ids => {
      const api=ChroniclesStorage,out=[],expect=(v,n)=>{if(!v)throw Error(n);out.push(n);};
      const reject=async fn=>{try{await fn();return false;}catch{return true;}};
      const roll=(id='r-'+crypto.randomUUID())=>({id,schemaVersion:1,characterId:ids.character,characterName:'Dylann',createdAt:new Date().toISOString(),source:'quick-dice',category:'expression',resolution:'sum',result:{expression:'2d20+3',quantity:2,faces:20,modifier:3,rolls:[17,8],diceTotal:25,total:28}});
      const stamp=(await api.getChronicle(ids.chronicle)).updatedAt;
      const r=roll(); await api.appendRoll(r,ids.chronicle);await api.appendRoll(r,ids.chronicle);
      expect((await api.listRollHistory('character',ids.character)).records.length===1,'Retry idempotente');
      await api.clearRollHistory('character',ids.character);
      expect((await api.listRollHistory('chronicle',ids.chronicle)).records.length===1,'Limpar ficha preserva Crônica');
      await api.clearRollHistory('chronicle',ids.chronicle);
      const p=await api.savePrivateEntry('investigation',ids.chronicle,null,{title:'Pista',content:'Conteúdo\nPrivado',revealed:false},{expectedUpdatedAt:null});
      await api.savePrivateEntry('investigation',ids.chronicle,p.id,{title:'Pista',content:p.content,revealed:true},{expectedUpdatedAt:p.updatedAt});
      expect(await reject(()=>api.savePrivateEntry('investigation',ids.chronicle,p.id,{title:'Conflito',content:'não',revealed:false},{expectedUpdatedAt:p.updatedAt})),'Conflito de pista');
      await api.savePrivateEntry('journal',ids.chronicle,null,{title:'Registro',content:'Diário',date:'2026-09-03'},{expectedUpdatedAt:null});
      expect((await api.getChronicle(ids.chronicle)).updatedAt===stamp,'Privados/rolagens não alteram data pública');
      const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){const r=add.apply(this,args);if(this.name==='chronicleRollLinks')this.transaction.abort();return r;};
      expect(await reject(()=>api.appendRoll(roll(),ids.chronicle)),'Abort propagado ao gravar rolagem');IDBObjectStore.prototype.add=add;
      expect((await api.listRollHistory('character',ids.character)).records.length===0,'Rollback de registro e vínculos');
      await api.replaceChronicleCast(ids.chronicle,[]);const lost=await api.appendRoll(roll(),ids.chronicle);
      expect(!lost.chronicleLinked && (await api.listRollHistory('character',ids.character)).records.length===1,'Vínculo removido durante envio preserva rolagem na ficha');
      await api.replaceChronicleCast(ids.chronicle,[ids.character]);
      const sameStamp=new Date().toISOString();
      for(let i=0;i<505;i++){const record=roll('retention-'+String(i).padStart(4,'0'));record.createdAt=sameStamp;await api.appendRoll(record);}
      let page=await api.listRollHistory('character',ids.character),seen=new Set(page.records.map(r=>r.id));while(page.next){page=await api.listRollHistory('character',ids.character,{before:page.next});page.records.forEach(r=>{if(seen.has(r.id))throw Error('Duplicate page');seen.add(r.id);});}
      expect(seen.size===500,'Retenção 500 e paginação estável com horários iguais');await api.clearRollHistory('character',ids.character);
      expect(rollDiceExpression(parseDiceExpression('2d20+3'),()=>8).total===19 && !parseDiceExpression('0d20').valid,'Matemática existente preservada; zero não reinterpretado');
      const cascade=await api.createChronicle({name:'Cascata v6',type:'campaign',synopsis:''});
      await api.replaceChronicleCast(cascade.id,[ids.character]);
      const battle=await api.createConfrontation(cascade.id,{name:'Filho'});
      await api.replaceConfrontationCharacters(battle.id,[ids.character],{expectedCharacterIds:[]});
      await api.createConfrontationAdversary(battle.id,{name:'Inimigo'});
      await api.createChronicleParticipant(cascade.id,{name:'Pessoa'});
      await api.saveChronicleMasterNote(cascade.id,'Nota',{expectedUpdatedAt:null});
      await api.setMasterAccess(cascade.id,{schemeVersion:1,algorithm:'PBKDF2-SHA-256',iterations:600000,salt:'a'.repeat(32),verifier:'b'.repeat(64)},{expectedUpdatedAt:null});
      await api.savePrivateEntry('investigation',cascade.id,null,{title:'Pista',content:'conteúdo',revealed:false},{expectedUpdatedAt:null});
      await api.savePrivateEntry('journal',cascade.id,null,{title:'Diário',content:'conteúdo',date:'2026-09-03'},{expectedUpdatedAt:null});
      const linkedRoll=roll();await api.appendRoll(linkedRoll,cascade.id);
      const del=IDBObjectStore.prototype.delete;
      IDBObjectStore.prototype.delete=function(...args){if(this.name==='chronicleJournalEntries')throw Error('TEST_ABORT');return del.apply(this,args);};
      expect(await reject(()=>api.deleteChronicle(cascade.id)),'Falha na cascata v6 aborta operação inteira');IDBObjectStore.prototype.delete=del;
      expect(!!await api.getChronicle(cascade.id) && (await api.listPrivateEntries('investigation',cascade.id)).length===1 && (await api.listRollHistory('chronicle',cascade.id)).records.length===1,'Rollback preserva Crônica, privados e resultados');
      await api.deleteChronicle(cascade.id);
      const opening=indexedDB.open('cronicasRessonanciaChronicles');const db=await new Promise((resolve,reject)=>{opening.onsuccess=()=>resolve(opening.result);opening.onerror=()=>reject(opening.error);});
      const read=(name,key,index)=>new Promise((resolve,reject)=>{const s=db.transaction(name).objectStore(name),r=index?s.index(index).count(key):s.get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      for(const n of ['chronicleMasterNotes','chronicleMasterAccess'])expect(!(await read(n,cascade.id)), 'Cascata remove '+n);
      for(const n of ['chronicleParticipants','chronicleCastLinks','chronicleConfrontations','chronicleInvestigationEntries','chronicleJournalEntries'])expect((await read(n,cascade.id,'chronicleId'))===0,'Cascata remove '+n);
      expect((await read('confrontationAdversaries',battle.id,'confrontationId'))===0 && (await read('confrontationCharacterLinks',battle.id,'confrontationId'))===0,'Cascata remove dependências de Confrontos');
      expect((await api.listRollHistory('chronicle',cascade.id)).records.length===0 && (await api.listRollHistory('character',ids.character)).records.some(r=>r.id===linkedRoll.id),'Excluir Crônica preserva histórico da ficha');
      await api.clearRollHistory('character',ids.character);
      const batch=db.transaction(['rollRecords','chronicleRollLinks'],'readwrite');
      for(let i=0;i<2005;i++){const r=roll('many-'+String(i).padStart(4,'0'));r.createdAt='2026-01-01T00:00:00.000Z';batch.objectStore('rollRecords').add(r);batch.objectStore('chronicleRollLinks').add({chronicleId:ids.chronicle,rollId:r.id,createdAt:r.createdAt});}
      await new Promise((resolve,reject)=>{batch.oncomplete=resolve;batch.onabort=()=>reject(batch.error);});
      await api.appendRoll(roll(),ids.chronicle);
      expect((await read('chronicleRollLinks',ids.chronicle,'owner'))===2000,'Retenção 2.000 referências por Crônica');
      expect(!(await read('rollRecords','many-0000')),'Coleta remove evento sem nenhuma referência');
      await api.clearRollHistory('chronicle',ids.chronicle);await api.clearRollHistory('character',ids.character);db.close();
      return out;
    },ids);storageChecks.forEach(label=>check(true,label));

    const combatChecks=await page.evaluate(async ids=>{
      const api=ChroniclesStorage,out=[], expect=(v,n)=>{if(!v)throw Error(n);out.push(n);};
      const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const done=t=>new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onabort=()=>reject(t.error);});
      const db=await req(indexedDB.open('cronicasRessonanciaChronicles'));
      let tx=db.transaction('chronicleConfrontations','readwrite');
      const legacy=await req(tx.objectStore('chronicleConfrontations').get(ids.battle));delete legacy.active;tx.objectStore('chronicleConfrontations').put(legacy);await done(tx);
      expect((await api.getConfrontation(ids.battle)).active===false,'Legado sem active é inativo e permanece acessível');
      expect(!Object.hasOwn(await req(db.transaction('chronicleConfrontations').objectStore('chronicleConfrontations').get(ids.battle)),'active'),'Leitura não reescreve legado');
      const spec={characterIds:[ids.character],adversaries:[{name:'Sentinela',pvCurrent:12,pvMax:12,defense:9}]};
      const before=JSON.stringify(await api.listConfrontations(ids.chronicle));
      const original=IDBObjectStore.prototype.add;
      let rejected=false;
      try {
        IDBObjectStore.prototype.add=function(...args){const r=original.apply(this,args);if(this.name==='confrontationAdversaries')this.transaction.abort();return r;};
        try{await api.createConfrontation(ids.chronicle,{name:'Falha parcial'},spec);}catch{rejected=true;}
      }finally{IDBObjectStore.prototype.add=original;}
      expect(rejected&&JSON.stringify(await api.listConfrontations(ids.chronicle))===before,'Falha de composição reverte registro e dependências');
      expect(await req(db.transaction('confrontationAdversaries').objectStore('confrontationAdversaries').count())===0,'Sem adversários parciais');
      expect(await req(db.transaction('confrontationCharacterLinks').objectStore('confrontationCharacterLinks').count())===0,'Sem vínculos parciais');
      rejected=false;try{await api.createConfrontation(ids.chronicle,{name:'Fora do Elenco'},{characterIds:['character-not-in-cast'],adversaries:[]});}catch(e){rejected=e.message==='CHARACTER_NOT_IN_CAST';}
      expect(rejected,'Elenco revalidado no salvamento da composição');
      rejected=false;try{await api.createConfrontation(ids.chronicle,{name:'Vazio'},{characterIds:[],adversaries:[]});}catch(e){rejected=e.message==='EMPTY_CONFRONTATION';}
      expect(rejected,'Criação completa não aceita composição vazia');
      const a=await api.createConfrontation(ids.chronicle,{name:'Concorrente A'},spec),b=await api.createConfrontation(ids.chronicle,{name:'Concorrente B'},spec);
      expect(!a.active&&!b.active,'Salvar prepara sem ativar');
      const put=IDBObjectStore.prototype.put;
      async function abortedActivation(item,value) {
        let failed=false;
        try { IDBObjectStore.prototype.put=function(...args){const r=put.apply(this,args);if(this.name==='chronicleConfrontations')this.transaction.abort();return r;};
          try{await api.setConfrontationActive(item.id,value,{expectedUpdatedAt:item.updatedAt});}catch{failed=true;}
        }finally{IDBObjectStore.prototype.put=put;}return failed;
      }
      expect(await abortedActivation(a,true)&&!(await api.getConfrontation(a.id)).active,'Falha de transação ao iniciar mantém inativo');
      const results=await Promise.allSettled([api.setConfrontationActive(a.id,true,{expectedUpdatedAt:a.updatedAt}),api.setConfrontationActive(b.id,true,{expectedUpdatedAt:b.updatedAt})]);
      expect(results.filter(r=>r.status==='fulfilled').length===1&&results.some(r=>r.reason?.message==='ACTIVE_CONFRONTATION_EXISTS'),'Início concorrente mantém no máximo um ativo por Crônica');
      const active=(await api.listConfrontations(ids.chronicle)).find(c=>c.active);
      const snapshot=JSON.stringify([await api.listConfrontationCharacterIds(active.id),await api.listConfrontationAdversaries(active.id)]);
      expect(await abortedActivation(active,false)&&(await api.getConfrontation(active.id)).active,'Falha ao encerrar mantém ativo e dados intactos');
      expect(Object.keys(active).sort().join(',')==='active,chronicleId,createdAt,description,id,name,updatedAt','Único campo novo é active, sem datas de início ou estados extras');
      const repeated=await api.setConfrontationActive(active.id,true,{expectedUpdatedAt:active.updatedAt});
      expect(repeated.updatedAt===active.updatedAt,'Repetir início não altera versão nem duplica');
      rejected=false;try{await api.setConfrontationActive(active.id,false,{expectedUpdatedAt:'stale'});}catch(e){rejected=e.message==='CONFRONTATION_UPDATE_CONFLICT';}
      expect(rejected&&(await api.getConfrontation(active.id)).active,'Encerramento obsoleto não sobrescreve');
      await api.setConfrontationActive(active.id,false,{expectedUpdatedAt:active.updatedAt});
      expect(snapshot===JSON.stringify([await api.listConfrontationCharacterIds(active.id),await api.listConfrontationAdversaries(active.id)]),'Encerrar preserva composição e IDs');
      expect(!(await api.listConfrontations(ids.chronicle)).some(c=>c.active),'Encerrar deixa Crônica sem ativo');
      for(const item of [a,b]){const current=await api.getConfrontation(item.id);await api.deleteConfrontation(current.id,{expectedUpdatedAt:current.updatedAt});}
      expect(db.version===6&&db.objectStoreNames.length===14,'Banco permanece v6, sem novas stores');
      expect((await api.getChronicleMasterNote(ids.chronicle)).content==='Nota original\nPreservada'&&(await api.listPrivateEntries('journal',ids.chronicle)).length===1&&(await api.listPrivateEntries('investigation',ids.chronicle)).length===1,'Dados privados dos módulos removidos preservados');
      db.close();return out;
    },ids);combatChecks.forEach(label=>check(true,label));
    const openChronicle=async()=>page.evaluate(async ids=>{showCharacterManagerView();showManagerSection('chronicles');await openChronicleDetail(ids.chronicle,1,document.getElementById('openChronicleCreation'));},ids);
    const unlock=async()=>{await page.waitForFunction(()=>document.querySelector('#masterShieldAccess input')&&!document.querySelector('#masterShieldAccess input').disabled);await page.locator('#masterShieldAccess input').first().fill('senha-alpha-123');const second=page.locator('#masterShieldAccess input').nth(1);if(await second.isVisible())await second.fill('senha-alpha-123');await page.locator('#masterShieldAccess form').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>!document.getElementById('masterShieldPrivate').hidden);};
    const shield=async()=>{await page.locator('#openMasterShield').evaluate(b=>b.click());await unlock();};
    const modules=async()=>page.locator('[data-master-module="combats"]').click();
    const addEnemy=async(name,pv=false)=>{await page.locator('#addConfrontationAdversary').click();await page.locator('#confrontationAdversaryName').fill(name);if(pv){await page.locator('#confrontationAdversaryPVCurrent').fill('24');await page.locator('#confrontationAdversaryPVMax').fill('30');await page.locator('#confrontationAdversaryDefense').fill('12');}await page.locator('#confrontationAdversaryForm').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>document.getElementById('confrontationAdversaryForm').hidden);};
    await openChronicle();
    check(await page.locator('[data-chronicle-detail-tab="participants"],[data-chronicle-detail-tab="encounters"]').count()===2,'Abas Participantes e Confrontos preservadas');
    check(await page.locator('#addChronicleParticipant,#newConfrontation').count()===0,'Somente botões de criação externos removidos');
    await page.locator('[data-chronicle-detail-tab="participants"]').click();await page.waitForFunction(()=>document.getElementById('chroniclePanelParticipants').textContent.includes('Felipe'));
    check(true,'Participantes existentes continuam listados');
    await page.locator('#chronicleParticipantsList button').first().click();await page.waitForFunction(()=>!document.getElementById('chronicleParticipantForm').hidden);
    await page.locator('#chronicleParticipantName').fill('Felipe revisado');await page.locator('#chronicleParticipantForm').evaluate(f=>f.requestSubmit());
    await page.waitForFunction(()=>document.getElementById('chronicleParticipantsList').textContent.includes('Felipe revisado'));
    check(true,'Editar Participante e restaurar foco funcionam sem botão Adicionar');
    await page.locator('[data-chronicle-detail-tab="encounters"]').click();await page.waitForFunction(()=>!document.getElementById('confrontationEmpty').hidden);
    check(await page.locator('#confrontationIndex li').count()===0,'Legado não ativado automaticamente na aba externa');
    await shield();
    check((await page.locator('[data-master-module] strong').allTextContents()).join('|')==='Caçadores|Combates','Escudo tem apenas Caçadores e Combates');
    check(await page.locator('#masterNoteForm,#masterResultsModule,#masterRecordsModule,#masterAgentsModule,#masterRecentResults').count()===0,'Sem módulos antigos ou espaços reservados');
    await page.locator('[data-master-module="hunters"]').click();await page.waitForFunction(()=>document.getElementById('masterShieldCastList').textContent.includes('Dylann'));check(true,'Caçadores reutiliza Elenco');
    await page.locator('#backToMasterDashboard').click();await modules();
    await page.waitForFunction(()=>document.getElementById('masterShieldConfrontationsList').textContent.includes('Confronto de teste'));
    check(true,'Confronto legado disponível em Combates');
    await page.locator('#createMasterConfrontation').click();
    check(await page.locator('#masterShieldPrivate #confrontationView').count()===1,'Preparação usa a mesma tela dentro do Escudo');
    await page.locator('#confrontationName').fill('Ataque preparado');await page.locator('#confrontationDescriptionInput').fill('Composição completa');
    await page.locator('#selectConfrontationCharacters').click();
    await page.locator('#confrontationCharacterSearch').fill('Dylann');
    await page.locator('#confrontationSelectionList input[type=checkbox]').check();await page.locator('#confrontationSelectionForm').evaluate(f=>f.requestSubmit());
    await addEnemy('Monstro',true);await addEnemy('Feiticeiro');
    check(await page.evaluate(async id=>(await ChroniclesStorage.listConfrontations(id)).length,ids.chronicle)===1,'Preparação não grava registro vazio ou parcial');
    check(await page.locator('#confrontationName').inputValue()==='Ataque preparado','Formulários de composição preservam identificação');
    await page.locator('#lockMasterShield').click();await unlock();
    check(await page.locator('#confrontationName').inputValue()==='Ataque preparado'&&await page.locator('#confrontationAdversaries li').count()===2,'Bloqueio preserva rascunho e composição');
    await page.evaluate(()=>{window.originalAPI=ChroniclesStorage;ChroniclesStorage={...originalAPI,createConfrontation:async()=>{throw Error('TEST_FAILURE');}};});
    await page.locator('#saveConfrontationComposition').click();await page.waitForFunction(()=>document.getElementById('confrontationFeedback').textContent.includes('Não foi possível'));
    check(await page.locator('#confrontationName').inputValue()==='Ataque preparado'&&await page.locator('#confrontationAdversaries li').count()===2,'Falha de salvamento preserva preenchimento');
    await page.evaluate(()=>{ChroniclesStorage=window.originalAPI;delete window.originalAPI;});
    await page.locator('#saveConfrontationComposition').click();await page.waitForFunction(()=>!document.getElementById('startConfrontation').hidden);
    const prepared=await page.evaluate(async id=>(await ChroniclesStorage.listConfrontations(id)).find(c=>c.name==='Ataque preparado'),ids.chronicle);
    check(!prepared.active,'Salvar composição mantém inativo');
    check(await page.evaluate(async id=>(await ChroniclesStorage.listConfrontationCharacterIds(id)).length===1&&(await ChroniclesStorage.listConfrontationAdversaries(id)).length===2,prepared.id),'Um ID com Caçadores e dois adversários salvos');
    check(await page.evaluate(async id=>(await ChroniclesStorage.listConfrontationAdversaries(id)).find(a=>a.name==='Feiticeiro').pvCurrent===undefined,prepared.id),'Ameaça sem PV mantém campos opcionais ausentes');
    await page.locator('#startConfrontation').click();await page.waitForFunction(()=>!document.getElementById('confrontationView').hidden&&document.getElementById('chronicleMasterShieldView').hidden);
    check(await page.locator('#endConfrontation').isVisible(),'Iniciar abre execução externa com Encerrar');
    check(await page.evaluate(async id=>(await ChroniclesStorage.getConfrontation(id)).active,prepared.id),'Iniciar grava somente active=true');
    check(await page.locator('#confrontationCharacters').textContent().then(t=>t.includes('Dylann')),'Execução usa Caçador selecionado');
    await page.locator('#confrontationAdversaries').getByRole('button',{name:/Editar Monstro/}).click();await page.locator('#confrontationAdversaryPVCurrent').fill('18');await page.locator('#confrontationAdversaryForm').evaluate(f=>f.requestSubmit());
    await page.waitForFunction(()=>document.getElementById('confrontationAdversaryForm').hidden);
    check(await page.evaluate(async id=>(await ChroniclesStorage.getConfrontation(id)).active&&(await ChroniclesStorage.listConfrontationAdversaries(id)).find(a=>a.name==='Monstro').pvCurrent===18,prepared.id),'Edição operacional existente preserva active e adversário');
    await page.reload();await openChronicle();await page.locator('[data-chronicle-detail-tab="encounters"]').click();
    await page.waitForFunction(()=>document.querySelector('#confrontationIndex li'));
    check(await page.locator('#confrontationIndex li').count()===1,'Reload mantém exatamente o Confronto ativo');
    await page.locator('#confrontationIndex button').click();await page.waitForFunction(()=>!document.getElementById('confrontationView').hidden);
    const compositionBefore=await page.evaluate(async id=>JSON.stringify([await ChroniclesStorage.listConfrontationCharacterIds(id),await ChroniclesStorage.listConfrontationAdversaries(id)]),prepared.id);
    await page.locator('#endConfrontation').click();await page.waitForFunction(()=>!document.getElementById('confrontationEmpty').hidden&&!document.getElementById('chronicleDetailView').hidden);
    check(await page.locator('#confrontationIndex li').count()===0,'Encerrar remove ativo da aba externa');
    check(await page.evaluate(async ({id,snapshot})=>!(await ChroniclesStorage.getConfrontation(id)).active&&JSON.stringify([await ChroniclesStorage.listConfrontationCharacterIds(id),await ChroniclesStorage.listConfrontationAdversaries(id)])===snapshot,{id:prepared.id,snapshot:compositionBefore}),'Encerrar não exclui nem muda composição');
    await page.reload();await openChronicle();await page.locator('[data-chronicle-detail-tab="encounters"]').click();await page.waitForFunction(()=>!document.getElementById('confrontationEmpty').hidden);
    check(await page.locator('#confrontationIndex li').count()===0,'Reload mantém encerrado inativo');
    await shield();await modules();await page.waitForFunction(()=>document.getElementById('masterShieldConfrontationsList').textContent.includes('Ataque preparado'));
    check(await page.locator('#masterShieldConfrontationsList li').count()===2,'Preparado/encerrado e legado preservados em Combates');
    await page.locator('#masterShieldConfrontationsList').getByRole('button',{name:'Iniciar Confronto: Ataque preparado',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('chronicleMasterShieldView').hidden&&!document.getElementById('confrontationView').hidden);
    check(await page.evaluate(async id=>(await ChroniclesStorage.getConfrontation(id)).active,prepared.id),'Iniciar pela lista reutiliza o mesmo Confronto encerrado');
    await page.locator('#endConfrontation').click();await page.waitForFunction(()=>!document.getElementById('chronicleDetailView').hidden);await shield();await modules();
    await page.locator('#createMasterConfrontation').click();await page.locator('#confrontationName').fill('Descartar');
    await page.locator('#backFromConfrontation').click();await page.locator('#modalActions button').filter({hasText:'Continuar editando'}).click();
    check(await page.locator('#confrontationName').inputValue()==='Descartar','Cancelar saída mantém preparação');
    await page.locator('#cancelConfrontationComposition').click();await page.locator('#modalActions button').filter({hasText:'Descartar alterações'}).click();
    await page.waitForFunction(()=>!document.getElementById('masterCombatsOverview').hidden);
    check(await page.evaluate(async id=>(await ChroniclesStorage.listConfrontations(id)).length,ids.chronicle)===2,'Descartar não deixa registros');
    for(const width of [1366,1024,390,320]){
      await page.setViewportSize({width,height:950});
      await page.locator('#backToMasterDashboard').click();
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Painel sem overflow '+width);
      await page.screenshot({path:path.join(__dirname,'artifacts/combates-dashboard-'+width+'.png'),fullPage:true});
      await modules();await page.locator('#createMasterConfrontation').click();
      await page.locator('#confrontationName').fill('Visual');
      await page.locator('#selectConfrontationCharacters').click();
      await page.waitForFunction(()=>document.querySelector('#confrontationSelectionList input'));
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Composição sem overflow '+width);
      await page.screenshot({path:path.join(__dirname,'artifacts/combates-preparacao-'+width+'.png'),fullPage:true});
      await page.locator('#cancelConfrontationSelection').click();
      await page.locator('#cancelConfrontationComposition').click();await page.locator('#modalActions button').filter({hasText:'Descartar alterações'}).click();
      await page.waitForFunction(()=>!document.getElementById('masterCombatsOverview').hidden);
    }
    await page.locator('#backFromMasterShield').click();
    await page.evaluate(async ids=>{await openCharacter(ids.character);showCharacterSheetView();},ids);
    await page.waitForFunction(()=>!document.getElementById('quickRollDestination').disabled);
    await page.locator('#quickDiceToggle').click();await page.locator('#quickDiceHistoryToggle').click();await page.locator('#quickDiceExpression').fill('2d20+3');await page.locator('#quickDiceForm').evaluate(f=>f.requestSubmit());
    await page.waitForFunction(()=>document.querySelector('#quickRollHistory .roll-history-row'));
    check(await page.evaluate(async ids=>(await ChroniclesStorage.listRollHistory('character',ids.character)).records.length===1&&(await ChroniclesStorage.listRollHistory('chronicle',ids.chronicle)).records.length===1,ids),'Rolador e históricos continuam funcionando sem módulo Resultados');
    const harness=await context.newPage();await harness.goto(url+'/tests/elenco-v1.html');await harness.locator('#run').click();
    await harness.waitForFunction(()=>/Concluído|Falha:|FALHOU:/.test(document.getElementById('status').textContent),null,{timeout:60000});
    check((await harness.locator('#status').textContent()).startsWith('Concluído'),'Regressão Elenco: 75 verificações');await harness.close();
    check(errors.length===0,'Entrypoint real sem exceções no Console: '+errors.join('; '));
    console.log('TOTAL',checks.length,'verificações aprovadas');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
