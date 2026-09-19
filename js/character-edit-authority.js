(function initializeCharacterEditAuthority(global) {
  'use strict';

  const CHANNEL_NAME = 'cronicas-ressonancia-character-tabs-v1';
  const TAB_SESSION_KEY = 'cronicasRessonanciaTabIdV1';
  const MESSAGE_VERSION = 1;
  const HANDSHAKE_DELAY = 70;
  const states = new Map();
  const processedMessages = new Set();
  const peersByCharacter = new Map();
  const hooks = { beforeYield: null, reconcile: null };
  const internalAuthority = Object.freeze({ internal: true });
  const instanceId = createId();
  let tabId = readOrCreateTabId();
  let channel = null;
  let handshakePromise = null;

  function createId() {
    if (typeof global.crypto?.randomUUID === 'function') return global.crypto.randomUUID();
    return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function readOrCreateTabId() {
    try {
      const stored = global.sessionStorage?.getItem(TAB_SESSION_KEY);
      if (stored) return stored;
      const created = createId();
      global.sessionStorage?.setItem(TAB_SESSION_KEY, created);
      return created;
    } catch (_) {
      return createId();
    }
  }

  function persistTabId(value) {
    tabId = value;
    try { global.sessionStorage?.setItem(TAB_SESSION_KEY, value); } catch (_) { /* Identidade em memória permanece válida. */ }
  }

  function supportsWebLocks() {
    return typeof global.navigator?.locks?.request === 'function';
  }

  function lockName(localId) {
    return `cronicas:character-edit:v1:${encodeURIComponent(String(localId || ''))}`;
  }

  function stateFor(localId) {
    return states.get(localId) || null;
  }

  function ensureState(localId) {
    let state = states.get(localId);
    if (!state) {
      state = {
        localId,
        mode: 'closed',
        generation: 0,
        releaseHold: null,
        lockRequest: null,
        abortController: null,
        activeOperations: new Set(),
        operationWaiters: [],
        peerDetected: false,
        lastError: ''
      };
      states.set(localId, state);
    }
    return state;
  }

  function publicState(state) {
    if (!state) return { mode: 'closed', canMutate: false, guaranteed: supportsWebLocks(), peerDetected: false };
    return {
      localId: state.localId,
      mode: state.mode,
      canMutate: canMutate(state.localId),
      guaranteed: supportsWebLocks(),
      peerDetected: state.peerDetected === true,
      tabId,
      instanceId,
      lastError: state.lastError || ''
    };
  }

  function emitState(localId) {
    const detail = publicState(stateFor(localId));
    global.dispatchEvent?.(new CustomEvent('cronicas:character-edit-authority', { detail }));
    return detail;
  }

  function trimProcessedMessages() {
    if (processedMessages.size <= 600) return;
    const iterator = processedMessages.values();
    for (let index = 0; index < 200; index += 1) processedMessages.delete(iterator.next().value);
  }

  function post(type, localId = '', payload = {}) {
    if (!channel) return false;
    const message = {
      version: MESSAGE_VERSION,
      messageId: createId(),
      type,
      localId: String(localId || ''),
      tabId,
      instanceId,
      sentAt: new Date().toISOString(),
      payload: payload && typeof payload === 'object' ? payload : {}
    };
    processedMessages.add(message.messageId);
    trimProcessedMessages();
    channel.postMessage(message);
    return true;
  }

  function hasHeldLock() {
    return [...states.values()].some(state => ['reconciling', 'editor', 'restricted', 'yielding'].includes(state.mode));
  }

  function regenerateTabId(previousTabId = tabId) {
    const nextTabId = createId();
    persistTabId(nextTabId);
    post('tab-id-changed', '', { previousTabId, nextTabId });
    return nextTabId;
  }

  function collisionWinner(message) {
    const ownHasLock = hasHeldLock();
    const peerHasLock = message.payload?.holdsLock === true;
    if (ownHasLock !== peerHasLock) return ownHasLock ? 'self' : 'peer';
    return instanceId.localeCompare(String(message.instanceId || '')) <= 0 ? 'self' : 'peer';
  }

  function handleIdentityCollision(message) {
    if (message.tabId !== tabId || message.instanceId === instanceId) return;
    if (collisionWinner(message) === 'peer') {
      regenerateTabId(tabId);
      post('tab-hello', '', { holdsLock: hasHeldLock() });
      return;
    }
    post('tab-id-in-use', '', {
      targetInstanceId: message.instanceId,
      collidedTabId: message.tabId,
      holdsLock: hasHeldLock()
    });
  }

  function rememberPeer(message) {
    if (!message.localId) return;
    const peers = peersByCharacter.get(message.localId) || new Map();
    if (message.type === 'character-closed') peers.delete(message.instanceId);
    else peers.set(message.instanceId, {
      tabId: message.tabId,
      instanceId: message.instanceId,
      type: message.type,
      seenAt: Date.now()
    });
    peersByCharacter.set(message.localId, peers);
    const state = stateFor(message.localId);
    if (state) {
      state.peerDetected = peers.size > 0;
      emitState(message.localId);
    }
  }

  async function handleTakeoverRequest(message) {
    const state = stateFor(message.localId);
    if (!state || !['editor', 'restricted'].includes(state.mode)) return;
    state.mode = 'yielding';
    emitState(message.localId);
    post('editor-yielding', message.localId, { targetInstanceId: message.instanceId });
    try {
      if (typeof hooks.beforeYield === 'function') {
        await hooks.beforeYield({
          localId: message.localId,
          authorityToken: internalAuthority,
          targetTabId: message.tabId,
          targetInstanceId: message.instanceId
        });
      }
      await waitForOperations(message.localId);
      post('draft-persisted', message.localId, { targetInstanceId: message.instanceId });
      await release(message.localId, { becomeObserver: true, announce: true });
    } catch (error) {
      state.mode = 'editor';
      state.lastError = String(error?.message || error || 'TAKEOVER_PREPARATION_FAILED');
      emitState(message.localId);
      post('takeover-busy', message.localId, {
        targetInstanceId: message.instanceId,
        reason: state.lastError
      });
    }
  }

  function handleMessage(event) {
    const message = event?.data;
    if (!message || message.version !== MESSAGE_VERSION || !message.messageId || !message.instanceId) return;
    if (message.instanceId === instanceId || processedMessages.has(message.messageId)) return;
    processedMessages.add(message.messageId);
    trimProcessedMessages();

    if (message.type === 'tab-hello') {
      handleIdentityCollision(message);
      post('tab-present', '', {
        targetInstanceId: message.instanceId,
        holdsLock: hasHeldLock()
      });
      return;
    }
    if (
      message.type === 'tab-id-in-use'
      && message.payload?.targetInstanceId === instanceId
      && message.payload?.collidedTabId === tabId
    ) {
      regenerateTabId(tabId);
      post('tab-hello', '', { holdsLock: hasHeldLock() });
      return;
    }
    if (message.type === 'tab-present') {
      handleIdentityCollision({ ...message, tabId: message.tabId });
      return;
    }

    rememberPeer(message);
    if (message.type === 'character-opened' && stateFor(message.localId)?.mode !== 'closed') {
      post('character-present', message.localId, { targetInstanceId: message.instanceId });
    }
    if (
      message.type === 'takeover-busy'
      && message.payload?.targetInstanceId === instanceId
    ) {
      const state = stateFor(message.localId);
      if (state?.mode === 'waiting') {
        state.lastError = String(message.payload?.reason || 'TAKEOVER_BUSY');
        state.abortController?.abort?.();
      }
    }
    if (message.type === 'takeover-requested') void handleTakeoverRequest(message);
    global.dispatchEvent?.(new CustomEvent('cronicas:character-peer-event', { detail: message }));
  }

  function initializeChannel() {
    if (typeof global.BroadcastChannel !== 'function') return null;
    try {
      channel = new global.BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener('message', handleMessage);
      post('tab-hello', '', { holdsLock: false });
      return channel;
    } catch (error) {
      console.warn('[Coordenação entre abas] BroadcastChannel indisponível:', error);
      channel = null;
      return null;
    }
  }

  function ensureHandshake() {
    if (handshakePromise) return handshakePromise;
    handshakePromise = new Promise(resolve => global.setTimeout(resolve, HANDSHAKE_DELAY));
    return handshakePromise;
  }

  function operationAllowed(state, operation) {
    if (!state) return true;
    if (state.mode === 'consultative' || state.mode === 'editor') return true;
    return state.mode === 'restricted' && operation === 'conflict-resolution';
  }

  function canMutate(localId, operation = 'edit') {
    if (!localId) return false;
    return operationAllowed(stateFor(localId), operation);
  }

  function beginOperation(localId, operation = 'edit', options = {}) {
    const state = stateFor(localId);
    const allowReconcile = options.allowDuringReconcile === true && state?.mode === 'reconciling';
    const allowYield = options.allowDuringYield === true && state?.mode === 'yielding';
    if (!allowReconcile && !allowYield && !operationAllowed(state, operation)) return null;
    const token = Object.freeze({
      localId,
      operation,
      generation: state?.generation || 0,
      instanceId,
      id: createId()
    });
    if (state) state.activeOperations.add(token);
    return token;
  }

  function endOperation(token) {
    if (!token?.localId) return;
    const state = stateFor(token.localId);
    if (!state) return;
    state.activeOperations.delete(token);
    if (!state.activeOperations.size) {
      const waiters = state.operationWaiters.splice(0);
      waiters.forEach(resolve => resolve());
    }
  }

  function waitForOperations(localId) {
    const state = stateFor(localId);
    if (!state?.activeOperations.size) return Promise.resolve();
    return new Promise(resolve => state.operationWaiters.push(resolve));
  }

  function authorizeWrite(localId, token = null, operation = 'write') {
    const state = stateFor(localId);
    if (!state) return true;
    if (token === internalAuthority) return ['reconciling', 'yielding', 'editor', 'restricted', 'consultative'].includes(state.mode);
    if (!token || token.localId !== localId || token.instanceId !== instanceId) return false;
    return state.activeOperations.has(token) && token.operation === operation;
  }

  function requestPersistentLock(localId, wait) {
    const state = ensureState(localId);
    if (!supportsWebLocks()) {
      state.mode = 'consultative';
      emitState(localId);
      return Promise.resolve({ acquired: true, guaranteed: false, mode: state.mode });
    }
    if (['reconciling', 'editor', 'restricted', 'yielding'].includes(state.mode)) {
      return Promise.resolve({ acquired: true, guaranteed: true, mode: state.mode });
    }
    if (state.lockRequest) return state.lockRequest;

    const abortController = wait && typeof global.AbortController === 'function' ? new global.AbortController() : null;
    state.abortController = abortController;
    state.mode = wait ? 'waiting' : 'acquiring';
    emitState(localId);
    let settleAcquisition;
    const acquisition = new Promise(resolve => { settleAcquisition = resolve; });
    const options = wait ? {} : { ifAvailable: true };
    if (abortController) options.signal = abortController.signal;

    const request = global.navigator.locks.request(lockName(localId), options, async lock => {
      if (!lock) {
        state.mode = 'observer';
        settleAcquisition({ acquired: false, guaranteed: true, mode: state.mode });
        emitState(localId);
        return;
      }
      state.generation += 1;
      state.mode = 'reconciling';
      state.lastError = '';
      const hold = new Promise(resolve => { state.releaseHold = resolve; });
      settleAcquisition({ acquired: true, guaranteed: true, mode: state.mode });
      emitState(localId);
      await hold;
    }).catch(error => {
      if (error?.name !== 'AbortError') {
        state.lastError = String(error?.message || error);
        console.warn('[Coordenação entre abas] Não foi possível obter o Web Lock:', error);
      }
      if (state.mode !== 'closed') state.mode = 'observer';
      settleAcquisition({ acquired: false, guaranteed: true, mode: state.mode, error });
      emitState(localId);
    }).finally(() => {
      state.lockRequest = null;
      state.abortController = null;
      state.releaseHold = null;
    });
    state.lockRequest = acquisition;
    state.lockLifecycle = request;
    return acquisition;
  }

  async function open(localId) {
    if (!localId) return { acquired: false, guaranteed: supportsWebLocks(), mode: 'closed' };
    await ensureHandshake();
    const result = await requestPersistentLock(localId, false);
    post('character-opened', localId, { mode: result.mode, guaranteed: result.guaranteed });
    if (result.acquired && !result.guaranteed) post('edit-lease-advisory', localId, { guaranteed: false });
    return result;
  }

  function activate(localId, options = {}) {
    const state = ensureState(localId);
    if (supportsWebLocks() && !['reconciling', 'restricted', 'editor'].includes(state.mode)) return false;
    state.mode = options.restricted === true ? 'restricted' : (supportsWebLocks() ? 'editor' : 'consultative');
    emitState(localId);
    post('edit-lease-acquired', localId, {
      mode: state.mode,
      guaranteed: supportsWebLocks(),
      restricted: options.restricted === true
    });
    return true;
  }

  async function release(localId, options = {}) {
    const state = stateFor(localId);
    if (!state) return true;
    state.abortController?.abort?.();
    await waitForOperations(localId);
    const releaseHold = state.releaseHold;
    state.releaseHold = null;
    if (releaseHold) releaseHold();
    state.mode = options.becomeObserver === true ? 'observer' : 'closed';
    emitState(localId);
    if (options.announce !== false) post(options.becomeObserver ? 'edit-lease-released' : 'character-closed', localId);
    if (state.mode === 'closed') states.delete(localId);
    return true;
  }

  async function requestTakeover(localId) {
    const state = ensureState(localId);
    if (!supportsWebLocks()) {
      state.peerDetected = true;
      state.mode = 'consultative';
      emitState(localId);
      post('takeover-advisory', localId, { guaranteed: false });
      return { acquired: true, guaranteed: false, advisory: true };
    }
    if (['editor', 'restricted'].includes(state.mode)) return { acquired: true, guaranteed: true, mode: state.mode };
    post('takeover-requested', localId, { requestedBy: instanceId });
    const result = await requestPersistentLock(localId, true);
    if (!result.acquired) return result;
    let reconciliation = null;
    try {
      if (typeof hooks.reconcile === 'function') {
        reconciliation = await hooks.reconcile({
          localId,
          authorityToken: internalAuthority,
          reason: 'takeover'
        });
      }
      post('reconciliation-completed', localId, {
        conflict: reconciliation?.conflict === true,
        published: reconciliation?.published === true
      });
      activate(localId, { restricted: reconciliation?.conflict === true });
      return { ...result, reconciliation, mode: stateFor(localId)?.mode };
    } catch (error) {
      state.lastError = String(error?.message || error || 'TAKEOVER_RECONCILIATION_FAILED');
      await release(localId, { becomeObserver: true, announce: true });
      return { acquired: false, guaranteed: true, error };
    }
  }

  async function runExclusive(localId, operation, callback) {
    const state = stateFor(localId);
    if (state) {
      const token = beginOperation(localId, operation);
      if (!token) throw new Error('CHARACTER_EDIT_NOT_AUTHORIZED');
      try { return await callback(token); } finally { endOperation(token); }
    }
    if (!supportsWebLocks()) return callback(null);
    let executed = false;
    return global.navigator.locks.request(lockName(localId), { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('CHARACTER_EDIT_LOCKED_IN_ANOTHER_TAB');
      executed = true;
      const temporary = ensureState(localId);
      temporary.mode = 'editor';
      temporary.generation += 1;
      const token = beginOperation(localId, operation);
      try { return await callback(token); } finally {
        endOperation(token);
        states.delete(localId);
        if (executed) post('character-updated', localId, { operation });
      }
    });
  }

  function configure(nextHooks = {}) {
    if (typeof nextHooks.beforeYield === 'function') hooks.beforeYield = nextHooks.beforeYield;
    if (typeof nextHooks.reconcile === 'function') hooks.reconcile = nextHooks.reconcile;
  }

  function announce(type, localId, payload = {}) {
    return post(type, localId, payload);
  }

  function getState(localId) {
    return publicState(stateFor(localId));
  }

  function shutdown() {
    [...states.keys()].forEach(localId => {
      post('character-closed', localId);
      const state = stateFor(localId);
      state?.releaseHold?.();
    });
    channel?.close?.();
  }

  initializeChannel();
  global.addEventListener?.('pageshow', () => post('tab-hello', '', { holdsLock: hasHeldLock() }));

  global.CharacterEditAuthority = Object.freeze({
    supported: supportsWebLocks(),
    get tabId() { return tabId; },
    instanceId,
    open,
    activate,
    release,
    requestTakeover,
    canMutate,
    beginOperation,
    endOperation,
    authorizeWrite,
    runExclusive,
    configure,
    announce,
    getState,
    lockName,
    shutdown
  });
})(window);
