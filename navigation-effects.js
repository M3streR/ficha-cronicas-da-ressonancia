/* Visual-only bridge between the two experimental documents. Saving stays with their owners. */
(() => {'use strict';
 const key='cronicasRessonanciaNavigationEffect',reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 let layer=null,pending=null;
 const announce=(phase,kind)=>document.dispatchEvent(new CustomEvent('cronicas:navigation-effect',{detail:{phase,kind}}));
 function clear(){layer?.remove();layer=null;}
 function surface(kind){
  clear();const node=document.createElement('div');node.className='resonance-journey';node.dataset.direction=kind;node.setAttribute('aria-hidden','true');
  node.innerHTML='<div class="resonance-journey-seal"><svg viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="47"/><circle cx="60" cy="60" r="39" stroke-dasharray="2 9"/><path d="M60 8 112 60 60 112 8 60ZM60 30Q65 55 90 60Q65 65 60 90Q55 65 30 60Q55 55 60 30ZM60 48 72 60 60 72 48 60Z"/></svg></div>';
  document.body.append(node);layer=node;return node;
 }
 async function animate(node,frames,duration){
  if(!node.animate||reduced())return;
  let animation;try{animation=node.animate(frames,{duration,easing:'cubic-bezier(.22,.65,.3,1)',fill:'forwards'});await Promise.race([animation.finished.catch(()=>{}),new Promise(resolve=>setTimeout(resolve,duration+80))]);}catch{}finally{animation?.cancel();}
 }
 async function navigate(url,kind='open'){
  if(pending)return pending;
  const target=new URL(url,location.href);if(target.origin!==location.origin)throw Error('A transição só atende à prévia local.');
  pending=(async()=>{
   if(!reduced()){
    try{const node=surface(kind);announce('leaving',kind);await animate(node,[{opacity:0},{opacity:1}],180);node.style.opacity='1';sessionStorage.setItem(key,JSON.stringify({url:target.href,at:Date.now(),kind,gold:document.body.dataset.gold==='true'}));}catch{clear();}
   }
   try{location.assign(target.href);}catch(error){try{sessionStorage.removeItem(key);}catch{}clear();pending=null;throw error;}
  })();return pending;
 }
 window.FichaV2NavigationEffects=Object.freeze({navigate});
 // Consume the one-use marker only on the intended destination. Reload/back never replays it.
 let arrival;try{arrival=JSON.parse(sessionStorage.getItem(key)||'null');sessionStorage.removeItem(key);}catch{}
 if(arrival?.url===location.href&&Date.now()-arrival.at<8000&&!reduced()){
  try{
   const node=surface(arrival.kind);node.style.opacity='1';node.dataset.gold=String(arrival.gold);announce('arriving',arrival.kind);
   const start=performance.now();function reveal(){
    if(window.fichaV2Ready||window.managerV2Ready||performance.now()-start>2400){
     announce('revealing',arrival.kind);animate(node,[{opacity:1},{opacity:0}],280).finally(()=>{if(layer===node)clear();announce('finished',arrival.kind);});
    }else requestAnimationFrame(reveal);
   }requestAnimationFrame(reveal);
  }catch{clear();}
 }
 // Restoring a page from browser history must never restore a covering animation.
 addEventListener('pagehide',clear);addEventListener('pageshow',event=>{if(event.persisted){clear();pending=null;}});
})();
