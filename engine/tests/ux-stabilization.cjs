const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html');
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${path.sep}`)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const checks = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const entry = page.locator('.site-entry-button');
    if (await entry.isVisible()) await entry.click();

    const resonanceThresholds = await page.evaluate(() => {
      const intellects = [1, 3, 5];
      return intellects.map(intellect => ({
        intellect,
        values: Array.from({ length: 11 }, (_, index) => calculateResonanceThreshold(index + 1, intellect))
      }));
    });
    for (const { intellect, values } of resonanceThresholds) {
      assert.deepEqual(
        values,
        [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5].map(levelBonus => 15 + intellect + levelBonus),
        `Limiar correto do nível 1 ao 11 com Intelecto ${intellect}`
      );
    }
    assert.equal(await page.evaluate(() => calculateResonanceThreshold(11, 6)), 26, 'Limiar aceita Intelecto 6 no nível 11');
    checks.push({ resonanceThresholds });

    const cases = [
      [1920, 1], [1745, 1.1], [1536, 1.25],
      [1366, 1], [1242, 1.1], [1093, 1.25],
      [1024, 1], [931, 1.1], [819, 1.25]
    ];
    for (const [width, zoom] of cases) {
      await page.setViewportSize({ width, height: 768 });
      const result = await page.evaluate(() => [...document.querySelectorAll('.manager-nav-item')].map(button => {
        const rect = button.getBoundingClientRect();
        const sidebar = button.closest('.manager-sidebar').getBoundingClientRect();
        const navigation = button.closest('.manager-navigation').getBoundingClientRect();
        return {
          text: button.textContent.trim(),
          textFits: button.scrollWidth <= button.clientWidth,
          clientWidth: button.clientWidth,
          scrollWidth: button.scrollWidth,
          fontSize: getComputedStyle(button).fontSize,
          padding: getComputedStyle(button).padding,
          sidebarWidth: sidebar.width,
          navigationWidth: navigation.width,
          inside: rect.left >= sidebar.left && rect.right <= sidebar.right,
          visible: rect.width > 0 && rect.height >= 42
        };
      }));
      assert.ok(result.every(item => item.textFits && item.inside && item.visible), `Sidebar cortada em ${width}px / zoom ${zoom}: ${JSON.stringify(result)}`);
      checks.push({ width, zoom, items: result });
    }

    await page.setViewportSize({ width: 1366, height: 768 });
    const characters = page.getByRole('button', { name: 'Personagens', exact: true });
    const chronicles = page.getByRole('button', { name: 'Crônicas', exact: true });
    const localRecord = await page.evaluate(() => ChroniclesStorage.createChronicle({ name: 'Crônica preservada', type: 'campaign', synopsis: 'Teste de troca de seção' }));
    await chronicles.click();
    await page.locator(`[data-chronicle-id="${localRecord.id}"]`).waitFor();
    await characters.click();
    await chronicles.click();
    assert.equal(await page.locator(`[data-chronicle-id="${localRecord.id}"]`).count(), 1, 'O último índice deve permanecer durante a atualização');
    assert.equal(await page.locator('#chroniclesEmptyState').isVisible(), false, 'Não deve piscar estado vazio durante a atualização');
    checks.push({ preservedIndexDuringRefresh: true });
    for (let index = 0; index < 5; index += 1) {
      await chronicles.click();
      await page.locator('#chroniclesIndexView').waitFor({ state: 'visible' });
      assert.equal(await chronicles.getAttribute('aria-current'), 'page');
      await characters.click();
      assert.equal(await characters.getAttribute('aria-current'), 'page');
    }
    checks.push({ navigationCycles: 5 });

    await page.locator('#managerCreateCharacter').click();
    await page.locator('#characterSheetView').waitFor({ state: 'visible' });
    await page.evaluate(() => {
      const restored = createEmptyCharacterState();
      Object.assign(restored.fields, { nivel: '1', intelecto: '3' });
      restoreState(restored);
    });
    assert.equal(await page.locator('#limiarRessonancia').evaluate(output => output.value), '18', 'Restauração recalcula o Limiar no nível 1');
    await page.locator('#nivel').fill('3');
    assert.equal(await page.locator('#limiarRessonancia').evaluate(output => output.value), '19', 'Alteração de nível recalcula o Limiar');
    await page.getByRole('button', { name: 'Aumentar Intelecto' }).click();
    assert.equal(await page.locator('#limiarRessonancia').evaluate(output => output.value), '20', 'Alteração de Intelecto recalcula o Limiar');
    assert.equal(await page.locator('#limiarRessonancia').getAttribute('aria-label'), 'Limiar de Ressonância: 20');
    checks.push({ resonanceThresholdUi: true });

    const responsiveCases = [
      [1920, 1080], [1366, 768], [1280, 800], [1279, 800], [1024, 768], [768, 1024],
      [430, 932], [390, 844], [360, 800], [320, 720]
    ];
    for (const [width, height] of responsiveCases) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      const initial = await page.evaluate(() => {
        const header = document.querySelector('.character-sheet-view > .app-header');
        const resourceBar = document.querySelector('.character-sheet-view > .mobile-resource-bar');
        const contentTabs = document.querySelector('.content-mobile-tabs');
        const sheet = document.querySelector('.character-sheet-view > .sheet-layout');
        return {
          headerPosition: getComputedStyle(header).position,
          headerZIndex: Number(getComputedStyle(header).zIndex),
          headerBackground: getComputedStyle(header).backgroundColor,
          headerOpaque: !/\/\s*(?:0(?:\.\d+)?|\.\d+)\s*\)/.test(getComputedStyle(header).backgroundColor),
          resourceZIndex: Number(getComputedStyle(resourceBar).zIndex),
          tabsZIndex: Number(getComputedStyle(contentTabs).zIndex),
          sheetZIndex: Number(getComputedStyle(sheet).zIndex)
        };
      });
      assert.equal(initial.headerPosition, width >= 1280 ? 'sticky' : 'static', `Comportamento do cabeçalho em ${width}px`);
      assert.equal(initial.headerOpaque, true, `Fundo opaco do cabeçalho em ${width}px: ${initial.headerBackground}`);
      assert.ok(initial.headerZIndex > initial.sheetZIndex, `Cabeçalho acima da ficha em ${width}px`);
      if (width < 1280) {
        assert.ok(initial.resourceZIndex > initial.tabsZIndex, `Barra de recursos acima das abas em ${width}px`);
        assert.ok(initial.tabsZIndex > initial.sheetZIndex, `Abas acima do conteúdo em ${width}px`);
      }

      await page.evaluate(() => window.scrollTo(0, Math.min(900, document.documentElement.scrollHeight - innerHeight)));
      const scrolled = await page.evaluate(() => {
        const header = document.querySelector('.character-sheet-view > .app-header');
        const resourceBar = document.querySelector('.character-sheet-view > .mobile-resource-bar');
        const headerRect = header.getBoundingClientRect();
        const resourceRect = resourceBar.getBoundingClientRect();
        const probeY = innerWidth >= 1280 ? Math.max(2, headerRect.height / 2) : Math.max(2, resourceRect.height / 2);
        const topElement = document.elementFromPoint(Math.min(innerWidth / 2, 300), probeY);
        return {
          headerTop: headerRect.top,
          headerBottom: headerRect.bottom,
          resourceTop: resourceRect.top,
          topLayer: innerWidth >= 1280
            ? Boolean(topElement?.closest('.app-header'))
            : Boolean(topElement?.closest('.mobile-resource-bar')),
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
        };
      });
      if (width >= 1280) {
        assert.ok(Math.abs(scrolled.headerTop) < 1, `Cabeçalho permanece no topo em ${width}px`);
      } else {
        assert.ok(scrolled.headerBottom <= 0, `Cabeçalho estático sai do viewport em ${width}px`);
        assert.ok(Math.abs(scrolled.resourceTop) < 1, `Barra de recursos permanece no topo em ${width}px`);
      }
      assert.equal(scrolled.topLayer, true, `Conteúdo não sobrepõe a camada superior em ${width}px`);
      assert.equal(scrolled.noHorizontalOverflow, true, `Sem overflow horizontal em ${width}px`);
      checks.push({ width, height, header: initial, scrolled });
    }

    assert.deepEqual(errors, []);
    await fs.mkdir(path.join(__dirname, 'artifacts', 'stabilization-ux'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, 'artifacts', 'stabilization-ux', 'sidebar-1366.png') });
    await fs.writeFile(path.join(__dirname, 'artifacts', 'stabilization-ux', 'sidebar-report.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(`OK Limiar, sidebar, navegação e cabeçalho: ${responsiveCases.length} larguras`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
