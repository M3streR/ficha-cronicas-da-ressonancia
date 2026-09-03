import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://gejpqmrystvzezscmmkg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_IflFHpAHB0PycyzZ5n3SWg_mHp8uYCu';
const AUTH_STORAGE_KEY = 'cronicasRessonanciaSupabaseAuth';

const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: AUTH_STORAGE_KEY
  }
});

let currentSession = null;
let initialized = false;
let resolveReady;
const ready = new Promise(resolve => { resolveReady = resolve; });

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function requireCredentials(email, password) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) throw new TypeError('INVALID_EMAIL');
  if (typeof password !== 'string' || password.length < 6 || password.length > 256) {
    throw new TypeError('INVALID_PASSWORD');
  }
  return { email: normalizedEmail, password };
}

function authErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (error?.message === 'INVALID_EMAIL') return 'Informe um e-mail válido.';
  if (error?.message === 'INVALID_PASSWORD') return 'A senha deve ter entre 6 e 256 caracteres.';
  if (message.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (message.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (message.includes('user already registered')) return 'Já existe uma conta com este e-mail.';
  if (message.includes('signup is disabled')) return 'A criação de contas está desativada no momento.';
  if (message.includes('rate limit')) return 'Muitas tentativas em pouco tempo. Aguarde um pouco e tente novamente.';
  return 'Não foi possível concluir a autenticação. Tente novamente.';
}

function emitAuthChange(event = 'INITIAL_SESSION') {
  const detail = {
    event,
    authenticated: Boolean(currentSession?.user),
    user: currentSession?.user || null
  };
  window.dispatchEvent(new CustomEvent('cronicas:auth-change', { detail }));
}

async function getSession() {
  if (!initialized) await ready;
  return currentSession;
}

async function getUser() {
  const session = await getSession();
  return session?.user || null;
}

async function signIn(email, password) {
  const credentials = requireCredentials(email, password);
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error) throw error;
  return data;
}

