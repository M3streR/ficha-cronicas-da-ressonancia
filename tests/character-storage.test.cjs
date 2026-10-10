const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://test').pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)] || 'application/octet-stream'); res.end(await fs.readFile(file)); }
  catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true});
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const context = await browser.newContext();
    await context.route('**/*.supabase.co/**', route => route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.waitForFunction(() => window.characterStorageReady);
    const result = await page.evaluate(async () => {
      const photo = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="30"><!--' + 'x'.repeat(1150000) + '--><rect width="24" height="30" fill="purple"/></svg>');
      const sheet = createEmptyCharacterState(); sheet.photo = photo;
      const raw = JSON.stringify(sheet), old = [];
      let quota;
      for (let i = 0; i < 4; i++) {
        try { localStorage.setItem('synthetic-quota:' + i, raw); old.push(i); }
        catch (error) { quota = error.name; }
      }
      const ids = [];
      for (let i = 0; i < 30; i++) {
        const c = cloneCharacterState(sheet); c.fields.nome = `Synthetic ${i}`;
        ids.push(await storeImportedCharacterAsNew(c));
      }
      return {quota, oldCount:old.length, count:readCharacterManager().order.length, ids, exact:ids.every(id => readStoredCharacter(id).photo === photo), localCompleteRecords:Object.keys(localStorage).filter(key => key.startsWith(CHARACTER_STORAGE_PREFIX)).length};
    });
    assert.equal(result.quota, 'QuotaExceededError'); assert.equal(result.oldCount, 3);
    assert.equal(result.count, 30); assert.equal(result.exact, true); assert.equal(result.localCompleteRecords, 0);
    await page.reload(); await page.waitForFunction(() => window.characterStorageReady);
    assert.equal(await page.evaluate(() => readCharacterManager().order.length), 30);
    assert.deepEqual(errors, []);
    console.log('OK: quota reproduzida na quarta cópia em Web Storage; 30 importações com fotos grandes no IndexedDB, sem gravações completas no localStorage.');
    const atomic = await page.evaluate(async () => {
      const key = CharacterStorage.keys.character + readCharacterManager().order[0];
      const before = CharacterStorage.get(key), original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, target) {
        if (this.name === 'records' && target === 'synthetic-fail') throw new DOMException('synthetic quota', 'QuotaExceededError');
        return original.call(this, value, target);
      };
      let name;
      try { await CharacterStorage.commit({ [key]: 'must-not-commit', 'synthetic-fail': 'fail' }); }
      catch (error) { name = error.name; }
      finally { IDBObjectStore.prototype.put = original; }
      await CharacterStorage.refresh([key]);
      return {name, unchanged:CharacterStorage.get(key) === before};
    });
    assert.deepEqual(atomic, {name:'QuotaExceededError', unchanged:true});
    const offline = await page.evaluate(async () => {
      const id = readCharacterManager().order[0], key = CharacterStorage.keys.sync + id;
      await CharacterStorage.commit({[key]:JSON.stringify({remoteId:'synthetic-publication',ownerId:'synthetic-owner',baseUpdatedAt:'2026-10-10T00:00:00.123456Z',dirty:false,conflict:false})});
      await openCharacter(id); showCharacterSheetView();
      document.getElementById('nome').value = 'Pending durable edit';
      const saved = await saveNow(id, {deferOnline:true});
      return {saved, metadata:JSON.parse(CharacterStorage.get(key)), name:readStoredCharacter(id).fields.nome};
    });
    assert.equal(offline.saved,true); assert.equal(offline.metadata.dirty,true);
    assert.equal(offline.metadata.baseUpdatedAt,'2026-10-10T00:00:00.123456Z');
    await page.reload(); await page.waitForFunction(() => window.characterStorageReady);
    assert.equal(await page.evaluate(() => readStoredCharacter(readCharacterManager().order[0]).fields.nome), 'Pending durable edit');
    assert.equal(await page.evaluate(() => JSON.parse(CharacterStorage.get(CharacterStorage.keys.sync+readCharacterManager().order[0])).dirty), true);
    console.log('OK: quota injetada aborta todas as escritas; edição e dirty persistem juntos, inclusive após refresh sem sessão Online.');

    const onlineFixture=await fs.readFile(path.join(root,'tests/online-character-persistence.test.cjs'),'utf8');
    await page.evaluate(()=>{window.assert={equal:(a,b)=>{if(a!==b)throw new Error('Synthetic server assertion failed');}};});
    await page.evaluate('(() => {' + onlineFixture.slice(onlineFixture.indexOf('function copy('),onlineFixture.indexOf('function createStorage(')) + '; window.createServer=createServer;window.createClient=createClient;})()');
    const online=await page.evaluate(async()=>{
      const id=readCharacterManager().order[0],character=readStoredCharacter(id),summary=readCharacterManager().characters[id];
      window.syntheticServer=createServer();
      syntheticServer.row={id:'synthetic-remote',owner_id:'synthetic-owner',source_local_id:id,name:character.fields.nome,level:1,class_name:'',signature:'',thumbnail:summary.thumbnail,snapshot:JSON.parse(JSON.stringify(character)),updated_at:syntheticServer.timestamp()};
      delete syntheticServer.row.snapshot.notes;delete syntheticServer.row.snapshot.photo;
      syntheticServer.row.name='Previous server version';syntheticServer.row.snapshot.fields.nome='Previous server version';
      window.CronicasSupabase={authenticated:true,ready:Promise.resolve(),getUser:async()=>({id:'synthetic-owner'}),client:createClient(syntheticServer)};
      const base=syntheticServer.row.updated_at;
      await CharacterStorage.commit({[CharacterStorage.keys.sync+id]:JSON.stringify({remoteId:'synthetic-remote',ownerId:'synthetic-owner',baseUpdatedAt:base,dirty:true,conflict:false})});
      window.dispatchEvent(new CustomEvent('cronicas:character-storage-refreshed',{detail:[CharacterStorage.keys.sync+id]}));
      const first=await ChroniclesCollaboration.queueCharacterSync(id,character,{immediate:true,manual:true});
      await CharacterStorage.flush();
      const saved=JSON.parse(CharacterStorage.get(CharacterStorage.keys.sync+id));
      syntheticServer.row={...syntheticServer.row,name:'External change',updated_at:syntheticServer.timestamp(),snapshot:{...syntheticServer.row.snapshot,fields:{...syntheticServer.row.snapshot.fields,nome:'External change'}}};
      const conflicting=await ChroniclesCollaboration.queueCharacterSync(id,character,{immediate:true,manual:true});
      await CharacterStorage.flush();
      return{first:first.ok,firstResult:first,clean:saved.dirty===false,base:saved.baseUpdatedAt,serverBase:first.row?.updated_at,filters:syntheticServer.lastUpdateFilters,conflict:conflicting.conflict===true,conflictMetadata:JSON.parse(CharacterStorage.get(CharacterStorage.keys.sync+id)),localName:readStoredCharacter(id).fields.nome,serverName:syntheticServer.row.name};
    });
    assert.equal(online.first,true,JSON.stringify(online));assert.equal(online.clean,true);assert.equal(online.base,online.serverBase);
    assert.equal(online.filters.some(([column])=>column==='updated_at'),true);
    assert.equal(online.conflict,true);assert.equal(online.conflictMetadata.conflict,true);
    assert.equal(online.localName,'Pending durable edit');assert.equal(online.serverName,'External change');
    await page.evaluate(()=>{window.CronicasSupabase={ready:Promise.resolve(),getUser:async()=>null};});
    console.log('OK: adapter Online real usa IndexedDB, confirma metadata após CAS e preserva conflito sem sobrescrever Local/servidor.');

    const migrated = await browser.newContext();
    await migrated.route('**/*.supabase.co/**', route => route.abort());
    await migrated.addInitScript(() => {
      if (localStorage.getItem('synthetic-seeded')) return;
      localStorage.setItem('synthetic-seeded', 'yes');
      const raw = '{"customUnknown":{"keep":true},"photo":"original-photo","notes":[{"content":"literal\\n\\ntext"}],"coyoteEyes":{"opaque":"preserve"}}';
      localStorage.setItem('cronicasRessonanciaCharacterV4:original-character', raw);
      localStorage.setItem('cronicasRessonanciaCharacterManagerV4', JSON.stringify({storageVersion:1,activeCharacterId:null,order:['original-character'],characters:{'original-character':{name:'Literal legacy',level:1,thumbnail:'',updatedAt:'2026-10-10T00:00:00.123Z'}},migrations:{custom:'preserve'}}));
      localStorage.setItem('cronicasRessonanciaOnlineCharacterSyncV1:original-character', '{"remoteId":"same","baseUpdatedAt":"2026-10-10T00:00:00.123456Z","dirty":true,"conflict":true}');
    });
    const p = await migrated.newPage(); await p.goto(url); await p.waitForFunction(() => window.characterStorageReady);
    assert.equal(await p.evaluate(() => CharacterStorage.get('cronicasRessonanciaCharacterV4:original-character') === localStorage.getItem('cronicasRessonanciaCharacterV4:original-character')), true);
    assert.equal(await p.evaluate(() => CharacterStorage.get('cronicasRessonanciaOnlineCharacterSyncV1:original-character') === localStorage.getItem('cronicasRessonanciaOnlineCharacterSyncV1:original-character')), true);
    assert.equal(await p.evaluate(() => CharacterStorage.get('cronicasRessonanciaCharacterManagerV4') === localStorage.getItem('cronicasRessonanciaCharacterManagerV4')), true);
    await p.reload(); await p.waitForFunction(() => window.characterStorageReady);
    assert.equal(await p.evaluate(() => CharacterStorage.entries().filter(([key]) => key.startsWith('cronicasRessonanciaCharacterV4:')).length), 1);
    await p.evaluate(async () => {
      const db = await new Promise((resolve,reject) => {const r=indexedDB.open(CharacterStorage.databaseName);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const tx=db.transaction('migration','readwrite'), store=tx.objectStore('migration'), read=store.get('legacy');
      read.onsuccess=()=>store.put({...read.result,status:'copied'},'legacy');
      await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
    });
    await p.reload(); await p.waitForFunction(() => window.characterStorageReady);
    assert.equal(await p.evaluate(() => CharacterStorage.get('cronicasRessonanciaCharacterV4:original-character') === localStorage.getItem('cronicasRessonanciaCharacterV4:original-character')), true);
    console.log('OK: migração literal, campos desconhecidos, notas, metadata com microssegundos, fonte antiga preservada e reabertura sem duplicação.');
    const oldTab = await migrated.newPage(); await oldTab.goto(url); await oldTab.waitForFunction(() => window.characterStorageReady);
    await oldTab.evaluate(() => localStorage.setItem('cronicasRessonanciaCharacterV4:original-character','legacy-changed-in-old-tab'));
    await p.waitForFunction(() => document.getElementById('statusSalvamento')?.textContent.includes('revisão') || !storageAvailable);
    assert.equal(await p.evaluate(async () => {
      try { await CharacterStorage.commit({'cronicasRessonanciaCharacterV4:original-character':'must-not-overwrite'});return false; }
      catch (error) {return error.message === 'LEGACY_STORAGE_CHANGED_AFTER_MIGRATION';}
    }),true);
    const recovery = await p.evaluate(() => CharacterStorage.recoverySnapshot());
    assert.equal(recovery.localStorage['cronicasRessonanciaCharacterV4:original-character'],'legacy-changed-in-old-tab');
    assert.notEqual(recovery.indexedDB['cronicasRessonanciaCharacterV4:original-character'],'legacy-changed-in-old-tab');
    await oldTab.close();
    await p.evaluate(() => CharacterStorage.acknowledgeLegacyChanges());
    await p.reload(); await p.waitForFunction(() => window.characterStorageReady);
    assert.equal(await p.evaluate(() => CharacterStorage.get('cronicasRessonanciaCharacterV4:original-character')), recovery.indexedDB['cronicasRessonanciaCharacterV4:original-character']);
    assert.equal(await p.evaluate(() => localStorage.getItem('cronicasRessonanciaCharacterV4:original-character')), 'legacy-changed-in-old-tab');
    console.log('OK: recuperação explícita mantém IndexedDB e fonte antiga divergente, sem aplicar nem descartar versões.');

    const peer = await context.newPage(); await peer.goto(url); await peer.waitForFunction(() => window.characterStorageReady);
    const beforeCount = await page.evaluate(() => readCharacterManager().order.length);
    await Promise.all([page.evaluate(async () => { const c=createEmptyCharacterState();c.fields.nome='Concurrent A';await storeImportedCharacterAsNew(c); }), peer.evaluate(async () => { const c=createEmptyCharacterState();c.fields.nome='Concurrent B';await storeImportedCharacterAsNew(c); })]);
    await page.evaluate(() => CharacterStorage.refresh());
    assert.equal(await page.evaluate(() => readCharacterManager().order.length),beforeCount+2);
    const observed = result.ids[0];
    await page.evaluate(async id => {await openCharacter(id);showCharacterSheetView();},observed);
    await peer.evaluate(async id => {await openCharacter(id);showCharacterSheetView();},observed);
    await peer.waitForFunction(id => CharacterEditAuthority.getState(id).mode==='observer',observed);
    assert.equal(await peer.evaluate(async id => {
      const before=CharacterStorage.get(CharacterStorage.keys.character+id);
      let snapshotDenied=false,indexDenied=false;
      try {await CharacterStorage.commit({[CharacterStorage.keys.character+id]:'unauthorized'});}catch(e){snapshotDenied=e.message==='CHARACTER_EDIT_NOT_AUTHORIZED';}
      const base=readCharacterManager(),next=JSON.parse(JSON.stringify(base));next.characters[id].name='unauthorized';
      try {await CharacterStorage.commit({},[],()=>true,{managerPatch:{base,next}});}catch(e){indexDenied=e.message==='CHARACTER_EDIT_NOT_AUTHORIZED';}
      return snapshotDenied&&indexDenied&&CharacterStorage.get(CharacterStorage.keys.character+id)===before;
    },observed),true);
    console.log('OK: importações simultâneas preservam ambos os índices; observadora não escreve ficha nem resumo por chamada programática.');
    await peer.close();

    const aborted = await browser.newContext(); await aborted.route('**/*.supabase.co/**',route=>route.abort());
    await aborted.addInitScript(() => {
      localStorage.setItem('cronicasRessonanciaCharacterV4:migration-failure','literal source');
      if(sessionStorage.getItem('migration-failure-injected')) return;
      sessionStorage.setItem('migration-failure-injected','yes');
      const original=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(value,key){if(this.name==='migration')throw new DOMException('synthetic migration failure','QuotaExceededError');return original.call(this,value,key);};
    });
    const a=await aborted.newPage();await a.goto(url);await a.getByText('Armazenamento não disponível',{exact:true}).waitFor();
    const failedCopy=await a.evaluate(()=>CharacterStorage.recoverySnapshot());
    assert.equal(failedCopy.localStorage['cronicasRessonanciaCharacterV4:migration-failure'],'literal source');
    assert.equal(failedCopy.indexedDB['cronicasRessonanciaCharacterV4:migration-failure'],undefined);
    await a.reload();await a.waitForFunction(()=>window.characterStorageReady);
    assert.equal(await a.evaluate(()=>CharacterStorage.get('cronicasRessonanciaCharacterV4:migration-failure')),'literal source');
    console.log('OK: quota durante migração aborta cópia inteira; próxima abertura retoma sem perda ou duplicação.');
    const divergent=await browser.newContext();await divergent.route('**/*.supabase.co/**',route=>route.abort());
    const d=await divergent.newPage();await d.goto(url+'/tests/participantes-v1.html');
    await d.evaluate(async()=>{
      localStorage.setItem('cronicasRessonanciaCharacterV4:divergent-record','legacy source');
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('cronicasRessonanciaCharacters',1);r.onupgradeneeded=()=>{r.result.createObjectStore('records');r.result.createObjectStore('migration');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const tx=db.transaction('records','readwrite');tx.objectStore('records').put('existing different version','cronicasRessonanciaCharacterV4:divergent-record');
      await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
    });
    await d.goto(url);await d.getByText('Armazenamento não disponível',{exact:true}).waitFor();
    const divergentSources=await d.evaluate(()=>CharacterStorage.recoverySnapshot());
    assert.equal(divergentSources.localStorage['cronicasRessonanciaCharacterV4:divergent-record'],'legacy source');
    assert.equal(divergentSources.indexedDB['cronicasRessonanciaCharacterV4:divergent-record'],'existing different version');
    console.log('OK: registro divergente impede migração e preserva ambas as versões sem sobrescrever nem duplicar.');
    const unavailable = await browser.newContext(); await unavailable.route('**/*.supabase.co/**',route=>route.abort());
    await unavailable.addInitScript(() => {Object.defineProperty(window,'indexedDB',{value:undefined});localStorage.setItem('cronicasRessonanciaCharacterV4:recovery-only','literal original');});
    const u=await unavailable.newPage();await u.goto(url);await u.getByText('Armazenamento não disponível',{exact:true}).waitFor();
    assert.equal(await u.evaluate(()=>localStorage.getItem('cronicasRessonanciaCharacterV4:recovery-only')),'literal original');
    assert.equal(await u.getByRole('button',{name:'Exportar recuperação'}).isVisible(),true);
    console.log('OK: retomada da fase copiada, aba antiga bloqueada sem sobrescrita, recuperação das duas fontes e IndexedDB indisponível sem apagar dados.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
