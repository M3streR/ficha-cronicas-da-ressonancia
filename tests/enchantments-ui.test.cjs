const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(await fs.readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});


(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => typeof createEmptyCharacterState === 'function');
    await page.evaluate(async () => {
      const id = 'character-enchantments-001';
      const c = createEmptyCharacterState(); c.fields.nome = 'Teste';
      let m = createEmptyCharacterManager();
      m = setCharacterSummary(m, id, await createCharacterSummary(c));
      writeStoredCharacter(id,c); writeCharacterManager(m);
      await openCharacter(id);
      showCharacterSheetView();
      showMobileSection('conteudo', {scrollToTop:false});
      document.getElementById('contentTabEquipamentos').click();
      document.getElementById('abrirEncantamentos').click();
    });
    const modal = page.locator('#appModal');
    assert.match(await modal.innerText(), /0\/3/);
    async function add(name, principle='Estrutura') {
      await modal.getByRole('button',{name:'+ Adicionar Encantamento',exact:true}).click();
      await modal.locator('[name="name"]').fill(name);
      await modal.locator('[name="principle"]').selectOption(principle);
      await modal.locator('[name="action"]').fill('Reforçar');
      await modal.locator('[name="description"]').fill('Primeiro parágrafo.\n\nSegundo parágrafo.');
      await modal.getByRole('button',{name:'Salvar Encantamento',exact:true}).click();
    }
    await add('Selo dourado');
    await add('Selo vermelho','Ruptura');
    await add('Selo mental','Psique');
    assert.match(await modal.innerText(), /3\/3/);
    assert.equal(await modal.getByRole('button',{name:'+ Adicionar Encantamento',exact:true}).isDisabled(),true);
    await modal.locator('summary').first().click();
    assert.match(await modal.innerText(), /Estrutura \+ Reforçar \+ Arma/);
    await modal.getByRole('button',{name:'Editar',exact:true}).first().click();
    await modal.locator('[name="name"]').fill('Não salvar');
    await page.locator('#modalClose').click();
    assert.match(await modal.innerText(), /não salvas/);
    await modal.getByRole('button',{name:'Continuar editando'}).click();
    assert.equal(await modal.locator('[name="name"]').inputValue(),'Não salvar');
    await modal.getByRole('button',{name:'Cancelar',exact:true}).click();
    await modal.getByRole('button',{name:'Descartar alterações'}).click();
    await modal.locator('summary').first().click();
    await modal.getByRole('button',{name:'Remover',exact:true}).first().click();
    await modal.getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.equal(await modal.locator('.enchantment-card').count(),3);
    await modal.locator('summary').first().click();
    await modal.getByRole('button',{name:'Remover',exact:true}).first().click();
    await modal.getByRole('button',{name:'Confirmar abandono',exact:true}).click();
    assert.equal(await modal.locator('.enchantment-card').count(),2);

    await modal.getByRole('button',{name:'+ Adicionar Encantamento',exact:true}).click();
    await modal.locator('[name="name"]').fill('Selo de alvo personalizado');
    await modal.locator('[name="action"]').fill('Conectar');
    await modal.locator('[name="target"]').selectOption('Personalizado');
    await modal.locator('[name="customTarget"]').fill('Objeto especial');
    await modal.locator('[name="description"]').fill('Descrição livre');
    assert.match(await modal.innerText(), /Estrutura \+ Conectar \+ Objeto especial/);
    // Storage failure retains draft and previous character.
    await page.evaluate(() => {
      window.savedWriterForEnchantmentsTest=writeStoredCharacter;
      writeStoredCharacter=()=>{throw new Error('TEST_STORAGE_FAILURE');};
    });
    await modal.getByRole('button',{name:'Salvar Encantamento',exact:true}).click();
    assert.match(await modal.locator('[role="alert"]').innerText(),/rascunho.*preservado/i);
    assert.equal(await modal.locator('[name="name"]').inputValue(),'Selo de alvo personalizado');
    await page.evaluate(() => { writeStoredCharacter=window.savedWriterForEnchantmentsTest; });
    // Another confirmed version during editing does not get silently replaced.
    await page.evaluate(() => { state.enchantments[0].name='Alterado externamente'; });
    await modal.getByRole('button',{name:'Salvar Encantamento',exact:true}).click();
    assert.match(await modal.locator('[role="alert"]').innerText(),/mudaram durante/);
    await modal.getByRole('button',{name:'Cancelar',exact:true}).click();
    await modal.getByRole('button',{name:'Descartar alterações'}).click();
    // A real Web Lock observer can read but cannot mutate through programmatic submit.
    const observer=await page.context().newPage();
    await observer.goto(`http://127.0.0.1:${server.address().port}`);
    await observer.waitForFunction(()=>typeof openCharacter==='function');
    await observer.evaluate(async()=>{await openCharacter('character-enchantments-001'); showCharacterSheetView(); Enchantments.open();});
    assert.equal(await observer.locator('#appModal').getByRole('button',{name:'+ Adicionar Encantamento',exact:true}).isDisabled(),true);
    await observer.evaluate(()=>document.querySelector('#appModal button:not(#modalClose)').dispatchEvent(new MouseEvent('click',{bubbles:true})));
    assert.equal(await observer.locator('.enchantment-form').count(),0);
    assert.equal(await observer.evaluate(()=>readStoredCharacter('character-enchantments-001').enchantments.length),2);
    await observer.close();
    const persistence = await page.evaluate(() => {
      const stored = readStoredCharacter(activeCharacterId);
      const imported = validateImportedSheet(JSON.parse(JSON.stringify(stored)));
      const old = createEmptyCharacterState(); delete old.enchantments;
      return { saved: stored.enchantments, imported: imported.normalized.enchantments, old: validateImportedSheet(old).normalized.enchantments };
    });
    assert.deepEqual(persistence.saved,persistence.imported); assert.deepEqual(persistence.old,[]);

    const roundtrip = await page.evaluate(async () => {
      const id=activeCharacterId, before=readCharacterManager().order;
      await duplicateCharacterById(id, null);
      const duplicateId=readCharacterManager().order.find(value=>!before.includes(value));
      const backup=await ChroniclesLocalCharacters.createConflictBackup({sourceLocalId:id,kind:'local',character:readStoredCharacter(id),createdAt:new Date().toISOString()});
      return {duplicate:readStoredCharacter(duplicateId).enchantments, backup:readStoredCharacter(backup.id).enchantments};
    });
    assert.deepEqual(roundtrip.duplicate,persistence.saved);
    assert.deepEqual(roundtrip.backup,persistence.saved);
    const downloadPromise=page.waitForEvent('download');
    await page.evaluate(()=>{restoreState(readStoredCharacter(activeCharacterId));exportSheet({notify:false});});
    const download=await downloadPromise;
    const stream=await download.createReadStream();
    const chunks=[]; for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()).enchantments,persistence.saved);
    await page.reload();
    await page.waitForFunction(() => typeof openCharacter === 'function');
    await page.evaluate(async () => { await openCharacter('character-enchantments-001'); showCharacterSheetView(); Enchantments.open(); });
    assert.equal(await modal.locator('.enchantment-card').count(),2);
    // Existing shared modal behavior is preserved.
    await page.locator('#modalClose').click();
    await page.evaluate(() => openModal({title:'Modal existente',content:'Referência'}));
    await page.locator('#modalClose').focus();
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#modalOverlay').isVisible(),false);
    await page.evaluate(() => Enchantments.open());
    await page.evaluate(() => { state.enchantments[0].name='Nome longo '.repeat(40); state.enchantments[0].description='Parágrafo longo de referência.\n\n'.repeat(100); });
    await page.locator('#modalClose').click();
    await page.evaluate(() => Enchantments.open());
    await modal.locator('summary').first().click();
    await page.locator('#modalClose').focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(()=>document.getElementById('appModal').contains(document.activeElement)),true);
    for (const width of [1920,1366,1280,1279,1024,768,430,390,360,320]) {
      await page.setViewportSize({width,height:768});
      for (const zoom of [1,1.1,1.25]) {
        await page.evaluate(z => { document.documentElement.style.zoom=z; },zoom);
        const layout = await page.evaluate(() => {
          const m=document.getElementById('appModal'), box=m.getBoundingClientRect();
          return {overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1, left:box.left,right:box.right,viewport:innerWidth};
        });
        assert.equal(layout.overflow,false,`${width} ${zoom}: page overflow`);
        assert.ok(layout.left>=-1 && layout.right<=layout.viewport+1,`${width} ${zoom}: modal containment`);
      }
    }
    await page.evaluate(() => { document.documentElement.style.zoom=''; });
    await fs.mkdir(path.join(root,'tests/artifacts/enchantments'),{recursive:true});
    await page.screenshot({path:path.join(root,'tests/artifacts/enchantments/mobile.png')});
    await page.setViewportSize({width:1366,height:768});
    await page.screenshot({path:path.join(root,'tests/artifacts/enchantments/desktop.png')});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modalOverlay').isVisible(),false);
    for(const width of [1366,768,390,320]) {
      await page.setViewportSize({width,height:768});
      await page.evaluate(()=>{showCharacterSheetView();showMobileSection('conteudo',{scrollToTop:false});document.getElementById('contentTabEquipamentos')?.click();});
      await page.locator('#contentPanelEquipamentos').scrollIntoViewIfNeeded();
      const positions=await page.evaluate(()=>{const a=document.getElementById('abrirEncantamentos').getBoundingClientRect(),b=document.getElementById('abrirAnotacoes').getBoundingClientRect();return {a:a.right,b:b.left,sameRow:Math.abs(a.top-b.top)<1};});
      assert.ok(positions.a<=positions.b && positions.sameRow);
      await page.screenshot({path:path.join(root,'tests/artifacts/enchantments',`toolbar-${width}.png`)});
    }
    assert.deepEqual(errors,[]);
    console.log('OK Encantamentos: CRUD, limite, confirmação, persistência, legado, modal e 30 combinações responsivas.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode=1; });
