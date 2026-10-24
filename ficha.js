'use strict';
const R=window.FichaV2Rules,M=window.FichaV2Model,S=window.FichaV2Bridge?.storage||window.FichaV2Storage;
let state,dirty=false,timer,revision=0,storageAvailable=false,lastWrite=Promise.resolve(),replacing=false;
const $=selector=>document.querySelector(selector);
$('#view-geral').inert=true;$('.test-toolbar').inert=true;
const icon=id=>`<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const feedback=message=>$('#feedback').textContent=message;
const identity={name:'nome',class:'classe',signature:'assinatura'};
const attributes=[['forca','force'],['vigor','will'],['agilidade','wing'],['intelecto','book'],['presenca','resonance']];
$('#attributes').innerHTML=attributes.map(([id,symbol])=>`<div class="attribute" role="group" aria-label="${R.getAttributeLabel(id)}">${icon(symbol)}<span>${R.getAttributeLabel(id)}</span><input class="attribute-value" data-field="${id}" type="number" min="1" max="5" aria-label="${R.getAttributeLabel(id)}"><button class="attribute-step-v2 decrease" type="button" data-attribute-step="${id}" data-step="-1" aria-label="Diminuir ${R.getAttributeLabel(id)}">−</button><button class="attribute-step-v2 increase" type="button" data-attribute-step="${id}" data-step="1" aria-label="Aumentar ${R.getAttributeLabel(id)}">+</button></div>`).join('');
const resourceDefinitions=[['PV','pv','#d16c8a','heart'],['PN','pn','#a353ee','resonance'],['PS','ps','#55d4ee','spiral']];
$('#resources').innerHTML=resourceDefinitions.map(([name,id,color,symbol])=>`<div class="resource" style="--resource:${color}"><div class="resource-top">${icon(symbol)}<label for="current-${name}">${name}</label><div class="resource-numbers"><input id="current-${name}" data-field="${id}Atual" type="number" min="0" aria-label="${name} atual"><span>/</span><input data-field="${id}Max" type="number" min="0" aria-label="${name} máximo"></div></div><div class="resource-track" aria-hidden="true"><div class="resource-fill"></div></div><div class="resource-buttons">${[-10,-1,1,10].map(delta=>`<button type="button" data-resource="${id}Atual" data-delta="${delta}" aria-label="${delta<0?'Retirar':'Recuperar'} ${Math.abs(delta)} ${name}">${delta>0?'+':''}${delta}</button>`).join('')}<button type="button" data-restore="${id}Atual" aria-label="Restaurar ${name} ao máximo" title="Restaurar máximo">↥</button></div></div>`).join('');
$('.resources').insertAdjacentHTML('beforeend','<div class="resources-summary"><label>PV temporários <input data-field="pvTemporarios" type="number" min="0" aria-label="PV temporários"></label><span class="v2-defense-label" aria-label="Defesa calculada"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="M12 7v9M8 11h8"/></svg><span>DEF</span><output id="defense-output" aria-label="Defesa"></output></span><span id="resource-warning"></span></div>');
for(const [selector,id] of Object.entries(identity))document.getElementById(selector).dataset.field=id;
for(const [label,id] of [['Nível','nivel'],['Tipo de Nexo','tipoNexo'],['Patente','patente'],['Idade','idade'],['Forma de Conjuração','formaConjuracao']])document.querySelector(`[aria-label="${label}"]`).dataset.field=id;
let skillRollBusy=false;
async function rollSkill(name){
 if(skillRollBusy||replacing)return;
 skillRollBusy=true;
 const output=$('#skill-roll-result');
 try{
  if(!window.FichaV2Bridge)throw Error('Aguarde a ficha carregar para rolar.');
  if(dirty&&!await persist())throw Error('Não foi possível salvar os ajustes antes da rolagem.');
  const rolled=await window.FichaV2Bridge.rollSkill(name);
  if(!rolled)throw Error('Rolagem não realizada. Confira o destino no Rolador rápido em Estados, efeitos e ferramentas.');
  const {result,attribute,degree}=rolled;
  output.hidden=false;output.dataset.skill=name;output.dataset.total=result.total;
  const dice=result.resolution==='highest'?`maior de ${result.rolls.join(', ')} = ${result.diceTotal}`:result.rolls.join(', ');
  output.textContent=`${name}: ${result.total} · ${dice}${result.modifier?` + ${result.modifier}`:''}`;
  output.title=`${attribute} · ${degree} · ${result.expression}. ${state.activeEffects?.length?'Efeitos descritivos devem ser conferidos conforme o contexto do teste.':''}`;
 }catch(error){output.hidden=false;output.textContent=error.message;feedback(error.message);}finally{skillRollBusy=false;}
}
const attributeAbbreviations=Object.freeze({'Força':'FOR','Vigor':'VIG','Agilidade':'AGI','Intelecto':'INT','Presença':'PRE'});
function renderSkills(){
 const list=[...R.pericias,...R.legacyPericias.filter(([name])=>Object.hasOwn(state.skills,name))];
 $('#skills').replaceChildren();
 for(const [name,attribute]of list){
  const row=document.createElement('div');row.className='skill-row';row.dataset.name=name;row.dataset.attribute=attribute;
  row.innerHTML=`<div class="skill-name">${icon(attribute==='Força'||attribute==='Vigor'?'force':attribute==='Agilidade'?'wing':attribute==='Intelecto'?'book':'resonance')}<span class="skill-identification"><span class="skill-label"></span> <small class="skill-attribute-short"></small></span><button class="skill-roll" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.25"/><circle cx="16" cy="8" r="1.25"/><circle cx="12" cy="12" r="1.25"/><circle cx="8" cy="16" r="1.25"/><circle cx="16" cy="16" r="1.25"/></svg></button></div><div class="grade-wrapper"><div class="degree-diamonds" aria-hidden="true">${Object.entries(R.graus).filter(([,bonus])=>bonus>0).map(([degree,bonus])=>`<span class="degree-step"><i data-degree="${R.skillDegreeSteps[degree]}"></i><small>+${bonus}</small></span>`).join('')}</div><select aria-label="Grau de ${name}">${Object.keys(R.graus).map(degree=>`<option>${degree}</option>`).join('')}</select></div><span class="skill-bonus"></span>`;
  row.querySelector('.skill-label').textContent=name;
  row.querySelector('.skill-attribute-short').textContent=`(${attributeAbbreviations[attribute]})`;
  row.querySelector('.skill-name').title=attribute;
  const diceButton=row.querySelector('.skill-roll');diceButton.setAttribute('aria-label',`Rolar ${name}`);diceButton.title=`Rolar ${name} · ${attribute}`;diceButton.addEventListener('click',()=>rollSkill(name));
  row.querySelector('select').addEventListener('change',event=>{
   if(replacing||!state||window.FichaV2Bridge?.isNavigating?.()||window.FichaV2Bridge&&!window.FichaV2Bridge.getEngine()?.canEdit())return;
   const result=M.setSkill(state,name,event.target.value);
   if(!result.allowed)feedback(result.message);else changed();
   render();
  });$('#skills').append(row);
 }
}
function filterSkills(){const query=$('#skill-search').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();for(const row of document.querySelectorAll('.skill-row')){const name=row.dataset.name;const match=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query);const attribute=$('#skill-attribute-filter').value;row.hidden=!match||($('#skill-filter').value==='trained'&&(state.skills[name]||'Sem Domínio')==='Sem Domínio')||(attribute!=='all'&&row.dataset.attribute!==attribute);}$('#skill-filter-count').textContent=`Exibindo ${document.querySelectorAll('.skill-row:not([hidden])').length} de ${document.querySelectorAll('.skill-row').length} perícias`;$('#skill-clear').disabled=!$('#skill-search').value;}
function render(){
 const f=state.fields,d=M.derived(state),hasClass=!!R.computeClassMaximums(M.snapshot(state));
 for(const input of document.querySelectorAll('[data-field]')){
  input.value=f[input.dataset.field]??'';
  if(R.ATTRIBUTE_IDS.includes(input.dataset.field))input.max=Number(f.nivel)===11?6:5;
  if(input.dataset.field.endsWith('Max')){input.readOnly=hasClass;input.title=hasClass?'Calculado pela Classe, nível e atributos.':'';}
 }
 $('#mobile-level').textContent=`Nível ${f.nivel||1}`;
 $('#character-name').textContent=f.nome||'Sem nome';$('#character-class').textContent=f.classe||'Sem Classe';$('#character-signature').textContent=f.assinatura||'Sem Assinatura';
 $('.threshold output').value=d.threshold;$('.threshold output').setAttribute('aria-label',`Limiar de Ressonância: ${d.threshold}`);
 $('#defense-output').value=d.defense;
 const photo=$('.portrait-frame img');photo.src=state.photo||'assets/portrait.svg';photo.alt=state.photo?'Retrato importado do personagem':'Placeholder simbólico de retrato';
 $('#attribute-status').textContent=Number(f.nivel)===1?`Ponto inicial disponível: ${Math.max(0,d.attributePoints)} / 1${d.attributePoints<0?' · distribuição importada acima da criação inicial':''}`:Number(f.nivel)===11?'Ápice do Nexo: somente um atributo pode alcançar 6.':'Progressão de atributos manual · máximo 5.';
 $('#skill-status').textContent=`Perícias iniciais: ${d.skills.initialUsed} / 6 · Avanços: ${d.skills.advancesUsed} / ${d.skills.advancesEarned}${d.skills.incompatible?' · Distribuição incompatível: reduza graus para corrigir.':''}`;
 $('#skill-status').classList.toggle('warning',d.skills.incompatible);
 for(const row of document.querySelectorAll('.skill-row')){const name=row.dataset.name,degree=state.skills[name]||'Sem Domínio',select=row.querySelector('select');select.value=degree;for(const option of select.options)option.disabled=option.value!==degree&&!R.canChangeSkill(state,name,option.value).allowed;row.querySelectorAll('[data-degree]').forEach(dot=>dot.classList.toggle('filled',Number(dot.dataset.degree)<=R.skillDegreeSteps[degree]));row.querySelector('.skill-bonus').textContent=`+${R.graus[degree]}`;select.title=`${degree} · atributo associado: ${row.dataset.attribute}`;}
 for(const resource of document.querySelectorAll('.resource')){const [current,max]=[...resource.querySelectorAll('input')].map(input=>Number(input.value)||0);resource.style.setProperty('--progress',`${max>0?Math.min(100,current/max*100):0}%`);}
 const above=resourceDefinitions.filter(([,id])=>Number(f[`${id}Atual`])>Number(f[`${id}Max`])).map(([name])=>name);
 $('#resource-warning').textContent=above.length?`${above.join(', ')} atual acima do máximo foi preservado.`:'';
 if(f.classe==='Guardião')feedback('Guardião legado preservado. Escolha Bastião ou Regente para definir o caminho.');
 filterSkills();
 document.dispatchEvent(new Event('cronicas:render'));
}
function changed(){dirty=true;revision++;$('#save-status').textContent='Alterações de teste pendentes';clearTimeout(timer);if(storageAvailable)timer=setTimeout(()=>persist(),200);}
async function persist(){clearTimeout(timer);if(replacing||!state)return false;if(!storageAvailable){feedback('Armazenamento indisponível. Exporte o JSON para preservar as alterações.');return false;}const version=revision;$('#save-status').textContent='Salvando teste…';try{const candidate=window.FichaV2Bridge&&!dirty?window.FichaV2Bridge.getEngine().getState():state;lastWrite=S.save(candidate,undefined,{generalOnly:true});await lastWrite;if(version===revision){state=M.clone(window.FichaV2Bridge?window.FichaV2Bridge.getEngine().getState():candidate);dirty=false;$('#save-status').textContent='Teste salvo no banco experimental';if(/^(Espaço insuficiente|Gravação não confirmada)/.test($('#feedback').textContent))feedback('');}return true;}catch(error){dirty=true;$('#save-status').textContent='Falha ao salvar teste';feedback(error.name==='QuotaExceededError'?'Espaço insuficiente. Exporte o JSON; nenhuma ficha oficial foi alterada.':`Gravação não confirmada: ${error.message}`);return false;}}
async function replaceTest(next){if(replacing)throw Error('Aguarde o carregamento experimental atual.');if(!storageAvailable)throw Error('Armazenamento experimental indisponível; substituição cancelada para proteger o teste atual.');replacing=true;$('#view-geral').inert=true;$('.test-toolbar').inert=true;clearTimeout(timer);const backup=M.clone(state);try{await lastWrite.catch(()=>{});lastWrite=S.save(next,backup);await lastWrite;state=next;dirty=false;revision++;renderSkills();render();$('#save-status').textContent='Teste salvo · cópia anterior preservada no banco experimental';}finally{replacing=false;$('#view-geral').inert=false;$('.test-toolbar').inert=false;}}
for(const input of document.querySelectorAll('[data-field]')){
 input.addEventListener(R.ATTRIBUTE_IDS.includes(input.dataset.field)?'change':'input',()=>{
  if(replacing||!state||window.FichaV2Bridge?.isNavigating?.()||window.FichaV2Bridge&&!window.FichaV2Bridge.getEngine()?.canEdit())return;
  if(input.value===''&&(input.dataset.field==='nivel'||R.ATTRIBUTE_IDS.includes(input.dataset.field)))return;
  const result=M.setField(state,input.dataset.field,input.value);if(!result.allowed)feedback(result.message);else{changed();feedback('');}render();
 });
 input.addEventListener('blur',()=>{if(input.value===''&&(input.dataset.field==='nivel'||R.ATTRIBUTE_IDS.includes(input.dataset.field)))render();});
}
$('#attributes').addEventListener('click',event=>{const button=event.target.closest('[data-attribute-step]');if(!button||replacing||!state||window.FichaV2Bridge&&!window.FichaV2Bridge.getEngine()?.canEdit())return;const id=button.dataset.attributeStep;const result=M.setField(state,id,Number(state.fields[id])+Number(button.dataset.step));if(result.allowed){changed();feedback('');}else feedback(result.message);render();});
$('#resources').addEventListener('click',event=>{if(replacing||!state||window.FichaV2Bridge?.isNavigating?.()||window.FichaV2Bridge&&!window.FichaV2Bridge.getEngine()?.canEdit())return;const step=event.target.closest('[data-resource]'),restore=event.target.closest('[data-restore]');if(step)M.delta(state,step.dataset.resource,Number(step.dataset.delta));else if(restore)M.setField(state,restore.dataset.restore,state.fields[restore.dataset.restore.replace('Atual','Max')]);else return;changed();render();});
$('#skill-search').addEventListener('input',filterSkills);$('#skill-filter').addEventListener('change',filterSkills);$('#skill-attribute-filter').addEventListener('change',filterSkills);$('#skill-clear').addEventListener('click',()=>{$('#skill-search').value='';filterSkills();$('#skill-search').focus();});
$('#save-test').addEventListener('click',persist);
$('#backup-test').addEventListener('click',async()=>{try{const backup=await S.lastBackup();if(!backup){feedback('Nenhum backup experimental disponível.');return;}if(confirm('Restaurar o último backup experimental? O teste atual também será preservado.')){await replaceTest(M.restore(backup));feedback('Backup experimental restaurado.');}}catch(e){feedback(e.message);}});
$('#new-test').addEventListener('click',async()=>{if(!confirm('Criar um novo personagem de teste? O teste atual será guardado como backup experimental.'))return;try{await replaceTest(M.empty());feedback('Novo teste criado. Nenhum personagem oficial foi alterado.');}catch(e){feedback(e.message);}});
$('#load-test').addEventListener('click',async()=>{if(dirty&&!confirm('Carregar o último teste salvo? As alterações atuais serão guardadas em backup experimental.'))return;try{clearTimeout(timer);await lastWrite.catch(()=>{});const saved=await S.load();if(saved){await replaceTest(M.restore(saved));feedback('Teste experimental carregado.');}}catch(e){feedback(e.message);}});
$('#import-test').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{let raw;try{raw=JSON.parse(await file.text());}catch{throw Error('Não foi possível ler um JSON válido. O teste atual foi preservado.');}const original=M.validate(raw);if(original.photo){const image=new Image();image.src=original.photo;try{await image.decode();}catch{throw Error('A imagem do JSON não pôde ser decodificada. Importação cancelada.');}}const next=M.restore(original);if(!confirm('Importar somente no ambiente experimental? O teste atual será preservado em backup. Nenhum vínculo Online será utilizado.'))return;await replaceTest(next);feedback('JSON importado no banco experimental. Dados das seis abas preservados.');}catch(e){feedback(e.message);}});
$('#export-test').addEventListener('click',()=>{const latest=window.FichaV2Bridge?.getEngine()?.getState();const exported=latest?(dirty?{...latest,fields:{...latest.fields,...state.fields},skills:{...latest.skills,...state.skills}}:latest):state;const blob=new Blob([JSON.stringify(exported,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='ficha-v2-teste-cronicas.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);feedback('JSON exportado com os dados completos. O arquivo exportado não cria nem altera vínculos online.');});
const tabs=[...document.querySelectorAll('[role=tab]')];async function selectTab(tab,focus=false){try{if(dirty&&!await persist())return;if(window.FichaV2Bridge&&await window.FichaV2Bridge.navigate(tab.dataset.tab)===false)return;tabs.forEach(item=>{const active=item===tab;item.classList.toggle('active',active);item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;});const general=tab.dataset.tab==='geral';$('#view-geral').hidden=!general;$('#view-pending').hidden=true;if(!window.FichaV2Bridge&&!general){$('#view-pending').hidden=false;$('#view-pending').setAttribute('aria-labelledby',tab.id);$('#pending-title').textContent=tab.textContent.trim();}if(focus)tab.focus();}catch(e){feedback(e.message);}}
for(const [index,tab]of tabs.entries()){tab.addEventListener('click',()=>selectTab(tab));tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==undefined){event.preventDefault();selectTab(tabs[next],true);}});}
$('.return-button').addEventListener('click',()=>selectTab(tabs[0],true));
window.addEventListener('beforeunload',event=>{if(dirty){persist();event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty)persist();});
(async()=>{try{await S.ready();storageAvailable=true;const saved=await S.load();state=saved?M.restore(saved):M.demo();$('#save-status').textContent=saved?'Teste experimental carregado':'Exemplo fictício · ainda não salvo';}catch(e){state=M.demo();$('#save-status').textContent='Sem armazenamento experimental';feedback(e.message);}renderSkills();render();$('#view-geral').inert=false;$('.test-toolbar').inert=false;$('#global-tools').inert=false;document.querySelector('.stage').hidden=false;window.fichaV2Ready=true;})();
window.FichaV2=Object.freeze({selectSection:section=>{const tab=tabs.find(item=>item.dataset.tab===section);if(!tab)return Promise.reject(Error('Seção experimental não reconhecida.'));return selectTab(tab);},getState:()=>M.clone(state),hasPendingChanges:()=>dirty,save:persist,importTest:async raw=>replaceTest(M.restore(M.validate(raw))),getPendingGeneral(){if(!dirty)return null;clearTimeout(timer);$('#view-geral').inert=true;return M.clone(state);},acceptTransferState(next){clearTimeout(timer);dirty=false;state=M.clone(next);renderSkills();render();},async refreshFromEngine(next){if(dirty||replacing)return false;state=M.clone(next);revision++;renderSkills();render();return true;}});

