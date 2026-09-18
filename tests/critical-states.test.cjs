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

async function inputValue(page, selector) {
  return Number(await page.locator(selector).inputValue());
}

async function setResource(page, selector, value) {
  await page.locator(selector).fill(String(value));
  await page.locator(selector).dispatchEvent('input');
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => typeof bindCriticalStates === 'function');
    await page.evaluate(() => {
      const character = createEmptyCharacterState();
      Object.assign(character.fields, {
        nome: 'Teste de estados críticos', classe: 'Vanguarda', nivel: '1',
        pvAtual: '12', pvMax: '30', psAtual: '10', psMax: '20',
        agilidade: '2', bonusDefesaEquipamento: '2'
      });
      character.activeEffects = [{
        id: 'effect-custom-001', name: 'Efeito personalizado', type: 'positive',
        description: 'Deve permanecer intacto.', duration: 'Uma cena'
      }];
      restoreState(character);
      showCharacterSheetView();
    });

    assert.equal(await page.locator('#criticalStatesSection').isVisible(), false);
    assert.equal(await page.locator('#defesaTotal').innerText(), '14');

    await setResource(page, '#pvAtual', 0);
    assert.equal(await page.locator('#dyingStatePanel').isVisible(), true, 'PV 0 ativa Morrendo');
    assert.match(await page.locator('#dyingStatePanel').innerText(), /inconsciente e não pode agir/i);
    assert.match(await page.locator('#dyingStatePanel').innerText(), /Medicina — DT 20/i);
    assert.equal(await page.locator('#activeEffectsCount').innerText(), '2', 'estado derivado coexiste com efeito personalizado');

    await page.locator('#advanceDyingRound').click();
    await page.locator('#advanceDyingRound').click();
    assert.match(await page.locator('#dyingRoundLabel').innerText(), /Rodada 3 de 3/);
    await page.locator('#undoDyingRound').click();
    assert.match(await page.locator('#dyingRoundLabel').innerText(), /Rodada 2 de 3/);
    await page.locator('#advanceDyingRound').click();
    await page.locator('#advanceDyingRound').click();
    assert.match(await page.locator('#dyingStateOutcome').innerText(), /personagem morreu/i);
    for (const selector of ['#advanceDyingRound', '#stabilizeDying', '#healDying']) {
      assert.equal(await page.locator(selector).isDisabled(), true, `${selector} é encerrado na terceira rodada`);
    }
    assert.equal(await page.locator('#dyingRoundTrack .completed').count(), 3);

    await setResource(page, '#pvAtual', 5);
    assert.equal(await page.locator('#dyingStatePanel').isVisible(), false, 'alteração manual posterior continua possível');
    assert.equal(await page.evaluate(() => state.criticalStates.dyingRounds), 0);

    await setResource(page, '#pvAtual', 0);
    await page.locator('#stabilizeDying').click();
    assert.equal(await inputValue(page, '#pvAtual'), 1, 'Medicina retorna exatamente com 1 PV');
    assert.equal(await page.evaluate(() => state.criticalStates.resonantRecoveryDefensePenalty), false);

    await setResource(page, '#pvAtual', 0);
    await page.locator('#healDying').click();
    await page.locator('.critical-recovery-form input[type="number"]').fill('7');
    await page.getByRole('button', { name: 'Aplicar cura' }).click();
    assert.equal(await inputValue(page, '#pvAtual'), 7, 'cura comum pode ultrapassar 1 PV');
    assert.equal(await page.locator('#defesaTotal').innerText(), '14');

    await setResource(page, '#pvAtual', 0);
    await page.locator('#healDying').click();
    await page.locator('.critical-recovery-form input[type="number"]').fill('4');
    await page.locator('.critical-recovery-form input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Aplicar cura' }).click();
    assert.equal(await inputValue(page, '#pvAtual'), 4);
    assert.equal(await page.locator('#defesaTotal').innerText(), '11', 'cura ressonante aplica −3 DEF uma única vez');
    assert.equal(await page.locator('#resonantRecoveryPanel').isVisible(), true);
    assert.equal(await page.locator('#listaEfeitosSistema .system-active-effect-card').count(), 1);
    assert.equal(await page.locator('#listaEfeitosSistema button').count(), 0, 'efeito do sistema é somente leitura');

    await setResource(page, '#pvAtual', 0);
    await page.locator('#healDying').click();
    await page.locator('.critical-recovery-form input[type="number"]').fill('2');
    await page.locator('.critical-recovery-form input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Aplicar cura' }).click();
    assert.equal(await page.locator('#defesaTotal').innerText(), '11', 'recuperações ressonantes não acumulam a penalidade');

    await setResource(page, '#psAtual', 0);
    assert.equal(await page.locator('#losingMindStatePanel').isVisible(), true, 'PS 0 ativa Enlouquecendo');
    assert.match(await page.locator('#losingMindStatePanel').innerText(), /Diplomacia — DT 20/i);
    await page.locator('#advanceLosingMindRound').click();
    await page.locator('#advanceLosingMindRound').click();
    await page.locator('#advanceLosingMindRound').click();
    assert.match(await page.locator('#losingMindStateOutcome').innerText(), /consequências devem ser resolvidas com o Mestre/i);
    assert.equal(await page.locator('#advanceLosingMindRound').isDisabled(), true);
    assert.equal(await page.locator('#resolveLosingMind').isDisabled(), true);
    assert.equal(await page.locator('#criticalStatesSection').innerText().then(text => /Cicatriz Mental/i.test(text)), false);

    await page.locator('#undoLosingMindRound').click();
    await page.locator('#resolveLosingMind').click();
    assert.equal(await inputValue(page, '#psAtual'), 1, 'Diplomacia retorna exatamente com 1 PS');
    assert.equal(await page.evaluate(() => state.criticalStates.losingMindRounds), 0);

    await setResource(page, '#pvAtual', 0);
    await setResource(page, '#psAtual', 0);
    await page.locator('#advanceDyingRound').click();
    await page.locator('#advanceLosingMindRound').click();
    await page.locator('#classe').selectOption('Arcano');
    await page.locator('#nivel').fill('6');
    await page.locator('#nivel').dispatchEvent('input');
    assert.deepEqual(await page.evaluate(() => state.criticalStates), {
      dyingRounds: 1, losingMindRounds: 1, resonantRecoveryDefensePenalty: true
    }, 'Classe e nível não alteram estados ativos');

    const persistence = await page.evaluate(async () => {
      captureState();
      const captured = JSON.parse(JSON.stringify(state));
      const validation = validateImportedSheet(captured);
      const localId = 'critical-states-local';
      writeStoredCharacter(localId, validation.normalized);
      const local = readStoredCharacter(localId);
      let manager = readCharacterManager() || createEmptyCharacterManager();
      manager = setCharacterSummary(manager, localId, await createCharacterSummary(validation.normalized));
      writeCharacterManager(manager);
      let payload = null;
      let operation = 'select';
      const online = {
        id: 'online-critical', owner_id: 'critical-owner', source_local_id: localId,
        name: validation.normalized.fields.nome || 'Personagem', level: 1,
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
        getUser: async () => ({ id: 'critical-owner' }),
        client: { from: () => query }
      };
      await ChroniclesCollaboration.resolveCharacterForOpen(localId, validation.normalized);
      await ChroniclesCollaboration.synchronizePublishedCharacter(localId, validation.normalized);
      const persistedSnapshot = payload?.snapshot || online.snapshot;
      return {
        captured: captured.criticalStates,
        imported: validation.normalized.criticalStates,
        local: local.criticalStates,
        online: persistedSnapshot.criticalStates,
        schemaVersion: persistedSnapshot.schemaVersion,
        customEffects: persistedSnapshot.activeEffects.map(effect => effect.name),
        rootKeys: Object.keys(persistedSnapshot)
      };
    });
    for (const source of ['captured', 'imported', 'local', 'online']) {
      assert.deepEqual(persistence[source], {
        dyingRounds: 1, losingMindRounds: 1, resonantRecoveryDefensePenalty: true
      }, `${source} preserva os estados críticos`);
    }
    assert.equal(persistence.schemaVersion, '0.3-pre-alpha');
    assert.deepEqual(persistence.customEffects, ['Efeito personalizado']);
    assert.equal(persistence.rootKeys.includes('mentalScars'), false, 'nenhuma estrutura de Cicatriz Mental é criada');

    await setResource(page, '#pvAtual', 2);
    await setResource(page, '#psAtual', 2);
    await page.locator('#registerRest').click();
    assert.equal(await page.locator('#defesaTotal').innerText(), '14', 'descanso remove somente −3 DEF');
    assert.equal(await page.evaluate(() => state.activeEffects.map(effect => effect.name).join(',')), 'Efeito personalizado');
    assert.equal(await page.locator('#listaEfeitosAtivos .active-effect-card').count(), 1);

    await page.evaluate(() => {
      const terminal = createEmptyCharacterState();
      Object.assign(terminal.fields, { classe: 'Vanguarda', nivel: '1', pvAtual: '0', pvMax: '30', psAtual: '0', psMax: '20' });
      terminal.criticalStates = { dyingRounds: 3, losingMindRounds: 3, resonantRecoveryDefensePenalty: false };
      restoreState(terminal);
    });
    assert.equal(await page.locator('#stabilizeDying').isDisabled(), true, 'Morrendo terminal permanece encerrado após restauração');
    assert.equal(await page.locator('#resolveLosingMind').isDisabled(), true, 'Enlouquecendo terminal permanece encerrado após restauração');
    assert.match(await page.locator('#dyingStateOutcome').innerText(), /morreu/i);
    assert.match(await page.locator('#losingMindStateOutcome').innerText(), /Mestre/i);

    await page.evaluate(() => {
      const stale = createEmptyCharacterState();
      Object.assign(stale.fields, { classe: 'Vanguarda', nivel: '1', pvAtual: '8', pvMax: '30', psAtual: '6', psMax: '20' });
      stale.criticalStates = { dyingRounds: 3, losingMindRounds: 2, resonantRecoveryDefensePenalty: true };
      restoreState(stale);
    });
    assert.deepEqual(await page.evaluate(() => state.criticalStates), {
      dyingRounds: 0, losingMindRounds: 0, resonantRecoveryDefensePenalty: true
    }, 'restauração limpa contadores incompatíveis sem remover a penalidade até descanso');

    await page.evaluate(() => {
      const restored = createEmptyCharacterState();
      Object.assign(restored.fields, { classe: 'Vanguarda', nivel: '1', pvAtual: '0', pvMax: '30', psAtual: '0', psMax: '20' });
      delete restored.criticalStates;
      restoreState(restored);
    });
    assert.equal(await page.locator('#dyingStatePanel').isVisible(), true, 'ficha antiga com PV 0 entra em Morrendo');
    assert.equal(await page.locator('#losingMindStatePanel').isVisible(), true, 'ficha antiga com PS 0 entra em Enlouquecendo');
    assert.equal(await page.evaluate(() => state.criticalStates.dyingRounds + state.criticalStates.losingMindRounds), 0);

    for (const viewport of [
      { width: 1920, height: 1080 }, { width: 1366, height: 768 },
      { width: 1024, height: 768 }, { width: 768, height: 1024 },
      { width: 430, height: 932 }, { width: 390, height: 844 },
      { width: 360, height: 800 }, { width: 320, height: 720 }
    ]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        right: document.getElementById('criticalStatesSection').getBoundingClientRect().right,
        viewportWidth: document.documentElement.clientWidth
      }));
      assert.equal(layout.overflow, false, `sem overflow horizontal em ${viewport.width}px`);
      assert.ok(layout.right <= layout.viewportWidth + 1, `painel contido em ${viewport.width}px`);
    }

    assert.deepEqual(errors, []);
    console.log('OK Morrendo, Enlouquecendo, recuperação ressonante, persistência e responsividade');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
