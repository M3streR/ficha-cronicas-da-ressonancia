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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => typeof createEmptyCharacterState === 'function' && window.ChroniclesLocalCharacters);

    const backup = await page.evaluate(async () => {
      const localId = 'character-conflict-source';
      const character = createEmptyCharacterState();
      character.fields.nome = 'Personagem de teste';
      character.fields.classe = 'Vanguarda';
      character.notes = [{
        id: 'note-conflict-001', title: 'Privada', content: 'Permanece Local', pinned: true,
        createdAt: '2026-09-18T12:00:00.000Z', updatedAt: '2026-09-18T12:00:00.000Z'
      }];
      const summary = await createCharacterSummary(character);
      let manager = createEmptyCharacterManager();
      manager = setCharacterSummary(manager, localId, summary);
      manager = setActiveCharacterId(manager, localId);
      writeStoredCharacter(localId, character);
      writeCharacterManager(manager);
      const result = await ChroniclesLocalCharacters.createConflictBackup({
        sourceLocalId: localId,
        kind: 'local',
        character,
        createdAt: '2026-09-18T15:42:00.000Z'
      });
      const saved = readStoredCharacter(result.id);
      renderCharacterManager();
      return { result, saved, summary: readCharacterManager().characters[result.id] };
    });

    assert.match(backup.summary.name, /Backup Local/);
    assert.match(backup.summary.name, /18\/09\/2026/);
    assert.match(backup.summary.name, /12:42|15:42/);
    assert.equal(backup.saved.notes[0].content, 'Permanece Local');

    await page.evaluate(() => {
      const details = {
        reason: 'remote-changed',
        local: { name: 'Nome Local extremamente longo para validar quebra segura', className: 'Vanguarda', level: 7 },
        online: {
          name: 'Nome Online extremamente longo para validar quebra segura', className: 'Guardião Regente', level: 10,
          updatedAt: '2026-09-18T15:42:00.000Z'
        },
        actions: ['use-online', 'keep-local']
      };
      openModal({
        title: ONLINE_CONFLICT_COPY[details.reason].title,
        content: createOnlineConflictContent(details),
        actions: conflictResolutionActions('character-conflict-source', details)
      });
    });

    assert.equal(await page.locator('#modalOverlay').isVisible(), true);
    assert.deepEqual(await page.locator('#modalActions button').allInnerTexts(), [
      'Usar versão Online', 'Manter minha versão', 'Decidir depois'
    ]);
    assert.match(await page.locator('#modalDescription').innerText(), /cópia Local com tipo, data e hora/i);
    const sizes = await page.locator('#appModal').evaluate(element => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth
    }));
    assert.ok(sizes.left >= 0 && sizes.right <= 390, 'modal permanece dentro da viewport mobile');
    assert.ok(sizes.scrollWidth <= sizes.clientWidth, 'modal não cria overflow horizontal');

    await page.setViewportSize({ width: 320, height: 720 });
    const narrow = await page.locator('#appModal').evaluate(element => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth
    }));
    assert.ok(narrow.left >= 0 && narrow.right <= 320, 'modal permanece dentro de 320 px');
    assert.ok(narrow.scrollWidth <= narrow.clientWidth, 'modal não transborda em 320 px');

    await page.evaluate(() => {
      const details = {
        reason: 'owner-mismatch',
        local: { name: 'Preservado Local', className: 'Arcano', level: 4 },
        online: null,
        actions: []
      };
      openModal({
        title: ONLINE_CONFLICT_COPY[details.reason].title,
        content: createOnlineConflictContent(details),
        actions: conflictResolutionActions('character-conflict-source', details)
      });
    });
    assert.deepEqual(await page.locator('#modalActions button').allInnerTexts(), ['Decidir depois']);
    assert.match(await page.locator('#modalDescription').innerText(), /conta proprietária/i);

    await page.evaluate(() => {
      closeModal();
      window.dispatchEvent(new CustomEvent('cronicas:character-sync-state', {
        detail: {
          localId: 'character-conflict-source',
          state: 'conflict',
          message: 'Conflito Online · revisão necessária'
        }
      }));
    });
    assert.equal(await page.locator('#modalOverlay').isVisible(), false, 'conflito em background não abre modal');
    const managerBadge = page.locator('[data-character-entry="character-conflict-source"] .character-online-state');
    assert.equal(await managerBadge.getAttribute('data-state'), 'conflict');
    assert.equal(await managerBadge.innerText(), 'Conflito Online · revisão necessária');

    const feedbackStates = [
      ['offline', 'Salvo Localmente · Offline'],
      ['reconnecting', 'Reconectando'],
      ['auth-required', 'Salvo Localmente · entre na conta'],
      ['permanent-error', 'Falha Online · ação necessária']
    ];
    for (const [state, message] of feedbackStates) {
      await page.evaluate(({ state, message }) => {
        window.dispatchEvent(new CustomEvent('cronicas:character-sync-state', {
          detail: { localId: 'character-conflict-source', state, message }
        }));
      }, { state, message });
      assert.equal(await managerBadge.getAttribute('data-state'), state);
      assert.equal(await managerBadge.innerText(), message);
    }
    const badgeOverflow = await managerBadge.evaluate(element => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      cardRight: element.closest('.character-card').getBoundingClientRect().right,
      viewport: window.innerWidth
    }));
    assert.ok(badgeOverflow.scrollWidth <= badgeOverflow.clientWidth, 'status longo quebra sem overflow');
    assert.ok(badgeOverflow.cardRight <= badgeOverflow.viewport, 'status permanece dentro do card mobile');
    assert.deepEqual(errors, []);
    console.log('OK conflict resolution UI and timestamped local backup');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
