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
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = `http://127.0.0.1:${server.address().port}`;
  const artifacts = path.join(root, 'tests/artifacts/gold-generation');
  async function code(target = page) {
    await target.locator('#voltarPersonagens').focus();
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'g', 'e']) await target.keyboard.press(key);
    await target.waitForFunction(()=>!hasPendingSave && !CharacterStorage.isPending());
  }
  async function showManifestations() {
    await page.evaluate(() => { closeNotesView(); showMobileSection('conteudo', { scrollToTop: false }); document.getElementById('contentTabManifestacoes').click(); });
  }
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify(state)));
  const card = () => page.locator('#listaManifestacoes .manifestation-card').first();
  try {
    await page.goto(url);
    await page.waitForFunction(() => typeof createEmptyCharacterState === 'function');
    await page.evaluate(async () => {
      let manager = createEmptyCharacterManager();
      for (const id of ['character-gold-001', 'character-alpha-002', 'character-touch-003']) {
        const character = createEmptyCharacterState(); character.fields.nome = id; character.fields.classe = 'Arcano';
        if (id === 'character-gold-001') { character.goldGeneration.round = 8; character.goldGeneration.availableFromRound = 100; }
        character.fields.pnAtual = '16'; character.fields.pnMax = '16';
        character.manifestations = [{ nome: 'Selo de teste', custo: '3', descricao: 'Dano, alcance e duração ficam intactos.', favorite: true }];
        character.notes = [{ id: 'note-gold-001', title: 'Privada', content: 'Não compartilhar', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
        await writeStoredCharacter(id, character); manager = setCharacterSummary(manager, id, await createCharacterSummary(character));
      }
      await writeCharacterManager(manager); await openCharacter('character-gold-001'); showCharacterSheetView();
    });
    assert.equal(await page.locator('#goldGenerationControls').isVisible(), false);
    assert.equal(await page.locator('.gold-enhancement-config').count(), 0);
    const outsideTheme = await page.evaluate(() => ({
      accent: getComputedStyle(document.documentElement).getPropertyValue('--color-accent'),
      manager: getComputedStyle(document.getElementById('characterManagerView')).backgroundImage
    }));
    const standardColor = await page.locator('.character-panel').evaluate(element => getComputedStyle(element).backgroundColor);
    await page.locator('#nome').focus();
    for (const key of ['ArrowUp','ArrowUp','ArrowLeft','ArrowDown','g','e']) await page.keyboard.press(key);
    assert.equal((await state()).goldGeneration.unlocked, false);
    await page.locator('#nome').fill('Teste dourado');
    await page.locator('#voltarPersonagens').focus();
    for (const key of ['ArrowUp','ArrowUp','ArrowRight','ArrowDown','g','e']) await page.keyboard.press(key);
    assert.equal((await state()).goldGeneration.unlocked, false);
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(2100);
    for (const key of ['ArrowUp','ArrowLeft','ArrowDown','g','e']) await page.keyboard.press(key);
    assert.equal((await state()).goldGeneration.unlocked, false);
    await page.evaluate(()=>{window.goldRevealObserved=false;window.goldTestObserver=new MutationObserver(()=>{if(document.querySelector('.gold-unlock-reveal'))window.goldRevealObserved=true;});goldTestObserver.observe(document.getElementById('characterSheetView'),{childList:true,subtree:true});});
    await code();
    assert.equal((await state()).goldGeneration.active, true);
    assert.equal(await page.locator('#characterSheetView').getAttribute('data-character-mode'), 'gold');
    assert.deepEqual(await page.evaluate(() => ({
      accent: getComputedStyle(document.documentElement).getPropertyValue('--color-accent'),
      manager: getComputedStyle(document.getElementById('characterManagerView')).backgroundImage
    })), outsideTheme);
    assert.equal(await page.evaluate(()=>window.goldRevealObserved), true);
    await showManifestations();
    await card().locator('.card-title').click();
    const config = card().locator('.gold-enhancement-config');
    await config.locator('input[type=checkbox]').check();
    await config.locator('[data-gold-field=aspect]').fill('Quantidade de alvos');
    await config.locator('[data-gold-field=normalValue]').fill('2');
    assert.match(await config.locator('.gold-enhancement-preview').innerText(), /2 → 4.*3 \+ 2 = 5 PN/);
    const use = card().getByRole('button', { name: 'Usar Aprimoramento', exact: true });
    await use.click();
    assert.equal(await page.locator('#appModal').getAttribute('data-character-mode'), 'gold');
    await page.locator('#appModal').getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(Number((await state()).fields.pnAtual), 16);
    await use.click();
    await page.locator('#appModal').getByRole('button', { name: 'Confirmar Aprimoramento', exact: true }).click();
    await page.waitForFunction(()=>!CharacterStorage.isPending());
    assert.equal(Number((await state()).fields.pnAtual), 11);
    assert.equal((await state()).goldGeneration.availableFromRound, 100);
    assert.equal(await use.isDisabled(), false);
    assert.equal(await page.locator('#goldRoundControls, #goldRoundStatus, #goldAdvanceRound, #goldResetRounds').count(), 0);
    await page.locator('#goldGenerationToggle').click();
    await page.waitForFunction(()=>!hasPendingSave && !CharacterStorage.isPending());
    assert.equal(await page.locator('.gold-enhancement-config').count(), 0);
    await page.locator('#goldGenerationToggle').click();
    await page.waitForFunction(()=>!hasPendingSave && !CharacterStorage.isPending());
    assert.equal(await use.isDisabled(), false);
    await page.reload(); await page.waitForFunction(() => typeof openCharacter === 'function' && window.characterStorageReady===true);
    await page.evaluate(async () => { await openCharacter('character-gold-001'); showCharacterSheetView(); });
    assert.equal((await state()).goldGeneration.round, 8);
    assert.equal((await state()).goldGeneration.availableFromRound, 100);
    assert.equal(await page.locator('.gold-unlock-reveal').count(), 0);
    await showManifestations(); await card().locator('.card-title').click();
    assert.equal(await use.isDisabled(), false);
    // Save failure rolls back the debit and preserves legacy data; retry remains possible.
    await page.evaluate(() => { window.goldOriginalWriter = writeStoredCharacter; writeStoredCharacter = () => { throw new Error('TEST_GOLD_STORAGE_FAILURE'); }; });
    await use.click(); await page.locator('#appModal').getByRole('button', { name: 'Confirmar Aprimoramento', exact: true }).click();
    await page.waitForFunction(()=>!CharacterStorage.isPending());
    assert.match(await page.locator('#appModal [role=alert]').innerText(), /preservados/);
    assert.equal(Number((await state()).fields.pnAtual), 11);
    assert.equal((await state()).goldGeneration.availableFromRound, 100);
    await page.evaluate(() => { writeStoredCharacter = window.goldOriginalWriter; window.goldConfirmedButton = Array.from(document.querySelectorAll('#appModal button')).find(button => button.textContent === 'Confirmar Aprimoramento'); });
    await page.locator('#appModal').getByRole('button', { name: 'Confirmar Aprimoramento', exact: true }).click();
    await page.waitForFunction(()=>!CharacterStorage.isPending());
    assert.equal(Number((await state()).fields.pnAtual), 6);
    await page.evaluate(() => window.goldConfirmedButton.click());
    assert.equal(Number((await state()).fields.pnAtual), 6);
    assert.equal(await use.isDisabled(), false);
    await use.click();
    assert.match(await page.locator('#appModal').innerText(), /espere uma rodada completa/);
    await page.locator('#appModal').getByRole('button', { name: 'Confirmar Aprimoramento', exact: true }).click();
    await page.waitForFunction(()=>!CharacterStorage.isPending());
    assert.equal(Number((await state()).fields.pnAtual), 1);
    assert.equal(await use.isDisabled(), true);
    assert.equal((await state()).goldGeneration.round, 8);
    assert.equal((await state()).goldGeneration.availableFromRound, 100);
    await page.evaluate(async () => { document.getElementById('pnAtual').value = '16'; updateResourceUI('pnAtual'); await saveNow(); });
    // Official abilities stay derived and their manual descriptors live separately.
    await page.evaluate(() => { document.getElementById('contentTabHabilidades').click(); });
    const official = page.locator('.automatic-class-ability').first();
    await official.locator('.card-title').click();
    await official.locator('input[type=checkbox]').check();
    await official.locator('[data-gold-field=aspect]').fill('Dados adicionais');
    await official.locator('[data-gold-field=normalValue]').fill('1');
    await official.locator('[data-gold-field=basePnCost]').fill('4');
    const persisted = await page.evaluate(async () => { await saveNow(); return { saved: readStoredCharacter(activeCharacterId), validated: validateImportedSheet(cloneCharacterState()) }; });
    assert.equal(persisted.validated.valid, true);
    assert.equal(persisted.validated.normalized.goldGeneration.round, 8);
    assert.equal(persisted.validated.normalized.goldGeneration.availableFromRound, 100);
    assert.equal(persisted.saved.abilities.length, 0);
    assert.equal(Object.values(persisted.saved.goldGeneration.officialEnhancements)[0].basePnCost, '4');
    assert.equal(persisted.saved.manifestations[0].signatureEnhancement.normalValue, '2');
    assert.equal(persisted.saved.manifestations[0].favorite, true);
    assert.equal(persisted.validated.normalized.manifestations[0].signatureEnhancement.aspect, 'Quantidade de alvos');
    await page.evaluate(async () => {
      addDynamicCard('listaHabilidades', 'templateHabilidade', {
        nome: 'Habilidade pessoal', custo: 'Custo definido narrativamente', efeito: 'Texto original intacto.',
        signatureEnhancement: { enabled: true, calculation: 'numeric', aspect: 'Alcance', normalValue: '3', enhancedValue: '6', basePnCost: '1' }
      }); await saveNow();
    });
    const personal = page.locator('#listaHabilidades .editable-card:not(.automatic-class-ability)').first();
    await personal.getByRole('button', { name: 'Usar Aprimoramento', exact: true }).click();
    assert.match(await page.locator('#appModal').innerText(), /Alcance: 3 → 6/);
    assert.match(await page.locator('#appModal').innerText(), /1 PN \+ 2 PN adicionais = 3 PN/);
    await page.locator('#appModal').getByRole('button', { name: 'Cancelar', exact: true }).click();
    const downloadPromise = page.waitForEvent('download'); await page.evaluate(() => exportSheet({ notify: false }));
    const stream = await (await downloadPromise).createReadStream(); const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(exported.goldGeneration.unlocked, true);
    assert.equal(exported.goldGeneration.round, 8);
    assert.equal(exported.goldGeneration.availableFromRound, 100);
    await page.evaluate(async () => { await duplicateCharacterById(activeCharacterId); });
    const copied = await page.evaluate(() => Object.keys(readCharacterManager().characters).filter(id => !['character-gold-001','character-alpha-002','character-touch-003'].includes(id)).map(readStoredCharacter)[0]);
    assert.equal(copied.goldGeneration.unlocked, false); assert.equal(copied.goldGeneration.active, false);
    assert.equal(copied.goldGeneration.round, 8);
    assert.equal(copied.goldGeneration.availableFromRound, 100);
    // Observer has no new mutation path, including programmatic calls.
    const observer = await context.newPage(); await observer.goto(url);
    await observer.waitForFunction(() => typeof openCharacter === 'function' && window.characterStorageReady===true);
    await observer.evaluate(async () => { await openCharacter('character-gold-001'); showCharacterSheetView(); });
    assert.equal(await observer.locator('#goldGenerationToggle').isDisabled(), true);
    const beforeObserver = await page.evaluate(() => CharacterStorage.get(getCharacterStorageKey(activeCharacterId)));
    await observer.evaluate(() => { document.getElementById('goldGenerationToggle').click(); document.querySelector('.gold-use-enhancement')?.click(); });
    assert.equal(await page.evaluate(() => CharacterStorage.get(getCharacterStorageKey(activeCharacterId))), beforeObserver);
    await observer.close();
    // Plain character keeps standard colors and no visible special controls.
    await page.evaluate(async () => { await openCharacter('character-alpha-002'); showCharacterSheetView(); });
    assert.equal(await page.locator('#goldGenerationControls').isVisible(), false);
    assert.equal(await page.locator('#characterSheetView').getAttribute('data-character-mode'), null);
    assert.equal(await page.locator('.character-panel').evaluate(element => getComputedStyle(element).backgroundColor), standardColor);
    // Touch gesture unlocks the same object and still opens notes.
    await page.evaluate(async () => { await openCharacter('character-touch-003'); showCharacterSheetView(); });
    await page.evaluate(() => {
      const brand = document.getElementById('sheetBrand');
      for (let index = 0; index < 5; index++) brand.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }));
      document.getElementById('abrirAnotacoes').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
    assert.equal((await state()).goldGeneration.unlocked, true);
    assert.equal(await page.locator('#notesView').isVisible(), true);
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const touchPage = await touchContext.newPage(); touchPage.on('pageerror', error => errors.push(error.message));
    await touchPage.goto(url); await touchPage.waitForFunction(() => typeof openCharacter === 'function' && window.characterStorageReady===true);
    await touchPage.evaluate(async () => {
      const id = 'character-real-touch-001', c = createEmptyCharacterState(); c.fields.nome = 'Toque real';
      let manager = createEmptyCharacterManager(); manager = setCharacterSummary(manager, id, await createCharacterSummary(c));
      await writeStoredCharacter(id, c); await writeCharacterManager(manager); await openCharacter(id); showCharacterSheetView(); showMobileSection('conteudo', { scrollToTop: false });
      document.getElementById('contentTabEquipamentos').click();
    });
    for (let i = 0; i < 4; i++) await touchPage.locator('#sheetBrand h1').tap();
    await touchPage.locator('#abrirAnotacoes').tap();
    assert.equal(await touchPage.evaluate(() => state.goldGeneration.unlocked), false);
    assert.equal(await touchPage.locator('#notesView').isVisible(), true);
    await touchPage.evaluate(() => closeNotesView());
    for (let i = 0; i < 5; i++) await touchPage.locator('#sheetBrand h1').tap();
    await touchPage.locator('#abrirAnotacoes').tap();
    assert.equal(await touchPage.evaluate(() => state.goldGeneration.unlocked), true);
    assert.equal(await touchPage.locator('#notesView').isVisible(), true);
    await touchContext.close();
    await page.evaluate(async () => { closeNotesView(); await openCharacter('character-gold-001'); showCharacterSheetView(); });
    // Standard shared modal is not themed merely because a gold sheet is open.
    await page.evaluate(() => openModal({ title: 'Modal externo', content: 'Sem tema da ficha' }));
    assert.equal(await page.locator('#appModal').getAttribute('data-character-mode'), null);
    await page.locator('#modalClose').click();
    await page.evaluate(() => Enchantments.open());
    assert.equal(await page.locator('#appModal').getAttribute('data-character-mode'), 'gold');
    for (const [principle, color] of Object.entries({ Estrutura: '#D4AF37', Ruptura: '#DC4545', Psique: '#9B65E8', Fluxo: '#43B878', Vínculo: '#4285E9' })) {
      await page.evaluate(value => {
        closeModal(); state.enchantments = [{ id: 'gold-enchantment-001', name: 'Selo', principle: value, grade: 'I', action: 'Reforçar', target: 'Arma', customTarget: '', description: 'Descrição íntegra.' }]; Enchantments.open();
      }, principle);
      const actual = await page.locator('.enchantment-card').evaluate(element => ({ token: element.style.getPropertyValue('--principle-color'), border: getComputedStyle(element).borderLeftColor }));
      const channels = [1,3,5].map(start => parseInt(color.slice(start, start + 2), 16));
      assert.equal(actual.token, color); assert.equal(actual.border, `rgb(${channels.join(', ')})`);
    }
    await page.evaluate(() => { closeModal(); state.enchantments = []; Enchantments.open(); });
    await page.locator('#modalClose').focus();
    await page.keyboard.press('Escape');
    // Configured complex result and insufficient PN.
    await showManifestations(); await card().locator('.card-title').click();
    await config.locator('[data-gold-field=calculation]').selectOption('manual');
    await config.locator('[data-gold-field=normalValue]').fill('2d8');
    await config.locator('[data-gold-field=enhancedValue]').fill('4d8');
    assert.match(await config.locator('.gold-enhancement-preview').innerText(), /2d8 → 4d8/);
    await page.evaluate(async () => { document.getElementById('pnAtual').value = '4'; updateResourceUI('pnAtual'); await saveNow(); });
    assert.equal(await use.isDisabled(), true);
    await page.evaluate(async () => { document.getElementById('pnAtual').value = '16'; updateResourceUI('pnAtual'); await saveNow(); });
    await fs.mkdir(artifacts, { recursive: true });
    for (const width of [1920,1366,1280,1279,1024,768,430,390,360,320]) {
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
      console.log(`Validando Geração de Ouro: ${width}px`);
      for (const zoom of [1,1.1,1.25]) {
        await page.evaluate(z => { document.documentElement.style.zoom = z; showCharacterSheetView(); showMobileSection('conteudo', { scrollToTop: false }); document.getElementById('contentTabManifestacoes').click(); }, zoom);
        const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
        assert.ok(layout.scroll <= layout.viewport + 1, `${width}/${zoom}: horizontal overflow`);
        try { await use.click({ timeout: 5000 }); }
        catch (error) {
          console.log(JSON.stringify(await use.evaluate(element => {
            const boxes = []; let current = element;
            while (current) { const b = current.getBoundingClientRect(); const css = getComputedStyle(current); boxes.push({ tag: current.tagName, className: current.className, x: b.x, y: b.y, width: b.width, height: b.height, overflow: css.overflow, display: css.display }); current = current.parentElement; }
            return { zoom: document.documentElement.style.zoom, innerWidth, innerHeight, scrollY, boxes };
          })));
          await page.screenshot({ path: path.join(artifacts, 'failure.png') });
          throw error;
        }
        const bounds = await page.locator('#appModal').evaluate(element => { const b = element.getBoundingClientRect(); return { left: b.left, right: b.right, width: innerWidth }; });
        assert.ok(bounds.left >= -1 && bounds.right <= bounds.width + 1, `${width}/${zoom}: modal overflow`);
        await page.locator('#modalClose').focus();
        await page.keyboard.press('Escape');
      }
      await page.evaluate(() => { document.documentElement.style.zoom = ''; window.scrollTo({ top: 0, behavior: 'instant' }); });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: path.join(artifacts, `gold-${width}.png`), fullPage: true });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const animation = await page.evaluate(() => { const e = document.createElement('div'); e.className = 'gold-unlock-reveal'; document.getElementById('characterSheetView').append(e); const value = getComputedStyle(e).animationName; e.remove(); return value; });
    assert.equal(animation, 'none');
    assert.deepEqual(errors, []);
    console.log('OK Geração de Ouro: segredos, PN, espera informativa, rollback, persistência, exportação, cópia, autoridade, modais e 30 combinações responsivas.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
