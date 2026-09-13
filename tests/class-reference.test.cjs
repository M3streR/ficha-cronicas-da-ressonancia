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

const classes = [
  {
    name: 'Vanguarda', description: /especialista em combate corpo a corpo/i,
    stats: ['24 + Vigor', '8 + Intelecto', '20', '+6 PV · +2 PN · +2 PS'],
    progression: ['Postura de Combate', 'Ímpeto de Batalha', 'Tenacidade', 'Postura Perfeita'],
    abilities: ['Postura de Combate', 'Ímpeto de Batalha', 'Tenacidade', 'Postura Perfeita']
  },
  {
    name: 'Atirador', description: /eliminar ameaças à distância/i,
    stats: ['20 + Vigor', '10 + Intelecto', '20', '+5 PV · +3 PN · +2 PS'],
    progression: ['Mira Precisa', 'Reposicionamento Tático', 'Ponto Fraco', 'Olho do Predador'],
    abilities: ['Mira Precisa', 'Reposicionamento Tático', 'Ponto Fraco', 'Olho do Predador']
  },
  {
    name: 'Arcano', description: /domínio da Ressonância/i,
    stats: ['16 + Vigor', '16 + Intelecto', '20', '+4 PV · +4 PN · +2 PS'],
    progression: ['Canalização Arcana', 'Moldagem Ressonante', 'Canalização Acelerada', 'Convergência Arcana'],
    abilities: ['Canalização Arcana', 'Moldagem Ressonante', 'Canalização Acelerada', 'Convergência Arcana']
  },
  {
    name: 'Guardião Bastião', description: /proteger também é uma forma de lutar/i,
    stats: ['22 + Vigor', '12 + Intelecto', '20', '+5 PV · +3 PN · +2 PS'],
    progression: ['Guarda Ressonante', 'Intervenção Ressonante', 'Guarda Inabalável', 'Fortaleza Ressonante'],
    abilities: ['Guarda Ressonante', 'Intervenção Ressonante', 'Guarda Inabalável', 'Fortaleza Ressonante']
  },
  {
    name: 'Guardião Regente', description: /cada aliado consiga lutar em sua melhor condição/i,
    stats: ['22 + Vigor', '12 + Intelecto', '20', '+5 PV · +3 PN · +2 PS'],
    progression: ['Pulso Restaurador', 'Ordem Ressonante', 'Regência Compartilhada', 'Campo de Regência'],
    abilities: ['Pulso Restaurador', 'Ordem Ressonante', 'Regência Compartilhada', 'Campo de Regência']
  }
];

