(function initializeChroniclesSharing(global) {
  'use strict';

  const PRODUCTION_APP_URL = 'https://m3strer.github.io/ficha-cronicas-da-ressonancia/';
  const CONVERSION_MAP_KEY = 'cronicasRessonanciaOnlineConversions';
  const INVITE_PARAM = 'invite';
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  let currentChronicle = null;
  let operationPending = false;
  let inviteDialog = null;
  let inviteShell = null;
  let conversionDialog = null;
  let conversionShell = null;

  function getAuth() {
    if (!global.CronicasSupabase) throw new Error('ONLINE_AUTH_UNAVAILABLE');
    return global.CronicasSupabase;
  }

  async function requireUser() {
    const auth = getAuth();
    await auth.ready;
    const user = await auth.getUser();
    if (!user) throw new Error('ONLINE_AUTH_REQUIRED');
    return { auth, user };
  }

  function readConversionMap() {
    try {
      const parsed = JSON.parse(global.localStorage.getItem(CONVERSION_MAP_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeConversionMap(map) {
    try {
      global.localStorage.setItem(CONVERSION_MAP_KEY, JSON.stringify(map));
    } catch (error) {
      console.warn('Não foi possível registrar o vínculo local da conversão online.', error);
    }
  }

  function getConvertedOnlineId(localId) {
    const value = readConversionMap()[localId];
    return typeof value === 'string' && value.startsWith('online:') ? value : '';
  }

  function rememberConversion(localId, onlineId) {
    const map = readConversionMap();
    map[localId] = onlineId;
    writeConversionMap(map);
  }

  function forgetConversion(localId) {
    const map = readConversionMap();
    if (!Object.hasOwn(map, localId)) return;
    delete map[localId];
    writeConversionMap(map);
  }

  function buildInviteUrl(code) {
    const url = new URL(PRODUCTION_APP_URL);
    url.searchParams.set(INVITE_PARAM, code);
    return url.href;
  }

  function inviteCodeFromLocation() {
    const value = new URL(global.location.href).searchParams.get(INVITE_PARAM) || '';
    return UUID_PATTERN.test(value) ? value : '';
  }

  function clearInviteFromLocation() {
    const url = new URL(global.location.href);
    url.searchParams.delete(INVITE_PARAM);
    global.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function formatDate(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  }

  function humanizeError(error) {
    const code = String(error?.message || '');
    const message = code.toLowerCase();
    if (code === 'ONLINE_AUTH_REQUIRED') return 'Entre na sua conta para continuar.';
    if (code === 'ONLINE_AUTH_UNAVAILABLE') return 'O serviço online ainda não ficou disponível. Recarregue a página.';
    if (message.includes('only the chronicle owner can create invitations')) return 'Somente o Mestre pode gerar convites para esta Crônica.';
    if (message.includes('only the chronicle owner can revoke invitations')) return 'Somente o Mestre pode cancelar este convite.';
    if (message.includes('invitation is invalid') || message.includes('already used') || message.includes('revoked')) return 'Este convite não está mais disponível. Ele pode ter sido usado ou cancelado.';
    if (message.includes('owner already has access')) return 'Você já é o Mestre desta Crônica.';
    if (message.includes('failed to fetch') || message.includes('network')) return 'Não foi possível alcançar o serviço online. Confira sua conexão.';
    return 'Não foi possível concluir esta operação online. Tente novamente.';
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    document.execCommand('copy');
    field.remove();
  }

  function ensureDialogs() {
    if (!conversionDialog) {
      conversionDialog = document.createElement('dialog');
      conversionDialog.className = 'chronicle-sharing-dialog';
      conversionDialog.id = 'chronicleConversionDialog';
      conversionShell = document.createElement('div');
      conversionShell.className = 'chronicle-sharing-shell';
      conversionDialog.appendChild(conversionShell);
      document.body.appendChild(conversionDialog);
      conversionDialog.addEventListener('cancel', event => {
        if (operationPending) event.preventDefault();
      });
    }

    if (!inviteDialog) {
      inviteDialog = document.createElement('dialog');
      inviteDialog.className = 'chronicle-sharing-dialog chronicle-invite-dialog';
      inviteDialog.id = 'chronicleInviteDialog';
      inviteShell = document.createElement('div');
      inviteShell.className = 'chronicle-sharing-shell';
      inviteDialog.appendChild(inviteShell);
      document.body.appendChild(inviteDialog);
      inviteDialog.addEventListener('cancel', event => {
        if (operationPending) event.preventDefault();
      });
    }
  }

  function dialogHeader(title, kicker, onClose) {
    const header = document.createElement('header');
    header.className = 'chronicle-sharing-header';
    const copy = document.createElement('div');
    const kickerElement = document.createElement('span');
    kickerElement.className = 'chronicles-kicker';
    kickerElement.textContent = kicker;
    const heading = document.createElement('h2');
    heading.textContent = title;
    copy.append(kickerElement, heading);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'chronicle-sharing-close';
    close.setAttribute('aria-label', 'Fechar');
    close.textContent = '×';
    close.disabled = operationPending;
    close.addEventListener('click', onClose);
    header.append(copy, close);
    return header;
  }

  function openAccountDialog() {
    document.querySelector('#managerAccount .manager-account-button')?.click();
  }

  function syncActionButtons(chronicle) {
    const convert = document.getElementById('makeChronicleOnlineAction');
    const invite = document.getElementById('inviteChronicleAction');
    if (!convert || !invite) return;

    const online = chronicle?.storage === 'online';
    const owner = online && chronicle?.role === 'owner';
    const authenticated = Boolean(global.CronicasSupabase?.authenticated);

    const mappedOnlineId = !online && chronicle ? getConvertedOnlineId(chronicle.id) : '';
    convert.hidden = online;
    convert.disabled = !chronicle || operationPending || Boolean(mappedOnlineId);
    convert.textContent = mappedOnlineId
      ? 'Versão Online Criada'
      : (authenticated ? 'Tornar Crônica Online' : 'Entrar para tornar Online');
    convert.title = mappedOnlineId ? 'Esta Crônica local já possui uma versão online vinculada neste navegador.' : '';

    invite.hidden = !online || !owner;
    invite.disabled = operationPending;
  }

  async function validateRememberedConversion(chronicle) {
    if (!chronicle || chronicle.storage === 'online') return;
    const mapped = getConvertedOnlineId(chronicle.id);
    if (!mapped) return;
    try {
      const online = await global.ChroniclesOnline?.getChronicle(mapped);
      if (!online) forgetConversion(chronicle.id);
    } catch {
      // Sem conexão, preservamos o vínculo local até uma verificação futura.
    }
    syncActionButtons(currentChronicle);
  }

  function renderConversionDialog(message = '', kind = '') {
    ensureDialogs();
    conversionShell.replaceChildren();
    const chronicle = currentChronicle;
    const closeDialog = () => {
      if (!operationPending && conversionDialog.open) conversionDialog.close();
    };
    conversionShell.appendChild(dialogHeader('Tornar Crônica Online', 'Compartilhamento', closeDialog));

    const intro = document.createElement('p');
    intro.className = 'chronicle-sharing-lead';
    intro.textContent = chronicle
      ? `Uma versão online de “${chronicle.name}” será criada para esta conta.`
      : 'Uma versão online desta Crônica será criada para sua conta.';

    const note = document.createElement('div');
    note.className = 'chronicle-sharing-note';
    note.innerHTML = '<strong>A versão local será preservada.</strong><span>Nada será apagado deste navegador. A versão online será um novo registro compartilhável.</span><span>Nesta etapa, somente nome, sinopse e tipo são levados para o online. Capa, Elenco, Participantes, Confrontos e Escudo permanecem na versão local até serem integrados.</span>';

    const feedback = document.createElement('p');
    feedback.className = 'chronicle-sharing-feedback';
    feedback.dataset.kind = kind;
    feedback.textContent = message;

    const mapped = chronicle ? getConvertedOnlineId(chronicle.id) : '';
    const actions = document.createElement('div');
    actions.className = 'chronicle-sharing-actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn secondary';
    cancel.textContent = 'Cancelar';
    cancel.disabled = operationPending;
    cancel.addEventListener('click', closeDialog);

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'btn';
    confirm.disabled = operationPending || Boolean(mapped);
    confirm.textContent = mapped ? 'Versão online já criada' : (operationPending ? 'Criando versão online…' : 'Criar versão online');
    confirm.addEventListener('click', async () => {
      if (operationPending || !currentChronicle || currentChronicle.storage === 'online') return;
      if (!global.CronicasSupabase?.authenticated) {
        conversionDialog.close();
        openAccountDialog();
        return;
      }
      operationPending = true;
      renderConversionDialog();
      try {
        const online = await global.ChroniclesOnline.createChronicle({
          name: currentChronicle.name,
          synopsis: currentChronicle.synopsis,
          type: currentChronicle.type,
          cover: null
        });
        rememberConversion(currentChronicle.id, online.id);
        operationPending = false;
        renderConversionDialog('Versão online criada com sucesso. A Crônica local continua preservada neste navegador.', 'success');
        syncActionButtons(currentChronicle);
        global.showNotification?.('Versão online da Crônica criada com sucesso.');
        if (typeof global.renderChroniclesIndex === 'function') void global.renderChroniclesIndex();
      } catch (error) {
        operationPending = false;
        renderConversionDialog(humanizeError(error), 'error');
      }
    });

    actions.append(cancel, confirm);
    conversionShell.append(intro, note, feedback, actions);
  }

  function openConversionDialog() {
    if (!currentChronicle || currentChronicle.storage === 'online') return;
    if (!global.CronicasSupabase?.authenticated) {
      openAccountDialog();
      return;
    }
    renderConversionDialog();
    if (!conversionDialog.open) conversionDialog.showModal();
  }

  async function fetchInvites(chronicle) {
    if (!chronicle?.remoteId) return [];
    const { auth } = await requireUser();
    const { data, error } = await auth.client
      .from('chronicle_invites')
      .select('id, chronicle_id, code, created_at, revoked_at, used_at, used_by')
      .eq('chronicle_id', chronicle.remoteId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  function inviteStatus(invite) {
    if (invite.revoked_at) return { label: 'Cancelado', kind: 'revoked' };
    if (invite.used_at) return { label: 'Utilizado', kind: 'used' };
    return { label: 'Disponível', kind: 'active' };
  }

  async function renderOwnerInviteDialog(message = '', kind = '') {
    ensureDialogs();
    inviteShell.replaceChildren();
    const chronicle = currentChronicle;
    const closeDialog = () => {
      if (!operationPending && inviteDialog.open) inviteDialog.close();
    };
    inviteShell.appendChild(dialogHeader('Convidar Participantes', 'Crônica Online', closeDialog));

    const intro = document.createElement('p');
    intro.className = 'chronicle-sharing-lead';
    intro.textContent = `Gere um link de acesso para “${chronicle?.name || 'esta Crônica'}”. Cada link pode ser usado uma única vez.`;

    const feedback = document.createElement('p');
    feedback.className = 'chronicle-sharing-feedback';
    feedback.dataset.kind = kind;
    feedback.textContent = message;

    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'btn chronicle-invite-create';
    create.disabled = operationPending;
    create.textContent = operationPending ? 'Gerando convite…' : 'Gerar novo convite';
    create.addEventListener('click', async () => {
      if (operationPending || !currentChronicle?.remoteId) return;
      operationPending = true;
      await renderOwnerInviteDialog();
      try {
        const { auth } = await requireUser();
        const { data, error } = await auth.client.rpc('create_chronicle_invite', {
          p_chronicle_id: currentChronicle.remoteId
        });
        if (error) throw error;
        operationPending = false;
        await renderOwnerInviteDialog('Convite criado. Copie o link e envie para o jogador.', 'success');
        const link = buildInviteUrl(data);
        try {
          await copyText(link);
          const feedbackElement = inviteShell.querySelector('.chronicle-sharing-feedback');
          if (feedbackElement) feedbackElement.textContent = 'Convite criado e link copiado para a área de transferência.';
        } catch {
          // O link permanece visível na lista mesmo se a cópia automática falhar.
        }
      } catch (error) {
        operationPending = false;
        await renderOwnerInviteDialog(humanizeError(error), 'error');
      }
    });

    const list = document.createElement('div');
    list.className = 'chronicle-invite-list';
    let invites = [];
    try {
      invites = await fetchInvites(chronicle);
    } catch (error) {
      feedback.dataset.kind = 'error';
      feedback.textContent = humanizeError(error);
    }

    if (!invites.length) {
      const empty = document.createElement('div');
      empty.className = 'chronicle-invite-empty';
      empty.innerHTML = '<span aria-hidden="true">◇</span><div><strong>Nenhum convite gerado</strong><p>Crie um link para adicionar o primeiro participante online.</p></div>';
      list.appendChild(empty);
    } else {
      invites.forEach(invite => {
        const status = inviteStatus(invite);
        const card = document.createElement('article');
        card.className = `chronicle-invite-card is-${status.kind}`;
        const top = document.createElement('div');
        top.className = 'chronicle-invite-card-top';
        const identity = document.createElement('div');
        const label = document.createElement('strong');
        label.textContent = `Convite · ${formatDate(invite.created_at)}`;
        const badge = document.createElement('span');
        badge.className = 'chronicle-invite-status';
        badge.textContent = status.label;
        identity.append(label, badge);
        top.appendChild(identity);

        const link = document.createElement('input');
        link.type = 'text';
        link.readOnly = true;
        link.value = buildInviteUrl(invite.code);
        link.setAttribute('aria-label', 'Link do convite');

        const actions = document.createElement('div');
        actions.className = 'chronicle-invite-card-actions';
        if (status.kind === 'active') {
          const copy = document.createElement('button');
          copy.type = 'button';
          copy.className = 'btn secondary';
          copy.textContent = 'Copiar link';
          copy.addEventListener('click', async () => {
            try {
              await copyText(link.value);
              copy.textContent = 'Copiado';
              global.setTimeout(() => { copy.textContent = 'Copiar link'; }, 1600);
            } catch {
              link.focus();
              link.select();
            }
          });
          const revoke = document.createElement('button');
          revoke.type = 'button';
          revoke.className = 'btn secondary chronicle-invite-revoke';
          revoke.textContent = 'Cancelar convite';
          revoke.disabled = operationPending;
          revoke.addEventListener('click', async () => {
            if (operationPending) return;
            operationPending = true;
            await renderOwnerInviteDialog();
            try {
              const { auth } = await requireUser();
              const { error } = await auth.client.rpc('revoke_chronicle_invite', { p_code: invite.code });
              if (error) throw error;
              operationPending = false;
              await renderOwnerInviteDialog('Convite cancelado.', 'success');
            } catch (error) {
              operationPending = false;
              await renderOwnerInviteDialog(humanizeError(error), 'error');
            }
          });
          actions.append(copy, revoke);
        }
        card.append(top, link, actions);
        list.appendChild(card);
      });
    }

    inviteShell.append(intro, feedback, create, list);
  }

  async function openOwnerInviteDialog() {
    if (!currentChronicle || currentChronicle.storage !== 'online' || currentChronicle.role !== 'owner') return;
    ensureDialogs();
    await renderOwnerInviteDialog();
    if (!inviteDialog.open) inviteDialog.showModal();
  }

  async function renderIncomingInviteDialog(code, message = '', kind = '', completedOnlineId = '') {
    ensureDialogs();
    inviteShell.replaceChildren();
    const closeDialog = () => {
      if (operationPending) return;
      if (inviteDialog.open) inviteDialog.close();
    };
    inviteShell.appendChild(dialogHeader('Convite para uma Crônica', 'Participação Online', closeDialog));

    const authenticated = Boolean(global.CronicasSupabase?.authenticated);
    const intro = document.createElement('p');
    intro.className = 'chronicle-sharing-lead';
    intro.textContent = completedOnlineId
      ? 'O convite foi aceito e a Crônica já faz parte da sua conta.'
      : (authenticated
        ? 'Você recebeu acesso a uma Crônica compartilhada. Aceite o convite para adicioná-la à sua conta.'
        : 'Você recebeu acesso a uma Crônica compartilhada. Entre na sua conta para continuar; o convite será preservado.');

    const note = document.createElement('div');
    note.className = 'chronicle-sharing-note';
    note.innerHTML = completedOnlineId
      ? '<strong>Acesso confirmado</strong><span>Esta conta agora é participante da Crônica compartilhada.</span>'
      : '<strong>Convite individual</strong><span>Este link pode ser utilizado apenas uma vez e ficará associado à conta que o aceitar.</span>';

    const feedback = document.createElement('p');
    feedback.className = 'chronicle-sharing-feedback';
    feedback.dataset.kind = kind;
    feedback.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'chronicle-sharing-actions';

    if (completedOnlineId) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'btn secondary';
      close.textContent = 'Fechar';
      close.addEventListener('click', closeDialog);

      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'btn';
      view.textContent = 'Ver Crônicas';
      view.addEventListener('click', async () => {
        if (inviteDialog.open) inviteDialog.close();
        if (typeof global.showChroniclesIndex === 'function') {
          await global.showChroniclesIndex({ focusId: completedOnlineId });
        } else if (typeof global.renderChroniclesIndex === 'function') {
          await global.renderChroniclesIndex({ focusId: completedOnlineId });
        }
      });
      actions.append(close, view);
      inviteShell.append(intro, note, feedback, actions);
      return;
    }

    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'btn secondary';
    later.textContent = 'Agora não';
    later.disabled = operationPending;
    later.addEventListener('click', closeDialog);

    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'btn';
    primary.disabled = operationPending;
    primary.textContent = authenticated
      ? (operationPending ? 'Aceitando convite…' : 'Aceitar convite')
      : 'Entrar na conta';
    primary.addEventListener('click', async () => {
      if (operationPending) return;
      if (!global.CronicasSupabase?.authenticated) {
        inviteDialog.close();
        openAccountDialog();
        return;
      }
      operationPending = true;
      await renderIncomingInviteDialog(code);
      try {
        const { auth } = await requireUser();
        const { data, error } = await auth.client.rpc('accept_chronicle_invite', { p_code: code });
        if (error) throw error;
        operationPending = false;
        clearInviteFromLocation();
        const onlineId = `online:${data}`;
        await renderIncomingInviteDialog(code, 'Convite aceito. A Crônica já está vinculada à sua conta.', 'success', onlineId);
        global.showNotification?.('Você entrou na Crônica online.');
      } catch (error) {
        operationPending = false;
        await renderIncomingInviteDialog(code, humanizeError(error), 'error');
      }
    });

    actions.append(later, primary);
    inviteShell.append(intro, note, feedback, actions);
  }

  async function handleIncomingInvite() {
    const code = inviteCodeFromLocation();
    if (!code) return;
    ensureDialogs();
    await renderIncomingInviteDialog(code);
    if (!inviteDialog.open) inviteDialog.showModal();
  }

  function bindActions() {
    document.getElementById('makeChronicleOnlineAction')?.addEventListener('click', openConversionDialog);
    document.getElementById('inviteChronicleAction')?.addEventListener('click', () => { void openOwnerInviteDialog(); });
  }

  function applyDetailMode(chronicle) {
    currentChronicle = chronicle || null;
    syncActionButtons(currentChronicle);
    void validateRememberedConversion(currentChronicle);
  }

  global.addEventListener('cronicas:auth-change', () => {
    syncActionButtons(currentChronicle);
    const code = inviteCodeFromLocation();
    if (code && global.CronicasSupabase?.authenticated) {
      global.setTimeout(() => { void handleIncomingInvite(); }, 50);
    }
  });

  function initialize() {
    ensureDialogs();
    bindActions();
    void handleIncomingInvite();
  }

  global.ChroniclesSharing = Object.freeze({
    applyDetailMode,
    handleIncomingInvite,
    openOwnerInviteDialog,
    openConversionDialog
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})(window);
