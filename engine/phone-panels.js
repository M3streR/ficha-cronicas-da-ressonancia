/* Reuse the official class reference; expose its long content on demand on phones. */
(() => {'use strict';
 if(!window.frameElement)return;
 const media=parent.matchMedia('(max-width:1024px)');
 const reference=document.querySelector('#classReference');
 const parts=['classReferenceDescription','classReferenceStats','classReferenceProgression'];
 let details=null;const homes=new Map();
 function adapt(){
  if(media.matches&&!details){details=document.createElement('details');details.className='phone-class-details';const summary=document.createElement('summary');summary.textContent='Descrição e progressão da Classe';details.append(summary);for(const id of parts){const node=document.getElementById(id),home=document.createComment('class reference original position');node.before(home);homes.set(node,home);details.append(node);}reference.append(details);}
  else if(!media.matches&&details){for(const[node,home]of homes)home.replaceWith(node);homes.clear();details.remove();details=null;}
 }
 adapt();media.addEventListener('change',adapt);
})();
