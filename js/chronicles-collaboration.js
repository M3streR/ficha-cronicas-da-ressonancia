(function initializeChroniclesCollaboration(global) {
  'use strict';

  let currentChronicle = null;
  let castManagerOpen = false;
  let castSearch = '';
  let pending = false;
  let realtimeChannel = null;
  let refreshTimer = null;

  function isOnlineChronicle(chronicle = currentChronicle) {
    return Boolean(chronicle && chronicle.storage === 'online' && chronicle.remoteId);
  }

  async function requireContext(chronicle = currentChronicle) {
    if (!isOnlineChronicle(chronicle)) throw new Error('ONLINE_CHRONICLE_REQUIRED');
    const auth = global.CronicasSupabase;
    if (!auth) throw new Error('ONLINE_AUTH_UNAVAILABLE');
    await auth.ready;
    const user = await auth.getUser();
    if (!user) throw new Error('ONLINE_AUTH_REQUIRED');
    return { auth, user, chronicle };
  }

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeSearch(value) {
    return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function displayDate(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return '';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value));
  }

  function humanizeError(error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('row-level security')) return 'Sua conta não tem permissão para concluir esta ação.';
    if (message.includes('duplicate') || error?.code === '23505') return 'Este personagem já está vinculado ao Elenco.';
    if (message.includes('failed to fetch') || message.includes('network')) return 'Não foi possível alcançar o serviço online. Confira sua conexão.';
    if (error?.message === 'ONLINE_AUTH_REQUIRED') return 'Entre na sua conta para continuar.';
    return 'Não foi possível concluir a operação online. Tente novamente.';
  }

  function setCastFeedback(message = '', kind = '', manager = false) {
    const element = document.getElementById(manager ? 'chronicleCastManagerFeedback' : 'chronicleCastFeedback');
    if (!element) return;
    element.textContent = message;
    element.dataset.kind = kind;
  }

  function setParticipantFeedback(message = '', kind = '') {
    const element = document.getElementById('chronicleParticipantsFeedback');
    if (!element) return;
    element.textContent = message;
    element.dataset.kind = kind;
  }

  function portrait(entry, className) {
    const shell = document.createElement('span');
    shell.className = className;
    if (entry?.thumbnail) {
      const image = document.createElement('img');
      image.src = entry.thumbnail;
      image.alt = '';
      shell.appendChild(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.textContent = text(entry?.name).charAt(0).toUpperCase() || '◇';
      shell.appendChild(placeholder);
    }
    return shell;
  }

  async function fetchProfiles(userIds) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return new Map();
    const { auth } = await requireContext();
    const { data, error } = await auth.client
      .from('account_profiles')
      .select('user_id, display_name')
      .in('user_id', ids);
    if (error) throw error;
    return new Map((data || []).map(row => [row.user_id, text(row.display_name) || 'Participante']));
  }

  async function fetchParticipants(chronicle = currentChronicle) {
    const { auth, chronicle: active } = await requireContext(chronicle);
    const { data: members, error } = await auth.client
      .from('chronicle_members')
      .select('user_id, created_at')
      .eq('chronicle_id', active.remoteId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const ids = [active.ownerId, ...(members || []).map(row => row.user_id)].filter(Boolean);
    const profiles = await fetchProfiles(ids);
    return {
      owner: {
        userId: active.ownerId,
        name: profiles.get(active.ownerId) || 'Mestre',
        role: 'owner',
        joinedAt: active.createdAt
      },
      members: (members || []).map(row => ({
        userId: row.user_id,
        name: profiles.get(row.user_id) || 'Participante',
        role: 'member',
        joinedAt: row.created_at
      }))
    };
  }

  async function removeParticipant(userId) {
    if (pending) return;
    const { auth, chronicle } = await requireContext();
    if (chronicle.role !== 'owner') return;
    pending = true;
    setParticipantFeedback('Removendo participante…');
    try {
      const { error } = await auth.client
        .from('chronicle_members')
        .delete()
        .eq('chronicle_id', chronicle.remoteId)
        .eq('user_id', userId);
      if (error) throw error;
      global.showNotification?.('Participante removido da Crônica.');
      await renderParticipants(chronicle);
      await renderCast(chronicle);
    } catch (error) {
      setParticipantFeedback(humanizeError(error), 'error');
    } finally {
      pending = false;
    }
  }

  function participantRow(entry, index, canRemove) {
    const row = document.createElement('li');
    row.className = 'chronicle-participant-row online-participant-row';
    row.dataset.userId = entry.userId || '';

    const number = document.createElement('span');
    number.className = 'chronicle-participant-number';
    number.textContent = String(index + 1).padStart(2, '0');
    number.setAttribute('aria-hidden', 'true');

    const identity = document.createElement('div');
    identity.className = 'chronicle-participant-identity';
    const name = document.createElement('h4');
    name.textContent = entry.name;
    const label = document.createElement('span');
    label.textContent = entry.role === 'owner'
      ? 'Mestre da Crônica'
      : `Participante${entry.joinedAt ? ` · desde ${displayDate(entry.joinedAt)}` : ''}`;
    identity.append(name, label);

    const actions = document.createElement('div');
    actions.className = 'chronicle-participant-row-actions';
    if (canRemove && entry.role === 'member') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn danger';
      remove.textContent = 'Remover acesso';
      remove.disabled = pending;
      remove.addEventListener('click', () => {
        const confirmed = global.confirm(`Remover ${entry.name} desta Crônica? Os personagens dessa conta também sairão do Elenco.`);
        if (confirmed) void removeParticipant(entry.userId);
      });
      actions.appendChild(remove);
    }

    row.append(number, identity, actions);
    return row;
  }

  async function renderParticipants(chronicle = currentChronicle) {
    if (!isOnlineChronicle(chronicle)) return false;
    currentChronicle = chronicle;
    const list = document.getElementById('chronicleParticipantsList');
    const empty = document.getElementById('chronicleParticipantsEmpty');
    const form = document.getElementById('chronicleParticipantForm');
    if (!list || !empty) return true;
    if (form) form.hidden = true;
    list.replaceChildren();
    empty.hidden = true;
    setParticipantFeedback('Carregando participantes…');
    try {
      const { owner, members } = await fetchParticipants(chronicle);
      const entries = [owner, ...members];
      entries.forEach((entry, index) => list.appendChild(participantRow(entry, index, chronicle.role === 'owner')));
      empty.hidden = entries.length !== 0;
      setParticipantFeedback(
        chronicle.role === 'owner'
          ? 'Os participantes abaixo possuem acesso online a esta Crônica. Use “Convidar Participantes” para adicionar novas contas.'
          : 'Estas são as contas com acesso a esta Crônica compartilhada.'
      );
    } catch (error) {
      setParticipantFeedback(humanizeError(error), 'error');
    }
    return true;
  }

  async function fetchCast(chronicle = currentChronicle) {
    const { auth, chronicle: active } = await requireContext(chronicle);
    const { data: links, error: linkError } = await auth.client
      .from('chronicle_cast_members')
      .select('character_id, added_by, created_at')
      .eq('chronicle_id', active.remoteId)
      .order('created_at', { ascending: true });
    if (linkError) throw linkError;
    const ids = (links || []).map(row => row.character_id);
    if (!ids.length) return [];
    const { data: characters, error: characterError } = await auth.client
      .from('online_characters')
      .select('id, owner_id, source_local_id, name, level, class_name, signature, thumbnail, snapshot, created_at, updated_at')
      .in('id', ids);
    if (characterError) throw characterError;
    const byId = new Map((characters || []).map(row => [row.id, row]));
    const profiles = await fetchProfiles((characters || []).map(row => row.owner_id));
    return (links || []).map(link => {
      const row = byId.get(link.character_id);
      if (!row) return null;
      return {
        id: row.id,
        ownerId: row.owner_id,
        sourceLocalId: row.source_local_id,
        name: text(row.name) || 'Personagem',
        level: Number(row.level) || 1,
        className: text(row.class_name),
        signature: text(row.signature),
        thumbnail: text(row.thumbnail),
        snapshot: row.snapshot || {},
        ownerName: profiles.get(row.owner_id) || 'Participante',
        updatedAt: row.updated_at
      };
    }).filter(Boolean);
  }

  function castMember(entry, index, userId, ownerRole) {
    const member = document.createElement('article');
    member.className = 'chronicle-cast-member online-cast-member';
    member.dataset.characterId = entry.id;

    const number = document.createElement('span');
    number.className = 'chronicle-cast-member-index';
    number.textContent = String(index + 1).padStart(2, '0');
    number.setAttribute('aria-hidden', 'true');

    const identity = document.createElement('div');
    identity.className = 'chronicle-cast-member-identity';
    const name = document.createElement('h4');
    name.textContent = entry.name;
    const details = document.createElement('p');
    details.textContent = [`Nível ${entry.level}`, entry.className, entry.signature].filter(Boolean).join(' · ');
    const owner = document.createElement('small');
    owner.className = 'online-cast-owner';
    owner.textContent = `Ficha de ${entry.ownerName}`;
    identity.append(name, details, owner);

    const actions = document.createElement('div');
    actions.className = 'online-cast-member-actions';
    if (ownerRole || entry.ownerId === userId) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn secondary';
      remove.textContent = 'Remover do Elenco';
      remove.addEventListener('click', () => void removeCastCharacter(entry.id));
      actions.appendChild(remove);
    }

    member.append(number, portrait(entry, 'chronicle-cast-member-portrait'), identity, actions);
    return member;
  }

  async function renderCast(chronicle = currentChronicle) {
    if (!isOnlineChronicle(chronicle)) return false;
    currentChronicle = chronicle;
    const list = document.getElementById('chronicleCastList');
    const empty = document.getElementById('chronicleCastEmpty');
    const count = document.getElementById('chronicleCastCount');
    if (!list || !empty || !count) return true;
    list.replaceChildren();
    empty.hidden = true;
    list.setAttribute('aria-busy', 'true');
    setCastFeedback('Carregando Elenco online…');
    try {
      const { user } = await requireContext(chronicle);
      const entries = await fetchCast(chronicle);
      entries.forEach((entry, index) => list.appendChild(castMember(entry, index, user.id, chronicle.role === 'owner')));
      count.textContent = String(entries.length).padStart(2, '0');
      count.setAttribute('aria-label', entries.length === 1 ? '1 personagem no Elenco' : `${entries.length} personagens no Elenco`);
      empty.hidden = entries.length !== 0;
      if (!entries.length) {
        const copy = empty.querySelector('p');
        if (copy) copy.textContent = 'Publique um personagem local para começar o Elenco compartilhado desta Crônica.';
      }
      setCastFeedback(entries.length ? 'Elenco compartilhado entre os participantes desta Crônica.' : '');
    } catch (error) {
      setCastFeedback(humanizeError(error), 'error');
    } finally {
      list.removeAttribute('aria-busy');
    }
    return true;
  }

  function localCharacters() {
    try {
      return global.ChroniclesLocalCharacters?.list?.() || [];
    } catch (error) {
      console.error('Não foi possível ler os personagens locais para publicação:', error);
      return [];
    }
  }

  function sanitizeSnapshot(character) {
    const source = character && typeof character === 'object' ? character : {};
    const clone = value => JSON.parse(JSON.stringify(value ?? null));
    return {
      schemaVersion: source.schemaVersion || '0.3-pre-alpha',
      fields: clone(source.fields || {}),
      skills: clone(source.skills || {}),
      equipment: clone(source.equipment || []),
      abilities: clone(source.abilities || []),
      manifestations: clone(source.manifestations || []),
      automaticAbilityFavorites: clone(source.automaticAbilityFavorites || {}),
      activeEffects: clone(source.activeEffects || [])
    };
  }

  async function upsertOnlineCharacter(localEntry) {
    const { auth, user } = await requireContext();
    const character = localEntry.character || {};
    const fields = character.fields || {};
    const payload = {
      owner_id: user.id,
      source_local_id: localEntry.id,
      name: text(fields.nome) || localEntry.name || 'Novo personagem',
      level: Math.max(1, Math.min(11, Number.parseInt(fields.nivel, 10) || localEntry.level || 1)),
      class_name: text(fields.classe).slice(0, 120),
      signature: text(fields.assinatura).slice(0, 120),
      thumbnail: text(localEntry.thumbnail).slice(0, 500000),
      snapshot: sanitizeSnapshot(character)
    };
    const { data, error } = await auth.client
      .from('online_characters')
      .upsert(payload, { onConflict: 'owner_id,source_local_id' })
      .select('id, owner_id, source_local_id, name, level, class_name, signature, thumbnail, updated_at')
      .single();
    if (error) throw error;
    return data;
  }

  async function publishAndAdd(localId) {
    if (pending) return;
    const entry = localCharacters().find(item => item.id === localId);
    if (!entry) {
      setCastFeedback('Este personagem não está mais disponível neste navegador.', 'error', true);
      return;
    }
    pending = true;
    setCastFeedback('Publicando personagem…', '', true);
    try {
      const { auth, user, chronicle } = await requireContext();
      const online = await upsertOnlineCharacter(entry);
      const { error } = await auth.client
        .from('chronicle_cast_members')
        .upsert({
          chronicle_id: chronicle.remoteId,
          character_id: online.id,
          added_by: user.id
        }, { onConflict: 'chronicle_id,character_id', ignoreDuplicates: true });
      if (error) throw error;
      global.showNotification?.(`${entry.name} foi publicado no Elenco online.`);
      await renderManagerList();
      await renderCast(chronicle);
    } catch (error) {
      setCastFeedback(humanizeError(error), 'error', true);
    } finally {
      pending = false;
    }
  }

  async function synchronizeCharacter(localId) {
    if (pending) return;
    const entry = localCharacters().find(item => item.id === localId);
    if (!entry) return;
    pending = true;
    setCastFeedback('Sincronizando ficha…', '', true);
    try {
      await upsertOnlineCharacter(entry);
      global.showNotification?.(`${entry.name} foi sincronizado.`);
      await renderManagerList();
      await renderCast(currentChronicle);
    } catch (error) {
      setCastFeedback(humanizeError(error), 'error', true);
    } finally {
      pending = false;
    }
  }

  async function removeCastCharacter(characterId) {
    if (pending) return;
    pending = true;
    setCastFeedback('Atualizando Elenco…', '', castManagerOpen);
    try {
      const { auth, chronicle } = await requireContext();
      const { error } = await auth.client
        .from('chronicle_cast_members')
        .delete()
        .eq('chronicle_id', chronicle.remoteId)
        .eq('character_id', characterId);
      if (error) throw error;
      global.showNotification?.('Personagem removido do Elenco online.');
      await renderCast(chronicle);
      if (castManagerOpen) await renderManagerList();
    } catch (error) {
      setCastFeedback(humanizeError(error), 'error', castManagerOpen);
    } finally {
      pending = false;
    }
  }

  function managerOption(local, published, linked) {
    const row = document.createElement('article');
    row.className = 'chronicle-cast-selection-option online-cast-publish-option';
    row.dataset.characterId = local.id;
    row.dataset.selected = String(Boolean(linked));

    const identity = document.createElement('span');
    identity.className = 'chronicle-cast-selection-identity';
    const name = document.createElement('strong');
    name.textContent = local.name;
    const details = document.createElement('span');
    details.textContent = [`Nível ${local.level}`, local.className, local.signature].filter(Boolean).join(' · ');
    const state = document.createElement('small');
    state.className = 'online-cast-publish-state';
    state.textContent = linked ? 'Publicado · No Elenco' : (published ? 'Publicado nesta conta' : 'Somente neste navegador');
    identity.append(name, details, state);

    const actions = document.createElement('span');
    actions.className = 'online-cast-publish-actions';
    if (!linked) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn';
      add.textContent = published ? 'Adicionar ao Elenco' : 'Publicar e adicionar';
      add.disabled = pending;
      add.addEventListener('click', event => {
        event.preventDefault();
        void publishAndAdd(local.id);
      });
      actions.appendChild(add);
    } else {
      const sync = document.createElement('button');
      sync.type = 'button';
      sync.className = 'btn secondary';
      sync.textContent = 'Sincronizar ficha';
      sync.disabled = pending;
      sync.addEventListener('click', event => {
        event.preventDefault();
        void synchronizeCharacter(local.id);
      });
      actions.appendChild(sync);
    }

    row.append(portrait(local, 'chronicle-cast-selection-portrait'), identity, actions);
    return row;
  }

  async function fetchOwnedPublishedCharacters() {
    const { auth, user } = await requireContext();
    const { data, error } = await auth.client
      .from('online_characters')
      .select('id, source_local_id, name, updated_at')
      .eq('owner_id', user.id);
    if (error) throw error;
    return data || [];
  }

  async function renderManagerList() {
    if (!castManagerOpen || !isOnlineChronicle()) return false;
    const list = document.getElementById('chronicleCastSelectionList');
    const noResults = document.getElementById('chronicleCastNoResults');
    if (!list || !noResults) return true;
    list.replaceChildren();
    setCastFeedback('Carregando seus personagens…', '', true);
    try {
      const [published, cast] = await Promise.all([fetchOwnedPublishedCharacters(), fetchCast()]);
      const publishedByLocal = new Map(published.map(row => [row.source_local_id, row]));
      const linkedIds = new Set(cast.map(entry => entry.id));
      const query = normalizeSearch(castSearch || document.getElementById('chronicleCastSearch')?.value || '');
      const locals = localCharacters().filter(entry => !query || normalizeSearch(entry.name).includes(query));
      locals.forEach(local => {
        const online = publishedByLocal.get(local.id) || null;
        list.appendChild(managerOption(local, online, online && linkedIds.has(online.id)));
      });
      noResults.textContent = query
        ? 'Nenhum personagem local corresponde à busca.'
        : 'Nenhum personagem local está disponível neste navegador.';
      noResults.hidden = locals.length !== 0;
      const selectionCount = document.getElementById('chronicleCastSelectionCount');
      if (selectionCount) selectionCount.textContent = `${cast.length} no Elenco online`;
      setCastFeedback('Publique seus personagens para compartilhá-los com esta Crônica. A ficha local continua preservada neste navegador.', '', true);
    } catch (error) {
      setCastFeedback(humanizeError(error), 'error', true);
    }
    return true;
  }

  async function openCastManager(chronicle = currentChronicle) {
    if (!isOnlineChronicle(chronicle)) return false;
    currentChronicle = chronicle;
    castManagerOpen = true;
    const consult = document.getElementById('chronicleCastConsultView');
    const manager = document.getElementById('chronicleCastManagerView');
    const search = document.getElementById('chronicleCastSearch');
    const save = document.getElementById('saveChronicleCast');
    const cancel = document.getElementById('cancelChronicleCastManagement');
    if (consult) consult.hidden = true;
    if (manager) manager.hidden = false;
    if (search) {
      search.value = '';
      search.disabled = false;
    }
    if (save) {
      save.textContent = 'Concluir';
      save.disabled = false;
    }
    if (cancel) cancel.hidden = true;
    castSearch = '';
    await renderManagerList();
    requestAnimationFrame(() => search?.focus());
    return true;
  }

  async function closeCastManager({ render = true } = {}) {
    if (!castManagerOpen) return false;
    castManagerOpen = false;
    castSearch = '';
    const consult = document.getElementById('chronicleCastConsultView');
    const manager = document.getElementById('chronicleCastManagerView');
    const list = document.getElementById('chronicleCastSelectionList');
    const save = document.getElementById('saveChronicleCast');
    const cancel = document.getElementById('cancelChronicleCastManagement');
    if (consult) consult.hidden = false;
    if (manager) manager.hidden = true;
    if (list) list.replaceChildren();
    if (save) save.textContent = 'Salvar Elenco';
    if (cancel) cancel.hidden = false;
    setCastFeedback('', '', true);
    if (render) await renderCast(currentChronicle);
    return true;
  }

  function handleCastSearch(value) {
    if (!castManagerOpen || !isOnlineChronicle()) return false;
    castSearch = value || '';
    void renderManagerList();
    return true;
  }

  function scheduleRealtimeRefresh() {
    global.clearTimeout(refreshTimer);
    refreshTimer = global.setTimeout(() => {
      if (!isOnlineChronicle()) return;
      const participantsVisible = !document.getElementById('chroniclePanelParticipants')?.hidden;
      const castVisible = !document.getElementById('chroniclePanelCast')?.hidden;
      if (participantsVisible) void renderParticipants(currentChronicle);
      if (castVisible && !castManagerOpen) void renderCast(currentChronicle);
      if (castManagerOpen) void renderManagerList();
    }, 180);
  }

  function stopRealtime() {
    if (realtimeChannel && global.CronicasSupabase?.client) {
      global.CronicasSupabase.client.removeChannel(realtimeChannel);
    }
    realtimeChannel = null;
  }

  function startRealtime(chronicle) {
    stopRealtime();
    if (!isOnlineChronicle(chronicle) || !global.CronicasSupabase?.client) return;
    const client = global.CronicasSupabase.client;
    realtimeChannel = client
      .channel(`chronicle-collaboration:${chronicle.remoteId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'chronicle_members', filter: `chronicle_id=eq.${chronicle.remoteId}`
      }, scheduleRealtimeRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'chronicle_cast_members', filter: `chronicle_id=eq.${chronicle.remoteId}`
      }, scheduleRealtimeRefresh)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'online_characters'
      }, scheduleRealtimeRefresh)
      .subscribe();
  }

  function applyDetailMode(chronicle) {
    currentChronicle = chronicle || null;
    castManagerOpen = false;
    if (isOnlineChronicle(chronicle)) startRealtime(chronicle);
    else stopRealtime();
  }

  function reset() {
    stopRealtime();
    currentChronicle = null;
    castManagerOpen = false;
    castSearch = '';
    pending = false;
  }

  global.ChroniclesCollaboration = Object.freeze({
    applyDetailMode,
    reset,
    renderParticipants,
    renderCast,
    openCastManager,
    closeCastManager,
    renderManagerList,
    handleCastSearch
  });
})(window);
