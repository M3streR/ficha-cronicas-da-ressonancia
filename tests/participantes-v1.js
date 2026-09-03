'use strict';
const frame = document.getElementById('app');
const results = document.getElementById('results');
const status = document.getElementById('status');
const req = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const done = tx => new Promise((resolve, reject) => {
  tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('aborted'));
});
const wait = async predicate => {
  for (let i = 0; i < 250; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Timeout aguardando interface');
};
function check(value, label) {
  const li = document.createElement('li'); li.className = value ? 'pass' : 'fail';
  li.textContent = `${value ? 'OK' : 'FALHOU'} — ${label}`; results.append(li);
  if (!value) throw new Error(label);
}
async function rejects(promise, message) {
  try { await promise; return false; } catch (error) { return error.message === message; }
}
document.querySelectorAll('[data-width]').forEach(button => button.onclick = () => { frame.style.width = `${button.dataset.width}px`; });
document.getElementById('run').onclick = async () => {
  document.getElementById('run').disabled = true; results.replaceChildren(); status.textContent = 'Executando…';
  const urls = [];
  const connections = [];
  try {
    const source = await fetch('../js/chronicles-storage.js').then(r => r.text());
    const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#131738';ctx.fillRect(0,0,960,540);
    ctx.fillStyle='#d5c4ff';ctx.font='48px sans-serif';ctx.fillText('CRÔNICA · TESTE ISOLADO',90,280);
    const legacyCover=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.8));
    let prefix, storageURL, api, db, legacy;
    const scriptURL = text => { const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' })); urls.push(url); return url; };
    for (const version of [1, 2]) {
      prefix = `participantsV1Test${crypto.randomUUID().replaceAll('-', '')}`;
      const name = `${prefix}Chronicles`;
      legacy = { id:'chronicle-test-legacy', schemaVersion:1, name:'Horizonte de Teste', synopsis:'Teste anterior a Participantes', type:'campaign', hasCover:true, createdAt:'2026-01-01T00:00:00.000Z', updatedAt:'2026-01-01T00:00:00.000Z' };
      const open = indexedDB.open(name, version);
      open.onupgradeneeded = () => {
        const store = open.result.createObjectStore('chronicles',{keyPath:'id'});
        for (const index of ['createdAt','updatedAt','type']) store.createIndex(index,index);
        open.result.createObjectStore('chronicleCovers',{keyPath:'chronicleId'});
        if (version === 2) {
          const links = open.result.createObjectStore('chronicleCastLinks',{keyPath:['chronicleId','characterId']});
          links.createIndex('chronicleId','chronicleId'); links.createIndex('characterId','characterId');
        }
      };
      const oldDb = await req(open);
      const tx = oldDb.transaction([...oldDb.objectStoreNames], 'readwrite');
      tx.objectStore('chronicles').add(legacy);
      tx.objectStore('chronicleCovers').add({chronicleId:legacy.id,blob:legacyCover,width:960,height:540});
      if (version === 2) tx.objectStore('chronicleCastLinks').add({chronicleId:legacy.id,characterId:'character-fixture-1'});
      await done(tx); oldDb.close();
      storageURL = scriptURL(source.replaceAll('cronicasRessonancia',prefix));
      await new Promise((resolve,reject) => { const script=document.createElement('script');script.src=storageURL;script.onload=resolve;script.onerror=reject;document.body.append(script); });
      api=window.ChroniclesStorage;
      check(JSON.stringify(await api.getChronicle(legacy.id))===JSON.stringify(legacy), `Upgrade v${version} → v6 preserva metadados e schemaVersion 1`);
      check(await (await api.getChronicleCover(legacy.id)).blob.text()===await legacyCover.text(), `Upgrade v${version} → v6 preserva capa`);
      check((await api.listChronicleCastIds(legacy.id)).length===(version===2?1:0), `Upgrade v${version} → v6 preserva Elenco`);
      check((await api.listChronicleParticipants(legacy.id)).participants.length===0, `Crônica v${version} começa sem participantes`);
      db=await req(indexedDB.open(name));connections.push(db);
      const participants=db.transaction('chronicleParticipants').objectStore('chronicleParticipants');
      check(db.version===6 && participants.keyPath==='id' && participants.indexNames.length===1 && participants.index('chronicleId').unique===false, 'Banco v6 preserva store de Participantes com chave id e índice chronicleId não exclusivo');
    }
    const a=await api.createChronicleParticipant(legacy.id,{name:'  Felipe  '});
    const b=await api.createChronicleParticipant(legacy.id,{name:'Felipe'});
    check(a.participant.id!==b.participant.id && a.participant.name==='Felipe', 'Nomes iguais permitidos, IDs independentes e trim do nome');
    check(Object.keys(a.participant).sort().join(',')==='chronicleId,createdAt,id,name,updatedAt', 'Participante armazena exatamente cinco campos');
    const list=await api.listChronicleParticipants(legacy.id);
    check(list.participants[0].id===a.participant.id && list.participants[1].id===b.participant.id, 'Ordem de criação crescente');
    check(await rejects(api.createChronicleParticipant(legacy.id,{name:'   '}),'INVALID_PARTICIPANT_NAME') && await rejects(api.createChronicleParticipant(legacy.id,{name:'a'.repeat(121)}),'INVALID_PARTICIPANT_NAME'), 'Nome obrigatório e limite de 120');
    const changed=await api.updateChronicleParticipant(legacy.id,a.participant.id,{name:'Felipe Atualizado'},{expectedUpdatedAt:a.participant.updatedAt});
    check(changed.participant.id===a.participant.id && changed.participant.createdAt===a.participant.createdAt && changed.participant.updatedAt!==a.participant.updatedAt, 'Editar mantém identidade e criação, atualiza somente data de alteração');
    const noop=await api.updateChronicleParticipant(legacy.id,a.participant.id,{name:' Felipe Atualizado '},{expectedUpdatedAt:changed.participant.updatedAt});
    check(noop.chronicle.updatedAt===changed.chronicle.updatedAt && noop.participant.updatedAt===changed.participant.updatedAt, 'Salvar sem mudança efetiva não altera datas');
    check(await rejects(api.updateChronicleParticipant(legacy.id,a.participant.id,{name:'Conflito'},{expectedUpdatedAt:a.participant.updatedAt}),'PARTICIPANT_UPDATE_CONFLICT'), 'Versão antiga do participante não sobrescreve nome');
    const other=await api.createChronicle({name:'Outra Crônica',type:'oneshot',synopsis:''});
    check(await rejects(api.deleteChronicleParticipant(other.id,a.participant.id,{expectedUpdatedAt:changed.participant.updatedAt}),'PARTICIPANT_NOT_FOUND'), 'Não é possível remover participante de outra Crônica');
    const originalPut=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args){if(this.name==='chronicles')throw new Error('TEST_ABORT');return originalPut.apply(this,args);};
    check(await rejects(api.updateChronicleParticipant(legacy.id,a.participant.id,{name:'Não persistir'},{expectedUpdatedAt:changed.participant.updatedAt}),'TEST_ABORT'), 'Falha injetada após alteração do participante aborta transação');
    IDBObjectStore.prototype.put=originalPut;
    check((await api.getChronicleParticipant(legacy.id,a.participant.id)).name==='Felipe Atualizado' && (await api.getChronicle(legacy.id)).updatedAt===changed.chronicle.updatedAt, 'Rollback preserva participante e updatedAt da Crônica');
    await api.deleteChronicleParticipant(legacy.id,b.participant.id,{expectedUpdatedAt:b.participant.updatedAt});
    check(!await api.getChronicleParticipant(legacy.id,b.participant.id) && await api.getChronicleParticipant(legacy.id,a.participant.id), 'Remoção individual preserva os demais participantes');
    await api.createChronicleParticipant(other.id,{name:'Pessoa'});await api.replaceChronicleCast(other.id,['character-fixture-1']);
    await api.deleteChronicle(other.id);
    check(!await api.getChronicle(other.id) && (await req(db.transaction('chronicleParticipants').objectStore('chronicleParticipants').index('chronicleId').getAll(other.id))).length===0 && (await api.listChronicleCastIds(other.id)).length===0, 'Excluir Crônica remove participantes e vínculos juntos');
    check(await rejects(api.createChronicleParticipant(other.id,{name:'Órfão'}),'CHRONICLE_NOT_FOUND'), 'Não cria participante sem Crônica');
    const cover=await api.getChronicleCover(legacy.id);
    const cascade=await api.createChronicle({name:'Atomicidade completa',type:'campaign',synopsis:'',cover});
    const cascadePerson=await api.createChronicleParticipant(cascade.id,{name:'Pessoa protegida'});
    await api.replaceChronicleCast(cascade.id,['character-fixture-1']);
    const originalDelete=IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete=function(...args){if(this.name==='chronicleParticipants')throw new Error('TEST_DELETE_ABORT');return originalDelete.apply(this,args);};
    check(await rejects(api.deleteChronicle(cascade.id),'TEST_DELETE_ABORT'),'Falha ao excluir Participantes aborta exclusão de Crônica');
    IDBObjectStore.prototype.delete=originalDelete;
    check(await api.getChronicle(cascade.id) && await api.getChronicleCover(cascade.id) && (await api.listChronicleCastIds(cascade.id)).length===1 && await api.getChronicleParticipant(cascade.id,cascadePerson.participant.id),'Rollback preserva as quatro stores');
    await api.deleteChronicle(cascade.id);
    check(!await api.getChronicle(cascade.id) && !await api.getChronicleCover(cascade.id) && !(await api.listChronicleCastIds(cascade.id)).length && !(await req(db.transaction('chronicleParticipants').objectStore('chronicleParticipants').index('chronicleId').getAll(cascade.id))).length,'Commit exclui metadados, capa, Elenco e Participantes');
    const races=await api.createChronicle({name:'Concorrência',type:'oneshot',synopsis:''});
    const raceA=(await api.createChronicleParticipant(races.id,{name:'A'})).participant;
    const raceB=(await api.createChronicleParticipant(races.id,{name:'B'})).participant;
    await Promise.all([
      api.updateChronicleParticipant(races.id,raceA.id,{name:'A2'},{expectedUpdatedAt:raceA.updatedAt}),
      api.updateChronicleParticipant(races.id,raceB.id,{name:'B2'},{expectedUpdatedAt:raceB.updatedAt})
    ]);
    check((await api.listChronicleParticipants(races.id)).participants.map(p=>p.name).join(',')==='A2,B2','Edições de pessoas distintas não geram conflito artificial na Crônica');
    const raceCurrent=await api.getChronicleParticipant(races.id,raceA.id);
    const competing=await Promise.allSettled(['Primeiro','Segundo'].map(name=>api.updateChronicleParticipant(races.id,raceA.id,{name},{expectedUpdatedAt:raceCurrent.updatedAt})));
    check(competing.filter(r=>r.status==='fulfilled').length===1 && competing.some(r=>r.status==='rejected' && r.reason.message==='PARTICIPANT_UPDATE_CONFLICT'),'Duas edições simultâneas do mesmo ID: uma vence, outra reporta conflito');
    await Promise.allSettled([api.deleteChronicle(races.id),api.createChronicleParticipant(races.id,{name:'Não pode ficar órfão'})]);
    check(!(await req(db.transaction('chronicleParticipants').objectStore('chronicleParticipants').index('chronicleId').getAll(races.id))).length,'Criar participante concorrendo com exclusão não deixa órfãos');
    const [html, appSource] = await Promise.all([fetch('../index.html').then(r=>r.text()),fetch('../script.js').then(r=>r.text())]);
    const appURL=scriptURL(appSource.replaceAll('cronicasRessonancia',prefix));
    await new Promise(resolve=>{
      frame.onload=resolve;
      frame.srcdoc=html.replace('<head>',`<head><base href="${new URL('../',location.href)}">`)
        .replace(/src="js\/chronicles-storage.js[^"]*"/,`src="${storageURL}"`)
        .replace(/src="script.js[^"]*"/,`src="${appURL}"`);
    });
    const w=frame.contentWindow,d=w.document,el=id=>d.getElementById(id);
    await wait(()=>typeof w.renderChronicleParticipants==='function' && !el('characterManagerView').hidden);
    const uiApi=w.ChroniclesStorage;
    const open=async id=>{
      if(el('characterManagerView').dataset.activeEnvironment!=='chronicles') w.showManagerSection('chronicles');
      await w.showChroniclesIndex();
      await w.openChronicleDetail(id,1,d.querySelector(`[data-chronicle-id="${id}"] button`));
      w.setChronicleDetailSection('participants');
      await w.renderChronicleParticipants();
    };
    const evt={preventDefault(){}};
    const rows=()=>[...el('chronicleParticipantsList').children];
    const beforeCharacters=Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>[k,localStorage.getItem(k)]));
    await open(legacy.id);
    check(rows().length===1 && rows()[0].textContent.includes('Felipe Atualizado'),'Lista usa participantes reais persistidos');
    el('addChronicleParticipant').click();
    check(!el('chronicleParticipantForm').hidden && d.activeElement===el('chronicleParticipantName'),'Adicionar abre formulário inline e foca Nome');
    await w.saveChronicleParticipant(evt);
    check(el('chronicleParticipantName').getAttribute('aria-invalid')==='true' && !el('chronicleParticipantForm').hidden,'Nome vazio recebe erro acessível sem fechar formulário');
    el('chronicleParticipantName').value='João';
    await w.saveChronicleParticipant(evt);
    const joao=(await api.listChronicleParticipants(legacy.id)).participants.find(p=>p.name==='João');
    check(joao && rows().length===2 && el('chronicleParticipantForm').hidden && d.activeElement.dataset.participantId===joao.id,'Salvar cria identidade, atualiza lista e restaura foco');
    await w.openChronicleParticipantEditor(joao.id);
    el('chronicleParticipantName').value='João Editado';await w.saveChronicleParticipant(evt);
    check((await api.getChronicleParticipant(legacy.id,joao.id)).name==='João Editado','Editar inline mantém ID');
    await w.openChronicleParticipantEditor(joao.id);
    el('chronicleParticipantName').value='Cancelar este nome';el('cancelChronicleParticipant').click();
    check((await api.getChronicleParticipant(legacy.id,joao.id)).name==='João Editado' && el('chronicleParticipantForm').hidden,'Cancelar explícito descarta sem persistir');
    await w.openChronicleParticipantEditor(joao.id);el('chronicleParticipantName').value='Rascunho';
    w.setChronicleDetailSection('overview');
    check(!el('modalOverlay').hidden && !el('chroniclePanelParticipants').hidden,'Saída implícita pede confirmação para nome não salvo');
    w.closeModal();check(el('chronicleParticipantName').value==='Rascunho','Continuar editando preserva rascunho');
    const current=await api.getChronicleParticipant(legacy.id,joao.id);
    await api.updateChronicleParticipant(legacy.id,joao.id,{name:'Outra aba'},{expectedUpdatedAt:current.updatedAt});
    await w.saveChronicleParticipant(evt);
    check(!el('chronicleParticipantForm').hidden && el('chronicleParticipantName').value==='Rascunho' && el('chronicleParticipantFormFeedback').textContent.includes('outra aba'),'Conflito preserva formulário e rascunho');
    el('cancelChronicleParticipant').click();
    await w.openChronicleParticipantEditor(joao.id);el('chronicleParticipantName').value='Falha preservada';
    w.ChroniclesStorage={...uiApi,updateChronicleParticipant:async()=>{throw new Error('TEST_FAILURE');}};
    await w.saveChronicleParticipant(evt);w.ChroniclesStorage=uiApi;
    check(el('chronicleParticipantName').value==='Falha preservada' && !el('saveChronicleParticipant').disabled,'Falha de persistência mantém edição e permite nova tentativa');
    el('cancelChronicleParticipant').click();
    await w.openChronicleParticipantEditor(joao.id);el('chronicleParticipantName').value='Preservar ao apagar externamente';
    const vanished=await api.getChronicleParticipant(legacy.id,joao.id);
    await api.deleteChronicleParticipant(legacy.id,joao.id,{expectedUpdatedAt:vanished.updatedAt});
    await w.saveChronicleParticipant(evt);
    check(!el('chronicleParticipantForm').hidden && el('chronicleParticipantName').value==='Preservar ao apagar externamente' && el('chronicleParticipantFormFeedback').textContent.includes('não está mais disponível'),'Registro excluído externamente preserva edição, sem recriar ID');
    el('cancelChronicleParticipant').click();
    const restoreTx=db.transaction('chronicleParticipants','readwrite');restoreTx.objectStore('chronicleParticipants').add(vanished);await done(restoreTx);
    let releaseLoad;
    const loadGate=new Promise(resolve=>{releaseLoad=resolve;});
    w.ChroniclesStorage={...uiApi,getChronicleParticipant:async(...args)=>{await loadGate;return uiApi.getChronicleParticipant(...args);}};
    const pending=w.openChronicleParticipantEditor(joao.id);
    w.setChronicleDetailSection('overview');releaseLoad();await pending;w.ChroniclesStorage=uiApi;
    check(el('chronicleParticipantForm').hidden && !el('chroniclePanelOverview').hidden,'Resposta atrasada não reabre edição após sair');
    w.setChronicleDetailSection('participants');await w.renderChronicleParticipants();await w.openChronicleParticipantEditor();
    el('chronicleParticipantName').value='Duplo clique';
    let releaseSave,calls=0;const gate=new Promise(resolve=>{releaseSave=resolve;});
    w.ChroniclesStorage={...uiApi,createChronicleParticipant:async(...args)=>{calls++;await gate;return uiApi.createChronicleParticipant(...args);}};
    const save1=w.saveChronicleParticipant(evt),save2=w.saveChronicleParticipant(evt);
    w.setChronicleDetailSection('overview');
    check(!el('chroniclePanelParticipants').hidden && el('saveChronicleParticipant').disabled,'Navegação protegida e controles bloqueados durante commit');
    releaseSave();await Promise.all([save1,save2]);w.ChroniclesStorage=uiApi;
    check(calls===1 && (await api.listChronicleParticipants(legacy.id)).participants.filter(p=>p.name==='Duplo clique').length===1,'Clique duplo gera somente uma gravação');
    const staleRemove=await api.getChronicleParticipant(legacy.id,joao.id);
    await api.updateChronicleParticipant(legacy.id,joao.id,{name:'Renomeado antes de remover'},{expectedUpdatedAt:staleRemove.updatedAt});
    await w.removeChronicleParticipant(staleRemove);
    check(!!await api.getChronicleParticipant(legacy.id,joao.id) && el('chronicleParticipantsFeedback').textContent.includes('outra aba'),'Remoção com versão antiga é recusada');
    w.ChroniclesStorage={...uiApi,deleteChronicleParticipant:async()=>{throw new Error('DELETE_UI_FAILURE');}};
    await w.removeChronicleParticipant(await api.getChronicleParticipant(legacy.id,joao.id));w.ChroniclesStorage=uiApi;
    check(!!await api.getChronicleParticipant(legacy.id,joao.id) && el('chronicleParticipantsFeedback').dataset.kind==='error','Falha ao remover mantém participante e fornece feedback');
    const removeTarget=await api.getChronicleParticipant(legacy.id,joao.id);
    w.confirmChronicleParticipantRemoval(removeTarget);
    check(!el('modalOverlay').hidden && el('modalDescription').textContent.includes(removeTarget.name),'Remoção pede confirmação identificando participante');
    w.closeModal();check(!!await api.getChronicleParticipant(legacy.id,joao.id),'Cancelar confirmação não remove');
    w.confirmChronicleParticipantRemoval(removeTarget);
    [...el('modalActions').children].find(b=>b.textContent==='Remover participante').click();
    await wait(()=>!el('chroniclePanelParticipants').getAttribute('aria-busy') || el('chroniclePanelParticipants').getAttribute('aria-busy')==='false');
    await w.renderChronicleParticipants();
    check(!await api.getChronicleParticipant(legacy.id,joao.id) && !rows().some(row=>row.dataset.participantId===joao.id),'Remoção confirmada atualiza armazenamento e lista');
    const corruptTx=db.transaction('chronicleParticipants','readwrite');corruptTx.objectStore('chronicleParticipants').add({id:'corrupt-participant-1',chronicleId:legacy.id,name:42});await done(corruptTx);
    await w.renderChronicleParticipants();
    check(el('chronicleParticipantsFeedback').dataset.kind==='warning' && (await api.listChronicleParticipants(legacy.id)).invalidCount===1,'Registro corrompido gera aviso, sem apagar dados nem quebrar listagem');
    check(await rejects(api.updateChronicleParticipant(legacy.id,'corrupt-participant-1',{name:'Não reconstruir'},{expectedUpdatedAt:'x'}),'PARTICIPANT_INVALID_RECORD'),'Registro corrompido não é sobrescrito silenciosamente');
    const cleanTx=db.transaction('chronicleParticipants','readwrite');cleanTx.objectStore('chronicleParticipants').delete('corrupt-participant-1');await done(cleanTx);
    const safeText=await api.createChronicleParticipant(legacy.id,{name:'<img src=x onerror=alert(1)>'});await w.renderChronicleParticipants();
    check(el('chronicleParticipantsList').textContent.includes(safeText.participant.name) && !el('chronicleParticipantsList').querySelector('img'),'Nome é texto, nunca HTML executável');
    await api.deleteChronicleParticipant(legacy.id,safeText.participant.id,{expectedUpdatedAt:safeText.participant.updatedAt});
    const empty=await api.createChronicle({name:'Participantes vazios',type:'oneshot',synopsis:''});
    await open(empty.id);
    check(!el('chronicleParticipantsEmpty').hidden && rows().length===0,'Estado vazio sem participantes');
    el('addChronicleParticipant').click();check(!el('chronicleParticipantForm').hidden,'Ação única também funciona no estado vazio');
    el('chronicleParticipantName').value='Nome '.repeat(24);await w.saveChronicleParticipant(evt);
    const long=(await api.listChronicleParticipants(empty.id)).participants[0];
    await api.createChronicleParticipant(empty.id,{name:'X'.repeat(120)});await w.renderChronicleParticipants();
    for(const width of [1440,768,390,320]){
      frame.style.width=`${width}px`;await new Promise(resolve=>setTimeout(resolve,80));
      check(d.documentElement.scrollWidth<=width && rows().every(row=>row.querySelector('button').getBoundingClientRect().height>=44),`Lista e nomes extensos sem overflow, toque 44px em ${width}px`);
      await w.openChronicleParticipantEditor(long.id);
      check(d.documentElement.scrollWidth<=width && el('chronicleParticipantName').getBoundingClientRect().height>=44 && el('saveChronicleParticipant').getBoundingClientRect().height>=44,`Formulário confortável e sem overflow em ${width}px`);
      el('cancelChronicleParticipant').click();
      w.confirmChronicleParticipantRemoval(long);await wait(()=>el('modalActions').firstElementChild===d.activeElement);
      check(d.documentElement.scrollWidth<=width && el('modalActions').firstElementChild===d.activeElement,`Confirmação acessível e foco em Cancelar em ${width}px`);
      w.closeModal();
    }
    frame.style.width='1440px';
    check(d.querySelectorAll('.chronicle-context-action:disabled').length===1 && [...d.querySelectorAll('.chronicle-context-action:disabled')].some(b=>b.textContent.includes('Convidar Participantes')),'Convites e outras ações futuras continuam indisponíveis');
    check(Object.entries(beforeCharacters).every(([k,v])=>localStorage.getItem(k)===v),'Participantes não alteram armazenamento de personagens');
    await w.openChronicleEditor();el('chronicleName').value='Crônica revisada com participantes';await w.submitChronicleUpdate(evt);
    check(el('chronicleDetailTitle').textContent==='Crônica revisada com participantes' && (await api.listChronicleParticipants(empty.id)).participants.length===2,'Editar Crônica preserva participantes');
    check(el('chronicleOverviewUpdatedAt').textContent && el('chronicleOverviewType').textContent==='One-shot','Visão Geral continua usando dados reais');
    await w.openChronicleEditor();w.openChronicleDeletionConfirmation();w.closeModal();await w.deleteActiveChronicle();
    check(!await api.getChronicle(empty.id) && (await req(db.transaction('chronicleParticipants').objectStore('chronicleParticipants').index('chronicleId').getAll(empty.id))).length===0 && !el('chroniclesIndexView').hidden,'Excluir Crônica via interface remove participantes e volta ao índice');
    await open(legacy.id);
    const savedIds=(await api.listChronicleParticipants(legacy.id)).participants.map(p=>p.id).join(',');
    await open(legacy.id);
    check(rows().map(row=>row.dataset.participantId).join(',')===savedIds,'Fechar e reabrir preserva identidade e ordem');
    check(el('chronicleParticipantFormFeedback').getAttribute('aria-live')==='polite' && el('chronicleParticipantsFeedback').getAttribute('aria-live')==='polite','Erros e estados comunicados em regiões aria-live');
    const persisted=JSON.stringify((await api.listChronicleParticipants(legacy.id)).participants);
    const docSource=frame.srcdoc;
    await new Promise(resolve=>{frame.onload=resolve;frame.srcdoc=docSource;});
    const reloaded=frame.contentWindow;
    await wait(()=>typeof reloaded.renderChronicleParticipants==='function' && !reloaded.document.getElementById('characterManagerView').hidden);
    check(JSON.stringify((await reloaded.ChroniclesStorage.listChronicleParticipants(legacy.id)).participants)===persisted,'Recarregar aplicação preserva IDs, nomes e timestamps');
    reloaded.showManagerSection('chronicles');await reloaded.showChroniclesIndex();
    await reloaded.openChronicleDetail(legacy.id,1,reloaded.document.querySelector(`[data-chronicle-id="${legacy.id}"] button`));
    reloaded.setChronicleDetailSection('participants');await reloaded.renderChronicleParticipants();
    check(reloaded.document.querySelectorAll('#chronicleParticipantsList li').length===2,'Reabertura após reload lista registros persistidos');
    status.textContent=`Concluído: ${results.children.length} verificações aprovadas.`;
  } catch(error) { console.error(error);status.textContent=`Falha: ${error.message}`; }
  finally {connections.forEach(db=>db.close());urls.forEach(url=>URL.revokeObjectURL(url));document.getElementById('run').disabled=false;}
};
