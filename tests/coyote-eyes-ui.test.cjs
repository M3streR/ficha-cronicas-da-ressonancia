const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    let contents=await fs.readFile(file);
    if (pathname === '/js/coyote-eyes.js' && request.headers['x-test-coyote-binding'] === 'enabled') {
      contents=Buffer.from(contents.toString().replace(/const approvedBindings = Object\.freeze\(\[[\s\S]*?\]\);/, 'const approvedBindings = Object.freeze([{localId: "character-coyote-test-001", ownerId: "owner-coyote-test"}]);'));
    }
    if (pathname === '/script.js' && request.headers['x-test-coyote-binding'] === 'enabled') {
      contents=Buffer.from(contents.toString().replace("ownerId: async () => (await window.CronicasSupabase?.getUser?.())?.id || '',", "ownerId: async () => window.__testCoyoteOwner || 'owner-coyote-test',"));
    }
    response.end(contents);
  } catch { response.writeHead(404).end(); }
});


(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1366,height:900},extraHTTPHeaders:{'x-test-coyote-binding':'enabled'}});
 const page=await context.newPage(), errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const url=`http://127.0.0.1:${server.address().port}`;
 const fixture=JSON.parse(await fs.readFile(path.join(__dirname,'fixtures/coyote-test.json'),'utf8'));
 const id='character-coyote-test-001';
 const read=()=>page.evaluate(()=>cloneCharacterState());
 const strip=list=>list.map(({coyoteRecordId,...record})=>record);
 async function sequence(keys=['ArrowLeft','ArrowRight','c','o','y']) {
   await page.locator('#voltarPersonagens').focus();
   for(const key of keys) await page.keyboard.press(key);
 }
 async function eye(expected) {await page.waitForFunction(value=>CoyoteEyes.effectiveEye(state)===value,expected);}
 async function show() {await page.evaluate(()=>{showMobileSection('conteudo',{scrollToTop:false});document.getElementById('contentTabManifestacoes').click();});}
 const cards=()=>page.locator('#listaManifestacoes .manifestation-card');
 try {
  await page.goto(url); await page.waitForFunction(()=>typeof openCharacter==='function');
  await page.evaluate(async({fixture,id})=>{
   window.__testCoyoteOwner='owner-coyote-test';
   let manager=createEmptyCharacterManager();
   writeStoredCharacter(id,fixture);manager=setCharacterSummary(manager,id,await createCharacterSummary(fixture));
   const other=cloneCharacterState(fixture);writeStoredCharacter('character-coyote-copy',other);
   manager=setCharacterSummary(manager,'character-coyote-copy',await createCharacterSummary(other));
   writeCharacterManager(manager);await openCharacter(id);showCharacterSheetView();saveNow();
  },{fixture,id});
  await page.waitForFunction(()=>Boolean(state.coyoteEyes));
  const before=await read();
  assert.deepEqual(strip(before.manifestations),fixture.manifestations);
  const outside=await page.evaluate(()=>({header:getComputedStyle(document.querySelector('.app-header')).backgroundImage,info:getComputedStyle(document.querySelector('.character-panel')).backgroundImage,manager:getComputedStyle(document.getElementById('characterManagerView')).backgroundImage}));
  assert.equal(await page.locator('#coyoteEyeLabel').isVisible(),false);
  assert.equal(await page.evaluate(()=>CoyoteEyes.canEnhance(document.querySelectorAll('#listaManifestacoes .manifestation-card')[2])),false);
  await page.locator('#nome').focus();
  for(const key of ['ArrowLeft','ArrowRight','c','o','y']) await page.keyboard.press(key);
  assert.equal((await read()).coyoteEyes.unlocked,false);
  await page.locator('#nome').fill(fixture.fields.nome);await page.evaluate(()=>saveNow());
  await sequence(['ArrowLeft','ArrowRight','c','x','y']);assert.equal((await read()).coyoteEyes.unlocked,false);
  await sequence(['ArrowLeft','ArrowRight','Shift+c','o','y']);assert.equal((await read()).coyoteEyes.unlocked,false);
  await page.locator('#voltarPersonagens').focus();
  await page.keyboard.press('ArrowLeft');await page.waitForTimeout(2100);
  for(const key of ['ArrowRight','c','o','y']) await page.keyboard.press(key);
  assert.equal((await read()).coyoteEyes.unlocked,false);
  await sequence();await eye('left'); await show();
  assert.equal(await cards().count(),3);
  assert.equal(await page.locator('.coyote-reveal').count(),1);
  let current=await read();
  assert.equal(current.coyoteEyes.firstRevealSeen,true);
  assert.deepEqual(strip(current.manifestations),fixture.manifestations);
  for(const key of Object.keys(before).filter(key=>!['manifestations','coyoteEyes'].includes(key))) assert.deepEqual(current[key],before[key],key);
  assert.deepEqual(await page.evaluate(()=>({header:getComputedStyle(document.querySelector('.app-header')).backgroundImage,info:getComputedStyle(document.querySelector('.character-panel')).backgroundImage,manager:getComputedStyle(document.getElementById('characterManagerView')).backgroundImage})),outside);
  await cards().first().locator('.card-title').click();
  await cards().first().locator('[data-field=descricao]').fill('Edição esquerda\n\nsegundo parágrafo');
  await page.evaluate(()=>saveNow());
  await sequence();await eye('right');
  assert.deepEqual(strip((await read()).manifestations),fixture.manifestations);
  await cards().first().locator('.card-title').click();
  await cards().first().locator('[data-field=efeito]').fill('Edição direita');
  await page.evaluate(()=>saveNow());
  await sequence();await eye('left');
  assert.equal(await cards().first().locator('[data-field=descricao]').inputValue(),'Edição esquerda\n\nsegundo parágrafo');
  assert.equal((await read()).manifestations[0].efeito,'Edição direita');
  await page.locator('#adicionarManifestacao').click();assert.equal(await cards().count(),4);
  await cards().last().locator('.remove-card').click();await page.evaluate(()=>saveNow());assert.equal(await cards().count(),3);
  for(let i=0;i<6;i++){await sequence();await eye(i%2===0?'right':'left');assert.equal(await cards().count(),3);}
  await sequence(['ArrowUp','ArrowUp','ArrowLeft','ArrowDown','g','e']);
  assert.equal((await read()).goldGeneration.active,true);
  await cards().first().locator('.card-title').click();
  const first=cards().first();
  await first.locator('.gold-enhancement-config input[type=checkbox]').check();
  await first.locator('[data-gold-field=aspect]').fill('Dados de dano');
  await first.locator('[data-gold-field=normalValue]').fill('1');
  await page.evaluate(()=>saveNow());
  await first.getByRole('button',{name:'Usar Aprimoramento',exact:true}).click();
  const pn=Number((await read()).fields.pnAtual);
  // Modal blocks a secret switch; detached card confirmation cannot debit PN.
  assert.equal(await page.evaluate(()=>CoyoteEyes.toggle()),false);
  await page.evaluate(()=>restoreDynamicList('listaManifestacoes','templateManifestacao',CoyoteEyes.activeRecords(state),'Nova Manifestação'));
  await page.locator('#appModal').getByRole('button',{name:'Confirmar Aprimoramento',exact:true}).click();
  assert.equal(Number((await read()).fields.pnAtual),pn);
  await cards().first().getByRole('button',{name:'Usar Aprimoramento',exact:true}).click();
  await page.locator('#appModal').getByRole('button',{name:'Confirmar Aprimoramento',exact:true}).click();
  assert.equal(Number((await read()).fields.pnAtual),pn-5);
  assert.equal((await read()).coyoteEyes.confidentManifestations[0].signatureEnhancement.enabled,true);
  const pnAfter=Number((await read()).fields.pnAtual);
  await sequence();await eye('right');
  assert.equal(Number((await read()).fields.pnAtual),pnAfter);
  const solitude=cards().nth(2);
  assert.equal(await solitude.locator('input[type=checkbox]').count(),0);
  assert.equal(await solitude.getByRole('button',{name:'Usar Aprimoramento',exact:true}).count(),0);
  await solitude.locator('.card-title').click();await solitude.locator('[data-field=nome]').fill('Solidão renomeada');await page.evaluate(()=>saveNow());
  assert.equal(await solitude.locator('input[type=checkbox]').count(),0);
  assert.equal((await read()).manifestations[2].custo,'02');
  // Failed Local write leaves both sets and the active eye intact.
  const snapshot=await read();
  await page.evaluate(()=>{window.coyoteOriginalWriter=writeStoredCharacter;writeStoredCharacter=()=>{throw new Error('TEST_COYOTE_STORAGE_FAILURE');};});
  assert.equal(await page.evaluate(()=>CoyoteEyes.toggle()),false);
  assert.deepEqual((await read()).coyoteEyes,snapshot.coyoteEyes);
  assert.deepEqual((await read()).manifestations,snapshot.manifestations);
  await page.evaluate(()=>{writeStoredCharacter=window.coyoteOriginalWriter;});
  await sequence();await eye('left');
  await page.reload();await page.waitForFunction(()=>typeof openCharacter==='function');
  await page.evaluate(async id=>{window.__testCoyoteOwner='owner-coyote-test';await openCharacter(id);showCharacterSheetView();},id);
  await eye('left');await show();
  assert.equal(await page.locator('.coyote-reveal').count(),0);
  assert.equal((await read()).coyoteEyes.confidentManifestations[0].descricao,'Edição esquerda\n\nsegundo parágrafo');
  const validated=await page.evaluate(()=>validateImportedSheet(cloneCharacterState()));assert.equal(validated.valid,true);
  assert.deepEqual(validated.normalized.coyoteEyes,(await read()).coyoteEyes);
  const download=page.waitForEvent('download');await page.evaluate(()=>exportSheet({notify:false}));
  const stream=await(await download).createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);
  const exported=JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(exported.manifestations[2].custo,'02');assert.equal(exported.coyoteEyes.confidentManifestations.length,3);
  const importedId=await page.evaluate(async data=>storeImportedCharacterAsNew(validateImportedSheet(data).normalized),exported);
  await page.evaluate(async id=>{await openCharacter(id);showCharacterSheetView();},importedId);
  assert.equal(await page.locator('#coyoteEyeLabel').isVisible(),false);assert.equal(await page.evaluate(()=>CoyoteEyes.toggle()),false);
  assert.equal((await read()).coyoteEyes.activeEye,'left');assert.equal(await cards().first().locator('[data-field=efeito]').inputValue(),'Edição direita');
  await page.evaluate(async id=>{await openCharacter(id);showCharacterSheetView();await duplicateCharacterById(id);},id);
  const copiedId=await page.evaluate(()=>readCharacterManager().order.at(-1));
  await page.evaluate(async id=>{await openCharacter(id);showCharacterSheetView();},copiedId);
  assert.equal(await page.evaluate(()=>CoyoteEyes.toggle()),false);
  assert.equal(await page.locator('#coyoteEyeLabel').isVisible(),false);
  assert.equal((await read()).coyoteEyes.confidentManifestations.length,3);
  await page.evaluate(async id=>{await openCharacter(id);showCharacterSheetView();},id);
  const observer=await context.newPage();await observer.goto(url);await observer.waitForFunction(()=>typeof openCharacter==='function');
  await observer.evaluate(async id=>{window.__testCoyoteOwner='owner-coyote-test';await openCharacter(id);showCharacterSheetView();},id);
  const beforeObserver=await read();assert.equal(await observer.evaluate(()=>CoyoteEyes.toggle()),false);assert.deepEqual(await read(),beforeObserver);await observer.close();
  await page.evaluate(()=>{window.__testCoyoteOwner='wrong-owner';});
  assert.equal(await page.evaluate(()=>CoyoteEyes.toggle()),false);
  await page.evaluate(()=>{window.__testCoyoteOwner='owner-coyote-test';});
  // Empty left set is intentional and stays empty after two switches and restoration.
  await page.evaluate(()=>{document.querySelectorAll('#listaManifestacoes .remove-card').forEach(button=>button.click());saveNow();});
  assert.equal((await read()).coyoteEyes.confidentManifestations.length,0);
  await sequence();await eye('right');await sequence();await eye('left');assert.equal(await cards().count(),0);
  await page.evaluate(()=>{state.coyoteEyes.confidentManifestations=CoyoteEyes.initialConfident();restoreDynamicList('listaManifestacoes','templateManifestacao',CoyoteEyes.activeRecords(state),'Nova Manifestação');saveNow();});
  const artifacts=path.join(root,'tests/artifacts/coyote-eyes');await fs.mkdir(artifacts,{recursive:true});
  for(const gold of [false,true]) {
   if((await read()).goldGeneration.active!==gold) await page.locator('#goldGenerationToggle').click();
   const border=await page.locator('.character-panel').evaluate(element=>getComputedStyle(element).borderColor);
   for(const width of [1920,1366,1280,1279,1024,768,430,390,360,320]) {
    await page.setViewportSize({width,height:width>=1024?900:844});
    for(const zoom of [1,1.1,1.25]) {
     await page.evaluate(z=>{document.documentElement.style.zoom=z;showMobileSection('conteudo',{scrollToTop:false});document.getElementById('contentTabManifestacoes').click();},zoom);
     const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:document.documentElement.clientWidth}));
     assert.ok(layout.scroll<=layout.width+1,`${gold}/${width}/${zoom}: overflow`);
     assert.equal(await page.locator('#contentPanelManifestacoes').evaluate(element=>getComputedStyle(element).borderColor),'rgb(149, 101, 217)');
     assert.equal(await page.locator('.character-panel').evaluate(element=>getComputedStyle(element).borderColor),border);
    }
    await page.evaluate(()=>document.documentElement.style.zoom='');
    if([1366,390,320].includes(width)) await page.screenshot({path:path.join(artifacts,`coyote-${gold?'gold':'alpha'}-${width}.png`),fullPage:true});
   }
  }
  await page.emulateMedia({reducedMotion:'reduce'});await sequence();await eye('right');await sequence();await eye('left');
  assert.equal(await page.locator('#listaManifestacoes').evaluate(element=>getComputedStyle(element).animationName),'none');
  // The actual production module rejects an unrelated local identity, even with matching records.
  const unboundContext=await browser.newContext();const unbound=await unboundContext.newPage();await unbound.goto(url);
  await unbound.waitForFunction(()=>typeof openCharacter==='function');
  await unbound.evaluate(async({fixture,id})=>{window.__testCoyoteOwner='owner-coyote-test';const manager=setCharacterSummary(createEmptyCharacterManager(),id,await createCharacterSummary(fixture));writeStoredCharacter(id,fixture);writeCharacterManager(manager);await openCharacter(id);showCharacterSheetView();},{fixture,id});
  assert.equal(await unbound.evaluate(()=>CoyoteEyes.toggle()),false);assert.equal(await unbound.evaluate(()=>state.coyoteEyes),undefined);await unboundContext.close();
  assert.deepEqual(errors,[]);
  console.log('OK Coyote: literalidade, dois conjuntos, segredo, Solidão, PN, rollback, restauração, importação/exportação, cópia, autoridade, vinculação bloqueada e 60 combinações responsivas.');
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
