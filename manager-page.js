/* Dedicated top-level manager. Uses original copied controls and experimental stores. */
(function(){'use strict';
const managerView=document.getElementById('characterManagerView');managerView.inert=true;
const engine=window.FichaV2Engine;
let opening=false;
completeMenuToSheetTransition=async function(trigger){
 if(opening)return;opening=true;
 try{const id=engine.getId();if(!id)throw Error('Escolha um personagem válido.');if(!await saveActiveCharacter())throw Error('Salvamento não confirmado.');await closeCharacter();const target=new URL('../ficha.html',document.baseURI);target.searchParams.set('character',id);if(window.FichaV2NavigationEffects)await window.FichaV2NavigationEffects.navigate(target.href,trigger?.id==='managerCreateCharacter'?'create':'open');else location.assign(target.href);}
 catch(error){opening=false;clearViewTransitionState(trigger,managerView,document.getElementById('characterSheetView'));throw error;}
};
(async()=>{try{
 await engine.ready;
 // Recover an existing Stage 2 sheet once; never generate or resurrect an example.
 // Official stores are reused directly; experimental bootstrap is never imported.

 showCharacterManagerView();const params=new URL(location.href).searchParams;
 if(params.get('section')==='chronicles')showManagerSection('chronicles',{focusPanel:true});
 if(params.get('account')==='1')document.querySelector('.manager-account-button')?.click();
 window.managerV2Ready=true;
 }catch(error){showNotification(`Gerenciador experimental: ${error.message}`,'error',12000);}
 finally{managerView.inert=false;}
})();
})();
