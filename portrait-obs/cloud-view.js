/* Unauthenticated, read-only capability view; never accesses character tables. */
(() => {'use strict';
 const config=window.FichaV2AccountConfig,token=new URLSearchParams(location.hash.slice(1)).get('token'),renderer=window.PortraitRenderer;
 let cursor=null,revision=null,imageRevision=null,state=null,pending=false,wait=1000;
 addEventListener('hashchange',()=>location.reload());
 const placeholder=new URL('../assets/portrait.svg',location.href).href;
 function message(text){if(state)return;document.getElementById('connection-message').textContent=text;document.getElementById('connection-message').hidden=false;}
 async function poll(){if(pending)return;pending=true;try{
  if(!/^[a-f0-9]{64}$/.test(token||'')){message('Endereço de Portrait inválido. Copie novamente o link na ficha.');return;}
  const response=await fetch(config.url+'/rest/v1/rpc/portrait_view',{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_token:token,p_cursor:cursor,p_revision:revision,p_image_revision:imageRevision}),signal:AbortSignal.timeout(5000),cache:'no-store'});if(!response.ok)throw Error('Conexão indisponível');const data=await response.json();
  if(!data){state=null;document.getElementById('portrait').hidden=true;document.getElementById('pn-meter').hidden=true;message('Este link foi renovado ou não está disponível. Peça o link atual ao jogador.');cursor=null;revision=null;imageRevision=null;wait=5000;return;}
  document.documentElement.dataset.connection='online';wait=1000;
  if(data.state){state={...state,...data.state};if(!state.portraitImage)state.portraitImage=placeholder;renderer.render({state,revision:data.revision});}
  if(!data.ready)message('Aguardando o jogador abrir a ficha.');
  for(const packet of data.rolls||[]){for(const key of Object.keys(packet))if(packet[key]===null)delete packet[key];renderer.receive(packet);}
  cursor=data.cursor;revision=data.revision;imageRevision=data.imageRevision;
 }catch{document.documentElement.dataset.connection='offline';cursor=null;wait=Math.min(10000,wait*2);message('Reconectando ao Portrait…');}finally{pending=false;setTimeout(poll,wait);}}
 message('Conectando ao Portrait online…');void poll();
})();
