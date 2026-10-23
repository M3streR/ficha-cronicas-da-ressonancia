const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=process.env.CANDIDATE_DIR||'/tmp/cronicas-official-candidate-v4';
async function runtime(url,patch={}){
 const calls=[],window={supabase:{createClient:(...args)=>{calls.push(args);return{auth:{onAuthStateChange(){},initialize:async()=>({})}};}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'account-auth/config.js'),'utf8'),{window,Object});window.FichaV2AccountConfig={...window.FichaV2AccountConfig,...patch};
 const context={window,location:new URL(url),URL,URLSearchParams,AbortSignal,history:{replaceState(){}},fetch:async()=>({ok:true,json:async()=>({external:{email:true,google:true}})})};
 vm.runInNewContext(fs.readFileSync(path.join(root,'account-auth/runtime.js'),'utf8'),context);await window.FichaV2AccountRuntime.ready;return{api:window.FichaV2AccountRuntime,calls};
}
test('official auth pins the project, preserves session storage and uses confirmed callbacks',async()=>{
 for(const base of ['https://m3strer.github.io/ficha-cronicas-da-ressonancia/','https://ficha-cronicas-da-ressonancia.vercel.app/'])for(const file of ['index.html','ficha.html','engine/index.html']){
  const {api,calls}=await runtime(base+file);assert(api.configured);assert(api.availability.google);assert(api.dataEnabled);assert.equal(api.storageKey,'cronicasRessonanciaSupabaseAuth');assert.equal(api.redirectTo,base+'index.html?account=1');assert.equal(calls[0][0],'https://gejpqmrystvzezscmmkg.supabase.co');
  await assert.rejects(calls[0][2].global.fetch('https://wxsmcocvjiqkajajolpn.supabase.co/auth/v1/user'),/NOT_ALLOWED/);
 }
});
test('official credentials cannot be enabled on local, foreign or neighbouring preview pages',async()=>{
 for(const url of ['http://localhost:8767/index.html','https://example.invalid/index.html','https://m3strer.github.io/ficha-cronicas-da-ressonancia/preview/ficha-v2/index.html'])assert.equal((await runtime(url)).api.configured,false);
 assert.equal((await runtime('https://ficha-cronicas-da-ressonancia.vercel.app/',{projectRef:'wxsmcocvjiqkajajolpn'})).api.configured,false);
});
