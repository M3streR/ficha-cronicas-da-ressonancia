const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (_) { res.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { headless: true, executablePath: process.env.CHROME_PATH } : { headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/ERR_|404|Failed to fetch/.test(message.text())) errors.push(message.text()); });
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => Boolean(window.ChronicleFreeRolls));
    const outcome = await page.evaluate(async () => {
      const calls = [];
      const channels = [];
      window.CronicasSupabase = {
        client: {
          channel(name) {
            const channel = { topic: name, on(_event, config, callback) { calls.push(config); this.callback = callback; return this; }, subscribe() { channels.push(name); return this; } };
            return channel;
          },
          removeChannel(channel) { const index = channels.indexOf(channel.topic); if (index >= 0) channels.splice(index, 1); }
        }
      };
      let options = null;
      let rollVersion = 1;
      window.ChroniclesOnlineRolls = {
        async listChronicleRolls(_id, value) {
          options = value;
          return { next: null, records: [{
            id: `roll-${rollVersion}`, characterName: rollVersion === 1 ? 'Dylann Gomes' : 'Luke Leywin', authorName: 'Felipe', category: 'expression',
            createdAt: new Date().toISOString(), confrontationId: null,
            result: { expression: '2d20+3', rolls: [14, 8], diceTotal: 14, modifier: 3, total: rollVersion === 1 ? 17 : 21 }
          }] };
        }
      };
      const chronicle = { id: 'online:22222222-2222-4222-8222-222222222222', remoteId: '22222222-2222-4222-8222-222222222222', storage: 'online' };
      document.getElementById('managerCharactersPanel').hidden = true;
      document.getElementById('managerChroniclesPanel').hidden = false;
      document.getElementById('chroniclesIndexView').hidden = true;
      document.getElementById('chronicleDetailView').hidden = false;
      const panel = document.getElementById('chroniclePanelFreeRolls');
      panel.hidden = false;
      document.getElementById('chronicleTabFreeRolls').setAttribute('aria-selected', 'true');
      window.ChronicleFreeRolls.applyDetailMode(chronicle);
      const before = document.activeElement;
      await window.ChronicleFreeRolls.render(chronicle);
      const renderFocusPreserved = before === document.activeElement;
      const initialCardText = document.querySelector('.chronicle-free-roll-card')?.textContent;
      document.getElementById('chronicleTabFreeRolls').focus();
      const focusBeforeRealtime = document.activeElement;
      rollVersion = 2;
      window.dispatchEvent(new CustomEvent('cronicas:online-rolls-change', { detail: {
        chronicleId: chronicle.remoteId,
        payload: { eventType: 'INSERT', new: { confrontation_id: null } }
      } }));
      await new Promise(resolve => setTimeout(resolve, 180));
      return {
        freeOnly: options?.freeOnly,
        cardText: initialCardText,
        hasRollControl: Boolean(panel.querySelector('button[type="submit"], input[placeholder*="d20"]')),
        focusPreserved: renderFocusPreserved,
        realtimeText: document.querySelector('.chronicle-free-roll-card')?.textContent,
        realtimeFocusPreserved: focusBeforeRealtime === document.activeElement,
        channels: [...channels],
        overflow: document.documentElement.scrollWidth <= innerWidth,
        touchHeight: Number.parseFloat(getComputedStyle(document.getElementById('refreshChronicleFreeRolls')).minHeight)
      };
    });
    assert.equal(outcome.freeOnly, true);
    assert.match(outcome.cardText, /Dylann Gomes/);
    assert.match(outcome.cardText, /17/);
    assert.equal(outcome.hasRollControl, false);
    assert.equal(outcome.focusPreserved, true);
    assert.match(outcome.realtimeText, /Luke Leywin/);
    assert.equal(outcome.realtimeFocusPreserved, true);
    assert.equal(outcome.channels.length, 0);
    assert.equal(outcome.overflow, true);
    assert.ok(outcome.touchHeight >= 44, `alvo de toque mediu ${outcome.touchHeight}px`);
    for (const width of [1920, 1366, 1024, 768, 430, 390, 360, 320]) {
      await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
      const responsive = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth <= innerWidth,
        cards: getComputedStyle(document.getElementById('chronicleFreeRollsList')).gridTemplateColumns,
        tabHeight: document.getElementById('chronicleTabFreeRolls').getBoundingClientRect().height
      }));
      assert.equal(responsive.overflow, true, `sem overflow horizontal em ${width}px`);
      assert.ok(responsive.tabHeight >= 44, `guia acessível por toque em ${width}px`);
      if (width <= 760) assert.equal(responsive.cards.trim().split(' ').length, 1, `uma coluna de resultados em ${width}px`);
    }
    assert.deepEqual(errors, []);
    console.log('OK Ala 05 exibe somente resultados livres, preserva foco e funciona em 390 px');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
