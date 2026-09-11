const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dir = path.join(__dirname, 'artifacts', 'compact-audit');
const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try { res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)] || 'application/octet-stream'); res.end(await fs.readFile(file)); }
  catch { res.writeHead(404).end(); }
});
(async () => {
  await fs.mkdir(dir, {recursive:true});
  await new Promise(r => server.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({reducedMotion:'reduce'});
  const errors = [], results = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => !!window.ChroniclesStorage);
    const enter = page.locator('.site-entry-button');
    if (await enter.isVisible()) await enter.click();
    await page.evaluate(async () => {
      const c = await ChroniclesStorage.createChronicle({name:'Ecos da cidade esquecida', type:'campaign', synopsis:'Um arquivo de histórias, encontros e descobertas nas fronteiras da Ressonância.'});
      window.auditChronicle = c.id;
      await ChroniclesStorage.createChronicleParticipant(c.id,{name:'Participante de teste'});
      await ChroniclesStorage.createConfrontation(c.id,{name:'Confronto preparado',description:'Auditoria Local'});
    });
    for (const [width,height] of [[1920,1080],[1366,768],[1024,768],[768,1024],[430,932],[390,844],[360,800],[320,720]]) {
      await page.setViewportSize({width,height});
      for (const view of ['manager','index','create','detail','cast','participants','encounters','free-rolls','modal','auth','sheet','dice']) {
        await page.evaluate(async view => {
          document.querySelector('dialog[open]')?.close();
          if (!document.getElementById('modalOverlay').hidden) document.getElementById('modalClose').click();
          if (view === 'manager') { showCharacterManagerView(); }
          if (view === 'index') { document.querySelector('[data-manager-section=chronicles]').click(); await showChroniclesIndex(); }
          if (view === 'create') { document.getElementById('openChronicleCreation').click(); }
          if (view === 'detail') { await showChroniclesIndex(); await openChronicleDetail(window.auditChronicle,1, document.querySelector('.chronicle-record-open')); }
          if (['cast','participants','encounters','free-rolls'].includes(view)) setChronicleDetailSection(view);
          if (view === 'modal') openModal({title:'Excluir registro?',content:createModalContent('Confirmação de exemplo para conferir o tamanho do modal.'),actions:[{label:'Cancelar',className:'secondary'}]});
        },view);
        if (view === 'auth') await page.locator('.manager-account-button').click();
        if (view === 'sheet') { await page.evaluate(() => showCharacterManagerView()); await page.locator('#managerCreateCharacter').click(); }
        if (view === 'dice') { const button=page.locator('#quickDiceToggle'); if(await button.count()) await button.click(); else continue; }
        if (['cast','participants','encounters','free-rolls'].includes(view)) {
          await page.locator(`[data-chronicle-detail-panel="${view}"]`).scrollIntoViewIfNeeded();
        }
        await page.waitForTimeout(80);
        const metrics = await page.evaluate(() => ({width:innerWidth, scroll:document.documentElement.scrollWidth, overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width && r.height && s.position!=='fixed' && s.visibility!=='hidden' && r.right>innerWidth+1 && r.left>=0;}).slice(0,8).map(e=>e.id||e.className)}));
        results.push({view,width,height,...metrics});
        await page.screenshot({path:path.join(dir,`${process.env.AUDIT_PHASE || 'after'}-${view}-${width}.png`)});
      }
    }
    await fs.writeFile(path.join(dir,`${process.env.AUDIT_PHASE || 'after'}-report.json`),JSON.stringify({results,errors},null,2));
    console.log(JSON.stringify({screens:results.length,overflows:results.filter(r=>r.scroll>r.width||r.overflow.length),errors}));
    if(errors.length || results.some(r=>r.scroll>r.width)) throw Error('Responsive audit failed');
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
