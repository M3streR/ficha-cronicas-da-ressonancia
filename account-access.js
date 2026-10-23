/* Manager-only account presentation; no independent identity or character store. */
(() => {'use strict';
 const markup=`<div class="account-access" aria-label="Acesso a Crônicas da Ressonância">
 <header class="cr-header">
  <div class="cr-brand"><span class="cr-emblem" aria-hidden="true"></span><div><div class="cr-brand-name">Crônicas da Ressonância</div><span class="cr-brand-caption">Histórias que ecoam entre mundos</span></div></div>
  <span class="cr-preview-label">ACESSO À CONTA</span><button type="button" class="cr-close" aria-label="Fechar" data-access-close>×</button>
 </header>
 <div class="cr-layout">
  <div class="cr-scenery" aria-hidden="true"><div class="cr-moon"></div><div class="cr-orbit"></div><div class="cr-mountains"></div><div class="cr-mountains cr-near"></div><div class="cr-castle"><i></i><i></i><i></i><i></i><i></i></div></div>
  <section class="cr-story"><div class="cr-kicker">Seu próximo capítulo</div><h1>Toda história<br>começa com<br><span>uma conexão.</span></h1><p>Seus personagens, suas Crônicas.<br>Um universo para continuar criando.</p><div class="cr-story-foot">◇ &nbsp; ENTRE MUNDOS E HISTÓRIAS</div></section>
  <section class="cr-panel" aria-label="Acesso à conta">
   <div data-view="login">
    <h2 class="cr-section-title" data-title>Bem-vindo de volta</h2><p class="cr-subtitle">Entre para continuar sua história.</p>
    <button class="cr-provider" type="button" data-provider="Google"><span class="cr-google-letter" aria-hidden="true">G</span>Continuar com Google</button>
    <div class="cr-separator">ou entre com seu e-mail</div>
    <form data-form="login">
     <div class="cr-field"><label class="cr-label" for="cr-login-email">E-mail</label><input id="cr-login-email" name="email" type="email" placeholder="voce@exemplo.com" autocomplete="email" required maxlength="320"></div>
     <div class="cr-field"><label class="cr-label" for="cr-login-password">Senha</label><div class="cr-password"><input id="cr-login-password" name="password" type="password" placeholder="Sua senha" autocomplete="current-password" required minlength="6" maxlength="256"><button class="cr-eye" type="button" aria-label="Mostrar senha" data-eye="cr-login-password"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>
     <div class="cr-forgot-row"><button class="cr-link" type="button" data-screen="reset">Esqueceu sua senha?</button></div>
     <button class="cr-main-button" type="submit">Entrar <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button>
    </form>
    <p class="cr-signup-line">Sua história começa aqui.<button class="cr-link" type="button" data-screen="signup">Criar conta</button></p>
    <button class="cr-local" type="button" data-access-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>Continuar no modo local</button>
   </div>
   <div data-view="reset" hidden>
    <button class="cr-link cr-back" type="button" data-screen="login"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m5-5-5 5 5 5"/></svg>Voltar para entrar</button>
    <div class="cr-recovery-symbol"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="15" cy="8" r="5"/><path d="m11 12-8 8v2h4v-3h3v-3l3-3"/></svg></div>
    <h2 class="cr-section-title">Recuperar acesso</h2><p class="cr-subtitle">Informe seu e-mail para receber um link de redefinição de senha.</p>
    <form data-form="reset"><div class="cr-field"><label class="cr-label" for="cr-reset-email">E-mail da conta</label><input id="cr-reset-email" name="email" type="email" placeholder="voce@exemplo.com" autocomplete="email" required maxlength="320"></div><button class="cr-main-button" type="submit">Enviar link de recuperação<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button></form>
   </div>
   <div data-view="signup" hidden>
    <button class="cr-link cr-back" type="button" data-screen="login"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m5-5-5 5 5 5"/></svg>Já tenho uma conta</button>
    <h2 class="cr-section-title">Comece sua história</h2><p class="cr-subtitle">Crie sua conta em Crônicas da Ressonância.</p>
    <button class="cr-provider" type="button" data-provider="Google"><span class="cr-google-letter" aria-hidden="true">G</span>Continuar com Google</button><div class="cr-separator">ou cadastre seu e-mail</div>
    <form data-form="signup"><div class="cr-field"><label class="cr-label" for="cr-signup-name">Como quer ser chamado?</label><input id="cr-signup-name" name="displayName" placeholder="Seu nome (opcional)" autocomplete="nickname" maxlength="80"></div><div class="cr-field"><label class="cr-label" for="cr-signup-email">E-mail</label><input id="cr-signup-email" name="email" type="email" placeholder="voce@exemplo.com" autocomplete="email" required maxlength="320"></div><div class="cr-field"><label class="cr-label" for="cr-signup-password">Crie uma senha</label><div class="cr-password"><input id="cr-signup-password" name="password" type="password" placeholder="Sua nova senha" autocomplete="new-password" required minlength="6" maxlength="256"><button class="cr-eye" type="button" aria-label="Mostrar senha" data-eye="cr-signup-password"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div><button class="cr-main-button" type="submit">Criar minha conta<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button></form>
   </div>
<div data-view="new-password" hidden><div class="cr-recovery-symbol cr-new-password-symbol"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="15" cy="8" r="5"/><path d="m11 12-8 8v2h4v-3h3v-3l3-3"/></svg></div><h2 class="cr-section-title">Definir nova senha</h2><p class="cr-subtitle">Escolha uma nova senha para recuperar o acesso à sua conta.</p><form data-form="new-password"><div class="cr-field"><label class="cr-label" for="cr-new-password">Nova senha</label><div class="cr-password"><input id="cr-new-password" name="password" type="password" required minlength="6" maxlength="256" autocomplete="new-password"><button class="cr-eye" type="button" data-eye="cr-new-password" aria-label="Mostrar senha"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div><p class="cr-form-hint">Use entre 6 e 256 caracteres.</p></div><div class="cr-field"><label class="cr-label" for="cr-confirm-password">Confirmar nova senha</label><input id="cr-confirm-password" name="confirmation" type="password" required minlength="6" maxlength="256" autocomplete="new-password"></div><button class="cr-main-button" type="submit">Salvar nova senha <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button></form></div>
   <button class="cr-link cr-resend" type="button" data-resend hidden>Reenviar e-mail de confirmação</button>
   <p class="cr-notice" role="status" aria-live="polite" hidden></p>
  </section>
 </div>
 <footer class="cr-bottom"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/></svg><span data-availability>Modo local disponível</span></footer>
</div>`;
 const controllers=new WeakMap();
 const localMessage='O acesso online ainda não está configurado neste site. Você pode continuar no modo local.';
 function release(dialog){controllers.get(dialog)?.dispose();}
 function render({dialog,shell,auth,availability={},close,setPending=()=>{},mode='login',onRecovered=()=>{},initialMessage=''}){
  release(dialog);shell.innerHTML=markup;const root=shell.querySelector('.account-access'),feedback=root.querySelector('.cr-notice'),resend=root.querySelector('[data-resend]');
  let view=mode==='new-password'?'new-password':'login',busy=false,disposed=false,emailDraft='';
  const labels=new Map([...root.querySelectorAll('.cr-main-button')].map(b=>[b,b.innerHTML]));
  root.querySelector('[data-availability]').textContent=availability.emailPassword?(availability.dataSync?'Personagens e Crônicas · compartilhamento pelas ações online da ficha.':'Personagens locais disponíveis neste navegador.'):'Acesso online em preparação · modo local disponível';
  function clearPasswords(){for(const input of root.querySelectorAll('input[type=password],input[data-secret]')){input.value='';input.type='password';}for(const button of root.querySelectorAll('[data-eye]'))button.setAttribute('aria-label','Mostrar senha');}
  for(const input of root.querySelectorAll('input[type=password]'))input.dataset.secret='true';
  function message(text,kind=''){feedback.textContent=text;feedback.dataset.kind=kind;feedback.hidden=!text;}
  function show(next,{focus=true}={}){
   const field=root.querySelector(`[data-view="${view}"] input[type=email]`);if(field?.value)emailDraft=field.value.trim();clearPasswords();view=next;message('');resend.hidden=true;
   root.querySelectorAll('[data-view]').forEach(panel=>{panel.hidden=panel.dataset.view!==view;panel.querySelector('h2')?.removeAttribute('id');});const current=root.querySelector(`[data-view="${view}"]`);current.querySelector('h2').id='accountDialogTitle';root.querySelectorAll('[autofocus]').forEach(input=>input.removeAttribute('autofocus'));current.querySelector('input')?.setAttribute('autofocus','');
   const email=current.querySelector('input[type=email]');if(email&&emailDraft)email.value=emailDraft;
   dialog.setAttribute('aria-labelledby','accountDialogTitle');
   if(focus)requestAnimationFrame(()=>{if(!disposed&&dialog.open)(current.querySelector('input')||current.querySelector('button'))?.focus({preventScroll:true});});
  }
  function pending(value){busy=value;setPending(value);root.setAttribute('aria-busy',String(value));root.querySelectorAll('button,input').forEach(el=>el.disabled=value);for(const[b,html]of labels)b.innerHTML=html;}
  function available(capability){if(availability[capability]===true)return true;clearPasswords();if(availability.staging&&['registration','passwordRecovery'].includes(capability)){message('Os links de confirmação e recuperação ainda precisam ser configurados para este site. O modo local continua disponível.','error');return false;}message(capability==='google'?'O login com Google ainda não foi configurado neste site. Seus dados locais permanecem disponíveis.':localMessage,'error');return false;}
  function errorMessage(error){const code=String(error?.code||''),text=String(error?.message||'').toLowerCase();
   if(text.includes('staging_not_configured'))return localMessage;
   if(text.includes('invalid login credentials')||code==='invalid_credentials')return 'E-mail ou senha incorretos. Confira os dados e tente novamente.';
   if(text.includes('email not confirmed')||code==='email_not_confirmed'){resend.hidden=false;return 'Confirme seu e-mail antes de entrar. Você pode reenviar a confirmação abaixo.';}
   if(text.includes('rate limit')||code.includes('rate_limit'))return 'Muitas tentativas em pouco tempo. Aguarde um pouco e tente novamente.';
   if(text.includes('expired')||code.includes('expired')||text.includes('invalid token'))return 'Este link expirou ou já foi utilizado. Solicite um novo link em “Esqueceu sua senha?”.';
   if(text.includes('network')||text.includes('fetch')||text.includes('timeout'))return 'Não foi possível conectar ao serviço. Confira sua conexão e tente novamente.';
   if(text.includes('user already registered'))return 'Não foi possível criar a conta. Tente entrar ou recuperar seu acesso.';
   if(text.includes('weak_password')||text.includes('password'))return 'A senha não atende aos requisitos. Revise e tente novamente.';
   return 'Não foi possível concluir esta ação. Tente novamente em instantes.';
  }
  async function operation(action,work){if(busy||disposed)return;pending(true);message('');const button=root.querySelector(`[data-view="${view}"] .cr-main-button`);if(button)button.textContent=action;let timer;
   try{const result=await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),20000);})]);if(disposed)return;return {ok:true,result};}catch(error){if(!disposed)message(errorMessage(error),'error');return{ok:false};}finally{clearTimeout(timer);clearPasswords();if(!disposed)pending(false);}
  }
  function validEmail(input){if(input?.value&&input.checkValidity())return true;message('Informe um e-mail válido.','error');input?.focus();return false;}
  function finishClose(){close();if(!dialog.open)dispose();}
  async function submit(event){event.preventDefault();if(busy||disposed)return;const form=event.target,kind=form.dataset.form;if(!kind)return;const email=form.querySelector('[name=email]'),password=form.querySelector('[name=password]');if(email&&!validEmail(email))return;if(password&&(password.value.length<6||password.value.length>256)){message('Use uma senha com 6 a 256 caracteres.','error');password.focus();return;}
   if(kind==='new-password'){
    if(password.value!==form.querySelector('[name=confirmation]').value){message('As senhas não coincidem. Digite a mesma senha nos dois campos.','error');return;}
    if(!available('passwordUpdate'))return;const secret=password.value;const result=await operation('Salvando…',()=>auth.changePassword(secret));if(result?.ok&&!disposed){onRecovered();message('Senha atualizada. Seu acesso foi recuperado.','success');form.hidden=true;const back=document.createElement('button');back.type='button';back.className='cr-main-button';back.dataset.accessClose='';back.textContent='Voltar aos Personagens';form.after(back);}return;
   }
   emailDraft=email.value.trim();
   if(kind==='reset'){
    if(!available('passwordRecovery'))return;const result=await operation('Enviando…',()=>auth.requestPasswordReset(emailDraft));if(result?.ok&&!disposed)message('Se houver uma conta para este e-mail, você receberá um link para definir uma nova senha. Confira também a pasta de spam.','success');return;
   }
   const displayName=form.querySelector('[name=displayName]')?.value.trim()||'';
   if(displayName&&(displayName.length<2||displayName.length>80)){message('Use entre 2 e 80 caracteres para o nome público.','error');return;}
   if(!available(kind==='signup'&&'registration' in availability?'registration':'emailPassword'))return;const secret=password.value;const result=await operation(kind==='signup'?'Criando conta…':'Entrando…',()=>kind==='signup'?auth.signUp(emailDraft,secret,{displayName}):auth.signIn(emailDraft,secret));if(!result?.ok||disposed)return;
   if(kind==='signup'&&!result.result?.session){show('login');message('Conta criada. Confira seu e-mail para confirmar o cadastro antes de entrar.','success');resend.hidden=false;}else finishClose();
  }
  async function click(event){const b=event.target.closest('button');if(!b||busy||disposed)return;
   if(b.hasAttribute('data-access-close')){finishClose();return;}
   if(b.dataset.screen){show(b.dataset.screen);return;}
   if(b.dataset.eye){const input=root.querySelector('#'+b.dataset.eye);input.type=input.type==='password'?'text':'password';b.setAttribute('aria-label',input.type==='password'?'Mostrar senha':'Ocultar senha');return;}
   if(b.dataset.provider){if(!available('google'))return;const result=await operation('Abrindo Google…',()=>auth.signInWithGoogle());if(result?.ok&&!disposed)message('Continue na janela do Google para concluir o acesso.');return;}
   if(b.hasAttribute('data-resend')){const input=root.querySelector('#cr-login-email');if(!validEmail(input)||!available('emailPassword'))return;const result=await operation('Enviando…',()=>auth.resendSignupConfirmation(input.value.trim()));if(result?.ok&&!disposed)message('Se a confirmação estiver pendente, um novo link será enviado. Use o e-mail mais recente.','success');}
  }
  function dispose(){if(disposed)return;disposed=true;clearPasswords();root.querySelectorAll('input').forEach(input=>input.value='');setPending(false);root.removeEventListener('click',click);root.removeEventListener('submit',submit);dialog.removeEventListener('close',onClose);if(controllers.get(dialog)?.dispose===dispose)controllers.delete(dialog);}
  function onClose(){if(!dialog.open)dispose();}
  root.addEventListener('click',click);root.addEventListener('submit',submit);root.querySelectorAll('form').forEach(form=>form.noValidate=true);dialog.addEventListener('close',onClose);controllers.set(dialog,{dispose});show(view,{focus:false});if(initialMessage)message(initialMessage,'error');return{dispose};
 }
 window.FichaV2AccountAccess=Object.freeze({render,release});
})();
