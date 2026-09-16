const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const phase = process.env.AUDIT_PHASE || 'after';
const auditUrl = process.env.AUDIT_URL || '';
const artifactDir = path.join(os.tmpdir(), 'cronicas-dynamic-layout-audit', phase);
const viewports = [[1920,1080],[1366,768],[1280,800],[1279,800],[1024,768],[768,1024],[430,932],[390,844],[360,800],[320,720]];
const zooms = [1, 1.1, 1.25];
const longName = 'A Guardiã das Crônicas da Ressonância e das Histórias Esquecidas nas Fronteiras do Nexo · '.repeat(3);
const longError = 'Não foi possível concluir esta operação. Confira a conexão e tente novamente sem perder os dados preenchidos. '.repeat(6);

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html');
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end();
  try {
    response.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)] || 'application/octet-stream');
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});

function inspect(page) {
  return page.evaluate(() => {
    const selectors = ['.character-gallery','.character-card','.character-card-info','.chronicles-record-grid','.chronicle-record-real','.chronicle-record-copy','.chronicle-participant-row','.online-cast-member','.chronicle-invite-card','.chronicle-invite-card-top','.chronicle-invite-card-actions','.chronicle-sharing-dialog','.chronicle-sharing-shell','.chronicle-invite-list','.app-modal','.modal-actions'];
    const components = selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).map(element => ({ selector, width: element.clientWidth, scrollWidth: element.scrollWidth, clipped: element.scrollWidth > element.clientWidth + 1 })));
    const activeDialog = document.querySelector('.chronicle-sharing-dialog[open]');
    const scrollAreas = activeDialog ? [activeDialog, activeDialog.querySelector('.chronicle-sharing-shell'), activeDialog.querySelector('.chronicle-invite-list')].filter(Boolean).filter(element => {
      const style = getComputedStyle(element);
      return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 2;
    }).map(element => element.className) : [];
    const scrollHost = activeDialog?.querySelector('.chronicle-sharing-shell') || document.querySelector('.modal-overlay:not([hidden]) .app-modal');
    const lastAction = scrollHost?.querySelector('.chronicle-sharing-actions .btn:last-child, .modal-actions .btn:last-child');
    let footerReachable = true;
    if (scrollHost && lastAction) {
      scrollHost.scrollTop = scrollHost.scrollHeight;
      const host = scrollHost.getBoundingClientRect(), action = lastAction.getBoundingClientRect();
      footerReachable = action.top >= Math.max(0, host.top) - 1 && action.bottom <= Math.min(innerHeight, host.bottom) + 1;
    }
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, components, scrollAreas, footerReachable,
      visibleParticipantRows: components.filter(component => component.selector === '.chronicle-participant-row').length,
      visibleCastRows: components.filter(component => component.selector === '.online-cast-member').length };
  });
}

