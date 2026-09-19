const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const characterId = 'character-multitab-001';

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

async function waitForApplication(page) {
  await page.waitForFunction(() => (
    typeof createEmptyCharacterState === 'function'
    && typeof openCharacter === 'function'
    && window.CharacterEditAuthority
    && window.ChroniclesLocalCharacters
  ));
}

async function seedCharacter(page, name = 'Sentinela entre abas') {
  await page.evaluate(async ({ characterId, name }) => {
    const character = createEmptyCharacterState();
    character.fields.nome = name;
    const summary = await createCharacterSummary(character);
    let manager = createEmptyCharacterManager();
    manager = setCharacterSummary(manager, characterId, summary);
    writeStoredCharacter(characterId, character);
    writeCharacterManager(manager);
  }, { characterId, name });
}

async function openSeededCharacter(page) {
  await page.evaluate(async characterId => {
    await openCharacter(characterId);
    document.getElementById('characterManagerView').hidden = true;
    document.getElementById('characterSheetView').hidden = false;
  }, characterId);
  await page.waitForFunction(characterId => activeCharacterId === characterId, characterId);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const errors = [];

  try {
    const context = await browser.newContext();
    const editor = await context.newPage();
    const observer = await context.newPage();
    [editor, observer].forEach(page => page.on('pageerror', error => errors.push(error.message)));
    await Promise.all([editor.goto(`${origin}/index.html`), observer.goto(`${origin}/index.html`)]);
    await Promise.all([waitForApplication(editor), waitForApplication(observer)]);
    await seedCharacter(editor);

    await openSeededCharacter(editor);
    await editor.waitForFunction(characterId => (
      CharacterEditAuthority.getState(characterId).mode === 'editor'
    ), characterId);
    await openSeededCharacter(observer);
    await observer.waitForFunction(characterId => (
      CharacterEditAuthority.getState(characterId).mode === 'observer'
    ), characterId);

    assert.equal(await editor.evaluate(characterId => CharacterEditAuthority.lockName(characterId), characterId),
      `cronicas:character-edit:v1:${characterId}`);
    assert.equal(await observer.locator('#nome').isDisabled(), true, 'a aba observadora bloqueia os campos');
    assert.equal(await observer.locator('#sheetEditAuthority').getAttribute('hidden'), null);
    assert.match(await observer.locator('#sheetEditAuthority').innerText(), /Visualização segura/i);
    await observer.setViewportSize({ width: 390, height: 844 });
    const mobileBanner = await observer.locator('#sheetEditAuthority').evaluate(element => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth
    }));
    assert.ok(mobileBanner.left >= 0 && mobileBanner.right <= 390, 'o aviso permanece dentro da viewport mobile');
    assert.ok(mobileBanner.scrollWidth <= mobileBanner.clientWidth, 'o aviso não cria overflow horizontal');

    await editor.locator('#nome').fill('Rascunho preservado pela editora');
    await editor.waitForFunction(characterId => {
      const stored = JSON.parse(localStorage.getItem(`cronicasRessonanciaCharacterV4:${characterId}`));
      return stored?.fields?.nome === 'Rascunho preservado pela editora';
    }, characterId);
    await observer.waitForFunction(() => document.getElementById('nome').value === 'Rascunho preservado pela editora');

    const programmaticAttempt = await observer.evaluate(async characterId => {
      document.getElementById('nome').value = 'Escrita indevida';
      const saveResult = saveNow(characterId);
      const syncResult = await ChroniclesCollaboration.queueCharacterSync(
        characterId,
        readStoredCharacter(characterId),
        { immediate: true, manual: true }
      );
      let directWriteBlocked = false;
      let conflictResolutionBlocked = false;
      try {
        const copy = readStoredCharacter(characterId);
        copy.fields.nome = 'Escrita direta indevida';
        writeStoredCharacter(characterId, copy);
      } catch (error) {
        directWriteBlocked = error.message === 'CHARACTER_EDIT_NOT_AUTHORIZED';
      }
      try {
        await ChroniclesCollaboration.resolveCharacterConflict(characterId, 'keep-local');
      } catch (error) {
        conflictResolutionBlocked = error.message === 'CHARACTER_EDIT_NOT_AUTHORIZED';
      }
      return {
        saveResult,
        syncUnauthorized: syncResult?.unauthorized === true,
        directWriteBlocked,
        conflictResolutionBlocked,
        storedName: readStoredCharacter(characterId).fields.nome
      };
    }, characterId);
    assert.equal(programmaticAttempt.saveResult, false);
    assert.equal(programmaticAttempt.syncUnauthorized, true);
    assert.equal(programmaticAttempt.directWriteBlocked, true);
    assert.equal(programmaticAttempt.conflictResolutionBlocked, true);
    assert.equal(programmaticAttempt.storedName, 'Rascunho preservado pela editora');

    await editor.evaluate(() => {
      const field = document.createElement('input');
      field.value = 'Rascunho ainda no diálogo';
      openModal({ title: 'Edição em andamento', content: field, actions: [] });
    });
    await observer.locator('#takeOverCharacterEditing').click();
    await observer.waitForFunction(characterId => (
      CharacterEditAuthority.getState(characterId).mode === 'observer'
    ), characterId);
    assert.equal(await editor.evaluate(characterId => CharacterEditAuthority.getState(characterId).mode, characterId), 'editor');
    await editor.evaluate(() => closeModal());

    await editor.locator('#nome').fill('Transferência com debounce pendente');
    const transferBefore = await editor.evaluate(() => ({
      value: document.getElementById('nome').value,
      pending: hasPendingSave,
      target: pendingSaveTargetId,
      activeCharacterId,
      mode: CharacterEditAuthority.getState(activeCharacterId).mode
    }));
    await observer.locator('#takeOverCharacterEditing').click();
    await observer.waitForFunction(characterId => (
      CharacterEditAuthority.getState(characterId).mode === 'editor'
    ), characterId);
    await editor.waitForFunction(characterId => (
      CharacterEditAuthority.getState(characterId).mode === 'observer'
    ), characterId);
    assert.equal(await observer.locator('#nome').inputValue(), 'Transferência com debounce pendente', JSON.stringify(transferBefore));
    assert.equal(await editor.locator('#nome').isDisabled(), true, 'a editora anterior perde autorização');
    assert.equal(await observer.locator('#nome').isEnabled(), true, 'a nova editora só é liberada após reconciliar');

    const stableLock = await observer.evaluate(async characterId => {
      const before = CharacterEditAuthority.lockName(characterId);
      await CharacterEditAuthority.runExclusive(characterId, 'publish', () => true);
      const published = CharacterEditAuthority.lockName(characterId);
      await CharacterEditAuthority.runExclusive(characterId, 'unpublish', () => true);
      await CharacterEditAuthority.runExclusive(characterId, 'republish', () => true);
      const republished = CharacterEditAuthority.lockName(characterId);
      return { before, published, republished };
    }, characterId);
    assert.equal(stableLock.before, stableLock.published);
    assert.equal(stableLock.published, stableLock.republished);

    await observer.close({ runBeforeUnload: false });
    const recoveredAfterClose = await editor.evaluate(characterId => (
      CharacterEditAuthority.requestTakeover(characterId)
    ), characterId);
    assert.equal(recoveredAfterClose.acquired, true, 'o navegador libera o Web Lock quando a editora encerra');
    await editor.waitForFunction(characterId => CharacterEditAuthority.getState(characterId).mode === 'editor', characterId);

    const firstTabId = await editor.evaluate(() => CharacterEditAuthority.tabId);
    const duplicate = await context.newPage();
    duplicate.on('pageerror', error => errors.push(error.message));
    await duplicate.goto(`${origin}/index.html`);
    await waitForApplication(duplicate);
    await duplicate.evaluate(tabId => sessionStorage.setItem('cronicasRessonanciaTabIdV1', tabId), firstTabId);
    await duplicate.reload();
    await waitForApplication(duplicate);
    await duplicate.waitForFunction(firstTabId => CharacterEditAuthority.tabId !== firstTabId, firstTabId, { timeout: 3000 });
    const identities = await Promise.all([
      editor.evaluate(() => ({ tabId: CharacterEditAuthority.tabId, instanceId: CharacterEditAuthority.instanceId })),
      duplicate.evaluate(() => ({ tabId: CharacterEditAuthority.tabId, instanceId: CharacterEditAuthority.instanceId }))
    ]);
    assert.notEqual(identities[0].instanceId, identities[1].instanceId);
    assert.notEqual(identities[0].tabId, identities[1].tabId, 'o handshake corrige sessionStorage duplicado');
    await context.close();

    const fallbackContext = await browser.newContext();
    await fallbackContext.addInitScript(() => {
      try { Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }); } catch (_) { /* teste */ }
    });
    const fallbackA = await fallbackContext.newPage();
    const fallbackB = await fallbackContext.newPage();
    await Promise.all([fallbackA.goto(`${origin}/index.html`), fallbackB.goto(`${origin}/index.html`)]);
    await Promise.all([waitForApplication(fallbackA), waitForApplication(fallbackB)]);
    await seedCharacter(fallbackA, 'Modo consultivo');
    await Promise.all([openSeededCharacter(fallbackA), openSeededCharacter(fallbackB)]);
    await Promise.all([
      fallbackA.waitForFunction(characterId => CharacterEditAuthority.getState(characterId).peerDetected, characterId),
      fallbackB.waitForFunction(characterId => CharacterEditAuthority.getState(characterId).peerDetected, characterId)
    ]);
    const fallbackStates = await Promise.all([
      fallbackA.evaluate(characterId => CharacterEditAuthority.getState(characterId), characterId),
      fallbackB.evaluate(characterId => CharacterEditAuthority.getState(characterId), characterId)
    ]);
    fallbackStates.forEach(state => {
      assert.equal(state.guaranteed, false);
      assert.equal(state.mode, 'consultative');
      assert.equal(state.canMutate, true, 'sem Web Locks o CAS existente permanece disponível');
    });
    await fallbackContext.close();

    assert.deepEqual(errors, []);
    console.log('OK multi-tab edit authority, takeover, tab identity and safe fallback');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
