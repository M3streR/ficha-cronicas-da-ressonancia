const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const phase = process.env.AUDIT_PHASE || 'after';
const artifactDir = path.join(__dirname, 'artifacts', 'layer-stabilization');
const viewports = [
  [1920, 1080], [1366, 768], [1280, 800], [1279, 800], [1024, 768],
  [768, 1024], [430, 932], [390, 844], [360, 800], [320, 720]
];

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html');
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
  try {
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(file)] || 'application/octet-stream');
    response.end(await fs.readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});

function screenshotPath(state, width) {
  return path.join(artifactDir, `${phase}-${state}-${width}.webp`);
}

async function layerProbe(page, selector) {
  return page.locator(selector).evaluate((element, targetSelector) => {
    const rect = element.getBoundingClientRect();
    const x = Math.max(1, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(1, Math.min(innerHeight - 1, rect.top + Math.min(rect.height / 2, 48)));
    const stack = document.elementsFromPoint(x, y);
    return {
      selector: targetSelector,
      topMatches: Boolean(stack[0]?.closest(targetSelector)),
      stack: stack.slice(0, 8).map(node => node.id || (typeof node.className === 'string' ? node.className : node.tagName)),
      zIndex: getComputedStyle(element).zIndex,
      position: getComputedStyle(element).position,
      rect: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height }
    };
  }, selector);
}

