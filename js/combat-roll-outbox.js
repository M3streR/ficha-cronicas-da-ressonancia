(function(global){
 'use strict';
 const prefix='fichaV2EnemyRollPending:';
 let running=false;
 async function scope(){const u=await global.CronicasSupabase.getUser();if(!u)throw Error('Entre novamente para compartilhar.');return {id:u.id,key:prefix+(global.FichaV2AccountConfig?.projectRef || 'local')+':'+u.id};}
 function read(key){const legacy=JSON.parse(global.localStorage.getItem(key)||'[]');if(!Array.isArray(legacy))throw Error('Fila de rolagens inválida.');for(const item of legacy)global.localStorage.setItem(key+':'+item.record.id,JSON.stringify(item));if(legacy.length)global.localStorage.removeItem(key);return Object.keys(global.localStorage).filter(k=>k.startsWith(key+':')).map(k=>JSON.parse(global.localStorage.getItem(k)));}
 function write(key,item){global.localStorage.setItem(key+':'+item.record.id,JSON.stringify(item));}
 async function commit(item,owner){
  const user=await global.CronicasSupabase.getUser();if(user?.id!==owner.id)throw Error('A conta mudou. O envio continua reservado à conta original.');
  const {error}=await global.CronicasSupabase.client.rpc('append_adversary_roll',{p_id:item.record.id,p_confrontation_id:item.combatId,p_adversary_id:item.enemyId,p_record:item.record});
  if(error)throw error;
  global.localStorage.removeItem(owner.key+':'+item.record.id);
 }
 async function send(record,combatId,enemyId){
  const owner=await scope(),item={record,combatId,enemyId};
  write(owner.key,item);
  try{await commit(item,owner);return {pending:false};}catch(error){global.showNotification?.('Resultado preservado. O compartilhamento está pendente; use Reenviar pendentes.','warning');return {pending:true};}
 }
 async function retry(){if(running)return;running=true;try{const owner=await scope();for(const item of read(owner.key)){try{await commit(item,owner);}catch(_){/* Preserve original context and continue other independent events. */}}}finally{running=false;}}
 async function count(){try{const owner=await scope();return read(owner.key).length;}catch(_){return 0;}}
 global.CombatRollOutbox=Object.freeze({send,retry,count});
})(window);
