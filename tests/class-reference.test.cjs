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
    abilities: ['Postura de Combate']
  },
  {
    name: 'Atirador', description: /eliminar ameaças à distância/i,
    stats: ['20 + Vigor', '10 + Intelecto', '20', '+5 PV · +3 PN · +2 PS'],
    progression: ['Mira Precisa', 'Reposicionamento Tático', 'Ponto Fraco', 'Olho do Predador'],
    abilities: ['Mira Precisa']
  },
  {
    name: 'Arcano', description: /domínio da Ressonância/i,
    stats: ['16 + Vigor', '16 + Intelecto', '20', '+4 PV · +4 PN · +2 PS'],
    progression: ['Canalização Arcana', 'Moldagem Ressonante', 'Canalização Acelerada', 'Convergência Arcana'],
    abilities: ['Canalização Arcana']
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

    await channeling.locator('.favorite-card-button').click();
    await page.locator('#classe').selectOption('Vanguarda');
    await page.locator('#classe').selectOption('Arcano');
    assert.equal(await page.locator('.automatic-class-ability .favorite-card-button').getAttribute('aria-pressed'), 'true');

    const persistence = await page.evaluate(() => {
      captureState();
      return {
        className: state.fields.classe,
        personalAbilities: state.abilities.map(ability => ability.nome),
        arcaneFavorite: state.automaticAbilityFavorites?.arcano
      };
    });
    assert.deepEqual(persistence, {
      className: 'Arcano',
      personalAbilities: ['Técnica Pessoal', 'Canalização Arcana'],
      arcaneFavorite: true
    });

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
