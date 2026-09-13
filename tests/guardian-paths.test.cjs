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

function names(cards) {
  return cards.map(card => card.querySelector('[data-field="nome"]').value);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => typeof createEmptyCharacterState === 'function');

    const options = await page.locator('#classe option').evaluateAll(elements => elements.map(option => ({
      value: option.value,
      disabled: option.disabled,
      hidden: option.hidden
    })));
    assert.deepEqual(options.slice(-3), [
      { value: 'Guardião', disabled: true, hidden: true },
      { value: 'Guardião Bastião', disabled: false, hidden: false },
      { value: 'Guardião Regente', disabled: false, hidden: false }
    ]);
    assert.deepEqual(
      options.filter(option => !option.hidden && !option.disabled).map(option => option.value),
      ['', 'Vanguarda', 'Atirador', 'Arcano', 'Guardião Bastião', 'Guardião Regente']
    );

    await page.evaluate(() => {
      const character = createEmptyCharacterState();
      Object.assign(character.fields, {
        classe: 'Guardião', nivel: '10', vigor: '3', intelecto: '4',
        pvAtual: '33', pvMax: '70', pnAtual: '21', pnMax: '43', psAtual: '12', psMax: '38'
      });
      character.abilities = [
        { nome: 'Pulso Restaurador', nivel: '3', efeito: 'Versão personalizada do jogador.', favorite: true },
        { nome: 'Técnica Pessoal', nivel: '2', efeito: 'Não pertence à Classe.' }
      ];
      character.automaticAbilityFavorites = { guardiao: true };
      restoreState(character);
      showCharacterSheetView();
    });

    assert.equal(await page.locator('#classe').inputValue(), 'Guardião');
    assert.equal(await page.locator('.automatic-class-ability').count(), 1);
    assert.equal(await page.locator('.ability-card:not(.automatic-class-ability)').count(), 2);
    assert.match(await page.locator('#classReference').innerText(), /escolha Guardião Bastião ou Guardião Regente/i);

    const legacyFlows = await page.evaluate(async () => {
      const legacy = createEmptyCharacterState();
      Object.assign(legacy.fields, { nome: 'Guardião Antigo', classe: 'Guardião', nivel: '5' });
      legacy.abilities = [{ nome: 'Habilidade preservada', efeito: 'Conteúdo pessoal.' }];

      const localId = 'guardian-legacy-local';
      writeStoredCharacter(localId, legacy);
      let manager = readCharacterManager() || createEmptyCharacterManager();
      manager = setCharacterSummary(manager, localId, await createCharacterSummary(legacy));
      writeCharacterManager(manager);
      await openCharacter(localId);
      const local = {
        className: document.getElementById('classe').value,
        title: document.getElementById('classReferenceTitle').textContent,
        personalAbilities: state.abilities.map(ability => ability.nome)
      };

      const imported = JSON.parse(JSON.stringify(legacy));
      imported.fields.nome = 'Guardião Importado';
      const validation = validateImportedSheet(imported);
      const importedId = await storeImportedCharacterAsNew(validation.normalized);
      await openCharacter(importedId);
      return {
        local,
        imported: {
          valid: validation.valid,
          normalizedClass: validation.normalized.fields.classe,
          selectedClass: document.getElementById('classe').value,
          title: document.getElementById('classReferenceTitle').textContent,
          personalAbilities: state.abilities.map(ability => ability.nome)
        }
      };
    });
    assert.deepEqual(legacyFlows.local, {
      className: 'Guardião', title: 'Guardião legado', personalAbilities: ['Habilidade preservada']
    });
    assert.deepEqual(legacyFlows.imported, {
      valid: true,
      normalizedClass: 'Guardião',
      selectedClass: 'Guardião',
      title: 'Guardião legado',
      personalAbilities: ['Habilidade preservada']
    });

    await page.evaluate(() => {
      const character = createEmptyCharacterState();
      Object.assign(character.fields, {
        classe: 'Guardião', nivel: '10', vigor: '3', intelecto: '4',
        pvAtual: '33', pvMax: '70', pnAtual: '21', pnMax: '43', psAtual: '12', psMax: '38'
      });
      character.abilities = [
        { nome: 'Pulso Restaurador', nivel: '3', efeito: 'Versão personalizada do jogador.', favorite: true },
        { nome: 'Técnica Pessoal', nivel: '2', efeito: 'Não pertence à Classe.' }
      ];
      character.automaticAbilityFavorites = { guardiao: true };
      restoreState(character);
    });

    const initialResources = await page.evaluate(() => ['pvAtual', 'pvMax', 'pnAtual', 'pnMax', 'psAtual', 'psMax']
      .map(id => document.getElementById(id).value));
    await page.locator('#classe').selectOption('Guardião Bastião');
    assert.deepEqual(await page.locator('.automatic-class-ability').evaluateAll(names), [
      'Guarda Ressonante', 'Intervenção Ressonante', 'Guarda Inabalável', 'Fortaleza Ressonante'
    ]);
    assert.deepEqual(await page.locator('.ability-card:not(.automatic-class-ability)').evaluateAll(names), [
      'Pulso Restaurador', 'Técnica Pessoal'
    ]);
    assert.deepEqual(await page.evaluate(() => ['pvAtual', 'pvMax', 'pnAtual', 'pnMax', 'psAtual', 'psMax']
      .map(id => document.getElementById(id).value)), initialResources);
    assert.equal(await page.locator('.automatic-class-ability[data-automatic-ability="Guarda Ressonante"] .favorite-card-button').getAttribute('aria-pressed'), 'false');
    await page.locator('.automatic-class-ability[data-automatic-ability="Guarda Ressonante"] .favorite-card-button').click();

    await page.locator('#classe').selectOption('Guardião Regente');
    assert.deepEqual(await page.locator('.automatic-class-ability').evaluateAll(names), [
      'Pulso Restaurador', 'Ordem Ressonante', 'Regência Compartilhada', 'Campo de Regência'
    ]);
    assert.equal(await page.locator('.automatic-class-ability[data-automatic-ability="Pulso Restaurador"] .favorite-card-button').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.ability-card:not(.automatic-class-ability)').count(), 2);

    await page.locator('.automatic-class-ability[data-automatic-ability="Ordem Ressonante"] .favorite-card-button').click();
    await page.locator('#classe').selectOption('Guardião Bastião');
    assert.equal(await page.locator('.automatic-class-ability[data-automatic-ability="Guarda Ressonante"] .favorite-card-button').getAttribute('aria-pressed'), 'true');
    await page.locator('#classe').selectOption('Guardião Regente');
    assert.equal(await page.locator('.automatic-class-ability[data-automatic-ability="Ordem Ressonante"] .favorite-card-button').getAttribute('aria-pressed'), 'true');
    await page.locator('.automatic-class-ability[data-automatic-ability="Pulso Restaurador"] .favorite-card-button').click();
    await page.locator('#classe').selectOption('Guardião Bastião');
    await page.locator('#classe').selectOption('Guardião Regente');
    assert.equal(await page.locator('.automatic-class-ability[data-automatic-ability="Pulso Restaurador"] .favorite-card-button').getAttribute('aria-pressed'), 'false');

    for (const [level, count] of [[1, 1], [4, 2], [7, 3], [10, 4]]) {
      await page.locator('#nivel').fill(String(level));
      await page.locator('#nivel').dispatchEvent('input');
      assert.equal(await page.locator('.automatic-class-ability').count(), count, `habilidades oficiais no nível ${level}`);
      assert.equal(await page.locator('.ability-card:not(.automatic-class-ability)').count(), 2, `habilidades pessoais no nível ${level}`);
    }

    const persistence = await page.evaluate(() => {
      captureState();
      const exported = JSON.parse(JSON.stringify(state));
      const validation = validateImportedSheet(exported);
      const legacy = createEmptyCharacterState();
      legacy.fields.classe = 'Guardião';
      const legacyValidation = validateImportedSheet(legacy);
      return {
        exportedClass: exported.fields.classe,
        persistedAbilities: exported.abilities.map(ability => ability.nome),
        favoriteKeys: Object.keys(exported.automaticAbilityFavorites || {}).sort(),
        importedClass: validation.normalized.fields.classe,
        legacyClass: legacyValidation.normalized.fields.classe,
        legacyValid: legacyValidation.valid
      };
    });
    assert.equal(persistence.exportedClass, 'Guardião Regente');
    assert.deepEqual(persistence.persistedAbilities, ['Pulso Restaurador', 'Técnica Pessoal']);
    assert.equal(persistence.importedClass, 'Guardião Regente');
    assert.equal(persistence.legacyClass, 'Guardião');
    assert.equal(persistence.legacyValid, true);
    assert.ok(!persistence.favoriteKeys.includes('guardiao'));
    assert.ok(persistence.favoriteKeys.some(key => key.includes('guardiao-bastiao-1-guarda-ressonante')));
    assert.ok(persistence.favoriteKeys.some(key => key.includes('guardiao-regente-4-ordem-ressonante')));

    const online = await page.evaluate(async () => {
      captureState();
      const localId = 'guardian-online-test';
      writeStoredCharacter(localId, JSON.parse(JSON.stringify(state)));
      let manager = readCharacterManager() || createEmptyCharacterManager();
      manager = setCharacterSummary(manager, localId, await createCharacterSummary(state));
      writeCharacterManager(manager);
      let payload = null;
      const query = {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: { id: 'published-character' }, error: null }),
        upsert(value) { payload = value; return this; },
        single: async () => ({ data: { id: 'published-character', ...payload }, error: null })
      };
      window.CronicasSupabase = {
        ready: Promise.resolve(), authenticated: true,
        getUser: async () => ({ id: 'guardian-owner' }),
        client: { from: () => query }
      };
      await ChroniclesCollaboration.synchronizePublishedCharacter(localId, state);
      return { className: payload.class_name, snapshotClass: payload.snapshot.fields.classe };
    });
    assert.deepEqual(online, { className: 'Guardião Regente', snapshotClass: 'Guardião Regente' });

    for (const viewport of [{ width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
      await page.setViewportSize(viewport);
      if (await page.locator('[data-mobile-target="conteudo"]').isVisible()) {
        await page.locator('[data-mobile-target="conteudo"]').click();
      }
      if (await page.locator('#contentTabHabilidades').isVisible()) {
        await page.locator('#contentTabHabilidades').click();
      }
      await page.locator('#contentPanelHabilidades').scrollIntoViewIfNeeded();
      const layout = await page.evaluate(() => ({
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        selectOverflow: document.getElementById('classe').scrollWidth > document.getElementById('classe').clientWidth + 1,
        referenceRight: document.getElementById('classReference').getBoundingClientRect().right,
        viewportWidth: document.documentElement.clientWidth
      }));
      assert.equal(layout.documentOverflow, false, `sem overflow horizontal em ${viewport.width}px`);
      assert.equal(layout.selectOverflow, false, `seleção legível em ${viewport.width}px`);
      assert.ok(layout.referenceRight <= layout.viewportWidth + 1, `referência contida em ${viewport.width}px`);
    }

    assert.deepEqual(errors, []);
    console.log('OK Guardião legado, Bastião, Regente, favoritos, persistência, Online e responsividade');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
