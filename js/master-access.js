(function (global) {
  'use strict';
  // Casual local UI barrier only. IndexedDB content is NOT encrypted or authorized by a server.
  const IDLE_MS = 30 * 60 * 1000;
  const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  async function derive(password, salt) {
    if (!global.crypto?.subtle) throw new Error('CRYPTO_UNAVAILABLE');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256',
      iterations: 600000, salt: Uint8Array.from(salt.match(/../g), value => parseInt(value, 16)) }, key, 256)));
  }
  const equal = (a,b) => { let difference = a.length ^ b.length; for (let i=0;i<a.length;i++) difference |= a.charCodeAt(i) ^ (b.charCodeAt(i)||0); return difference === 0; };
  function create({ host, storage, confirm, onUnlock, onLock, isBusy }) {
    let id = null, epoch = 0, config = null, unlocked = false, pending = false, timer, touchedAt = 0;
    const form = document.createElement('form'); form.className = 'master-access-form'; form.noValidate = true;
    const title = document.createElement('h3'); title.tabIndex = -1;
    const warning = document.createElement('p'); warning.textContent = 'Proteção local contra acesso casual. Não é autenticação segura: os dados deste navegador não são criptografados.';
    function field(text, autocomplete) {
      const label = document.createElement('label'); label.textContent = text;
      const input = document.createElement('input'); input.type = 'password'; input.autocomplete = autocomplete; input.required = true;
      label.append(input); form.append(label); return { label, input };
    }
    form.append(title, warning);
    const password = field('Senha do Escudo', 'current-password'), repeat = field('Confirmar senha', 'new-password');
    const feedback = document.createElement('p'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'btn';
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'btn secondary'; reset.textContent = 'Redefinir senha local';
    form.append(feedback, submit, reset); host.replaceChildren(form);
    const message = text => { feedback.textContent = text; };
    function paint() {
      title.textContent = config ? 'Desbloquear Escudo' : 'Definir senha local';
      repeat.label.hidden = Boolean(config); repeat.input.required = !config;
      password.input.autocomplete = config ? 'current-password' : 'new-password';
      submit.textContent = config ? 'Desbloquear' : 'Definir senha e entrar';
      reset.hidden = !config; host.hidden = unlocked;
      form.querySelectorAll('button,input').forEach(node => { node.disabled = pending; });
    }
    function touch() {
      if (!unlocked) return;
      touchedAt = Date.now(); clearTimeout(timer); timer = setTimeout(expire, IDLE_MS);
    }
    function expire() {
      if (!unlocked) return;
      if (isBusy()) { timer = setTimeout(expire, 1000); return; }
      if (Date.now() - touchedAt >= IDLE_MS) lock('Escudo bloqueado por inatividade. Rascunhos foram preservados nesta aba.');
    }
    function lock(reason = 'Escudo bloqueado. Rascunhos permanecem nesta aba até sair ou recarregar.') {
      if (!id || pending) return;
      if (isBusy()) { message('Aguarde o salvamento antes de bloquear.'); return; }
      unlocked = false; ++epoch; clearTimeout(timer); password.input.value = ''; repeat.input.value = '';
      onLock(); paint(); message(reason); password.input.focus();
    }
    async function open(chronicleId) {
      close(); id = chronicleId; const token = epoch; pending = true; paint(); message('Verificando acesso local…');
      try { const loaded = await storage().getMasterAccess(id); if (token !== epoch) return; config = loaded; message(''); }
      catch (error) { if (token !== epoch) return; message('Não foi possível verificar o acesso. Feche abas antigas e tente novamente.'); return; }
      finally { if (token === epoch) { pending = false; paint(); } }
      password.input.focus();
    }
    function close() {
      ++epoch; clearTimeout(timer); unlocked = false; pending = false; config = null; id = null;
      password.input.value = ''; repeat.input.value = ''; host.hidden = true;
    }
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (!id || pending || unlocked) return;
      const token = epoch, currentId = id, value = password.input.value;
      if (!value || value.length > 256 || (!config && (value.length < 8 || value !== repeat.input.value))) {
        message('Na criação, use de 8 a 256 caracteres e confirme a mesma senha.'); password.input.focus(); return;
      }
      pending = true; paint(); message('Verificando…');
      try {
        if (!global.crypto?.subtle) throw new Error('CRYPTO_UNAVAILABLE');
        const current = await storage().getMasterAccess(currentId);
        if ((current?.updatedAt ?? null) !== (config?.updatedAt ?? null)) throw new Error('CHANGED');
        const salt = config?.salt || hex(crypto.getRandomValues(new Uint8Array(16)));
        const verifier = await derive(value, salt);
        if (token !== epoch) return;
        if (current && !equal(verifier, current.verifier)) { message('Senha incorreta.'); return; }
        if (!current) config = await storage().setMasterAccess(currentId, { schemeVersion: 1, algorithm: 'PBKDF2-SHA-256', iterations: 600000, salt, verifier }, { expectedUpdatedAt: null });
        else {
          const latest = await storage().getMasterAccess(currentId);
          if (latest?.updatedAt !== current.updatedAt) throw new Error('CHANGED');
        }
        if (token !== epoch) return;
        unlocked = true; password.input.value = ''; repeat.input.value = ''; touch(); paint();
        onUnlock();
      } catch (error) {
        if (token === epoch) message(error.message === 'CRYPTO_UNAVAILABLE' ? 'Use HTTPS ou localhost para acessar a proteção local.'
          : error.message === 'CHANGED' || error.message === 'PRIVATE_UPDATE_CONFLICT' ? 'A configuração mudou em outra aba. Saia e abra o Escudo novamente.' : 'Não foi possível verificar ou salvar a senha. Tente novamente.');
      } finally { if (token === epoch) { pending = false; paint(); } }
    });
    reset.addEventListener('click', () => {
      if (pending || !config) return;
      const token = epoch;
      confirm({ title: 'Redefinir senha local?', content: 'Qualquer pessoa com acesso a este navegador pode redefinir esta barreira local. Apenas a senha será removida; os demais dados da Crônica serão preservados.', actions: [
        { label: 'Cancelar', className: 'secondary' },
        { label: 'Redefinir senha', className: 'danger', onClick: async () => {
          if (token !== epoch || pending) return;
          pending = true; paint();
          try { await storage().resetMasterAccess(id, { expectedUpdatedAt: config.updatedAt }); if (token === epoch) { config = null; message('Senha removida. Defina uma nova senha para entrar.'); } }
          catch (_) { if (token === epoch) message('Não foi possível redefinir. A configuração pode ter mudado em outra aba.'); }
          finally { if (token === epoch) { pending = false; paint(); password.input.focus(); } }
        } }
      ] });
    });
    async function checkFocus() {
      if (!unlocked) return; expire();
      const token = epoch;
      try { const latest = await storage().getMasterAccess(id); if (token === epoch && latest?.updatedAt !== config?.updatedAt) lock('A senha local foi alterada. Desbloqueie novamente.'); }
      catch (_) { if (token === epoch) lock('Não foi possível confirmar o acesso. Abra novamente o Escudo.'); }
    }
    document.addEventListener('pointerdown', event => { if (event.isTrusted) touch(); });
    document.addEventListener('keydown', event => { if (event.isTrusted) touch(); });
    global.addEventListener('focus', checkFocus);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void checkFocus(); });
    global.addEventListener('pagehide', () => { if (unlocked) lock(); });
    return { open, close, lock, get unlocked() { return unlocked; }, get pending() { return pending; } };
  }
  global.MasterAccess = Object.freeze({ create });
})(window);
