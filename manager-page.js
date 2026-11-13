/* Dedicated top-level manager. Uses original copied controls and experimental stores. */
(function(){'use strict';
const managerView=document.getElementById('characterManagerView');managerView.inert=true;
const engine=window.FichaV2Engine;
let opening=false;
function sheetDestination(id) {
 const target = new URL('../ficha.html', document.baseURI);
 target.searchParams.set('character', id);
 return target.href;
}
function goToSheet(id, kind) {
 const url = sheetDestination(id);
 return window.FichaV2NavigationEffects?.navigate(url, kind) ?? location.assign(url);
}
window.openExistingCharacterFromManager = async id => {
 if (activeCharacterId && !await saveActiveCharacter()) throw Error('Salvamento não confirmado.');
 await goToSheet(id, 'open');
};
completeMenuToSheetTransition=async function(trigger){
 if(opening)return;opening=true;
 try{const id=engine.getId();if(!id)throw Error('Escolha um personagem válido.');if(!await saveActiveCharacter())throw Error('Salvamento não confirmado.');await closeCharacter();await goToSheet(id,trigger?.id==='managerCreateCharacter'?'create':'open');}
 catch(error){opening=false;clearViewTransitionState(trigger,managerView,document.getElementById('characterSheetView'));throw error;}
};
(async()=>{try{
 await engine.ready;
 // Recover an existing Stage 2 sheet once; never generate or resurrect an example.
 // Official stores are reused directly; experimental bootstrap is never imported.

 showCharacterManagerView();const params=new URL(location.href).searchParams;
 if(params.get('section')==='chronicles'){showManagerSection('chronicles',{focusPanel:true});const id=params.get('chronicle');if(/^[0-9a-f-]{36}$/i.test(id||'')){await openChronicleDetail(params.get('storage')==='local'?id:'online:'+id,1,document.getElementById('openChronicleCreation'));document.getElementById('chronicleTabEncounters').click();}}
 if(params.get('account')==='1')document.querySelector('.manager-account-button')?.click();
 window.managerV2Ready=true;
 }catch(error){showNotification(`Gerenciador experimental: ${error.message}`,'error',12000);}
 finally{managerView.inert=false;}
})();
})();