(async () => {
  await fs.mkdir(artifactDir, {recursive:true});
  if (!auditUrl) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({reducedMotion:'reduce'});
  const errors = [], results = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(auditUrl || `http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => Boolean(window.ChroniclesStorage));
    if (await page.locator('.site-entry-button').isVisible()) await page.locator('.site-entry-button').click();
    for (const [width,height] of viewports) {
      for (const zoom of zooms) {
        await page.setViewportSize({width:Math.floor(width/zoom),height:Math.floor(height/zoom)});
        for (const state of ['characters','chronicles','empty','loading','participants','cast','modal-short','modal-long','sharing-short','sharing-long']) {
          await page.evaluate(({state,longName,longError}) => {
            document.querySelector('.chronicle-sharing-dialog[open]')?.close();
            if (!document.getElementById('modalOverlay').hidden) document.getElementById('modalClose').click();
            showCharacterManagerView();
            const manager = document.getElementById('characterManagerView');
            const characters = document.getElementById('managerCharactersPanel');
            const chronicles = document.getElementById('managerChroniclesPanel');
            const isCharacters = state === 'characters';
            manager.dataset.activeEnvironment = isCharacters ? 'characters' : 'chronicles';
            characters.hidden = !isCharacters;
            chronicles.hidden = isCharacters;
            document.querySelectorAll('[data-manager-section]').forEach(button => {
              const selected = button.dataset.managerSection === (isCharacters ? 'characters' : 'chronicles');
              button.classList.toggle('active', selected);
              if (selected) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
            });
            document.getElementById('chroniclesIndexView').hidden = state === 'participants' || state === 'cast';
            document.getElementById('chronicleDetailView').hidden = state !== 'participants' && state !== 'cast';
            document.getElementById('chronicleCreateView').hidden = true;
            document.getElementById('chroniclePanelOverview').hidden = true;
            document.getElementById('chroniclePanelCast').hidden = state !== 'cast';
            document.getElementById('chroniclePanelParticipants').hidden = state !== 'participants';
            const gallery = document.getElementById('characterCardList');
            if (isCharacters) {
              gallery.querySelectorAll('.character-card-shell').forEach(element => element.remove());
              for (let index=0;index<8;index++) gallery.appendChild(createCharacterCard(`visual-${index}`, {name:index ? `Personagem ${index}` : longName,level:11}));
            }
            const grid = document.getElementById('chroniclesRecordGrid');
            if (state === 'chronicles') {
              grid.replaceChildren();
              for (let index=0;index<14;index++) {
                const record = {id:`visual-${index}`,name:index ? `Crônica ${index} · ${longName.slice(0,75)}` : longName.slice(0,120),type:'campaign',synopsis:longName.slice(0,340)};
                grid.appendChild(createChronicleRecordElement(record,index).card);
              }
            }
            const empty = document.getElementById('chroniclesEmptyState');
            const loading = document.getElementById('chroniclesLoadingState');
            grid.hidden = state !== 'chronicles';
            empty.hidden = state !== 'empty';
            loading.hidden = state !== 'loading';
            if (state === 'empty') { empty.querySelector('strong').textContent = longError; empty.querySelector('span').textContent = longError; }
            if (state === 'loading') loading.querySelector('span:last-child').textContent = longError;
            if (state === 'participants') {
              const list = document.getElementById('chronicleParticipantsList');
              list.replaceChildren();
              for (let index=0; index<22; index++) {
                const row = document.createElement('div');
                row.className = 'chronicle-participant-row online-participant-row';
                row.innerHTML = `<span class="chronicle-participant-number">${index+1}</span><div class="chronicle-participant-identity"><h4></h4><span>Participante Online · Jogador</span></div><div class="chronicle-participant-row-actions"><button class="btn secondary">Remover participante</button></div>`;
                row.querySelector('h4').textContent = index === 0 ? longName : `Participante ${index}`;
                list.appendChild(row);
              }
              const feedback=document.getElementById('chronicleParticipantsFeedback');
              feedback.textContent=longError; feedback.dataset.kind='error';
            }
            if (state === 'cast') {
              const cast = document.getElementById('chronicleCastList');
              cast.replaceChildren();
              for (let index=0;index<18;index++) {
                const member = document.createElement('div');
                member.className = 'chronicle-cast-member online-cast-member';
                member.innerHTML = '<span>01</span><span class="chronicle-cast-member-portrait">◇</span><div class="chronicle-cast-member-identity"><h4></h4><p>Personagem Online</p></div><div class="online-cast-member-actions"><button class="btn secondary">Remover do Elenco</button></div>';
                member.querySelector('h4').textContent = index ? `Personagem ${index}` : longName;
                cast.appendChild(member);
              }
            }
            if (state.startsWith('modal-')) {
              const content = document.createElement('div');
              const paragraphs = state.endsWith('long') ? 18 : 1;
              for (let i=0;i<paragraphs;i++) { const p=document.createElement('p'); p.textContent=longError; content.appendChild(p); }
              openModal({title:longName,content,actions:[{label:'Cancelar',className:'secondary'},{label:'Confirmar ação',className:'primary'}]});
            }
            if (state.startsWith('sharing-')) {
              const dialog = document.createElement('dialog'); dialog.className='chronicle-sharing-dialog';
              const shell = document.createElement('div'); shell.className='chronicle-sharing-shell';
              shell.innerHTML='<header class="chronicle-sharing-header"><div><h2></h2></div><button class="chronicle-sharing-close">×</button></header><p class="chronicle-sharing-feedback" data-kind="error"></p><div class="chronicle-invite-list"></div><div class="chronicle-sharing-actions"><button class="btn secondary">Fechar</button><button class="btn">Copiar link</button></div>';
              shell.querySelector('h2').textContent=longName; shell.querySelector('.chronicle-sharing-feedback').textContent=longError;
              const list=shell.querySelector('.chronicle-invite-list');
              for (let i=0;i<(state.endsWith('long')?24:1);i++) {
                const card=document.createElement('div'); card.className='chronicle-invite-card';
                card.innerHTML='<div class="chronicle-invite-card-top"><div><strong></strong><span class="chronicle-invite-status">Ativo</span><small class="chronicle-invite-usage">4 / 10 usos</small></div></div><input readonly><div class="chronicle-invite-card-actions"><button class="btn secondary">Copiar link</button><button class="btn secondary">Revogar</button></div>';
                card.querySelector('strong').textContent=longName; card.querySelector('input').value='https://example.com/?invite=abcdefghijklmnopqrstuvwx'; list.appendChild(card);
              }
              dialog.appendChild(shell); document.body.appendChild(dialog); dialog.showModal();
              window.dynamicAuditDialog=dialog;
            }
          }, {state,longName,longError});
          await page.waitForTimeout(20);
          const metrics = await inspect(page);
          results.push({width,height,zoom,state,...metrics});
          if (zoom === 1 && [1279,390,320].includes(width) && ['characters','chronicles','participants','cast','modal-long','sharing-long'].includes(state)) {
            if (state === 'participants' || state === 'cast') {
              await page.locator(state === 'participants' ? '#chroniclePanelParticipants' : '#chroniclePanelCast').scrollIntoViewIfNeeded();
            }
            await page.screenshot({path:path.join(artifactDir,`${state}-${width}.png`)});
          }
          await page.evaluate(() => window.dynamicAuditDialog?.remove());
        }
      }
    }
    await fs.writeFile(path.join(artifactDir,'report.json'),JSON.stringify({results,errors},null,2));
    const pageOverflow=results.filter(result => result.documentWidth > result.viewport + 1);
    const componentOverflow=results.filter(result => result.components.some(component => component.clipped));
    const nestedScroll=results.filter(result => result.state === 'sharing-long' && result.scrollAreas.length > 1);
    const inaccessibleFooter=results.filter(result => ['modal-long','sharing-long'].includes(result.state) && !result.footerReachable);
    const missingFixtures=results.filter(result => (result.state === 'participants' && result.visibleParticipantRows !== 22) || (result.state === 'cast' && result.visibleCastRows !== 18));
    console.log(JSON.stringify({phase,states:results.length,pageOverflow:pageOverflow.length,componentOverflow:componentOverflow.length,nestedScroll:nestedScroll.length,inaccessibleFooter:inaccessibleFooter.length,missingFixtures:missingFixtures.length,errors}));
    if (phase !== 'before') {
      assert.equal(errors.length,0,'Console sem exceções');
      assert.equal(pageOverflow.length,0,'Página sem overflow horizontal');
      assert.equal(componentOverflow.length,0,'Componentes sem overflow horizontal');
      assert.equal(nestedScroll.length,0,'Compartilhamento com uma área de rolagem');
      assert.equal(inaccessibleFooter.length,0,'Ações do modal alcançáveis');
      assert.equal(missingFixtures.length,0,'Listas extremas visíveis durante a auditoria');
    }
  } finally { await browser.close(); if (!auditUrl) server.close(); }
})().catch(error => { console.error(error); if (!auditUrl) server.close(); process.exitCode=1; });
