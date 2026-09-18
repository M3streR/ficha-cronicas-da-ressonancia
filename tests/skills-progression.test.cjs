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

const officialSkills = [
  'Acrobacia', 'Artes', 'Atletismo', 'Atualidades', 'Carisma', 'Ciências', 'Combate', 'Crime',
  'Diplomacia', 'Fortitude', 'Furtividade', 'História', 'Iniciativa', 'Intuição', 'Investigação',
  'Medicina', 'Percepção', 'Pilotagem', 'Pontaria', 'Profissão', 'Reflexos', 'Ressonância',
  'Sobrevivência', 'Tática', 'Tecnologia', 'Vontade'
];

function skillSelect(page, name, legacy = false) {
  const container = legacy ? '#listaPericiasLegado' : '#listaPericias';
  return page.locator(`${container} .skill-row[data-skill="${name}"] select`);
}

async function outputValue(page, selector) {
  return page.locator(selector).evaluate(output => output.value);
}

async function forceDegree(select, degree) {
  await select.evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, degree);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => typeof analyzeSkillDistribution === 'function');
    await page.evaluate(() => {
      restoreState(createEmptyCharacterState());
      showCharacterSheetView();
    });

    assert.deepEqual(
      await page.locator('#listaPericias .skill-row').evaluateAll(rows => rows.map(row => row.dataset.skill)),
      officialSkills,
      'a ficha nova apresenta exatamente as 26 perícias oficiais'
    );
    assert.equal(await page.locator('[data-skill="Enganação"]').count(), 0, 'Enganação não aparece em ficha nova');
    assert.equal(await page.locator('#skillFilterCount').innerText(), 'Exibindo 26 de 26 perícias');
    assert.equal(await outputValue(page, '#skillInitialCount'), '0 / 6');
    assert.equal(await outputValue(page, '#skillAdvanceCount'), '0 / 0');

    for (const [index, name] of officialSkills.slice(0, 6).entries()) {
      await skillSelect(page, name).selectOption('Praticante');
      assert.equal(
        await outputValue(page, '#skillInitialCount'),
        `${index + 1} / 6`,
        `o contador acompanha ${index + 1} perícia(s) Praticante`
      );
    }
    assert.equal(await outputValue(page, '#skillInitialCount'), '6 / 6', 'seis escolhas iniciais são aceitas');
    assert.equal(await skillSelect(page, officialSkills[6]).locator('option', { hasText: 'Praticante' }).isDisabled(), true, 'a sétima escolha fica indisponível');
    await forceDegree(skillSelect(page, officialSkills[6]), 'Praticante');
    assert.equal(await skillSelect(page, officialSkills[6]).inputValue(), 'Sem Domínio', 'a validação rejeita a sétima escolha mesmo fora da interface');
    assert.match(await page.locator('#skillProgressFeedback').innerText(), /apenas 6 perícias/i);

    assert.equal(await skillSelect(page, officialSkills[0]).locator('option', { hasText: 'Experiente' }).isDisabled(), true);
    await forceDegree(skillSelect(page, officialSkills[0]), 'Experiente');
    assert.equal(await skillSelect(page, officialSkills[0]).inputValue(), 'Praticante', 'Experiente é bloqueado antes do nível 6');

    await page.locator('#nivel').fill('3');
    assert.equal(await outputValue(page, '#skillAdvanceCount'), '0 / 2');
    await skillSelect(page, officialSkills[6]).selectOption('Praticante');
    await skillSelect(page, officialSkills[7]).selectOption('Praticante');
    assert.equal(await outputValue(page, '#skillAdvanceCount'), '2 / 2', 'nível 3 recebe dois avanços');
    await forceDegree(skillSelect(page, officialSkills[8]), 'Praticante');
    assert.equal(await skillSelect(page, officialSkills[8]).inputValue(), 'Sem Domínio');

    await page.locator('#nivel').fill('6');
    assert.equal(await outputValue(page, '#skillAdvanceCount'), '2 / 4');
    await skillSelect(page, officialSkills[0]).selectOption('Experiente');
    await skillSelect(page, officialSkills[1]).selectOption('Experiente');
    assert.equal(await outputValue(page, '#skillAdvanceCount'), '4 / 4', 'nível 6 acumula quatro avanços');
    assert.equal(await skillSelect(page, officialSkills[0]).locator('option', { hasText: 'Mestre' }).isDisabled(), true);
    await forceDegree(skillSelect(page, officialSkills[0]), 'Mestre');
    assert.equal(await skillSelect(page, officialSkills[0]).inputValue(), 'Experiente', 'Mestre é bloqueado antes do nível 9');

    await page.locator('#nivel').fill('9');
    assert.equal(await outputValue(page, '#skillAdvanceCount'), '4 / 6');
    await skillSelect(page, officialSkills[0]).selectOption('Mestre');
    await skillSelect(page, officialSkills[1]).selectOption('Mestre');
    assert.equal(await outputValue(page, '#skillAdvanceCount'), '6 / 6', 'nível 9 acumula seis avanços');
    await forceDegree(skillSelect(page, officialSkills[2]), 'Mestre');
    assert.equal(await skillSelect(page, officialSkills[2]).inputValue(), 'Praticante', 'não é possível saltar de Praticante para Mestre');
    await forceDegree(skillSelect(page, officialSkills[8]), 'Mestre');
    assert.equal(await skillSelect(page, officialSkills[8]).inputValue(), 'Sem Domínio', 'não é possível saltar de Sem Domínio para Mestre');
    assert.match(await page.locator('#skillProgressFeedback').innerText(), /apenas um grau/i);

    await page.locator('#nivel').fill('6');
    assert.equal(await skillSelect(page, officialSkills[0]).inputValue(), 'Mestre', 'reduzir o nível não rebaixa uma perícia');
    assert.equal(await page.locator('#skillCompatibilityWarning').isVisible(), true, 'a redução de nível sinaliza incompatibilidade');
    await skillSelect(page, officialSkills[0]).selectOption('Experiente');
    await skillSelect(page, officialSkills[1]).selectOption('Experiente');
    assert.equal(await page.locator('#skillCompatibilityWarning').isVisible(), false, 'reduções manuais corrigem a distribuição');

    const stableDegrees = await page.locator('#listaPericias select').evaluateAll(selects => selects.map(select => select.value));
    for (const level of ['9', '3', '6', '1', '9', '6']) await page.locator('#nivel').fill(level);
    assert.deepEqual(
      await page.locator('#listaPericias select').evaluateAll(selects => selects.map(select => select.value)),
      stableDegrees,
      'trocas repetidas de nível não alteram graus'
    );

    const legacyFixture = await page.evaluate(names => {
      const character = createEmptyCharacterState();
      Object.assign(character.fields, { nome: 'Legado de Perícias', nivel: '1' });
      names.slice(0, 7).forEach(name => { character.skills[name] = 'Praticante'; });
      character.skills[names[0]] = 'Experiente';
      character.skills.Enganação = 'Mestre';
      restoreState(character);
      captureState();
      return JSON.parse(JSON.stringify(state));
    }, officialSkills);

    assert.equal(await page.locator('#listaPericias .skill-row').count(), 26);
    assert.equal(await skillSelect(page, 'Enganação', true).inputValue(), 'Mestre', 'Enganação legado continua acessível');
    assert.equal(await page.locator('#legacySkillsSection').isVisible(), true);
    assert.equal(await page.locator('#skillCompatibilityWarning').isVisible(), true);
    assert.equal(legacyFixture.skills.Enganação, 'Mestre', 'carregar e capturar não altera Enganação');
    assert.equal(legacyFixture.skills[officialSkills[0]], 'Experiente', 'carregar e capturar não rebaixa grau oficial incompatível');

    await forceDegree(skillSelect(page, 'Medicina'), 'Praticante');
    assert.equal(await skillSelect(page, 'Medicina').inputValue(), 'Sem Domínio', 'distribuição incompatível não aceita novos aumentos');
    await skillSelect(page, officialSkills[0]).selectOption('Praticante');
    assert.equal(await page.locator('#skillCompatibilityWarning').isVisible(), true, 'correção parcial preserva o aviso');
    await skillSelect(page, officialSkills[6]).selectOption('Sem Domínio');
    assert.equal(await page.locator('#skillCompatibilityWarning').isVisible(), false, 'a distribuição pode ser corrigida sem normalização automática');
    await skillSelect(page, 'Enganação', true).selectOption('Experiente');
    assert.equal(await skillSelect(page, 'Enganação', true).locator('option', { hasText: 'Mestre' }).isDisabled(), true, 'Enganação pode ser reduzida, mas não aumentada');

    const persistence = await page.evaluate(async fixture => {
      const validation = validateImportedSheet(fixture);
      const localId = 'skills-progression-local';
      writeStoredCharacter(localId, validation.normalized);
      const local = readStoredCharacter(localId);
      let manager = readCharacterManager() || createEmptyCharacterManager();
      manager = setCharacterSummary(manager, localId, await createCharacterSummary(validation.normalized));
      writeCharacterManager(manager);

      let payload = null;
      let operation = 'select';
      const online = {
        id: 'online-skills', owner_id: 'skills-owner', source_local_id: localId,
        name: validation.normalized.fields.nome || 'Legado de Perícias', level: 1,
        class_name: validation.normalized.fields.classe || '', signature: '', thumbnail: '',
        snapshot: validation.normalized,
        created_at: '2026-09-18T12:00:00.000001+00:00',
        updated_at: '2026-09-18T12:00:00.000001+00:00'
      };
      const query = {
        select() { return this; }, eq() { return this; },
        update(value) { operation = 'update'; payload = value; return this; },
        maybeSingle: async () => ({
          data: operation === 'update'
            ? { ...online, ...payload, updated_at: '2026-09-18T12:00:00.000002+00:00' }
            : online,
          error: null
        })
      };
      window.CronicasSupabase = {
        ready: Promise.resolve(), authenticated: true,
        getUser: async () => ({ id: 'skills-owner' }),
        client: { from: () => query }
      };
      await ChroniclesCollaboration.resolveCharacterForOpen(localId, validation.normalized);
      await ChroniclesCollaboration.synchronizePublishedCharacter(localId, validation.normalized);
      const persistedSnapshot = payload?.snapshot || online.snapshot;
      return {
        importedLegacy: validation.normalized.skills.Enganação,
        importedOfficial: validation.normalized.skills.Acrobacia,
        localLegacy: local.skills.Enganação,
        localOfficial: local.skills.Acrobacia,
        onlineLegacy: persistedSnapshot.skills.Enganação,
        onlineOfficial: persistedSnapshot.skills.Acrobacia,
        schemaVersion: persistedSnapshot.schemaVersion
      };
    }, legacyFixture);
    assert.deepEqual(persistence, {
      importedLegacy: 'Mestre', importedOfficial: 'Experiente',
      localLegacy: 'Mestre', localOfficial: 'Experiente',
      onlineLegacy: 'Mestre', onlineOfficial: 'Experiente',
      schemaVersion: '0.3-pre-alpha'
    });

    for (const viewport of [
      { width: 1920, height: 1080 }, { width: 1366, height: 768 },
      { width: 1024, height: 768 }, { width: 768, height: 1024 },
      { width: 430, height: 932 }, { width: 390, height: 844 },
      { width: 360, height: 800 }, { width: 320, height: 720 }
    ]) {
      await page.setViewportSize(viewport);
      if (await page.locator('[data-mobile-target="pericias"]').isVisible()) {
        await page.locator('[data-mobile-target="pericias"]').click();
      }
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        summaryRight: document.getElementById('skillProgressSummary').getBoundingClientRect().right,
        legacyRight: document.getElementById('legacySkillsSection').getBoundingClientRect().right,
        viewportWidth: document.documentElement.clientWidth,
        countersVisible: document.getElementById('skillInitialCount').getClientRects().length > 0
      }));
      assert.equal(layout.overflow, false, `sem overflow horizontal em ${viewport.width}px`);
      assert.ok(layout.summaryRight <= layout.viewportWidth + 1, `resumo contido em ${viewport.width}px`);
      assert.ok(layout.legacyRight <= layout.viewportWidth + 1, `legado contido em ${viewport.width}px`);
      assert.equal(layout.countersVisible, true, `contadores visíveis em ${viewport.width}px`);
    }

    assert.deepEqual(errors, []);
    console.log('OK progressão de Perícias, legado, persistência e responsividade');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
