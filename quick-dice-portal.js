/* Adopt the one existing tool; the original engine still owns rolls and history. */
(() => {'use strict';
 function mount(engineWindow){
  if(document.getElementById('quickDiceTool'))return;
  const tool=engineWindow.document.getElementById('quickDiceTool');if(!tool)return;
  engineWindow.FichaV2QuickDiceDocument=document;
  document.body.append(document.adoptNode(tool));
  tool.dataset.global='true';tool.hidden=!window.fichaV2Ready;
  function expose(){if(!window.fichaV2Ready){requestAnimationFrame(expose);return;}tool.hidden=false;}expose();
  const panel=tool.querySelector('#quickDicePanel'),form=tool.querySelector('#quickDiceForm');
  function fit(){const v=window.visualViewport;tool.style.setProperty('--qd-height',`${Math.max(180,(v?.height||innerHeight)-110)}px`);tool.style.setProperty('--qd-bottom',`${18+Math.max(0,innerHeight-(v?.height||innerHeight)-(v?.offsetTop||0))}px`);}
  fit();window.addEventListener('resize',fit);window.visualViewport?.addEventListener('resize',fit);window.visualViewport?.addEventListener('scroll',fit);
  // A pending edit on Geral must reach the canonical character before recording a roll.
  let pending=false;
  form.addEventListener('submit',event=>{
   if(!window.FichaV2?.hasPendingChanges()&&!pending)return;
   event.preventDefault();event.stopImmediatePropagation();if(pending)return;pending=true;
   const expression=tool.querySelector('#quickDiceExpression').value;
   void(async()=>{try{if(await window.FichaV2.save())engineWindow.performQuickDiceRoll({expression});}catch(error){const output=tool.querySelector('#quickDiceError');output.textContent=error.message;output.hidden=false;}finally{pending=false;}})();
  },true);
  document.addEventListener('pointerdown',event=>{if(!panel.hidden&&!tool.contains(event.target))engineWindow.closeQuickDice({restoreFocus:false});});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden&&!document.body.classList.contains('v2-modal-open')){event.preventDefault();engineWindow.closeQuickDice();}});
 }
 window.FichaV2QuickDicePortal=Object.freeze({mount});
 window.FichaV2Bridge?.ready.then(()=>mount(document.getElementById('complete-engine').contentWindow));
})();
