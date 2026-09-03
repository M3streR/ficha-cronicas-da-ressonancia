'use strict';
const frame=document.getElementById('app'),results=document.getElementById('results'),status=document.getElementById('status');
const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('aborted'));});
const wait=async fn=>{for(let n=0;n<300;n++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Timeout aguardando interface');};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function check(value,label){const li=document.createElement('li');li.className=value?'pass':'fail';li.textContent=`${value?'OK':'FALHOU'} — ${label}`;results.append(li);if(!value)throw new Error(label);}
async function rejects(promise,code){try{await promise;return false;}catch(e){return !code||e.message===code;}}
document.querySelectorAll('[data-width]').forEach(b=>b.onclick=()=>{frame.style.width=`${b.dataset.width}px`;});
document.getElementById('run').onclick=async()=>{
  document.getElementById('run').disabled=true;results.replaceChildren();status.textContent='Executando…';
  const urls=[],connections=[];
  const scriptURL=text=>{const url=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));urls.push(url);return url;};
  try{
    const source=await fetch('../js/chronicles-storage.js').then(r=>r.text()),stamp='2026-01-01T00:00:00.000Z';
    const old={id:'chronicle-legacy-test',schemaVersion:1,name:'Horizonte de Teste',synopsis:'Arquivo preservado',type:'campaign',hasCover:true,createdAt:stamp,updatedAt:stamp};
    const fixtures={
      chronicles:old,
      chronicleCovers:{chronicleId:old.id,blob:new Blob(['test-cover'],{type:'image/webp'}),width:960,height:540},
      chronicleCastLinks:{chronicleId:old.id,characterId:'character-fixture-1'},
      chronicleParticipants:{id:'participant-fixture-1',chronicleId:old.id,name:'Felipe',createdAt:stamp,updatedAt:stamp},
      chronicleConfrontations:{id:'confrontation-fixture-1',chronicleId:old.id,name:'Ataque à instalação',description:'',createdAt:stamp,updatedAt:stamp},
      confrontationCharacterLinks:{confrontationId:'confrontation-fixture-1',characterId:'character-fixture-1'},
      confrontationAdversaries:{id:'adversary-fixture-1',confrontationId:'confrontation-fixture-1',name:'Sentinela',createdAt:stamp,updatedAt:stamp}
    };
    let api,db,prefix,storageURL;
    for(const version of [1,2,3,4]){
      prefix=`escudoV1Test${crypto.randomUUID().replaceAll('-','')}`;
      const opening=indexedDB.open(`${prefix}Chronicles`,version);
      opening.onupgradeneeded=()=>{
        const database=opening.result;
        const store=database.createObjectStore('chronicles',{keyPath:'id'});['createdAt','updatedAt','type'].forEach(k=>store.createIndex(k,k));
        database.createObjectStore('chronicleCovers',{keyPath:'chronicleId'});
        if(version>=2){const s=database.createObjectStore('chronicleCastLinks',{keyPath:['chronicleId','characterId']});['chronicleId','characterId'].forEach(k=>s.createIndex(k,k));}
        if(version>=3)database.createObjectStore('chronicleParticipants',{keyPath:'id'}).createIndex('chronicleId','chronicleId');
        if(version>=4){database.createObjectStore('chronicleConfrontations',{keyPath:'id'}).createIndex('chronicleId','chronicleId');database.createObjectStore('confrontationCharacterLinks',{keyPath:['confrontationId','characterId']}).createIndex('confrontationId','confrontationId');database.createObjectStore('confrontationAdversaries',{keyPath:'id'}).createIndex('confrontationId','confrontationId');}
      };
      const legacy=await req(opening),names=[...legacy.objectStoreNames],tx=legacy.transaction(names,'readwrite');
      names.forEach(k=>tx.objectStore(k).add(fixtures[k]));await done(tx);legacy.close();
      storageURL=scriptURL(source.replaceAll('cronicasRessonancia',prefix));
      await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=storageURL;s.onload=resolve;s.onerror=reject;document.body.append(s);});
      api=window.ChroniclesStorage;
      check(await api.getChronicleMasterNote(old.id)===null,`v${version} → v6: Crônica antiga não recebe nota automaticamente`);
      db=await req(indexedDB.open(`${prefix}Chronicles`));connections.push(db);
      const inspection=db.transaction([...db.objectStoreNames]);
      check(db.version===6 && db.objectStoreNames.length===14 && inspection.objectStore('chronicleMasterNotes').keyPath==='chronicleId' && inspection.objectStore('chronicleMasterNotes').indexNames.length===0,`v${version} → v6: store preservada, chave única e nenhum índice extra`);
      for(const name of names){
        const record=(await req(db.transaction(name).objectStore(name).getAll()))[0];
        check(name==='chronicleCovers'?await record.blob.text()===await fixtures[name].blob.text():equal(record,fixtures[name]),`v${version} → v6 preserva ${name}`);
      }
    }
    const publicBefore=await api.getChronicle(old.id),save=(text,version)=>api.saveChronicleMasterNote(old.id,text,{expectedUpdatedAt:version});
    check(await save('',null)===null,'Salvar vazio sem mudança não cria registro');
    const text='  Preparação\n\nNão revelar o portal.\n<script>conteúdo literal</script>  ';
    let note=await save(text,null);
    check(equal(Object.keys(note).sort(),['chronicleId','content','updatedAt']) && note.content===text,'Nota preserva texto e somente três campos');
    check(equal(await api.getChronicle(old.id),publicBefore) && !(await api.listChronicles()).some(c=>'content' in c),'Nota não altera nem aparece nos dados públicos');
    check((await save(text,note.updatedAt)).updatedAt===note.updatedAt,'Salvar igual preserva versão');
    check(await rejects(save('x'.repeat(50001),note.updatedAt),'INVALID_MASTER_NOTE_CONTENT'),'50.001 caracteres rejeitados sem truncamento');
    note=await save('x'.repeat(50000),note.updatedAt);check(note.content.length===50000,'50.000 caracteres aceitos');
    const stale=note.updatedAt;note=await save('',stale);
    check(note.content==='' && note.updatedAt!==stale && !!await api.getChronicleMasterNote(old.id),'Limpar texto mantém registro versionado');
    check(await rejects(save('Conflito',stale),'MASTER_NOTE_UPDATE_CONFLICT'),'Versão antiga não sobrescreve nota');
    const other=await api.createChronicle({name:'Outra Crônica',type:'oneshot',synopsis:''});
    const initial=await Promise.allSettled(['A','B'].map(content=>api.saveChronicleMasterNote(other.id,content,{expectedUpdatedAt:null})));
    check(initial.filter(x=>x.status==='fulfilled').length===1 && initial.some(x=>x.reason?.message==='MASTER_NOTE_UPDATE_CONFLICT'),'Duas primeiras gravações: apenas uma vence');
    const parallel=await Promise.allSettled(['A','B'].map(content=>save(content,note.updatedAt)));
    check(parallel.filter(x=>x.status==='fulfilled').length===1,'Duas edições concorrentes: apenas uma vence');
    note=await api.getChronicleMasterNote(old.id);
    check((await api.getChronicleMasterNote(other.id)).chronicleId===other.id,'Notas isoladas por Crônica');
    await api.updateChronicle(old.id,{name:old.name,synopsis:'Atualização pública',type:old.type},{expectedUpdatedAt:publicBefore.updatedAt});
    note=await save('Edição privada independente',note.updatedAt);
    check(note.content==='Edição privada independente','Alteração pública não causa conflito privado');
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(this.name==='chronicleMasterNotes')this.transaction.abort();return request;};
    check(await rejects(save('Não salvar',note.updatedAt)),'Abort após escrita de nota propaga falha');IDBObjectStore.prototype.put=put;
    check(equal(await api.getChronicleMasterNote(old.id),note),'Rollback mantém nota anterior');
    const del=IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete=function(...args){if(this.name==='chronicleMasterNotes')throw new Error('TEST_DELETE_ABORT');return del.apply(this,args);};
    check(await rejects(api.deleteChronicle(old.id),'TEST_DELETE_ABORT'),'Falha ao apagar nota aborta cascata');IDBObjectStore.prototype.delete=del;
    check(!!await api.getChronicle(old.id) && !!await api.getChronicleCover(old.id) && (await api.listChronicleCastIds(old.id)).length===1 && (await api.listChronicleParticipants(old.id)).participants.length===1 && (await api.listConfrontations(old.id)).length===1 && (await api.listConfrontationCharacterIds(fixtures.chronicleConfrontations.id)).length===1 && (await api.listConfrontationAdversaries(fixtures.chronicleConfrontations.id)).length===1 && equal(await api.getChronicleMasterNote(old.id),note),'Rollback da cascata preserva todas as oito stores');
    const corrupt=await api.createChronicle({name:'Corrompida',type:'oneshot'}),badTx=db.transaction('chronicleMasterNotes','readwrite');badTx.objectStore('chronicleMasterNotes').put({chronicleId:corrupt.id,content:2,updatedAt:stamp});await done(badTx);
    check(await rejects(api.getChronicleMasterNote(corrupt.id),'MASTER_NOTE_INVALID_RECORD') && await rejects(api.saveChronicleMasterNote(corrupt.id,'Não sobrescrever',{expectedUpdatedAt:null}),'MASTER_NOTE_INVALID_RECORD'),'Registro inválido não vira nota vazia nem é sobrescrito');
    await api.deleteChronicle(corrupt.id);
    check((await req(db.transaction('chronicleMasterNotes').objectStore('chronicleMasterNotes').get(corrupt.id)))===undefined,'Exclusão da Crônica remove também nota inválida');
    const [html,appSource]=await Promise.all([fetch('../index.html').then(r=>r.text()),fetch('../script.js').then(r=>r.text())]);
    const appURL=scriptURL(appSource.replaceAll('cronicasRessonancia',prefix));
    const loadFrame=()=>new Promise(resolve=>{frame.onload=resolve;frame.srcdoc=html.replace('<head>',`<head><base href="${new URL('../',location.href)}">`).replace(/src="js\/chronicles-storage.js[^"]*"/,`src="${storageURL}"`).replace(/src="script.js[^"]*"/,`src="${appURL}"`);});
    await loadFrame();
    const w=frame.contentWindow,d=w.document,el=id=>d.getElementById(id);
    await wait(()=>typeof w.openChronicleMasterShield==='function' && !el('characterManagerView').hidden);
    const uiApi=w.ChroniclesStorage;
    const input=value=>{el('masterNoteContent').value=value;el('masterNoteContent').dispatchEvent(new w.Event('input',{bubbles:true}));};
    const ready=()=>!el('masterNoteForm').hidden && !el('masterNoteContent').readOnly;
    const unlock=async()=>{
      await wait(()=>!el('masterShieldAccess').hidden && !el('masterShieldAccess').querySelector('input').disabled);
      const fields=el('masterShieldAccess').querySelectorAll('input');
      fields[0].value='senha-teste-123';fields[1].value='senha-teste-123';el('masterShieldAccess').querySelector('form').requestSubmit();
      await wait(()=>!el('masterShieldPrivate').hidden);
    };
    const openShield=async()=>{el('openMasterShield').click();await unlock();d.querySelector('[data-master-module="notes"]').click();await wait(ready);};
    const submit=async()=>{el('masterNoteForm').requestSubmit();await wait(()=>!el('saveMasterNote').disabled);};
    const modalButton=label=>[...d.querySelectorAll('#modalActions button')].find(b=>b.textContent===label);
    const character=w.createEmptyCharacterState();character.fields.nome='Dylann';character.fields.classe='Atirador';character.fields.nivel=2;
    w.writeStoredCharacter('character-fixture-1',character);
    let manager=w.readCharacterManager()||w.createEmptyCharacterManager();manager=w.setCharacterSummary(manager,'character-fixture-1',await w.createCharacterSummary(character));w.writeCharacterManager(manager);
    await api.createConfrontation(old.id,{name:'Confronto de consulta'});
    w.showManagerSection('chronicles');await wait(()=>!el('chroniclesIndexView').hidden);
    await w.openChronicleDetail(old.id,1,el('openChronicleCreation'));await openShield();
    check(d.activeElement===el('masterModuleTitle'),'Foco no título da tela de trabalho');
    check(el('masterNoteContent').value===note.content,'Nota antiga carregada integralmente');
    input('Rascunho não salvo');
    const unload=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(unload);check(unload.defaultPrevented,'Rascunho protege reload');
    el('backFromMasterShield').click();await wait(()=>!el('modalOverlay').hidden);modalButton('Continuar editando').click();
    check(ready() && el('masterNoteContent').value==='Rascunho não salvo','Continuar editando preserva texto');
    for(const target of [()=>w.showManagerSection('characters'),()=>w.returnToChroniclesIndex(),()=>w.openChronicleDetail(other.id,2,el('openChronicleCreation'))]){
      target();await wait(()=>!el('modalOverlay').hidden);check(el('masterNoteContent').value==='Rascunho não salvo','Saída protegida mantém rascunho');modalButton('Continuar editando').click();
    }
    const publicStamp=(await api.getChronicle(old.id)).updatedAt;
    await submit();check((await api.getChronicleMasterNote(old.id)).content==='Rascunho não salvo' && (await api.getChronicle(old.id)).updatedAt===publicStamp,'Nota salva não muda timestamp público');
    const cleanUnload=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(cleanUnload);check(!cleanUnload.defaultPrevented,'Aviso de saída removido após salvar');
    input('x'.repeat(50001));await submit();check(el('masterNoteContent').value.length===50001 && el('masterNoteContent').getAttribute('aria-invalid')==='true','50.001 caracteres não são truncados');
    input('Minha edição local');const remote=await api.saveChronicleMasterNote(old.id,'Edição remota',{expectedUpdatedAt:(await api.getChronicleMasterNote(old.id)).updatedAt});
    await submit();check(el('masterNoteContent').value==='Minha edição local' && el('masterNoteFeedback').textContent.includes('outra aba'),'Conflito mantém texto local');
    el('backFromMasterShield').click();await wait(()=>!el('modalOverlay').hidden);modalButton('Descartar e sair').click();
    check(el('masterNoteContent').value==='' && el('chronicleMasterShieldView').hidden,'Saída limpa DOM privado');
    await openShield();check(el('masterNoteContent').value===remote.content,'Reabrir carrega versão salva');
    input('Texto preservado na falha');w.ChroniclesStorage={...uiApi,saveChronicleMasterNote:async()=>{throw Error('TEST_FAILURE');}};
    await submit();check(el('masterNoteContent').value==='Texto preservado na falha' && el('masterNoteFeedback').dataset.kind==='error','Falha mantém editor e texto');w.ChroniclesStorage=uiApi;
    let release,calls=0;w.ChroniclesStorage={...uiApi,saveChronicleMasterNote:(...args)=>{calls++;return new Promise(resolve=>{release=()=>resolve(uiApi.saveChronicleMasterNote(...args));});}};
    el('masterNoteForm').requestSubmit();el('masterNoteForm').requestSubmit();el('backFromMasterShield').click();
    check(calls===1 && !el('chronicleMasterShieldView').hidden && el('masterNoteContent').readOnly,'Clique duplo e saída durante salvamento bloqueados');release();await wait(()=>!el('saveMasterNote').disabled);w.ChroniclesStorage=uiApi;
    el('backToMasterDashboard').click();await wait(()=>!el('masterDashboard').hidden);
    d.querySelector('[data-master-module="agents"]').click();await wait(()=>el('masterShieldCastList').textContent.includes('Dylann'));
    check(el('masterShieldCastList').textContent.includes('Atirador'),'Agentes consulta Elenco atual sem copiar a ficha');
    el('backToMasterDashboard').click();d.querySelector('[data-master-module="combats"]').click();await wait(()=>el('masterShieldConfrontationsList').querySelector('button'));el('masterShieldConfrontationsList').querySelector('button').click();await wait(()=>!el('confrontationView').hidden);
    check(el('masterNoteContent').value==='' && el('confrontationTitle').textContent.includes('Confronto'),'Combates reutiliza tela operacional e fecha acesso privado');
    el('backFromConfrontation').click();await unlock();d.querySelector('[data-master-module="notes"]').click();await wait(ready);
    for(const width of [1440,768,390,320]){
      frame.style.width=width+'px';await new Promise(r=>setTimeout(r,100));
      check(d.documentElement.scrollWidth<=d.documentElement.clientWidth,width+'px: sem overflow');
      check(el('saveMasterNote').getBoundingClientRect().height>=44 && parseFloat(w.getComputedStyle(el('masterNoteContent')).fontSize)>=16,width+'px: toque e escrita confortáveis');
    }
    el('backFromMasterShield').click();
    let late;w.ChroniclesStorage={...uiApi,getChronicleMasterNote:()=>new Promise(resolve=>{late=resolve;})};
    el('openMasterShield').click();await unlock();d.querySelector('[data-master-module="notes"]').click();await wait(()=>typeof late==='function');
    el('backFromMasterShield').click();late({chronicleId:old.id,content:'RESPOSTA ATRASADA',updatedAt:stamp});await new Promise(r=>setTimeout(r,30));
    check(el('chronicleMasterShieldView').hidden && el('masterNoteContent').value==='','Resposta atrasada não repovoa DOM privado');w.ChroniclesStorage=uiApi;
    const temporary=await api.createChronicle({name:'Excluir durante edição',type:'oneshot'});
    await w.openChronicleDetail(temporary.id,3,el('openChronicleCreation'));await openShield();input('Não perder o rascunho');await api.deleteChronicle(temporary.id);await submit();
    check(el('masterNoteContent').value==='Não perder o rascunho' && el('masterNoteFeedback').textContent.includes('não está mais disponível'),'Crônica excluída não é recriada e rascunho permanece');
    el('backFromMasterShield').click();await wait(()=>!el('modalOverlay').hidden);modalButton('Descartar e sair').click();
    check(d.querySelectorAll('.chronicle-context-action:disabled').length===1,'Somente Convidar Participantes permanece indisponível');
    status.textContent=`Concluído: ${results.children.length} verificações aprovadas.`;
  }catch(error){status.textContent=`FALHOU: ${error.message}`;console.error(error);}finally{connections.forEach(db=>db.close());urls.forEach(url=>URL.revokeObjectURL(url));document.getElementById('run').disabled=false;}
};
