/* Pinned staging-only transport. Data features require an explicit validated flag. */
(() => {
  'use strict';
  const config=window.FichaV2AccountConfig;
  const production=config?.environment==='production';
  const PROJECT=production?'gejpqmrystvzezscmmkg':'wxsmcocvjiqkajajolpn';
  const local=['127.0.0.1','localhost','[::1]'].includes(location.hostname);
  // A public preview must opt in to one exact HTTPS base, including its path.
  // Copying the files to another host or the official site's neighbouring path
  // must never enable authentication there implicitly.
  let previewBase=null;
  try {
    const sites=production?config.productionSites:[config?.hostedPreview];
    for(const site of sites||[]){const value=site?.baseUrl;if(value){const candidate=new URL(value);if(candidate.protocol==='https:'&&!candidate.username&&!candidate.password&&!candidate.search&&!candidate.hash&&candidate.href.endsWith('/')&&!/[ *]/.test(value)&&!['localhost','127.0.0.1','[::1]'].includes(candidate.hostname)&&new URL(location.href).origin===candidate.origin&&new URL(location.href).pathname.startsWith(candidate.pathname)){previewBase=candidate;break;}}}
  } catch { /* Invalid optional configuration keeps hosted access disabled. */ }
  const currentUrl=new URL(location.href);
  const hosted=Boolean(previewBase&&currentUrl.origin===previewBase.origin&&['','index.html','ficha.html','engine/index.html'].some(file=>currentUrl.pathname===previewBase.pathname+file));
  const redirectsConfirmed=production?hosted&&config?.productionSites?.find(site=>site.baseUrl===previewBase?.href)?.redirectsConfirmed===true:local?config?.redirectsConfirmed===true:hosted&&config?.hostedPreview?.redirectsConfirmed===true;
  const configured=((local&&!production)||hosted)&&['staging','production'].includes(config?.environment)&&config.projectRef===PROJECT
    &&config.url===`https://${PROJECT}.supabase.co`
    &&/^sb_publishable_[\w-]+$/.test(config.publishableKey||'')
    &&typeof window.supabase?.createClient==='function';
  let callbackError='',recovery=false,settings=null,settingsError='';
  const availability=Object.freeze({
    environment:production?'production':'staging',
    staging:configured,
    dataSync:configured&&config.dataSyncEnabled===true,
    get emailPassword(){return configured&&settings?.external?.email===true;},
    get registration(){return configured&&redirectsConfirmed&&settings?.external?.email===true;},
    get passwordRecovery(){return configured&&redirectsConfirmed&&settings?.external?.email===true;},
    get passwordUpdate(){return configured;},
    get google(){return configured&&redirectsConfirmed&&settings?.external?.google===true;}
  });
  const callback=hosted?new URL('index.html',previewBase):new URL(location.href);
  callback.pathname=callback.pathname.replace(/\/engine\/index\.html$/, '/index.html');
  callback.search='?account=1';callback.hash='';
  const redirectTo=callback.href;
  const storageKey=production?'cronicasRessonanciaSupabaseAuth':`fichaV2Account:${PROJECT}`;
  const callbackParams=new URLSearchParams(location.hash.slice(1));
  const incoming=new URL(location.href);
  if(incoming.searchParams.has('error')||callbackParams.has('error'))callbackError='AUTH_CALLBACK_FAILED';
  async function authFetch(input,init){
    const target=new URL(typeof input==='string'?input:input.url);
    const paths=config.dataSyncEnabled===true?['/auth/v1/','/rest/v1/','/storage/v1/','/functions/v1/']:['/auth/v1/'];
    if(target.origin!==config.url||!paths.some(prefix=>target.pathname.startsWith(prefix)))throw Error('ACCOUNT_TRANSPORT_NOT_ALLOWED');
    return fetch(input,init);
  }
  const client=configured?window.supabase.createClient(config.url,config.publishableKey,{
    auth:{storageKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},
    global:{fetch:authFetch}
  }):null;
  // Subscribe immediately; the SDK may recover a session while the page is loading.
  client?.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')recovery=true;});
  const ready=(async()=>{
    if(!client)return;
    try{
      const response=await authFetch(`${config.url}/auth/v1/settings`,{headers:{apikey:config.publishableKey},signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('AUTH_SETTINGS_UNAVAILABLE');
      settings=await response.json();
    }catch{settingsError='Não foi possível verificar o serviço de acesso. Tente recarregar a página.';}
    try{const {error}=await client.auth.initialize();if(error)callbackError=error.code||'AUTH_CALLBACK_FAILED';}
    catch{callbackError='AUTH_CALLBACK_FAILED';}
    // Codes/tokens/errors must not survive in browser history or an exported URL.
    const clean=new URL(location.href);
    for(const key of ['code','error','error_code','error_description','sb_flow_id'])clean.searchParams.delete(key);
    if(callbackError||recovery||callbackParams.has('access_token')||callbackParams.has('error'))clean.hash='';
    if(clean.href!==location.href)history.replaceState(history.state,'',clean.href);
  })();
  window.FichaV2AccountRuntime=Object.freeze({configured,client,availability,ready,redirectTo,storageKey,hosted,
    dataEnabled:configured&&config.dataSyncEnabled===true,
    get recovery(){return recovery;},get callbackError(){return callbackError;},get settingsError(){return settingsError;}
  });
})();