(async () => {
  await fs.mkdir(artifactDir, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [];
  const results = [];
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => Boolean(window.ChroniclesStorage));
    const entry = page.locator('.site-entry-button');
    if (await entry.isVisible()) await entry.click();

    const layerScale = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const names = [
        '--layer-content', '--layer-elevated', '--layer-sticky', '--layer-sticky-raised',
        '--layer-mobile-navigation', '--layer-popover', '--layer-quick-dice', '--layer-backdrop',
        '--layer-overlay-panel', '--layer-modal', '--layer-critical-notification', '--layer-entry-gate'
      ];
      return Object.fromEntries(names.map(name => [name, Number(style.getPropertyValue(name))]));
    });
    const layerValues = Object.values(layerScale);
    assert.ok(layerValues.every((value, index) => index === 0 || value > layerValues[index - 1]), 'A escala global deve ser estritamente crescente');

    await page.evaluate(async () => {
      const created = [];
      for (let index = 1; index <= 18; index += 1) {
        created.push(await ChroniclesStorage.createChronicle({
          name: `Crônica de camadas ${String(index).padStart(2, '0')}`,
          type: 'campaign',
          synopsis: 'Registro para validar rolagem, navegação e empilhamento.'
        }));
      }
      window.layerAuditChronicle = created[0].id;
    });

    await page.locator('#managerCreateCharacter').click();
    await page.locator('#nome').fill('Personagem de camadas');
    await page.waitForTimeout(450);
    await page.locator('#voltarPersonagens').click();
    await page.locator('.character-card-shell').first().waitFor();

    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => {
        closeChronicleActions?.();
        closeQuickDice?.();
        closeModal?.();
        showCharacterManagerView();
      });

      await page.locator('[data-manager-section="chronicles"]').click();
      await page.locator('.chronicle-record-real').first().waitFor();
      await page.evaluate(() => window.scrollTo(0, Math.min(560, document.documentElement.scrollHeight - innerHeight)));
      const manager = await page.evaluate(() => {
        const navigation = document.querySelector('.manager-navigation');
        const managerRoot = document.querySelector('.character-manager');
        const rect = navigation.getBoundingClientRect();
        return {
          scrollY,
          navigationTop: rect.top,
          navigationPosition: getComputedStyle(navigation).position,
          managerOverflowX: getComputedStyle(managerRoot).overflowX,
          managerOverflowY: getComputedStyle(managerRoot).overflowY,
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
        };
      });
      await page.screenshot({ path: screenshotPath('manager-scroll', width), type: 'webp' });

      await page.locator('[data-manager-section="characters"]').click();
      await page.locator('.character-options-button').first().click();
      const characterMenuSelector = width >= 1280 ? '.character-options-popover:not([hidden])' : '#modalOverlay:not([hidden])';
      const characterMenu = await layerProbe(page, characterMenuSelector);
      await page.screenshot({ path: screenshotPath('character-menu', width), type: 'webp' });
      if (width >= 1280) await page.keyboard.press('Escape');
      else await page.locator('#modalClose').click();

      await page.locator('.character-card').first().click();
      await page.locator('#characterSheetView').waitFor({ state: 'visible' });
      await page.evaluate(() => window.scrollTo(0, Math.min(760, document.documentElement.scrollHeight - innerHeight)));
      const sheetTop = await page.evaluate(() => {
        const header = document.querySelector('.character-sheet-view > .app-header');
        const resources = document.querySelector('.character-sheet-view > .mobile-resource-bar');
        const tabs = document.querySelector('.content-mobile-tabs');
        const active = innerWidth >= 1280 ? header : resources;
        const rect = active.getBoundingClientRect();
        const top = document.elementsFromPoint(Math.min(innerWidth / 2, 320), Math.max(2, Math.min(32, rect.height / 2)));
        return {
          headerPosition: getComputedStyle(header).position,
          headerZIndex: getComputedStyle(header).zIndex,
          resourceZIndex: getComputedStyle(resources).zIndex,
          tabsZIndex: getComputedStyle(tabs).zIndex,
          activeTop: rect.top,
          activeOwnsPoint: Boolean(top[0]?.closest(innerWidth >= 1280 ? '.app-header' : '.mobile-resource-bar'))
        };
      });
      await page.screenshot({ path: screenshotPath('sheet-scroll', width), type: 'webp' });

      const mobileNav = width < 1280 ? await layerProbe(page, '.mobile-nav') : null;

      await page.locator('#quickDiceToggle').click();
      const quickDice = await layerProbe(page, '#quickDicePanel');
      await page.screenshot({ path: screenshotPath('quick-dice', width), type: 'webp' });
      await page.locator('#quickDiceClose').click();

      await page.evaluate(() => {
        openModal({
          title: 'Validação de camadas',
          content: createModalContent('O modal deve permanecer acima de toda a interface comum.'),
          actions: [{ label: 'Fechar', className: 'secondary' }]
        });
        showNotification('Notificação de validação', 'warning', 60000);
      });
      const modal = await layerProbe(page, '#appModal');
      const notification = await layerProbe(page, '#globalNotification');
      await page.screenshot({ path: screenshotPath('modal-notification', width), type: 'webp' });
      await page.evaluate(() => { closeModal(); document.getElementById('globalNotification').hidden = true; });

      await page.evaluate(() => {
        showCharacterManagerView();
        const dialog = document.querySelector('dialog:not([open])');
        if (!dialog) throw new Error('Diálogo nativo não encontrado');
        dialog.showModal();
      });
      const nativeDialog = await layerProbe(page, 'dialog[open]');
      await page.screenshot({ path: screenshotPath('native-dialog', width), type: 'webp' });
      await page.evaluate(() => document.querySelector('dialog[open]')?.close());

      let drawer = null;
      if (width <= 1100) {
        await page.evaluate(() => showCharacterManagerView());
        await page.locator('[data-manager-section="chronicles"]').click();
        await page.locator('.chronicle-record-open').first().click();
        await page.locator('#chronicleDetailView').waitFor({ state: 'visible' });
        await page.locator('#openChronicleActions').click();
        drawer = {
          panel: await layerProbe(page, '#chronicleActionsPanel.is-open'),
          backdrop: await layerProbe(page, '#chronicleActionsBackdrop:not([hidden])')
        };
        await page.screenshot({ path: screenshotPath('actions-drawer', width), type: 'webp' });
        await page.locator('#closeChronicleActions').click();
      }

      results.push({ width, height, manager, characterMenu, sheetTop, mobileNav, quickDice, modal, notification, nativeDialog, drawer });

      if (phase === 'after') {
        assert.equal(manager.noHorizontalOverflow, true, `Overflow horizontal em ${width}px`);
        if (width > 900 && manager.scrollY > 0) assert.ok(manager.navigationTop >= 0 && manager.navigationTop <= 24, `Sidebar sticky falhou em ${width}px: ${manager.navigationTop}`);
        assert.equal(characterMenu.topMatches, true, `Menu de personagem encoberto em ${width}px`);
        assert.equal(sheetTop.headerPosition, width >= 1280 ? 'sticky' : 'static', `Cabeçalho incorreto em ${width}px`);
        assert.equal(sheetTop.activeOwnsPoint, true, `Camada sticky encoberta em ${width}px`);
        if (mobileNav) assert.equal(mobileNav.topMatches, true, `Navegação móvel encoberta em ${width}px`);
        assert.equal(quickDice.topMatches, true, `Quick Dice encoberto em ${width}px`);
        assert.equal(modal.topMatches, true, `Modal encoberto em ${width}px`);
        assert.equal(notification.topMatches, true, `Notificação encoberta em ${width}px`);
        assert.equal(nativeDialog.topMatches, true, `Diálogo da top layer encoberto em ${width}px`);
        if (drawer) {
          assert.equal(drawer.panel.topMatches, true, `Gaveta encoberta em ${width}px`);
          assert.equal(drawer.backdrop.topMatches, true, `Backdrop da gaveta encoberto em ${width}px`);
        }
      }
    }

    const zoomChecks = [];
    for (const zoom of [1, 1.1, 1.25]) {
      for (const baseWidth of [1920, 1366, 1024]) {
        const effectiveWidth = Math.floor(baseWidth / zoom);
        await page.setViewportSize({ width: effectiveWidth, height: 768 });
        await page.evaluate(() => { showCharacterManagerView(); window.scrollTo(0, 0); });
        const values = await page.evaluate(() => ({
          width: innerWidth,
          pageFits: document.documentElement.scrollWidth <= innerWidth,
          navFits: [...document.querySelectorAll('.manager-nav-item')].every(item => item.scrollWidth <= item.clientWidth + 1)
        }));
        if (phase === 'after') {
          assert.equal(values.pageFits, true, `Página não cabe em zoom ${zoom} / ${baseWidth}px`);
          assert.equal(values.navFits, true, `Navegação não cabe em zoom ${zoom} / ${baseWidth}px`);
        }
        zoomChecks.push({ zoom, baseWidth, effectiveWidth, ...values });
      }
    }

    assert.deepEqual(errors, [], 'Erros de execução no navegador');
    await fs.writeFile(path.join(artifactDir, `${phase}-report.json`), JSON.stringify({ phase, layerScale, results, zoomChecks, errors }, null, 2));
    console.log(`OK camadas: ${viewports.length} larguras, ${zoomChecks.length} combinações de zoom (${phase})`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
