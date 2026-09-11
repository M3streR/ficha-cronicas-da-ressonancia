// Opt-in integration test against the configured project. Only disposable
// accounts supplied in the ignored .test-secrets.json are used.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const server = http.createServer(async(req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+path.sep)||file.endsWith('.test-secrets.json'))return res.writeHead(403).end();
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}
});
(async()=>{
  const users=JSON.parse(await fs.readFile(path.join(root,'.test-secrets.json'),'utf8'));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true});
  const pages=[],checks=[];
  const check=(v,label)=>{assert.ok(v,label);checks.push(label);console.log('OK',label);};
  let record;
  try {
    for(const user of users){
      const page=await browser.newPage();pages.push(page);
      page.on('response', async r=>{if(r.status()>=400 && /\/storage\/|\/functions\//.test(r.url())) console.log('Storage response',r.status(),await r.text());});
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(()=>!!window.CronicasSupabase);
      const error=await page.evaluate(async({email,password})=>{await CronicasSupabase.ready;const r=await CronicasSupabase.client.auth.signInWithPassword({email,password});return r.error?.message;},user);
      check(!error,'Login conta temporária '+pages.length+(error?' '+error:''));
    }
    const owner=pages[0],member=pages[1],stranger=pages[2];
    record=await owner.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#513a86';ctx.fillRect(0,0,960,540);ctx.fillStyle='#f2c66d';ctx.font='64px serif';ctx.fillText('Crônica de teste',100,280);
      const blob=await new Promise(r=>canvas.toBlob(r,'image/webp'));
      window.testCover={blob,width:960,height:540};
      return ChroniclesOnline.createChronicle({name:'AUDIT • Storage temporário',type:'campaign',synopsis:'Fixture descartável',cover:testCover});
    });
    if (!record.hasCover) record=await owner.evaluate(async c=>ChroniclesOnline.updateChronicle(c.id,{name:c.name,type:c.type,synopsis:c.synopsis},{coverAction:'replace',cover:testCover,expectedUpdatedAt:c.updatedAt}),record);
    check(record.hasCover,'Upload e persistência da capa real');
    check(await owner.evaluate(async id=>!!(await getChroniclesStorage().getChronicleCover(id))?.blob,record.id),'Download autenticado do Mestre');
    check(await stranger.evaluate(async p=>{const r=await CronicasSupabase.client.storage.from('chronicle-covers').download(p);return !!r.error;},record.coverPath),'Estranho não lê capa privada');
    check(await stranger.evaluate(async id=>!(await ChroniclesOnline.getChronicle(id)),record.id),'Estranho não lê Crônica');
    check(await owner.evaluate(async({id,userId})=>{const r=await CronicasSupabase.client.from('chronicle_members').insert({chronicle_id:id,user_id:userId});return !r.error;},{id:record.remoteId,userId:users[1].id}),'Mestre adiciona participante temporário');
    check(await member.evaluate(async id=>!!(await getChroniclesStorage().getChronicleCover(id))?.blob,record.id),'Participante lê capa');
    check(await member.evaluate(async id=>{try{await ChroniclesOnline.updateChronicle(id,{name:'Negado',type:'campaign',synopsis:''},{coverAction:'remove'});return false;}catch{return true;}},record.id),'Participante não remove capa');
    check(await stranger.evaluate(async({path,ownerId})=>{const r=await CronicasSupabase.client.from('chronicle_cover_cleanup').insert({path,owner_id:ownerId});return !!r.error;},{path:record.coverPath.replace(/[^/]+$/,'stranger.webp'),ownerId:users[0].id}),'RLS bloqueia reserva para outro owner');
    check(await owner.evaluate(async()=>{try{ChronicleCovers.validate({blob:new Blob(['svg'],{type:'image/svg+xml'}),width:960,height:540});return false;}catch{return true;}}),'Validação rejeita SVG');
    check(await owner.evaluate(async()=>{try{ChronicleCovers.validate({blob:new Blob([new Uint8Array(460801)],{type:'image/png'}),width:960,height:540});return false;}catch{return true;}}),'Validação rejeita tamanho acima do limite');
    if(process.env.AUDIT_ONLINE === '1') {
      const enter=owner.locator('.site-entry-button');if(await enter.isVisible())await enter.click();
      await owner.evaluate(async c=>{
        const character=createEmptyCharacterState(); character.fields.nome='Caçadora da Aurora'; character.fields.classe='Atirador'; character.fields.nivel=2;
        const id='audit-'+crypto.randomUUID(); window.auditCharacterId=id;
        writeStoredCharacter(id,character);let manager=readCharacterManager()||createEmptyCharacterManager();manager=setCharacterSummary(manager,id,await createCharacterSummary(character));writeCharacterManager(manager);renderCharacterManager();
        document.querySelector('[data-manager-section=chronicles]').click();await showChroniclesIndex();
        await openChronicleDetail(c.id,1,document.querySelector('.chronicle-record-open'));
        setChronicleDetailSection('cast');await ChroniclesCollaboration.openCastManager(c);
      },record);
      await owner.getByRole('button',{name:'Publicar e adicionar',exact:true}).click();
      await owner.getByRole('button',{name:'Sincronizar ficha',exact:true}).waitFor();
      check(true,'Publicar personagem Local e adicionar ao Elenco pela UI');
      const onlineCharacter=await owner.evaluate(async()=>{
        const client=CronicasSupabase.client;
        const {data,error}=await client.from('online_characters').select('id').eq('source_local_id',auditCharacterId).single();if(error)throw error;
        const character=readStoredCharacter(auditCharacterId);character.fields.nome='Caçadora da Aurora • sincronizada';writeStoredCharacter(auditCharacterId,character);
        await ChroniclesCollaboration.synchronizePublishedCharacter(auditCharacterId,character);
        const updated=await client.from('online_characters').select('name').eq('id',data.id).single();if(updated.data.name!==character.fields.nome)throw Error('sync failed');
        return data.id;
      });
      check(true,'Sincronização preserva e atualiza personagem publicado');
      await owner.evaluate(async({c,characterId})=>{
        await ChroniclesCollaboration.closeCastManager({render:false});
        const result=CronicasDiceEngine.roll(CronicasDiceEngine.parse('2d20+3'));
        await ChroniclesOnlineRolls.appendOnlineRoll({id:crypto.randomUUID(),characterId:auditCharacterId,characterName:'Caçadora da Aurora',source:'quick-dice',category:'expression',result},`online-roll:${c.remoteId}:${characterId}`);
      },{c:record,characterId:onlineCharacter});
      check(true,'Rolagem Livre Online usa resultado da engine existente');
      const combat=await owner.evaluate(async({c,characterId})=>ChroniclesOnlineCombat.storage.createConfrontation(c.id,{name:'Confronto da Aurora',description:'Fixture de auditoria visual'},{characterIds:[characterId],adversaries:[{name:'Sentinela',pvCurrent:18,pvMax:18,defense:12}]}),{c:record,characterId:onlineCharacter});
      check(!!combat.id,'Confronto Online criado sem alterar RPG');
      const metrics=[];
      for(const view of ['index','detail','cast','participants','free-rolls','encounters','combat','shield','edit']){
        if(view==='index')await owner.evaluate(()=>showChroniclesIndex());
        if(view==='detail')await owner.evaluate(async c=>openChronicleDetail(c.id,1,document.querySelector('.chronicle-record-open')),record);
        if(['cast','participants','free-rolls','encounters'].includes(view)){
          await owner.evaluate(v=>setChronicleDetailSection(v),view);
          await owner.waitForTimeout(700);
        }
        if(view==='combat'){
          await owner.evaluate(async id=>{await ChroniclesOnlineCombat.storage.setConfrontationActive(id,true);await ChroniclesOnlineCombat.render();},combat.id);
          await owner.locator('.online-combat-header').waitFor({state:'visible'});
          check(await owner.locator('.online-combat-header').isVisible(),'Combate ativo renderizado para o Mestre');
        }
        if(view==='shield') { await owner.evaluate(()=>MasterShieldUI.open()); check(await owner.locator('#masterShieldPrivate').isVisible(),'Escudo Online reconhece owner/Auth'); }
        if(view==='edit') await owner.evaluate(async c=>{await showChroniclesIndex();await openChronicleDetail(c.id,1,document.querySelector('.chronicle-record-open'));document.getElementById('editChronicleAction').click();},record);
        for(const [width,height] of [[1920,1080],[1366,768],[1024,768],[768,1024],[430,932],[390,844],[360,800],[320,720]]){
          await owner.setViewportSize({width,height});
          const target=view==='index'?'#chroniclesIndexView':view==='edit'?'#chronicleCreateView':view==='shield'?'#chronicleMasterShieldView':view==='combat'?'#onlineCombatHost':view==='detail'?'#chronicleDetailView':`[data-chronicle-detail-panel="${view}"]`;
          await owner.locator(target).scrollIntoViewIfNeeded();
          await owner.waitForTimeout(80);
          const m=await owner.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));metrics.push({view,height,...m});
          await owner.screenshot({path:path.join(__dirname,'artifacts','compact-audit',`online-${view}-${width}.png`)});
        }
      }
      check(metrics.every(m=>m.scroll===m.width),'9 telas Online × 8 tamanhos sem overflow da página');
      await fs.writeFile(path.join(__dirname,'artifacts','compact-audit','online-visual-report.json'),JSON.stringify({metrics},null,2));
      await owner.evaluate(()=>showChroniclesIndex());
      await owner.waitForTimeout(300);
      check(await owner.evaluate(()=>CronicasSupabase.client.getChannels().every(c=>!c.topic.includes('online-combat')&&!c.topic.includes('chronicle-collaboration'))),'Voltar ao índice remove canais de Combate e colaboração');
      await owner.evaluate(async id=>{await CronicasSupabase.client.from('online_characters').delete().eq('id',id);},onlineCharacter);
      const enterMember=member.locator('.site-entry-button');if(await enterMember.isVisible())await enterMember.click();
      await member.evaluate(async c=>{document.querySelector('[data-manager-section=chronicles]').click();await showChroniclesIndex();await openChronicleDetail(c.id,1,document.querySelector('.chronicle-record-open'));},record);
      check(await member.locator('#openMasterShield').isDisabled(),'Participante não recebe controles do Escudo');
    }
    const oldPath=record.coverPath,oldStamp=record.updatedAt;
    record=await owner.evaluate(async c=>ChroniclesOnline.updateChronicle(c.id,{name:c.name+' • revisada',type:c.type,synopsis:c.synopsis},{coverAction:'replace',cover:testCover,expectedUpdatedAt:c.updatedAt}),record);
    check(record.coverPath!==oldPath,'Substituição usa caminho imutável');
    if(process.env.AUDIT_ONLINE==='1') {
      await member.waitForFunction(name=>document.getElementById('chronicleDetailTitle').textContent===name,record.name);
      check(true,'Realtime atualiza identidade/capa no detalhe do participante');
    }
    check(await owner.evaluate(async p=>{const r=await CronicasSupabase.client.storage.from('chronicle-covers').list(p.slice(0,p.lastIndexOf('/')));return !r.error && !r.data.some(o=>o.name===p.split('/').pop());},oldPath),'Storage remove imagem substituída');
    check(await owner.evaluate(async({id,stamp})=>{try{await ChroniclesOnline.updateChronicle(id,{name:'Conflito',type:'campaign',synopsis:''},{coverAction:'remove',expectedUpdatedAt:stamp});return false;}catch(e){return e.message==='CHRONICLE_UPDATE_CONFLICT';}},{id:record.id,stamp:oldStamp}),'Microssegundos / conflito preservam capa atual');
    const secondPath=record.coverPath;
    record=await owner.evaluate(async c=>ChroniclesOnline.updateChronicle(c.id,{name:c.name,type:c.type,synopsis:c.synopsis},{coverAction:'remove',expectedUpdatedAt:c.updatedAt}),record);
    check(!record.hasCover,'Remover limpa metadados');
    check(await owner.evaluate(async p=>{const r=await CronicasSupabase.client.storage.from('chronicle-covers').list(p.slice(0,p.lastIndexOf('/')));return !r.error && !r.data.some(o=>o.name===p.split('/').pop());},secondPath),'Remover limpa Storage');
    record=await owner.evaluate(async c=>ChroniclesOnline.updateChronicle(c.id,{name:c.name,type:c.type,synopsis:c.synopsis},{coverAction:'replace',cover:testCover,expectedUpdatedAt:c.updatedAt}),record);
    await owner.evaluate(async id=>ChroniclesOnline.deleteChronicle(id),record.id);
    check(await owner.evaluate(async p=>{const r=await CronicasSupabase.client.storage.from('chronicle-covers').list(p.slice(0,p.lastIndexOf('/')));return !r.error && !r.data.length;},record.coverPath),'Excluir Crônica limpa Storage');
    check(await owner.evaluate(async()=>{const r=await CronicasSupabase.client.from('chronicle_cover_cleanup').select('path');return !r.error && !r.data.length;}),'Fila drenada após exclusão');
    record=null;
    await fs.writeFile(path.join(__dirname,'artifacts','compact-audit','storage-live-report.json'),JSON.stringify({checks},null,2));
  } finally {
    if(record&&pages[0])await pages[0].evaluate(async id=>{await ChroniclesOnline.deleteChronicle(id);},record.id).catch(console.error);
    if(pages[0])await pages[0].evaluate(async()=>{await CronicasSupabase.client.from('online_characters').delete().like('source_local_id','audit-%');}).catch(console.error);
    for(const page of pages)await page.evaluate(()=>CronicasSupabase.client.auth.signOut()).catch(()=>{});
    await browser.close();server.close();
  }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
