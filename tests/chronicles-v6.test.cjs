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
  page.on('console', message => { if (message.type()==='error' && !message.text().includes('404') && !message.text().includes('ERR_NETWORK_ACCESS_DENIED')) errors.push(message.text()); });
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
    await page.evaluate(async ids=>{await openCharacter(ids.character);showCharacterSheetView();},ids);
    await page.waitForFunction(id=>document.getElementById('quickRollDestination').value===id,ids.chronicle);
    check(await page.locator('#contentTabDados,#contentPanelDados,#sheetRollDestination').count()===0,'Dados e destino fixo removidos do DOM');
    check(!(await page.locator('.content-mobile-tabs').isVisible()),'Desktop sem navegação nova por abas');
    for (const section of ['Equipamentos','Habilidades','Manifestacoes']) check(await page.locator('#contentPanel'+section).isVisible(),'Desktop preserva bloco '+section);
    check(await page.locator('.content-column > article').count()===3,'Distribuição anterior: exatamente três blocos de conteúdo');
    check(await page.locator('.eyebrow').filter({hasText:'Alpha · Ficha v1.0'}).count()===1,'Cabeçalho Alpha');
    check(await page.evaluate(()=>{const c=createEmptyCharacterState();const v=validateImportedSheet(c);return !/pr[eé][ _-]*alpha/i.test(createImportPreview(v).textContent)&&createImportPreview(v).textContent.includes('Alpha')&&c.schemaVersion==='0.3-pre-alpha';}),'Importação apresenta Alpha sem mudar schemaVersion');
    await page.screenshot({path:path.join(__dirname,'artifacts/correction-ficha-desktop.png'),fullPage:true});
    await page.locator('#quickDiceToggle').click();
    check(!(await page.locator('#quickDiceHistorySection').isVisible()),'Histórico inicialmente recolhido');
    await page.locator('#quickDiceHistoryToggle').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.getElementById('quickRollHistory').textContent.includes('Nenhuma rolagem'));
    check(await page.locator('#quickDiceHistoryToggle').getAttribute('aria-expanded')==='true','Histórico acessível por teclado e aria-expanded');
    await page.locator('#quickDiceExpression').fill('2d20+3');await page.locator('#quickDiceForm').evaluate(f=>f.requestSubmit());
    await page.waitForFunction(()=>document.getElementById('quickDiceHistoryFeedback').textContent.includes('salva'));
    await page.waitForFunction(()=>document.querySelectorAll('#quickRollHistory .roll-history-row').length===1);
    check(await page.locator('#quickRollHistory .roll-history-row').count()===1,'Rolador existente registra histórico da ficha');
    check((await page.locator('#quickRollHistory').textContent()).includes('Destino vinculado: Crônica Alpha'),'Histórico exibe destino pelos vínculos existentes');
    await page.locator('#quickRollHistory .roll-history-row').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(__dirname,'artifacts/correction-historico-desktop.png'),fullPage:true});
    check(await page.evaluate(async id=>(await ChroniclesStorage.listRollHistory('chronicle',id)).records.length,ids.chronicle)===1,'Rolagem disponível na Crônica escolhida');
    await page.evaluate(()=>{window.savedRollAPI=ChroniclesStorage;ChroniclesStorage={...savedRollAPI,appendRoll:async()=>{throw Error('TEST_HISTORY_FAILURE');}};window.failedResult=performQuickDiceRoll();});
    await page.waitForFunction(()=>document.getElementById('quickDiceHistoryFeedback').textContent.includes('não salvo'));
    await page.evaluate(()=>{ChroniclesStorage=window.savedRollAPI;delete window.savedRollAPI;});await page.locator('#quickDiceRetry').click();
    await page.waitForFunction(()=>document.getElementById('quickDiceRetry').hidden);
    check(await page.evaluate(async id=>(await ChroniclesStorage.listRollHistory('character',id)).records.some(r=>JSON.stringify(r.result)===JSON.stringify(window.failedResult)),ids.character),'Falha na interface: tentar novamente mantém valores originais');
    const exported=await page.evaluate(async()=>{const original=URL.createObjectURL;let captured;URL.createObjectURL=blob=>{captured=blob;return original(blob);};try{exportSheet();return JSON.parse(await captured.text());}finally{URL.createObjectURL=original;}});
    check(!Object.hasOwn(exported,'rollRecords') && !Object.hasOwn(exported,'rollHistory') && !Object.hasOwn(exported,'chronicleId'),'Exportação atual não inclui histórico ou vínculo de Crônica');
    if(await page.locator('#quickDiceClose').isVisible())await page.locator('#quickDiceClose').click();
    await page.evaluate(async ids=>{await ChroniclesStorage.replaceChronicleCast(ids.other,[ids.character]);await closeCharacter();await openCharacter(ids.character);},ids);
    await page.waitForFunction(()=>document.getElementById('quickRollDestination').value==='__choose__');
    check(await page.evaluate(()=>performQuickDiceRoll())===null,'Múltiplas Crônicas exigem escolha antes de gerar dados');
    await page.locator('#quickDiceToggle').click();
    check(!(await page.locator('#quickDiceHistorySection').isVisible()),'Reabrir personagem recolhe o histórico');
    await page.locator('#quickRollDestination').selectOption('');
    await page.evaluate(()=>performQuickDiceRoll());await page.waitForFunction(()=>document.getElementById('quickDiceHistoryFeedback').textContent.includes('salva'));
    check(await page.evaluate(async id=>(await ChroniclesStorage.listRollHistory('chronicle',id)).records.length,ids.other)===0,'Somente ficha não transmite a outras Crônicas');
    await page.evaluate(async ids=>{await closeCharacter();showCharacterManagerView();showManagerSection('chronicles');await openChronicleDetail(ids.chronicle,1,document.getElementById('openChronicleCreation'));},ids);
    await page.locator('#openMasterShield').click();
    await page.waitForFunction(()=>!document.querySelector('#masterShieldAccess input').disabled);
    check(!(await page.locator('#masterShieldPrivate').isVisible()),'Conteúdo privado não é exibido antes da senha');
    const unlock=async()=>{await page.locator('#masterShieldAccess input').first().fill('senha-alpha-123');const second=page.locator('#masterShieldAccess input').nth(1);if(await second.isVisible())await second.fill('senha-alpha-123');await page.locator('#masterShieldAccess form').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>!document.getElementById('masterShieldPrivate').hidden);};
    await unlock();check(await page.locator('#masterDashboard').isVisible(),'Primeiro acesso define senha e abre painel');
    await page.screenshot({path:path.join(__dirname,'artifacts/v6-painel-desktop.png'),fullPage:true});
    check((await page.locator('[data-master-module] strong').allTextContents()).join('|')==='Caçadores|Combates','Escudo expõe somente Caçadores e Combates');
    check(await page.locator('#masterNoteForm,#masterResultsModule,#masterRecordsModule,#masterAgentsModule').count()===0,'Módulos removidos não deixam interface residual');
    check(await page.evaluate(async id=>Boolean(await ChroniclesStorage.getChronicleMasterNote(id)) && (await ChroniclesStorage.listPrivateEntries('investigation',id)).length===1,ids.chronicle),'Dados privados legados permanecem preservados sem exposição');
    await page.locator('[data-master-module="hunters"]').click();await page.waitForFunction(()=>document.getElementById('masterShieldCastList').textContent.includes('Dylann'));
    check(true,'Caçadores consulta o Elenco atual');
    await page.locator('#backToMasterDashboard').click();await page.locator('[data-master-module="combats"]').click();
    await page.waitForFunction(()=>document.getElementById('masterShieldConfrontationsList').textContent.includes('Confronto de teste'));
    check(true,'Combates reutiliza os Confrontos existentes');
    await page.locator('#backToMasterDashboard').click();
    await page.evaluate(()=>{window.originalNow=Date.now;Date.now=()=>originalNow()+30*60*1000+1;document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>!document.getElementById('masterShieldAccess').hidden);
    await page.evaluate(()=>{Date.now=window.originalNow;delete window.originalNow;});await unlock();
    check(await page.locator('#masterDashboard').isVisible(),'30 minutos de inatividade bloqueiam e exigem novo desbloqueio');
    for(const width of [1024,390,320]) {
      await page.setViewportSize({width,height:900});
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Painel sem overflow em ${width}px`);
      if(width===390 || width===320)await page.screenshot({path:path.join(__dirname,`artifacts/v6-painel-${width}.png`),fullPage:true});
    }
    await page.locator('#lockMasterShield').click();await page.locator('#masterShieldAccess input').first().fill('errada');await page.locator('#masterShieldAccess form').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>document.getElementById('masterShieldAccess').textContent.includes('incorreta'));
    check(!(await page.locator('#masterShieldPrivate').isVisible()),'Senha incorreta mantém bloqueio');
    await page.locator('#masterShieldAccess button').filter({hasText:'Redefinir senha local'}).click();await page.locator('#modalActions button').filter({hasText:'Redefinir senha'}).click();
    await page.waitForFunction(()=>document.querySelector('#masterShieldAccess h3').textContent.includes('Definir'));
    check(await page.evaluate(async id=>Boolean(await ChroniclesStorage.getChronicleMasterNote(id)) && (await ChroniclesStorage.listPrivateEntries('investigation',id)).length>0 && (await ChroniclesStorage.listPrivateEntries('journal',id)).length>0,ids.chronicle),'Redefinir senha preserva conteúdo privado');
    await unlock();await page.reload();
    await page.evaluate(async ids=>{showManagerSection('chronicles');await openChronicleDetail(ids.chronicle,1,document.getElementById('openChronicleCreation'));openChronicleMasterShield();},ids);
    await page.waitForFunction(()=>!document.getElementById('masterShieldAccess').hidden);
    check(!(await page.locator('#masterShieldPrivate').isVisible()),'Reload remove desbloqueio');
    const preserved = await page.evaluate(async ids=>({
      rolls:(await ChroniclesStorage.listRollHistory('character',ids.character)).records,
      results:(await ChroniclesStorage.listRollHistory('chronicle',ids.chronicle)).records,
      investigation:await ChroniclesStorage.listPrivateEntries('investigation',ids.chronicle)
    }),ids);
    await page.locator('#backFromMasterShield').click();await page.evaluate(async ids=>{await openCharacter(ids.character);showCharacterSheetView();},ids);
    for(const width of [1024,390,320]){
      await page.setViewportSize({width,height:900});await page.locator('[data-mobile-target="conteudo"]').click();
      check(await page.locator('.content-mobile-tabs button').count()===3,'Três guias originais em '+width+'px');
      await page.locator('#contentTabHabilidades').click();
      check(await page.locator('#contentPanelHabilidades').isVisible()&&!(await page.locator('#contentPanelEquipamentos').isVisible()),'Navegação original mobile em '+width+'px');
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Ficha sem overflow em '+width+'px');
      await page.screenshot({path:path.join(__dirname,'artifacts/correction-ficha-'+width+'.png'),fullPage:true});
      await page.locator('#quickDiceToggle').click();
      if(!(await page.locator('#quickDiceHistorySection').isVisible()))await page.locator('#quickDiceHistoryToggle').click();
      await page.waitForFunction(()=>document.querySelector('#quickRollHistory .roll-history-row'));
      check(await page.locator('#quickRollHistory .roll-history-row').count()===preserved.rolls.length,'Histórico do personagem no Rolador em '+width+'px');
      check(await page.locator('#quickDicePanel').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Rolador sem overflow horizontal em '+width+'px');
      await page.locator('#quickDiceHistoryToggle').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(__dirname,'artifacts/correction-rolador-'+width+'.png'),fullPage:true});
      await page.locator('#quickRollHistory .roll-history-row').last().scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(__dirname,'artifacts/correction-historico-'+width+'.png'),fullPage:true});
      await page.keyboard.press('Escape');
      check(!(await page.locator('#quickDicePanel').isVisible()),'Escape fecha Rolador em '+width+'px');
    }
    await page.setViewportSize({width:1366,height:950});
    for (const section of ['Equipamentos','Habilidades','Manifestacoes']) check(await page.locator('#contentPanel'+section).isVisible(),'Resize restaura convivência de '+section);
    check(await page.evaluate(async ({ids,preserved})=>{
      const a=ChroniclesStorage;
      return JSON.stringify((await a.listRollHistory('character',ids.character)).records)===JSON.stringify(preserved.rolls)
        &&JSON.stringify((await a.listRollHistory('chronicle',ids.chronicle)).records)===JSON.stringify(preserved.results)
        &&JSON.stringify(await a.listPrivateEntries('investigation',ids.chronicle))===JSON.stringify(preserved.investigation);
    },{ids,preserved}),'Navegação preserva registros, vínculos e pistas existentes');
    await page.evaluate(async ids=>{
      const template=(await ChroniclesStorage.listRollHistory('character',ids.character)).records[0];
      for(let i=0;i<52;i++)await ChroniclesStorage.appendRoll({...template,id:'ui-page-'+i,createdAt:new Date(Date.now()+i).toISOString()},null);
    },ids);
    await page.locator('#quickDiceToggle').click();await page.locator('#quickRollHistory').getByRole('button',{name:'Atualizar',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('#quickRollHistory .roll-history-row').length===50);
    await page.locator('#quickRollHistory').getByRole('button',{name:'Carregar mais',exact:true}).click();
    await page.waitForFunction(count=>document.querySelectorAll('#quickRollHistory .roll-history-row').length===count,preserved.rolls.length+52);
    check(true,'Carregar mais consulta todo histórico retido dentro do Rolador');
    await page.evaluate(async()=>{await closeCharacter();showCharacterManagerView();});
    check(await page.locator('#quickDiceHistoryControls').evaluate(el=>el.hidden),'Sem personagem não expõe histórico anterior');
    const another=await page.evaluate(async()=>{const id='other-sheet-test', character=createEmptyCharacterState();writeStoredCharacter(id,character);let manager=readCharacterManager();manager=setCharacterSummary(manager,id,await createCharacterSummary(character));writeCharacterManager(manager);await openCharacter(id);showCharacterSheetView();return id;});
    await page.waitForFunction(()=>!document.getElementById('quickRollDestination').disabled);
    check(await page.locator('#quickRollDestination').inputValue()==='','Personagem sem Crônica usa Somente ficha');
    if(!(await page.locator('#quickDicePanel').isVisible()))await page.locator('#quickDiceToggle').click();
    await page.locator('#quickDiceHistoryToggle').click();await page.waitForFunction(()=>document.getElementById('quickRollHistory').textContent.includes('Nenhuma rolagem'));
    check(await page.locator('#quickRollHistory .roll-history-row').count()===0,'Troca de personagem não mistura históricos');
    await page.locator('#quickDiceExpression').fill('2d20');await page.locator('#quickDiceForm').evaluate(f=>f.requestSubmit());
    await page.waitForFunction(()=>document.querySelectorAll('#quickRollHistory .roll-history-row').length===1);
    check(await page.evaluate(async id=>{const r=(await ChroniclesStorage.listRollHistory('character',id)).records[0];return r.result.total===r.result.rolls.reduce((a,b)=>a+b,0)&&r.resolution==='sum';},another),'2d20 continua soma, com histórico atualizado sem rerrolar');
    const two=await context.newPage();await two.goto(url+'/index.html');await two.evaluate(async ids=>{showManagerSection('chronicles');await openChronicleDetail(ids.chronicle,1,document.getElementById('openChronicleCreation'));openChronicleMasterShield();},ids);
    await two.waitForFunction(()=>!document.getElementById('masterShieldAccess').hidden);check(!(await two.locator('#masterShieldPrivate').isVisible()),'Outra aba não herda desbloqueio');await two.close();
    // Confrontos e Escudo possuem o fluxo atual completo em combates-flow.test.cjs.
    for (const test of ['elenco-v1','participantes-v1']) {
      const harness=await context.newPage();harness.on('console', m=>{if(m.type()==='error')console.log('HARNESS',test,m.text());});harness.on('pageerror', e=>console.log('HARNESS ERROR',e.stack));await harness.goto(url+'/tests/'+test+'.html');await harness.locator('#run').click();
      await harness.waitForFunction(()=>/Concluído|Falha:|FALHOU:/.test(document.getElementById('status').textContent),null,{timeout:60000});
      const result=await harness.locator('#status').textContent();if(!result.startsWith('Concluído'))console.log(await harness.locator('#results li').allTextContents());check(result.startsWith('Concluído'),test+': '+result);await harness.close();
    }
    check(errors.length===0,'Entrypoint real sem exceções no Console: '+errors.join('; '));
    console.log('TOTAL',checks.length,'verificações aprovadas');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
