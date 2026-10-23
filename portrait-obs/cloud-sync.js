/* Optional online display output. Character state and dice stay in the original engine. */
(() => {'use strict';
 const moduleUrl=document.currentScript.src,entries=new Map(),publisher=crypto.randomUUID();let sequence=0;
 const engineWindow=()=>document.querySelector('#complete-engine')?.contentWindow;
 async function account(){await window.FichaV2Bridge?.ready;const w=engineWindow(),runtime=w?.FichaV2AccountRuntime;await runtime?.ready;if(!runtime?.dataEnabled||!w.FichaV2AccountConfig?.portraitCloudEnabled)return null;await w.CronicasAccount.ready;const session=await w.CronicasAccount.getSession();return session?.user?{id:session.user.id,client:runtime.client}:null;}
 async function rpc(a,name,args){const {data,error}=await a.client.rpc(name,args).abortSignal(AbortSignal.timeout(6000));if(error)throw Error(error.code==='42501'?'Entre na sua conta para compartilhar o Portrait.':error.message);return data;}
 function notify(e,online,error=''){e.online=online;e.error=error;window.dispatchEvent(new CustomEvent('portrait:cloud-connection',{detail:{characterId:e.id,online,error}}));}
 function get(id){let e=entries.get(id);if(!e){e={id,epoch:Date.now()+performance.now()%1,owner:null,share:null,serial:'',sent:'',photo:undefined,sentPhoto:undefined,events:[],seen:new Set(),busy:null,enabled:false};entries.set(id,e);}return e;}
 async function imageData(value){if(!value)return '';const image=new Image();image.src=value;await image.decode();const scale=Math.min(1,1024/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const result=canvas.toDataURL('image/webp',.9);if(result.length>2500000)throw Error('Imagem muito grande para o Portrait online. A imagem original da ficha foi preservada.');return result;}
 async function pump(e){if(e.busy)return e.busy;if(!e.enabled||!e.state)return;e.busy=(async()=>{try{
  const a=await account();if(!a){notify(e,false,'Entre na conta para enviar este Portrait pela internet.');return;}
  if(e.owner!==a.id){if(e.owner){e.events=[];e.seen.clear();}e.owner=a.id;e.epoch=Date.now()+performance.now()%1;e.share=null;e.sent='';e.sentPhoto=undefined;}
  if(!e.share)e.share=await rpc(a,'portrait_open',{p_local_id:e.id});
  while(e.enabled&&(e.serial!==e.sent||e.photo!==e.sentPhoto)){const serial=e.serial,photo=e.photo,state=JSON.parse(serial);let image=null;if(photo!==e.sentPhoto){if(e.compressedSource!==photo){e.compressed=await imageData(photo);e.compressedSource=photo;}image=e.compressed;}
   await rpc(a,'portrait_publish',{p_local_id:e.id,p_state:state,p_image:image,p_sync:{publisher,epoch:e.epoch,sequence:++sequence}});e.sent=serial;e.sentPhoto=photo;notify(e,true);
  }
  while(e.events.length){const event=e.events[0];if(Date.now()-event.at>10000){e.events.shift();continue;}await rpc(a,'portrait_roll',{p_local_id:e.id,p_record:event.record});e.events.shift();}
 }catch(error){notify(e,false,error.message);}finally{e.busy=null;}})();return e.busy;}
 function observe(id,raw,enabled=true){if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)||!raw?.fields)return;const e=get(id);if(enabled&&!e.enabled)e.epoch=Date.now()+performance.now()%1;e.enabled=enabled;if(!enabled)return;const f=raw.fields,state={name:String(f.nome||'Sem nome')};for(const key of ['pv','pn','ps'])state[key]={current:Number(f[key+'Atual']),max:Number(f[key+'Max'])};const photo=raw.photo||'';e.state=state;e.photo=photo;const serial=JSON.stringify(state);if(e.photoMarker!==photo){e.sent='';e.photoMarker=photo;}e.serial=serial;void pump(e);}
 function roll(record){if(!record?.result||!record.id)return;const e=entries.get(record.characterId);if(!e?.enabled||e.seen.has(record.id))return;e.seen.add(record.id);if(e.seen.size>1000)e.seen.delete(e.seen.values().next().value);if(e.events.length>=64)e.events.shift();e.events.push({record:JSON.parse(JSON.stringify(record)),at:Date.now()});void pump(e);}
 async function share(id,raw,enabled){observe(id,raw,enabled);const e=get(id);await pump(e);if(e.busy)await e.busy;if(!e.share||!e.online)throw Error(e.error||'Aguarde a ficha editora enviar o Portrait online.');const url=new URL('remote.html',moduleUrl);url.hash=new URLSearchParams({token:e.share.token});return url.href;}
 async function rotate(id){const e=get(id),a=await account();if(!a)throw Error('Entre na sua conta.');const data=await rpc(a,'portrait_rotate',{p_local_id:id});e.share={...e.share,token:data.token};const url=new URL('remote.html',moduleUrl);url.hash=new URLSearchParams({token:data.token});return url.href;}
 setInterval(()=>{for(const e of entries.values())if(e.enabled&&(e.serial!==e.sent||e.photo!==e.sentPhoto||e.events.length))void pump(e);},1500);
 window.FichaV2PortraitCloud=Object.freeze({available:async()=>Boolean(await account()),observe,roll,share,rotate});
})();
