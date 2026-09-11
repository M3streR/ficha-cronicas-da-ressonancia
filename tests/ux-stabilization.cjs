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
    assert.deepEqual(errors, []);
    await fs.mkdir(path.join(__dirname, 'artifacts', 'stabilization-ux'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, 'artifacts', 'stabilization-ux', 'sidebar-1366.png') });
    await fs.writeFile(path.join(__dirname, 'artifacts', 'stabilization-ux', 'sidebar-report.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(`OK sidebar e navegação: ${cases.length} combinações, 5 ciclos`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