function cardNames(cards) {
  return cards.map(card => card.querySelector('[data-field="nome"]').value);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => typeof createEmptyCharacterState === 'function');
    await page.evaluate(() => {
      const character = createEmptyCharacterState();
      Object.assign(character.fields, { nivel: '10', vigor: '3', intelecto: '4' });
      character.abilities = [
        { nome: 'Técnica Pessoal', efeito: 'Sempre preservada.', favorite: true },
        { nome: 'Canalização Arcana', efeito: 'Versão personalizada do jogador.' }
      ];
      character.automaticAbilityFavorites = { vanguarda: true, atirador: true };
      restoreState(character);
      showCharacterSheetView();
    });

    for (const definition of classes) {
      await page.locator('#classe').selectOption(definition.name);
      assert.equal(await page.locator('#classReference').isVisible(), true, `${definition.name} mostra o painel`);
      assert.equal(await page.locator('#classReferenceTitle').innerText(), definition.name);
      assert.equal(await page.locator('#classReferenceLevel').innerText(), 'NÍVEL 10');
      assert.match(await page.locator('#classReferenceDescription').innerText(), definition.description);
      assert.deepEqual(await page.locator('#classReferenceStats dd').allInnerTexts(), definition.stats);
      assert.equal(await page.locator('#classReferenceProgression li').count(), 11);
      assert.equal(await page.locator('#classReferenceProgression li.unlocked').count(), 10);
      const progressionText = await page.locator('#classReferenceProgression').innerText();
      definition.progression.forEach(name => assert.match(progressionText, new RegExp(name, 'i')));
      assert.deepEqual(await page.locator('.automatic-class-ability').evaluateAll(cardNames), definition.abilities);
      assert.deepEqual(await page.locator('.ability-card:not(.automatic-class-ability)').evaluateAll(cardNames), [
        'Técnica Pessoal', 'Canalização Arcana'
      ]);
      if (definition.name === 'Vanguarda' || definition.name === 'Atirador') {
        assert.equal(
          await page.locator('.automatic-class-ability').first().locator('.favorite-card-button').getAttribute('aria-pressed'),
          'true'
        );
      }
    }

    const levelSequence = [1, 4, 7, 10, 7, 4, 1, 10];
    for (const definition of classes.slice(0, 3)) {
      await page.locator('#classe').selectOption(definition.name);
      for (const level of levelSequence) {
        await page.locator('#nivel').fill(String(level));
        await page.locator('#nivel').dispatchEvent('input');
        const unlockedCount = [1, 4, 7, 10].filter(requiredLevel => requiredLevel <= level).length;
        const automaticNames = await page.locator('.automatic-class-ability').evaluateAll(cardNames);
        assert.deepEqual(
          automaticNames,
          definition.abilities.slice(0, unlockedCount),
          `${definition.name} no nível ${level}`
        );
        assert.equal(new Set(automaticNames).size, automaticNames.length, `${definition.name} sem duplicatas`);
        assert.deepEqual(await page.locator('.ability-card:not(.automatic-class-ability)').evaluateAll(cardNames), [
          'Técnica Pessoal', 'Canalização Arcana'
        ]);
      }
    }

    await page.locator('#classe').selectOption('Arcano');
    const channeling = page.locator('.automatic-class-ability[data-automatic-ability="Canalização Arcana"]');
    assert.deepEqual(await channeling.locator('[data-field]').evaluateAll(fields => Object.fromEntries(
      fields.map(field => [field.dataset.field, field.value])
    )), {
      nome: 'Canalização Arcana',
      nivel: '1',
      custo: '1 PN adicional',
      acao: 'Padrão',
      frequencia: 'Uma vez por rodada',
      alcance: '',
      duracao: '',
      efeito: 'Ao utilizar Canalização Arcana, escolha uma Manifestação conhecida que cause dano ou recupere Pontos de Vida e utilize-a como parte desta mesma ação.\n\nAo calcular o dano ou a cura dessa Manifestação, adicione +1 dado adicional do mesmo tipo utilizado por ela. Por exemplo, uma Manifestação que normalmente cause 2d8 de dano passa a causar 3d8, enquanto uma Manifestação que recupere 2d6 + Intelecto PV passa a recuperar 3d6 + Intelecto PV.\n\nO custo normal da Manifestação ainda deve ser pago, além do custo da Canalização Arcana. Canalização Arcana não aumenta efeitos que não utilizem dados de dano ou cura e não modifica outros efeitos da Manifestação.'
    });

    const officialDetails = [
      ['Vanguarda', 'Ímpeto de Batalha', '4', '1 PN', '', 'Uma vez por rodada', '', '', /deslocar uma distância curta/i],
      ['Vanguarda', 'Tenacidade', '7', '', '', 'Uma vez por combate', '', 'Até o final do combate', /nível \+ Vigor/i],
      ['Vanguarda', 'Postura Perfeita', '10', '4 PN', 'Livre', 'Uma vez por cena', '', '3 rodadas', /bônus são cumulativos/i],
      ['Atirador', 'Reposicionamento Tático', '4', '', '', 'Uma vez por rodada', '', '', /ataque não precisa acertar/i],
      ['Atirador', 'Ponto Fraco', '7', '2 PN', '', 'Uma vez por rodada', '', '', /dado adicional de dano da arma/i],
      ['Atirador', 'Olho do Predador', '10', '4 PN', 'Livre', 'Uma vez por cena', '', '3 rodadas', /cobertura parcial/i],
      ['Arcano', 'Moldagem Ressonante', '4', '1 PN adicional', '', 'Uma vez por rodada', '', '', /aumentar o alcance em uma categoria/i],
      ['Arcano', 'Canalização Acelerada', '7', '4 PN adicionais', '', 'Uma vez por rodada', '', '', /como ação de movimento uma Manifestação que normalmente exigiria uma ação padrão/i],
      ['Arcano', 'Convergência Arcana', '10', 'Custos normais das Manifestações', '', 'Uma vez por cena', '', '', /duas Manifestações diferentes como parte da mesma ação/i]
    ];
    for (const [className, name, level, cost, action, frequency, range, duration, effect] of officialDetails) {
      await page.locator('#classe').selectOption(className);
      await page.locator('#nivel').fill('10');
      await page.locator('#nivel').dispatchEvent('input');
      const card = page.locator(`.automatic-class-ability[data-automatic-ability="${name}"]`);
      const fields = await card.locator('[data-field]').evaluateAll(elements => Object.fromEntries(
        elements.map(element => [element.dataset.field, element.value])
      ));
      assert.deepEqual(fields, {
        nome: name, nivel: level, custo: cost, acao: action,
        frequencia: frequency, alcance: range, duracao: duration, efeito: fields.efeito
      });
      assert.match(fields.efeito, effect);
    }

    await channeling.locator('.favorite-card-button').click();
    await page.locator('#classe').selectOption('Vanguarda');
    await page.locator('#classe').selectOption('Arcano');
    assert.equal(await channeling.locator('.favorite-card-button').getAttribute('aria-pressed'), 'true');

    for (const [className, abilityName] of [
      ['Vanguarda', 'Postura Perfeita'],
      ['Atirador', 'Olho do Predador'],
      ['Arcano', 'Convergência Arcana']
    ]) {
      await page.locator('#classe').selectOption(className);
      await page.locator(`.automatic-class-ability[data-automatic-ability="${abilityName}"] .favorite-card-button`).click();
      await page.locator('#classe').selectOption('Guardião Bastião');
      await page.locator('#classe').selectOption(className);
      assert.equal(
        await page.locator(`.automatic-class-ability[data-automatic-ability="${abilityName}"] .favorite-card-button`).getAttribute('aria-pressed'),
        'true'
      );
    }

    await page.locator('#classe').selectOption('Arcano');

    const persistence = await page.evaluate(() => {
      captureState();
      return {
        className: state.fields.classe,
        personalAbilities: state.abilities.map(ability => ability.nome),
        favoriteKeys: Object.keys(state.automaticAbilityFavorites || {}).sort()
      };
    });
    assert.deepEqual(persistence, {
      className: 'Arcano',
      personalAbilities: ['Técnica Pessoal', 'Canalização Arcana'],
      favoriteKeys: [
        'arcano',
        'arcano-10-convergencia-arcana',
        'atirador',
        'atirador-10-olho-do-predador',
        'vanguarda',
        'vanguarda-10-postura-perfeita'
      ]
    });

    const storageFlows = await page.evaluate(async () => {
      const results = [];
      for (const [className, localId] of [
        ['Vanguarda', 'class-flow-vanguarda'],
        ['Atirador', 'class-flow-atirador'],
        ['Arcano', 'class-flow-arcano']
      ]) {
        const imported = createEmptyCharacterState();
        Object.assign(imported.fields, { nome: `Fluxo ${className}`, classe: className, nivel: '10' });
        imported.abilities = [{ nome: 'Habilidade importada', efeito: 'Conteúdo pessoal.' }];
        const validation = validateImportedSheet(imported);
        writeStoredCharacter(localId, validation.normalized);
        let manager = readCharacterManager() || createEmptyCharacterManager();
        manager = setCharacterSummary(manager, localId, await createCharacterSummary(validation.normalized));
        writeCharacterManager(manager);
        await openCharacter(localId);
        captureState();

        let payload = null;
        const query = {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { id: `online-${localId}` }, error: null }),
          upsert(value) { payload = value; return this; },
          single: async () => ({ data: { id: `online-${localId}`, ...payload }, error: null })
        };
        window.CronicasSupabase = {
          ready: Promise.resolve(), authenticated: true,
          getUser: async () => ({ id: 'class-flow-owner' }),
          client: { from: () => query }
        };
        await ChroniclesCollaboration.synchronizePublishedCharacter(localId, state);
        results.push({
          className,
          importedClass: validation.normalized.fields.classe,
          selectedClass: document.getElementById('classe').value,
          exportedClass: state.fields.classe,
          persistedAbilities: state.abilities.map(ability => ability.nome),
          onlineClass: payload.class_name,
          snapshotClass: payload.snapshot.fields.classe
        });
      }
      return results;
    });
    assert.deepEqual(storageFlows, ['Vanguarda', 'Atirador', 'Arcano'].map(className => ({
      className,
      importedClass: className,
      selectedClass: className,
      exportedClass: className,
      persistedAbilities: ['Habilidade importada'],
      onlineClass: className,
      snapshotClass: className
    })));

    for (const viewport of [
      { width: 1920, height: 1080 }, { width: 1366, height: 768 },
      { width: 1024, height: 768 }, { width: 768, height: 1024 },
      { width: 430, height: 932 }, { width: 390, height: 844 },
      { width: 360, height: 800 }, { width: 320, height: 720 }
    ]) {
      await page.setViewportSize(viewport);
      if (await page.locator('[data-mobile-target="conteudo"]').isVisible()) {
        await page.locator('[data-mobile-target="conteudo"]').click();
      }
      if (await page.locator('#contentTabHabilidades').isVisible()) {
        await page.locator('#contentTabHabilidades').click();
      }
      const layout = await page.evaluate(() => ({
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        panelRight: document.getElementById('classReference').getBoundingClientRect().right,
        viewportWidth: document.documentElement.clientWidth
      }));
      assert.equal(layout.documentOverflow, false, `sem overflow horizontal em ${viewport.width}px`);
      assert.ok(layout.panelRight <= layout.viewportWidth + 1, `painel contido em ${viewport.width}px`);
    }

    assert.deepEqual(errors, []);
    console.log('OK painéis das cinco Classes, Canalização Arcana, favoritos e responsividade');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
