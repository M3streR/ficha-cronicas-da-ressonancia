/* One-time, on-device snapshot before the new UI opens official stores.
   Never sends records, photos, notes or authentication tokens to a server. */
(() => {'use strict';
 const release='ficha-v2-2026-10',backupDb='cronicasRessonanciaReleaseBackups';
 const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const complete=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('BACKUP_TRANSACTION_ABORTED'));tx.onerror=()=>{};});
 async function readExisting(name){
  return new Promise((resolve,reject)=>{const r=indexedDB.open(name);let missing=false;
   r.onupgradeneeded=event=>{if(event.oldVersion===0){missing=true;r.transaction.abort();}};
   r.onerror=()=>missing?resolve(null):reject(r.error);
   r.onblocked=()=>reject(Error('Feche outras abas antigas da ficha para criar a cópia de segurança.'));
   r.onsuccess=async()=>{const db=r.result;try{const names=[...db.objectStoreNames],stores={};if(names.length){const tx=db.transaction(names,'readonly'),done=complete(tx);await Promise.all(names.map(async name=>{const store=tx.objectStore(name),[keys,values]=await Promise.all([request(store.getAllKeys()),request(store.getAll())]);stores[name]=keys.map((key,index)=>({key,value:values[index]}));}));await done;}resolve({name,version:db.version,stores});}catch(e){reject(e);}finally{db.close();}};
  });
 }
 const ready=(async()=>{
  const r=indexedDB.open(backupDb,1);r.onupgradeneeded=()=>r.result.createObjectStore('releases');const db=await request(r);
  try{
   let tx=db.transaction('releases','readonly'),done=complete(tx),previous=await request(tx.objectStore('releases').get(release));await done;if(previous)return;
   const databases=await Promise.all(['cronicasRessonanciaCharacters','cronicasRessonanciaChronicles'].map(readExisting));
   const local={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith('cronicasRessonancia')&&!/auth|token|password/i.test(key))local[key]=localStorage.getItem(key);}
   const value={release,createdAt:new Date().toISOString(),origin:location.origin,localStorage:local,databases:databases.filter(Boolean)};
   tx=db.transaction('releases','readwrite');done=complete(tx);const store=tx.objectStore('releases');previous=await request(store.get(release));if(!previous)store.add(value,release);await done;
  }finally{db.close();}
 })();
 // Attach a handler immediately: initialization below remains authoritative.
 ready.catch(error=>console.error('Cópia local de segurança não confirmada:',error));
 const original=window.CharacterStorage;
 window.CharacterStorage=Object.freeze({...original,initialize:()=>ready.then(()=>original.initialize())});
 window.CronicasReleaseBackupReady=ready;
})();
