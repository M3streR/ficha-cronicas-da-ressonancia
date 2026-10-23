(function initializeChronicleCovers(global) {
  'use strict';
  const BUCKET = 'chronicle-covers';
  const MAX_BYTES = 450 * 1024;
  const TYPES = new Map([['image/webp', 'webp'], ['image/jpeg', 'jpg'], ['image/png', 'png']]);
  let cleanupRequest = null;
  let lastCoverError = 0;
  let cleanupPending = false;

  function validate(cover) {
    if (!cover?.blob || !TYPES.has(cover.blob.type)) throw new Error('ONLINE_COVER_INVALID_TYPE');
    if (!cover.blob.size || cover.blob.size > MAX_BYTES) throw new Error('ONLINE_COVER_TOO_LARGE');
    if (!Number.isInteger(cover.width) || !Number.isInteger(cover.height) || cover.width < 1 || cover.height < 1 || cover.width > 960 || cover.height > 540) throw new Error('ONLINE_COVER_INVALID_DIMENSIONS');
    return cover;
  }

  async function upload(client, userId, chronicleId, cover) {
    validate(cover);
    const path = `${userId}/${chronicleId}/${global.crypto.randomUUID()}.${TYPES.get(cover.blob.type)}`;
    // Reserve a cleanup job first. A crashed or failed upload can be collected
    // later; the worker never deletes a path referenced by a live Chronicle.
    const reservation = await client.from('chronicle_cover_cleanup').insert({ owner_id: userId, path });
    if (reservation.error) throw reservation.error;
    const { error } = await client.storage.from(BUCKET).upload(path, cover.blob, { contentType: cover.blob.type, upsert: false, cacheControl: '3600' });
    if (error) throw new Error('ONLINE_COVER_UPLOAD_FAILED', { cause: error });
    return { cover_path: path, cover_width: cover.width, cover_height: cover.height };
  }

  async function download(client, chronicle) {
    if (!chronicle?.coverPath) return null;
    const { data, error } = await client.storage.from(BUCKET).download(chronicle.coverPath);
    if (error) {
      global.dispatchEvent(new CustomEvent('cronicas:cover-error', { detail: { id: chronicle.id } }));
      if (Date.now() - lastCoverError > 10000) {
        lastCoverError = Date.now();
        global.showNotification?.('A capa não pôde ser carregada. Reabra a Crônica para tentar novamente.', 'warning');
      }
      // A failed image must not prevent access to the Chronicle or its editor.
      return null;
    }
    return { blob: data, width: chronicle.coverWidth, height: chronicle.coverHeight };
  }

  async function cleanup(client, { notify = false } = {}) {
    // A mutation arriving during an earlier login sweep must run another sweep.
    if (cleanupRequest) await cleanupRequest;
    cleanupRequest = (async () => {
      try {
        let more = true;
        for (let page = 0; page < 10 && more; page++) {
          const { data, error } = await client.functions.invoke('cleanup-chronicle-covers', { body: {} });
          if (error || data?.failed) throw error || new Error('COVER_CLEANUP_PENDING');
          more = data?.more === true;
        }
        if (more) throw new Error('COVER_CLEANUP_PENDING');
        cleanupPending = false;
        return true;
      } catch (_) {
        cleanupPending = true;
        if (notify) global.showNotification?.('Alteração salva. A limpeza da capa anterior será tentada novamente ao entrar na conta.', 'warning');
        return false;
      } finally { cleanupRequest = null; }
    })();
    return cleanupRequest;
  }

  global.addEventListener('cronicas:auth-change', event => {
    if (event.detail?.authenticated && global.CronicasSupabase?.client) void cleanup(global.CronicasSupabase.client);
  });
  global.ChronicleCovers = Object.freeze({ upload, download, cleanup, validate, BUCKET, MAX_BYTES, get cleanupPending() { return cleanupPending; } });
})(window);
