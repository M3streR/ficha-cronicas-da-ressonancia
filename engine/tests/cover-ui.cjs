const { chromium } = require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+path.sep)||file.endsWith('.test-secrets.json'))return res.writeHead(403).end();
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}
});
(async()=>{
  const [user]=JSON.parse(await fs.readFile(path.join(root,'.test-secrets.json'),'utf8'));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  let id;const checks=[];const check=(v,s)=>{assert.ok(v,s);checks.push(s);console.log('OK',s);};
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>!!window.CronicasSupabase);
    await page.evaluate(async u=>{await CronicasSupabase.ready;const r=await CronicasSupabase.client.auth.signInWithPassword(u);if(r.error)throw r.error;}, {email:user.email,password:user.password});
    const enter=page.locator('.site-entry-button');if(await enter.isVisible())await enter.click();await page.locator('[data-manager-section=chronicles]').click();await page.locator('#openChronicleCreation').click();
    await page.locator('#chronicleName').fill('AUDIT • Formulário de capa');await page.locator('input[name=chronicleType][value=campaign]').check();await page.locator('#chronicleStorageOnline').check();
    const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');x.fillStyle='#322154';x.fillRect(0,0,640,360);x.fillStyle='#e4c478';x.fillRect(40,40,560,280);return c.toDataURL('image/png').split(',')[1];});
    const file={name:'cover.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')};
    await page.locator('#chronicleCoverInput').setInputFiles(file);await page.waitForFunction(()=>document.getElementById('chronicleCoverStatus').textContent.includes('Capa pronta'));
    check(await page.locator('#chronicleCoverPreviewImage').isVisible(),'Preview do arquivo antes de enviar');
    await page.locator('#createChronicleButton').click();await page.locator('#chroniclesIndexView').waitFor({state:'visible'});
    const row=await page.evaluate(async()=>{const rows=await ChroniclesOnline.listChronicles();return rows.find(c=>c.name==='AUDIT • Formulário de capa');});id=row?.id;check(!!row?.hasCover,'Formulário cria Online com capa persistida');
    await page.evaluate(async id=>{await openChronicleDetail(id,1,document.querySelector('.chronicle-record-open'));document.getElementById('editChronicleAction').click();},id);
    await page.waitForFunction(()=>document.getElementById('chronicleCoverStatus').textContent.includes('Capa atual'));
    await page.locator('#chronicleCoverInput').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
    await page.waitForFunction(()=>document.getElementById('chronicleCoverStatus').textContent.includes('arquivo de imagem válido'));
    check(await page.locator('#chronicleCoverPreviewImage').isVisible(),'Arquivo inválido mantém capa atual no editor');
    await page.locator('#chronicleCoverInput').setInputFiles(file);await page.waitForFunction(()=>document.getElementById('chronicleCoverStatus').textContent.includes('Capa pronta'));
    const matcher='**/storage/v1/object/chronicle-covers/**';await page.route(matcher,r=>r.request().method()==='POST'?r.abort():r.continue());
    await page.locator('#createChronicleButton').click();await page.waitForFunction(()=>document.getElementById('chronicleFormFeedback').textContent.includes('Não foi possível enviar'));
    check(await page.locator('#chronicleName').inputValue()==='AUDIT • Formulário de capa','Falha de upload mantém formulário e informa erro');
    check(await page.evaluate(async({id,path})=>(await ChroniclesOnline.getChronicle(id)).coverPath===path,{id,path:row.coverPath}),'Falha de upload preserva capa persistida');
    await page.unroute(matcher);await page.locator('#createChronicleButton').click();await page.locator('#chronicleDetailView').waitFor({state:'visible'});
    check(await page.evaluate(async({id,path})=>(await ChroniclesOnline.getChronicle(id)).coverPath!==path,{id,path:row.coverPath}),'Tentar novamente substitui capa pelo formulário');
    await page.evaluate(()=>document.getElementById('editChronicleAction').click());await page.waitForFunction(()=>document.getElementById('chronicleCoverStatus').textContent.includes('Capa atual'));
    await page.locator('#removeChronicleCover').click();await page.locator('#createChronicleButton').click();await page.locator('#chronicleDetailView').waitFor({state:'visible'});
    check(await page.evaluate(async id=>!(await ChroniclesOnline.getChronicle(id)).hasCover,id),'Remover pelo formulário persiste ausência da capa');
    await fs.writeFile(path.join(__dirname,'artifacts/compact-audit/cover-ui-report.json'),JSON.stringify({checks},null,2));
  }finally{
    if(id)await page.evaluate(async id=>ChroniclesOnline.deleteChronicle(id),id).catch(console.error);
    await page.evaluate(()=>CronicasSupabase.client.auth.signOut()).catch(()=>{});await browser.close();server.close();
  }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
