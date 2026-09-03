(function initializeChroniclesOnline(global) {
  'use strict';

  const ONLINE_PREFIX = 'online:';
  const ALLOWED_TYPES = new Set(['campaign', 'oneshot']);
  const routerCache = new WeakMap();

  function isOnlineId(id) {
    return typeof id === 'string' && id.startsWith(ONLINE_PREFIX);
  }

  function remoteIdFrom(id) {
    if (!isOnlineId(id)) throw new TypeError('INVALID_ONLINE_CHRONICLE_ID');
    const remoteId = id.slice(ONLINE_PREFIX.length);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(remoteId)) {
      throw new TypeError('INVALID_ONLINE_CHRONICLE_ID');
    }
    return remoteId;
  }

  async function getAuth() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (global.CronicasSupabase) {
        await global.CronicasSupabase.ready;
        return global.CronicasSupabase;
      }
      await new Promise(resolve => global.setTimeout(resolve, 20));
    }
    throw new Error('ONLINE_AUTH_UNAVAILABLE');
  }

  function normalizeFields(input) {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const synopsis = typeof input?.synopsis === 'string' ? input.synopsis.trim() : '';
    const type = typeof input?.type === 'string' ? input.type : '';
    if (!name || name.length > 120) throw new TypeError('INVALID_CHRONICLE_NAME');
    if (synopsis.length > 1200) throw new TypeError('INVALID_CHRONICLE_SYNOPSIS');
    if (!ALLOWED_TYPES.has(type)) throw new TypeError('INVALID_CHRONICLE_TYPE');
    return { name, synopsis, type };
  }

  function normalizeRow(row, userId) {
    if (!row || typeof row !== 'object' || !row.id || !row.name || !ALLOWED_TYPES.has(row.type)) return null;
    const createdAt = Number.isFinite(Date.parse(row.created_at))
      ? new Date(row.created_at).toISOString()
      : new Date(0).toISOString();
    const updatedAt = Number.isFinite(Date.parse(row.updated_at))
      ? new Date(row.updated_at).toISOString()
      : createdAt;
    return {
      id: `${ONLINE_PREFIX}${row.id}`,
      remoteId: row.id,
      ownerId: row.owner_id,
      role: row.owner_id === userId ? 'owner' : 'member',
      storage: 'online',
      schemaVersion: 1,
      name: String(row.name).trim(),
      synopsis: typeof row.synopsis === 'string' ? row.synopsis : '',
      type: row.type,
      hasCover: false,
      createdAt,
      updatedAt
    };
  }

  async function requireUser() {
    const auth = await getAuth();
    const user = await auth.getUser();
    if (!user) throw new Error('ONLINE_AUTH_REQUIRED');
    return { auth, user };
  }

  async function listOnlineChronicles() {
    const auth = await getAuth();
    const user = await auth.getUser();
    if (!user) return [];
    const { data, error } = await auth.client
      .from('chronicles')
      .select('id, owner_id, name, synopsis, type, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(row => normalizeRow(row, user.id)).filter(Boolean);
  }

  async function getOnlineChronicle(id) {
    const remoteId = remoteIdFrom(id);
    const { auth, user } = await requireUser();
    const { data, error } = await auth.client
      .from('chronicles')
      .select('id, owner_id, name, synopsis, type, created_at, updated_at')
      .eq('id', remoteId)
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeRow(data, user.id) : null;
  }

  async function createOnlineChronicle(input) {
    const fields = normalizeFields(input);
    if (input?.cover) throw new Error('ONLINE_COVER_UNSUPPORTED');
    const { auth, user } = await requireUser();
    const { data, error } = await auth.client
      .from('chronicles')
      .insert({ ...fields, owner_id: user.id })
      .select('id, owner_id, name, synopsis, type, created_at, updated_at')
      .single();
    if (error) throw error;
    return normalizeRow(data, user.id);
  }

  async function updateOnlineChronicle(id, input, options = {}) {
    const remoteId = remoteIdFrom(id);
    const fields = normalizeFields(input);
    if (options.coverAction && options.coverAction !== 'keep') throw new Error('ONLINE_COVER_UNSUPPORTED');
    const { auth, user } = await requireUser();
    const current = await getOnlineChronicle(id);
    if (!current) throw new Error('CHRONICLE_NOT_FOUND');
    if (current.ownerId !== user.id) throw new Error('ONLINE_CHRONICLE_FORBIDDEN');
    const expectedUpdatedAt = typeof options.expectedUpdatedAt === 'string' ? options.expectedUpdatedAt : '';

    let query = auth.client
      .from('chronicles')
      .update(fields)
      .eq('id', remoteId);
    if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);

    const { data, error } = await query
      .select('id, owner_id, name, synopsis, type, created_at, updated_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const latest = await getOnlineChronicle(id);
      if (!latest) throw new Error('CHRONICLE_NOT_FOUND');
      if (expectedUpdatedAt && latest.updatedAt !== expectedUpdatedAt) throw new Error('CHRONICLE_UPDATE_CONFLICT');
      throw new Error('ONLINE_CHRONICLE_FORBIDDEN');
    }
    return normalizeRow(data, user.id);
  }

  async function deleteOnlineChronicle(id) {
    const remoteId = remoteIdFrom(id);
    const { auth, user } = await requireUser();
    const current = await getOnlineChronicle(id);
    if (!current) throw new Error('CHRONICLE_NOT_FOUND');
    if (current.ownerId !== user.id) throw new Error('ONLINE_CHRONICLE_FORBIDDEN');
    const { data, error } = await auth.client
      .from('chronicles')
      .delete()
      .eq('id', remoteId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('CHRONICLE_NOT_FOUND');
    return true;
  }

  function createStorageSelector() {
    const typeFieldset = document.getElementById('chronicleTypeFieldset');
    if (!typeFieldset || document.getElementById('chronicleStorageFieldset')) return;

    const fieldset = document.createElement('fieldset');
    fieldset.className = 'chronicle-online-storage-fieldset';
    fieldset.id = 'chronicleStorageFieldset';
    const legend = document.createElement('legend');
    legend.textContent = 'Armazenamento da Crônica';
    const options = document.createElement('div');
    options.className = 'chronicle-online-storage-options';

    const makeOption = (value, title, description, checked = false) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'chronicleStorage';
      input.value = value;
      input.checked = checked;
      const copy = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = title;
      const small = document.createElement('small');
      small.textContent = description;
      copy.append(strong, small);
      label.append(input, copy);
      return { label, input };
    };

    const local = makeOption('local', 'Local', 'Salva somente neste navegador.', true);
    const online = makeOption('online', 'Online', 'Compartilhada pela sua conta e pelo Supabase.');
    online.input.id = 'chronicleStorageOnline';
    options.append(local.label, online.label);

    const feedback = document.createElement('p');
    feedback.className = 'chronicle-online-storage-help';
    feedback.id = 'chronicleStorageHelp';
    fieldset.append(legend, options, feedback);
    typeFieldset.insertAdjacentElement('afterend', fieldset);

    fieldset.addEventListener('change', event => {
      if (event.target?.name !== 'chronicleStorage') return;
      syncCoverControls();
    });
    updateStorageSelectorAuth();
    syncCoverControls();
  }

  function getSelectedStorage() {
    return document.querySelector('input[name="chronicleStorage"]:checked')?.value === 'online'
      ? 'online'
      : 'local';
  }

  function setFormStorage(storage = 'local', { locked = false } = {}) {
    createStorageSelector();
    const value = storage === 'online' ? 'online' : 'local';
    const inputs = [...document.querySelectorAll('input[name="chronicleStorage"]')];
    inputs.forEach(input => {
      input.checked = input.value === value;
      input.disabled = locked || (input.value === 'online' && !global.CronicasSupabase?.authenticated);
    });
    const fieldset = document.getElementById('chronicleStorageFieldset');
    if (fieldset) fieldset.dataset.locked = String(locked);
    syncCoverControls();
  }

  function updateStorageSelectorAuth() {
    createStorageSelector();
    const online = document.getElementById('chronicleStorageOnline');
    const feedback = document.getElementById('chronicleStorageHelp');
    if (!online || !feedback) return;
    const locked = document.getElementById('chronicleStorageFieldset')?.dataset.locked === 'true';
    const authenticated = Boolean(global.CronicasSupabase?.authenticated);
    if (!locked) online.disabled = !authenticated;
    if (!authenticated && online.checked && !locked) {
      const local = document.querySelector('input[name="chronicleStorage"][value="local"]');
      if (local) local.checked = true;
    }
    feedback.textContent = authenticated
      ? 'Online exige conta conectada. Nesta etapa, capas continuam disponíveis apenas para Crônicas locais.'
      : 'Entre na sua conta para habilitar Crônicas online.';
    syncCoverControls();
  }

  function syncCoverControls() {
    const online = getSelectedStorage() === 'online';
    const section = document.getElementById('chronicleCoverPreview')?.closest('.chronicle-cover-section');
    if (!section) return;
    section.dataset.onlineUnavailable = String(online);
    const input = document.getElementById('chronicleCoverInput');
    const remove = document.getElementById('removeChronicleCover');
    const select = input?.closest('label');
    if (online && remove && !remove.hidden) remove.click();
    if (input) input.disabled = online;
    if (select) select.setAttribute('aria-disabled', String(online));
    if (remove) remove.disabled = online;
  }

  function decorateRecord(card, metadata, chronicle) {
    if (!card || !metadata || !chronicle) return;
    const storage = chronicle.storage === 'online' ? 'online' : 'local';
    card.dataset.chronicleStorage = storage;
    if (metadata.querySelector('.chronicle-storage-badge')) return;
    const badge = document.createElement('span');
    badge.className = `chronicle-storage-badge is-${storage}`;
    badge.textContent = storage === 'online' ? 'Online' : 'Local';
    metadata.appendChild(badge);
  }

  function applyDetailMode(chronicle) {
    if (!chronicle) return;
    const online = chronicle.storage === 'online' || isOnlineId(chronicle.id);
    const owner = !online || chronicle.role === 'owner';
    const metadata = document.querySelector('.chronicle-detail-metadata');
    let badge = document.getElementById('chronicleDetailStorageBadge');
    if (metadata && !badge) {
      badge = document.createElement('span');
      badge.id = 'chronicleDetailStorageBadge';
      badge.className = 'chronicle-storage-badge';
      metadata.appendChild(badge);
    }
    if (badge) {
      badge.className = `chronicle-storage-badge is-${online ? 'online' : 'local'}`;
      badge.textContent = online ? 'Online' : 'Local';
    }

    ['chronicleTabCast', 'chronicleTabParticipants', 'chronicleTabEncounters'].forEach(id => {
      const tab = document.getElementById(id);
      if (!tab) return;
      tab.disabled = online;
      tab.title = online ? 'Esta área será conectada às Crônicas online em uma próxima etapa.' : '';
    });

    const masterShield = document.getElementById('openMasterShield');
    if (masterShield) {
      masterShield.disabled = online;
      masterShield.title = online ? 'O Escudo online será ligado às permissões do Mestre em uma próxima etapa.' : '';
    }
    const edit = document.getElementById('editChronicleAction');
    if (edit) {
      edit.disabled = online && !owner;
      edit.title = online && !owner ? 'Somente o Mestre pode editar esta Crônica online.' : '';
    }
  }

  function getErrorMessage(error) {
    const code = error?.message || '';
    if (code === 'ONLINE_AUTH_REQUIRED') return 'Entre na sua conta para usar Crônicas online.';
    if (code === 'ONLINE_AUTH_UNAVAILABLE') return 'O serviço online ainda não ficou disponível. Recarregue a página e tente novamente.';
    if (code === 'ONLINE_COVER_UNSUPPORTED') return 'Nesta etapa, Crônicas online ainda não aceitam capa. Remova a capa ou salve como Local.';
    if (code === 'ONLINE_CHRONICLE_FORBIDDEN') return 'Somente o Mestre pode alterar esta Crônica online.';
    if (code === 'INVALID_ONLINE_CHRONICLE_ID') return 'A referência desta Crônica online é inválida.';
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('failed to fetch') || message.includes('network')) return 'Não foi possível alcançar o serviço online. Confira sua conexão e tente novamente.';
    return '';
  }

  function createRouter(localStorageApi) {
    if (!localStorageApi || typeof localStorageApi !== 'object') throw new TypeError('INVALID_LOCAL_CHRONICLES_STORAGE');
    if (routerCache.has(localStorageApi)) return routerCache.get(localStorageApi);

    const overrides = {
      async listChronicles() {
        const [local, online] = await Promise.all([
          localStorageApi.listChronicles(),
          listOnlineChronicles()
        ]);
        return [
          ...local.map(chronicle => ({ ...chronicle, storage: 'local', role: 'local' })),
          ...online
        ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      },
      async getChronicle(id) {
        if (isOnlineId(id)) return getOnlineChronicle(id);
        const chronicle = await localStorageApi.getChronicle(id);
        return chronicle ? { ...chronicle, storage: 'local', role: 'local' } : null;
      },
      async getChronicleCover(id) {
        if (isOnlineId(id)) return null;
        return localStorageApi.getChronicleCover(id);
      },
      async createChronicle(input) {
        return getSelectedStorage() === 'online'
          ? createOnlineChronicle(input)
          : localStorageApi.createChronicle(input).then(chronicle => ({ ...chronicle, storage: 'local', role: 'local' }));
      },
      async updateChronicle(id, input, options) {
        if (isOnlineId(id)) return updateOnlineChronicle(id, input, options);
        return localStorageApi.updateChronicle(id, input, options).then(chronicle => ({ ...chronicle, storage: 'local', role: 'local' }));
      },
      async deleteChronicle(id) {
        if (isOnlineId(id)) return deleteOnlineChronicle(id);
        return localStorageApi.deleteChronicle(id);
      }
    };

    const router = new Proxy(localStorageApi, {
      get(target, property, receiver) {
        if (Object.prototype.hasOwnProperty.call(overrides, property)) return overrides[property];
        return Reflect.get(target, property, receiver);
      }
    });
    routerCache.set(localStorageApi, router);
    return router;
  }

  function refreshIndexAfterAuthChange() {
    updateStorageSelectorAuth();
    const panel = document.getElementById('managerChroniclesPanel');
    const index = document.getElementById('chroniclesIndexView');
    if (!panel?.hidden && !index?.hidden && typeof global.renderChroniclesIndex === 'function') {
      void global.renderChroniclesIndex();
    }
  }

  global.addEventListener('cronicas:auth-change', refreshIndexAfterAuthChange);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createStorageSelector, { once: true });
  } else {
    createStorageSelector();
  }

  global.ChroniclesOnline = Object.freeze({
    ONLINE_PREFIX,
    isOnlineId,
    createRouter,
    getSelectedStorage,
    setFormStorage,
    updateStorageSelectorAuth,
    decorateRecord,
    applyDetailMode,
    getErrorMessage,
    listChronicles: listOnlineChronicles,
    getChronicle: getOnlineChronicle,
    createChronicle: createOnlineChronicle,
    updateChronicle: updateOnlineChronicle,
    deleteChronicle: deleteOnlineChronicle
  });
})(window);