async function signUp(email, password) {
  const credentials = requireCredentials(email, password);
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { data, error } = await client.auth.signUp({
    ...credentials,
    options: { emailRedirectTo: redirectTo }
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

function onAuthStateChange(callback) {
  if (typeof callback !== 'function') throw new TypeError('INVALID_AUTH_CALLBACK');
  const { data } = client.auth.onAuthStateChange((event, session) => callback(event, session));
  return () => data.subscription.unsubscribe();
}

function createAccountUI() {
  const topbar = document.querySelector('.manager-topbar.manager-environment-brand');
  if (!topbar || document.getElementById('managerAccount')) return;

  const account = document.createElement('div');
  account.className = 'manager-account';
  account.id = 'managerAccount';

  const identity = document.createElement('div');
  identity.className = 'manager-account-identity';
  const stateLabel = document.createElement('span');
  stateLabel.className = 'manager-account-state';
  stateLabel.textContent = 'Modo local';
  const emailLabel = document.createElement('span');
  emailLabel.className = 'manager-account-email';
  emailLabel.textContent = 'Sem conta conectada';
  identity.append(stateLabel, emailLabel);

  const accountButton = document.createElement('button');
  accountButton.type = 'button';
  accountButton.className = 'btn secondary manager-account-button';
  accountButton.textContent = 'Entrar';
  accountButton.setAttribute('aria-haspopup', 'dialog');
  account.append(identity, accountButton);
  topbar.appendChild(account);

  const dialog = document.createElement('dialog');
  dialog.className = 'account-dialog';
  dialog.id = 'accountDialog';
  dialog.setAttribute('aria-labelledby', 'accountDialogTitle');

  const shell = document.createElement('div');
  shell.className = 'account-dialog-shell';
  dialog.appendChild(shell);
  document.body.appendChild(dialog);

  let mode = 'signin';
  let pending = false;

  function closeDialog() {
    if (!pending && dialog.open) dialog.close();
  }

  function renderTopbar() {
    const user = currentSession?.user || null;
    if (user) {
      stateLabel.textContent = 'Conta conectada';
      emailLabel.textContent = user.email || 'Usuário autenticado';
      accountButton.textContent = 'Conta';
      account.dataset.authenticated = 'true';
    } else {
      stateLabel.textContent = 'Modo local';
      emailLabel.textContent = 'Sem conta conectada';
      accountButton.textContent = 'Entrar';
      account.dataset.authenticated = 'false';
    }
  }

  function renderDialog(message = '', kind = '') {
    shell.replaceChildren();
    const user = currentSession?.user || null;

    const header = document.createElement('header');
    header.className = 'account-dialog-header';
    const heading = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.className = 'account-dialog-kicker';
    kicker.textContent = 'Conta online';
    const title = document.createElement('h2');
    title.id = 'accountDialogTitle';
    title.textContent = user ? 'Sua conta' : (mode === 'signup' ? 'Criar conta' : 'Entrar');
    heading.append(kicker, title);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'account-dialog-close';
    close.setAttribute('aria-label', 'Fechar');
    close.textContent = '×';
    close.disabled = pending;
    close.addEventListener('click', closeDialog);
    header.append(heading, close);
    shell.appendChild(header);

    if (user) {
      const copy = document.createElement('p');
      copy.className = 'account-dialog-copy';
      copy.textContent = 'Esta conta será usada pelos recursos online das Crônicas. Seus personagens e dados locais continuam neste navegador.';
      const email = document.createElement('strong');
      email.className = 'account-dialog-current-email';
      email.textContent = user.email || user.id;
      const feedback = document.createElement('p');
      feedback.className = 'account-dialog-feedback';
      feedback.dataset.kind = kind;
      feedback.textContent = message;
      const actions = document.createElement('div');
      actions.className = 'account-dialog-actions';
      const logout = document.createElement('button');
      logout.type = 'button';
      logout.className = 'btn secondary';
      logout.textContent = pending ? 'Saindo…' : 'Sair da conta';
      logout.disabled = pending;
      logout.addEventListener('click', async () => {
        if (pending) return;
        pending = true;
        renderDialog();
        try {
          await signOut();
          pending = false;
          closeDialog();
        } catch (error) {
          pending = false;
          renderDialog(authErrorMessage(error), 'error');
        }
      });
      actions.appendChild(logout);
      shell.append(copy, email, feedback, actions);
      return;
    }

    const copy = document.createElement('p');
    copy.className = 'account-dialog-copy';
    copy.textContent = mode === 'signup'
      ? 'Crie uma conta para usar os recursos compartilhados quando eles forem ativados. O uso local continua independente.'
      : 'Entre para preparar o acesso aos recursos online. Nada do armazenamento local será migrado nesta etapa.';

    const form = document.createElement('form');
    form.className = 'account-auth-form';
    form.noValidate = true;

    const emailField = document.createElement('label');
    emailField.textContent = 'E-mail';
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.autocomplete = 'email';
    emailInput.required = true;
    emailInput.maxLength = 320;
    emailField.appendChild(emailInput);

    const passwordField = document.createElement('label');
    passwordField.textContent = 'Senha';
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    passwordInput.required = true;
    passwordInput.minLength = 6;
    passwordInput.maxLength = 256;
    passwordField.appendChild(passwordInput);

    const feedback = document.createElement('p');
    feedback.className = 'account-dialog-feedback';
    feedback.dataset.kind = kind;
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    feedback.textContent = message;

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn';
    submit.disabled = pending;
    submit.textContent = pending
      ? (mode === 'signup' ? 'Criando…' : 'Entrando…')
      : (mode === 'signup' ? 'Criar conta' : 'Entrar');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'account-auth-toggle';
    toggle.disabled = pending;
    toggle.textContent = mode === 'signup' ? 'Já tenho conta' : 'Criar uma conta';
    toggle.addEventListener('click', () => {
      if (pending) return;
      mode = mode === 'signup' ? 'signin' : 'signup';
      renderDialog();
      requestAnimationFrame(() => shell.querySelector('input')?.focus());
    });

    form.append(emailField, passwordField, feedback, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (pending) return;
      let credentials;
      try {
        credentials = requireCredentials(emailInput.value, passwordInput.value);
      } catch (error) {
        feedback.dataset.kind = 'error';
        feedback.textContent = authErrorMessage(error);
        return;
      }

      pending = true;
      const submittedMode = mode;
      submit.disabled = true;
      toggle.disabled = true;
      emailInput.disabled = true;
      passwordInput.disabled = true;
      submit.textContent = submittedMode === 'signup' ? 'Criando…' : 'Entrando…';
      feedback.dataset.kind = '';
      feedback.textContent = '';

      try {
        if (submittedMode === 'signup') {
          const data = await signUp(credentials.email, credentials.password);
          if (data.session) {
            pending = false;
            closeDialog();
          } else {
            pending = false;
            renderDialog('Conta criada. Confira seu e-mail para confirmar o cadastro antes de entrar.', 'success');
          }
        } else {
          await signIn(credentials.email, credentials.password);
          pending = false;
          closeDialog();
        }
      } catch (error) {
        pending = false;
        renderDialog(authErrorMessage(error), 'error');
      }
    });

    shell.append(copy, form, toggle);
    requestAnimationFrame(() => emailInput.focus());
  }

  accountButton.addEventListener('click', () => {
    mode = 'signin';
    renderDialog();
    if (!dialog.open) dialog.showModal();
  });

  dialog.addEventListener('cancel', event => {
    if (pending) event.preventDefault();
  });

  renderTopbar();
  window.addEventListener('cronicas:auth-change', () => {
    renderTopbar();
    if (dialog.open) renderDialog();
  });
}

async function initialize() {
  try {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    currentSession = data.session;
  } catch (error) {
    console.error('Não foi possível restaurar a sessão online:', error);
    currentSession = null;
  } finally {
    initialized = true;
    resolveReady(currentSession);
    emitAuthChange('INITIAL_SESSION');
  }

  client.auth.onAuthStateChange((event, session) => {
    currentSession = session;
    emitAuthChange(event);
  });
}

window.CronicasSupabase = Object.freeze({
  client,
  ready,
  getSession,
  getUser,
  signIn,
  signUp,
  signOut,
  onAuthStateChange,
  get authenticated() { return Boolean(currentSession?.user); }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createAccountUI, { once: true });
} else {
  createAccountUI();
}

void initialize();
