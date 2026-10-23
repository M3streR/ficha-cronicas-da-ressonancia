/* Viewport and navigation presentation; no character state or game calculations. */
(() => {'use strict';
 const mobile=matchMedia('(max-width:1024px)'),tabs=document.querySelector('.tabs');
 const rail=document.createElement('div');rail.className='mobile-tabs-rail';
 const previous=document.createElement('button'),next=document.createElement('button');
 tabs.id ||= 'sheet-tabs';
 for(const[button,direction,icon]of [[previous,-1,'m14 6-6 6 6 6'],[next,1,'m10 6 6 6-6 6']]){
  button.type='button';button.className='mobile-tab-step';button.setAttribute('aria-controls',tabs.id);
  button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg>`;
  button.addEventListener('click',()=>{if(!mobile.matches||tabs.inert)return;const items=[...tabs.querySelectorAll('[role=tab]')],index=items.findIndex(tab=>tab.getAttribute('aria-selected')==='true');items[index+direction]?.click();});
 }
 tabs.before(rail);rail.append(previous,tabs,next);
 function revealTab(){if(!mobile.matches)return;const tab=tabs.querySelector('[aria-selected="true"]');if(!tab)return;const r=tab.getBoundingClientRect(),v=tabs.getBoundingClientRect();if(r.left<v.left||r.right>v.right)tabs.scrollLeft+=r.left-v.left-(v.width-r.width)/2;}
 function updateNavigation(){const items=[...tabs.querySelectorAll('[role=tab]')],index=items.findIndex(tab=>tab.getAttribute('aria-selected')==='true');for(const[button,target,fallback]of [[previous,items[index-1],'Aba anterior'],[next,items[index+1],'Próxima aba']]){button.disabled=!target||tabs.inert;const label=target?'Ir para '+target.textContent.trim():fallback;button.setAttribute('aria-label',label);button.title=label;}revealTab();}
 new MutationObserver(updateNavigation).observe(tabs,{subtree:true,attributes:true,attributeFilter:['aria-selected','inert']});
 let width=0;
 function fit(){const v=window.visualViewport;document.documentElement.style.setProperty('--mobile-visible-height',`${v?.height||innerHeight}px`);document.documentElement.style.setProperty('--mobile-visible-top',`${v?.offsetTop||0}px`);}
 // A viewport scroll must not pull the tab strip back while the player browses it.
 new ResizeObserver(()=>{if(tabs.clientWidth!==width){width=tabs.clientWidth;revealTab();}}).observe(tabs);
 updateNavigation();fit();mobile.addEventListener('change',updateNavigation);addEventListener('resize',fit);window.visualViewport?.addEventListener('resize',fit);window.visualViewport?.addEventListener('scroll',fit);
})();
