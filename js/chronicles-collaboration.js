(function initializeChroniclesCollaboration(global) {
  'use strict';

  let currentChronicle = null;
  let castManagerOpen = false;
  let castSearch = '';
  let pending = false;
  let realtimeChannel = null;
  let refreshTimer = null;
  let viewEpoch = 0;
  let participantsEpoch = 0;
  let castEpoch = 0;
  let managerEpoch = 0;
  let syncEpoch = 0;
  let syncUserId = null;
  let currentCastIds = new Set();
  const characterSyncStates = new Map();
  const characterSyncTimers = new Map();
  const characterSyncQueues = new Map();
  const characterSyncRetries = new Map();
  const latestCharacterSnapshots = new Map();
  const characterSyncWaiters = new Map();
  const characterSyncVersions = new Map();
  const CHARACTER_SYNC_META_PREFIX = 'cronicasRessonanciaOnlineCharacterSyncV1:';
  const ONLINE_CHARACTER_COLUMNS = 'id, owner_id, source_local_id, name, level, class_name, signature, thumbnail, snapshot, created_at, updated_at';

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

  async function requireUser() {
    const auth = global.CronicasSupabase;
    if (!auth) throw new Error('ONLINE_AUTH_UNAVAILABLE');
    await auth.ready;
    const user = await auth.getUser();
    if (!user) throw new Error('ONLINE_AUTH_REQUIRED');
    return { auth, user };
  }

  function setCharacterSyncState(localId, state, message = '', extra = {}) {
    const previous = characterSyncStates.get(localId) || {};
    const detail = { ...previous, ...extra, localId, state, message };
    characterSyncStates.set(localId, detail);
    global.dispatchEvent(new CustomEvent('cronicas:character-sync-state', { detail }));
  }

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function neutralName(userId) {
    return `Caçador ${String(userId || '').replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  }

  function normalizeSearch(value) {
    return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function displayDate(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return '';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value));
  }

  function humanizeError(error) {
    if (error?.message === 'ONLINE_CHARACTER_CONFLICT') return 'A ficha Online mudou em outro local. Nenhuma versão foi sobrescrita.';
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
    return new Map((data || []).map(row => [row.user_id, text(row.display_name) || neutralName(row.user_id)]));
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
        name: profiles.get(active.ownerId) || neutralName(active.ownerId),
        role: 'owner',
        joinedAt: active.createdAt
      },
      members: (members || []).map(row => ({
        userId: row.user_id,
        name: profiles.get(row.user_id) || neutralName(row.user_id),
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
    const token = ++participantsEpoch, view = viewEpoch;
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
      if (token !== participantsEpoch || view !== viewEpoch || currentChronicle?.id !== chronicle.id) return true;
      const entries = [owner, ...members];
      entries.forEach((entry, index) => list.appendChild(participantRow(entry, index, chronicle.role === 'owner')));
      empty.hidden = entries.length !== 0;
      setParticipantFeedback(
        chronicle.role === 'owner'
          ? 'Os participantes abaixo possuem acesso online a esta Crônica. Use “Convidar Participantes” para adicionar novas contas.'
          : 'Estas são as contas com acesso a esta Crônica compartilhada.'
      );
    } catch (error) {
      if (token !== participantsEpoch || view !== viewEpoch) return true;
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
    if (currentChronicle?.id === active.id) currentCastIds = new Set(ids);
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
        ownerName: profiles.get(row.owner_id) || neutralName(row.owner_id),
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
    const token = ++castEpoch, view = viewEpoch;
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
      if (token !== castEpoch || view !== viewEpoch || currentChronicle?.id !== chronicle.id) return true;
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
      if (token !== castEpoch || view !== viewEpoch) return true;
      setCastFeedback(humanizeError(error), 'error');
    } finally {
      if (token === castEpoch && view === viewEpoch) list.removeAttribute('aria-busy');
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
      activeEffects: clone(source.activeEffects || []),
      criticalStates: clone(source.criticalStates || {
        dyingRounds: 0,
        losingMindRounds: 0,
        resonantRecoveryDefensePenalty: false
      })
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
  }

  function stableSerialize(value) {
    if (Array.isArray(value)) return '[' + value.map(stableSerialize).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableSerialize(value[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  function snapshotsEqual(left, right) {
    return stableSerialize(sanitizeSnapshot(left)) === stableSerialize(sanitizeSnapshot(right));
  }

  function mergeRemoteSnapshot(remoteSnapshot, localCharacter) {
    const local = localCharacter && typeof localCharacter === 'object' ? localCharacter : {};
    return {
      ...sanitizeSnapshot(remoteSnapshot),
      photo: typeof local.photo === 'string' ? local.photo : '',
      notes: Array.isArray(local.notes) ? clone(local.notes) : []
    };
  }

  function syncMetadataKey(localId) {
    return CHARACTER_SYNC_META_PREFIX + localId;
  }

  function readSyncMetadata(localId) {
    try {
      const value = JSON.parse(global.localStorage?.getItem(syncMetadataKey(localId)) || 'null');
      if (!value || typeof value !== 'object') return null;
      if (!value.remoteId || !value.ownerId || !value.baseUpdatedAt) return null;
      return {
        remoteId: String(value.remoteId),
        ownerId: String(value.ownerId),
        baseUpdatedAt: String(value.baseUpdatedAt),
        dirty: value.dirty === true,
        conflict: value.conflict === true
      };
    } catch (error) {
      console.warn('[Personagem online] Metadados locais de sincronização inválidos:', error);
      return null;
    }
  }

  function writeSyncMetadata(localId, value) {
    try {
      global.localStorage?.setItem(syncMetadataKey(localId), JSON.stringify({
        remoteId: value.remoteId,
        ownerId: value.ownerId,
        baseUpdatedAt: value.baseUpdatedAt,
        dirty: value.dirty === true,
        conflict: value.conflict === true
      }));
      return true;
    } catch (error) {
      console.warn('[Personagem online] Não foi possível salvar os metadados de sincronização:', error);
      return false;
    }
  }

  function rememberVersion(localId, row, options = {}) {
    const version = {
      remoteId: row.id,
      ownerId: row.owner_id,
      baseUpdatedAt: row.updated_at,
      dirty: options.dirty === true,
      conflict: options.conflict === true
    };
    characterSyncVersions.set(localId, version);
    writeSyncMetadata(localId, version);
    return version;
  }

  function currentVersion(localId) {
    return characterSyncVersions.get(localId) || readSyncMetadata(localId);
  }

  function markDirty(localId) {
    const current = currentVersion(localId);
    if (!current) return null;
    const dirty = { ...current, dirty: true };
    characterSyncVersions.set(localId, dirty);
    writeSyncMetadata(localId, dirty);
    return dirty;
  }

  function markConflict(localId, row, reason = 'changed') {
    const current = currentVersion(localId);
    const metadata = {
      remoteId: row?.id || current?.remoteId || '',
      ownerId: row?.owner_id || current?.ownerId || '',
      baseUpdatedAt: current?.baseUpdatedAt || row?.updated_at || '',
      dirty: true,
      conflict: true
    };
    if (metadata.remoteId && metadata.ownerId && metadata.baseUpdatedAt) {
      characterSyncVersions.set(localId, metadata);
      writeSyncMetadata(localId, metadata);
    }
    characterSyncRetries.delete(localId);
    setCharacterSyncState(localId, 'conflict', 'Conflito Online · revisão necessária', {
      conflictReason: reason,
      remoteUpdatedAt: row?.updated_at || ''
    });
    return { ok: false, conflict: true, reason };
  }

  function characterPayload(localEntry, userId) {
    const character = localEntry.character || {};
    const fields = character.fields || {};
    return {
      owner_id: userId,
      source_local_id: localEntry.id,
      name: text(fields.nome) || localEntry.name || 'Novo personagem',
      level: Math.max(1, Math.min(11, Number.parseInt(fields.nivel, 10) || localEntry.level || 1)),
      class_name: text(fields.classe).slice(0, 120),
      signature: text(fields.assinatura).slice(0, 120),
      thumbnail: text(localEntry.thumbnail).slice(0, 500000),
      snapshot: sanitizeSnapshot(character)
    };
  }

  function rowMatchesPayload(row, payload) {
    return Boolean(row)
      && row.owner_id === payload.owner_id
      && row.source_local_id === payload.source_local_id
      && row.name === payload.name
      && Number(row.level) === Number(payload.level)
      && text(row.class_name) === text(payload.class_name)
      && text(row.signature) === text(payload.signature)
      && text(row.thumbnail) === text(payload.thumbnail)
      && snapshotsEqual(row.snapshot, payload.snapshot);
  }

  async function fetchOwnedOnlineCharacter(auth, userId, localId) {
    const { data, error } = await auth.client
      .from('online_characters')
      .select(ONLINE_CHARACTER_COLUMNS)
      .eq('owner_id', userId)
      .eq('source_local_id', localId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function createOnlineCharacter(localEntry, expectedUserId = null) {
    const { auth, user } = await requireUser();
    if (expectedUserId && user.id !== expectedUserId) throw new Error('ONLINE_AUTH_CHANGED');
    const payload = characterPayload(localEntry, user.id);
    const existing = await fetchOwnedOnlineCharacter(auth, user.id, localEntry.id);
    if (existing) {
      if (!snapshotsEqual(existing.snapshot, localEntry.character)) {
        markConflict(localEntry.id, existing, 'existing-publication');
        throw new Error('ONLINE_CHARACTER_CONFLICT');
      }
      rememberVersion(localEntry.id, existing);
      return existing;
    }
    const { data, error } = await auth.client
      .from('online_characters')
      .insert(payload)
      .select(ONLINE_CHARACTER_COLUMNS)
      .single();
    if (error?.code === '23505') {
      const concurrent = await fetchOwnedOnlineCharacter(auth, user.id, localEntry.id);
      if (concurrent && snapshotsEqual(concurrent.snapshot, localEntry.character)) {
        rememberVersion(localEntry.id, concurrent);
        return concurrent;
      }
      markConflict(localEntry.id, concurrent, 'concurrent-publication');
      throw new Error('ONLINE_CHARACTER_CONFLICT');
    }
    if (error) throw error;
    rememberVersion(localEntry.id, data);
    return data;
  }

  async function resolveCharacterForOpen(localId, localCharacter) {
    let context;
    try {
      context = await requireUser();
    } catch (_) {
      const metadata = currentVersion(localId);
      if (metadata?.remoteId) {
        setCharacterSyncState(localId, metadata.conflict ? 'conflict' : 'pending',
          metadata.conflict ? 'Conflito Online · revisão necessária' : 'Cópia local · Online não verificado');
      }
      return { character: localCharacter, published: Boolean(metadata?.remoteId), verified: false };
    }

    const row = await fetchOwnedOnlineCharacter(context.auth, context.user.id, localId);
    const metadata = currentVersion(localId);
    if (!row) {
      if (metadata?.remoteId && metadata.ownerId === context.user.id) {
        markConflict(localId, null, 'remote-deleted');
        return { character: localCharacter, published: true, verified: true, conflict: true };
      }
      setCharacterSyncState(localId, 'local', 'Apenas Local');
      return { character: localCharacter, published: false, verified: true };
    }

    if (metadata?.ownerId && metadata.ownerId !== context.user.id) {
      markConflict(localId, row, 'account-changed');
      return { character: localCharacter, published: true, verified: true, conflict: true };
    }
    if (metadata?.conflict) {
      markConflict(localId, row, 'unresolved');
      return { character: localCharacter, published: true, verified: true, conflict: true };
    }

    const sameContent = snapshotsEqual(row.snapshot, localCharacter);
    if (!metadata) {
      if (!sameContent) {
        markConflict(localId, row, 'legacy-divergence');
        return { character: localCharacter, published: true, verified: true, conflict: true };
      }
      rememberVersion(localId, row);
    } else if (metadata.dirty) {
      if (metadata.baseUpdatedAt === row.updated_at) {
        characterSyncVersions.set(localId, metadata);
        setCharacterSyncState(localId, 'pending', 'Alterações pendentes', { syncedAt: metadata.baseUpdatedAt });
        return { character: localCharacter, published: true, verified: true, pending: true };
      }
      if (!sameContent) {
        markConflict(localId, row, 'stale-local-copy');
        return { character: localCharacter, published: true, verified: true, conflict: true };
      }
      rememberVersion(localId, row);
    } else {
      rememberVersion(localId, row);
    }

    const character = mergeRemoteSnapshot(row.snapshot, localCharacter);
    setCharacterSyncState(localId, 'synced', 'Publicado Online · Atualizado', { syncedAt: row.updated_at });
    return { character, published: true, verified: true, fromServer: true };
  }

  async function performCharacterSync(localId, character = null) {
    const epoch = syncEpoch;
    const { auth, user } = await requireUser();
    const local = localCharacters().find(item => item.id === localId);
    if (!local) return { ok: false, missing: true };
    const entry = character ? { ...local, character } : local;
    const attemptedPayload = characterPayload(entry, user.id);
    const row = await fetchOwnedOnlineCharacter(auth, user.id, localId);
    if (epoch !== syncEpoch) return { ok: false, cancelled: true };
    const metadata = currentVersion(localId);

    if (!row) {
      if (metadata?.remoteId) return markConflict(localId, null, 'remote-deleted');
      setCharacterSyncState(localId, 'local', 'Apenas Local');
      return { ok: false, localOnly: true };
    }
    if (metadata?.conflict) return markConflict(localId, row, 'unresolved');
    if (!metadata?.baseUpdatedAt) {
      if (rowMatchesPayload(row, attemptedPayload)) {
        rememberVersion(localId, row);
        setCharacterSyncState(localId, 'synced', 'Publicado Online · Atualizado', { syncedAt: row.updated_at });
        return { ok: true, row, acknowledged: true };
      }
      return markConflict(localId, row, 'missing-base-version');
    }
    if (metadata.remoteId !== row.id || metadata.ownerId !== user.id) {
      return markConflict(localId, row, 'publication-changed');
    }
    if (row.updated_at !== metadata.baseUpdatedAt) {
      if (rowMatchesPayload(row, attemptedPayload)) {
        rememberVersion(localId, row);
        setCharacterSyncState(localId, 'synced', 'Publicado Online · Atualizado', { syncedAt: row.updated_at });
        return { ok: true, row, acknowledged: true };
      }
      return markConflict(localId, row, 'stale-write');
    }

    if (rowMatchesPayload(row, attemptedPayload)) {
      rememberVersion(localId, row);
      characterSyncRetries.delete(localId);
      setCharacterSyncState(localId, 'synced', 'Publicado Online · Atualizado', { syncedAt: row.updated_at });
      return { ok: true, row, acknowledged: true, unchanged: true };
    }

    setCharacterSyncState(localId, 'syncing', 'Sincronizando');
    const { data, error } = await auth.client
      .from('online_characters')
      .update(attemptedPayload)
      .eq('id', row.id)
      .eq('owner_id', user.id)
      .eq('updated_at', metadata.baseUpdatedAt)
      .select(ONLINE_CHARACTER_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (epoch !== syncEpoch) return { ok: false, cancelled: true };
    if (data) {
      rememberVersion(localId, data);
      characterSyncRetries.delete(localId);
      setCharacterSyncState(localId, 'synced', 'Publicado Online · Atualizado', { syncedAt: data.updated_at });
      return { ok: true, row: data };
    }

    const latest = await fetchOwnedOnlineCharacter(auth, user.id, localId);
    if (!latest) return markConflict(localId, null, 'remote-deleted');
    if (rowMatchesPayload(latest, attemptedPayload)) {
      rememberVersion(localId, latest);
      characterSyncRetries.delete(localId);
      setCharacterSyncState(localId, 'synced', 'Publicado Online · Atualizado', { syncedAt: latest.updated_at });
      return { ok: true, row: latest, acknowledged: true };
    }
    return markConflict(localId, latest, 'stale-write');
  }

  async function synchronizePublishedCharacter(localId, character = null) {
    return queueCharacterSync(localId, character, { immediate: true, manual: true });
  }

  function scheduleSyncRetry(localId) {
    const attempts = (characterSyncRetries.get(localId) || 0) + 1;
    characterSyncRetries.set(localId, attempts);
    if (attempts > 4 || !global.CronicasSupabase?.authenticated) return false;
    const delay = Math.min(30000, 1500 * (2 ** (attempts - 1)));
    global.clearTimeout(characterSyncTimers.get(localId));
    characterSyncTimers.set(localId, global.setTimeout(() => {
      characterSyncTimers.delete(localId);
      void queueCharacterSync(localId, latestCharacterSnapshots.get(localId), { immediate: true, retry: true });
    }, delay));
    return true;
  }

  function flushCharacterSync(localId, epoch) {
    global.clearTimeout(characterSyncTimers.get(localId));
    characterSyncTimers.delete(localId);
    const waiters = characterSyncWaiters.get(localId) || [];
    characterSyncWaiters.set(localId, []);
    const character = latestCharacterSnapshots.get(localId) || null;
    const previous = characterSyncQueues.get(localId) || Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      if (epoch !== syncEpoch) return { ok: false, cancelled: true };
      try {
        return await performCharacterSync(localId, character);
      } catch (error) {
        if (epoch !== syncEpoch) return { ok: false, cancelled: true };
        console.error('[Personagem online] Falha de sincronização:', error);
        const retryScheduled = scheduleSyncRetry(localId);
        setCharacterSyncState(localId, 'error', retryScheduled
          ? 'Erro de sincronização · nova tentativa agendada'
          : 'Erro de sincronização · tente novamente');
        return { ok: false, error };
      }
    });
    characterSyncQueues.set(localId, next);
    void next.then(result => waiters.forEach(resolve => resolve(result))).finally(() => {
      if (characterSyncQueues.get(localId) === next) characterSyncQueues.delete(localId);
    });
  }

  function queueCharacterSync(localId, character = null, options = {}) {
    if (!localId) return Promise.resolve({ ok: false, missing: true });
    if (character) latestCharacterSnapshots.set(localId, character);
    const metadata = markDirty(localId);
    if (metadata?.conflict) {
      setCharacterSyncState(localId, 'conflict', 'Conflito Online · revisão necessária');
      return Promise.resolve({ ok: false, conflict: true });
    }
    if (!global.CronicasSupabase?.authenticated) {
      setCharacterSyncState(localId, metadata?.remoteId ? 'pending' : 'local',
        metadata?.remoteId ? 'Cópia local · Online não verificado' : 'Apenas Local');
      return Promise.resolve({ ok: false, offline: true });
    }
    global.clearTimeout(characterSyncTimers.get(localId));
    const epoch = syncEpoch;
    setCharacterSyncState(localId, 'pending', 'Alterações pendentes');
    const completion = new Promise(resolve => {
      const waiters = characterSyncWaiters.get(localId) || [];
      waiters.push(resolve);
      characterSyncWaiters.set(localId, waiters);
    });
    characterSyncTimers.set(localId, global.setTimeout(
      () => flushCharacterSync(localId, epoch),
      options.immediate ? 0 : 650
    ));
    return completion;
  }

  function getCharacterSyncState(localId) {
    return characterSyncStates.get(localId) || null;
  }

  async function refreshCharacterSyncStates(localSummaries = {}) {
    let context;
    try { context = await requireUser(); } catch (_) { return false; }
    const { data, error } = await context.auth.client.from('online_characters')
      .select(ONLINE_CHARACTER_COLUMNS).eq('owner_id', context.user.id);
    if (error) throw error;
    const published = new Map((data || []).map(row => [row.source_local_id, row]));
    const locals = new Map(localCharacters().map(entry => [entry.id, entry]));
    const onlineIds = (data || []).map(row => row.id);
    const chroniclesByCharacter = new Map();
    if (onlineIds.length) {
      const { data: links, error: linksError } = await context.auth.client
        .from('chronicle_cast_members').select('character_id, chronicle_id').in('character_id', onlineIds);
      if (linksError) throw linksError;
      const chronicleIds = [...new Set((links || []).map(row => row.chronicle_id))];
      let names = new Map();
      if (chronicleIds.length) {
        const { data: chronicles, error: chronicleError } = await context.auth.client.from('chronicles').select('id, name').in('id', chronicleIds);
        if (chronicleError) throw chronicleError;
        names = new Map((chronicles || []).map(row => [row.id, text(row.name) || 'Crônica online']));
      }
      (links || []).forEach(link => {
        const list = chroniclesByCharacter.get(link.character_id) || [];
        list.push(names.get(link.chronicle_id) || 'Crônica online');
        chroniclesByCharacter.set(link.character_id, list);
      });
    }
    Object.keys(localSummaries || {}).forEach(localId => {
      const metadata = currentVersion(localId);
      if (!published.has(localId)) {
        if (metadata?.remoteId && metadata.ownerId === context.user.id) markConflict(localId, null, 'remote-deleted');
        else setCharacterSyncState(localId, 'local', 'Apenas Local');
        return;
      }
      const online = published.get(localId);
      const chronicles = [...new Set(chroniclesByCharacter.get(online.id) || [])];
      const local = locals.get(localId);
      if (metadata?.conflict) {
        setCharacterSyncState(localId, 'conflict', 'Conflito Online · revisão necessária', { chronicles, syncedAt: metadata.baseUpdatedAt });
        return;
      }
      if (!metadata) {
        if (local && snapshotsEqual(online.snapshot, local.character)) {
          rememberVersion(localId, online);
          setCharacterSyncState(localId, 'synced', 'Publicado Online · Atualizado', { chronicles, syncedAt: online.updated_at });
        } else {
          markConflict(localId, online, 'legacy-divergence');
        }
        return;
      }
      if (metadata.dirty) {
        if (metadata.baseUpdatedAt === online.updated_at) {
          setCharacterSyncState(localId, 'pending', 'Alterações pendentes', { chronicles, syncedAt: metadata.baseUpdatedAt });
          void queueCharacterSync(localId, local?.character);
        } else if (local && snapshotsEqual(online.snapshot, local.character)) {
          rememberVersion(localId, online);
          setCharacterSyncState(localId, 'synced', 'Publicado Online · Atualizado', { chronicles, syncedAt: online.updated_at });
        } else {
          markConflict(localId, online, 'stale-local-copy');
        }
        return;
      }
      if (metadata.baseUpdatedAt !== online.updated_at) {
        characterSyncVersions.set(localId, metadata);
        setCharacterSyncState(localId, 'remote', 'Atualização Online disponível', { chronicles, syncedAt: online.updated_at });
        return;
      }
      characterSyncVersions.set(localId, metadata);
      setCharacterSyncState(localId, 'synced', 'Publicado Online · Atualizado', { chronicles, syncedAt: online.updated_at });
    });
    return true;
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
      const online = await createOnlineCharacter(entry, user.id);
      setCharacterSyncState(localId, 'synced', 'Publicado Online · Atualizado', { syncedAt: online.updated_at });
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
      const result = await queueCharacterSync(localId, entry.character, { immediate: true, manual: true });
      if (!result?.ok) {
        if (result?.conflict) setCastFeedback('A ficha Online mudou em outro local. Nenhuma versão foi sobrescrita.', 'error', true);
        else setCastFeedback('A sincronização não foi concluída. A cópia local foi preservada.', 'error', true);
        return;
      }
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
    const token = ++managerEpoch, view = viewEpoch;
    const list = document.getElementById('chronicleCastSelectionList');
    const noResults = document.getElementById('chronicleCastNoResults');
    if (!list || !noResults) return true;
    list.replaceChildren();
    setCastFeedback('Carregando seus personagens…', '', true);
    try {
      const [published, cast] = await Promise.all([fetchOwnedPublishedCharacters(), fetchCast()]);
      if (token !== managerEpoch || view !== viewEpoch || !castManagerOpen) return true;
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
      if (token !== managerEpoch || view !== viewEpoch || !castManagerOpen) return true;
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
    const view = viewEpoch;
    refreshTimer = global.setTimeout(async () => {
      if (view !== viewEpoch || !isOnlineChronicle()) return;
      if (currentChronicle.role !== 'owner') {
        try {
          const accessible = await global.ChroniclesOnline?.getChronicle?.(currentChronicle.id);
          if (view !== viewEpoch) return;
          if (!accessible) {
            global.showNotification?.('Seu acesso a esta Crônica foi removido.', 'warning');
            reset();
            await global.showChroniclesIndex?.();
            return;
          }
        } catch (_) {
          // Erros transitórios de rede não expulsam o usuário da tela.
        }
      }
      if (view !== viewEpoch || !isOnlineChronicle()) return;
      const participantsVisible = !document.getElementById('chroniclePanelParticipants')?.hidden;
      const castVisible = !document.getElementById('chroniclePanelCast')?.hidden;
      if (participantsVisible) void renderParticipants(currentChronicle);
      if (castVisible && !castManagerOpen) void renderCast(currentChronicle);
      if (castManagerOpen) void renderManagerList();
    }, 180);
  }

  function stopRealtime() {
    global.clearTimeout(refreshTimer);
    refreshTimer = null;
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
        event: '*', schema: 'public', table: 'online_roll_records', filter: `chronicle_id=eq.${chronicle.remoteId}`
      }, payload => {
        global.dispatchEvent(new CustomEvent('cronicas:online-rolls-change', {
          detail: { chronicleId: chronicle.remoteId, payload }
        }));
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'online_characters'
      }, payload => {
        const id = payload?.new?.id || payload?.old?.id;
        if (id && currentCastIds.has(id)) scheduleRealtimeRefresh();
      })
      .subscribe();
  }

  function applyDetailMode(chronicle) {
    ++viewEpoch;
    currentChronicle = chronicle || null;
    castManagerOpen = false;
    if (isOnlineChronicle(chronicle)) startRealtime(chronicle);
    else stopRealtime();
  }

  function reset() {
    ++viewEpoch;
    stopRealtime();
    currentChronicle = null;
    castManagerOpen = false;
    castSearch = '';
    pending = false;
    currentCastIds = new Set();
  }

  global.addEventListener('cronicas:auth-change', event => {
    const userId = event.detail?.user?.id || null;
    if (userId === syncUserId) return;
    syncUserId = userId;
    ++syncEpoch;
    reset();
    characterSyncTimers.forEach(timer => global.clearTimeout(timer));
    characterSyncTimers.clear();
    characterSyncWaiters.forEach(waiters => {
      waiters.forEach(resolve => resolve({ ok: false, cancelled: true }));
    });
    characterSyncWaiters.clear();
    characterSyncQueues.clear();
    characterSyncRetries.clear();
    latestCharacterSnapshots.clear();
    characterSyncVersions.clear();
    characterSyncStates.clear();
  });

  global.ChroniclesCollaboration = Object.freeze({
    applyDetailMode,
    reset,
    renderParticipants,
    renderCast,
    openCastManager,
    closeCastManager,
    renderManagerList,
    handleCastSearch,
    resolveCharacterForOpen,
    queueCharacterSync,
    synchronizePublishedCharacter,
    getCharacterSyncState,
    refreshCharacterSyncStates
  });
})(window);
