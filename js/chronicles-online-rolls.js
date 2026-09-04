(function initializeChroniclesOnlineRolls(global) {
  'use strict';

  const CHRONICLE_PREFIX = 'online-roll:';
  const COMBAT_PREFIX = 'online-combat-roll:';
  const text = value => typeof value === 'string' ? value.trim() : '';
  const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');

  async function context() {
    const auth = global.CronicasSupabase;
    if (!auth) throw new Error('ONLINE_AUTH_UNAVAILABLE');
    await auth.ready;
    const user = await auth.getUser();
    if (!user) throw new Error('ONLINE_AUTH_REQUIRED');
    return { client: auth.client, user };
  }

  function parseDestination(value) {
    if (typeof value !== 'string') return null;
    const parts = value.split(':');
    if (parts[0] === 'online-roll' && uuid(parts[1]) && uuid(parts[2])) {
      return { chronicleId: parts[1], characterId: parts[2], confrontationId: null };
    }
    if (parts[0] === 'online-combat-roll' && uuid(parts[1]) && uuid(parts[2]) && uuid(parts[3])) {
      return { chronicleId: parts[1], confrontationId: parts[2], characterId: parts[3] };
    }
    return null;
  }

  function normalizeRow(row) {
    const rolls = Array.isArray(row.rolls) ? row.rolls.map(Number) : [];
    return {
      id: row.id,
      schemaVersion: 1,
      characterId: row.online_character_id || `deleted:${row.id}`,
      characterName: text(row.character_name) || 'Personagem',
      createdAt: row.created_at,
      source: row.source || 'quick-dice',
      category: row.category || 'expression',
      resolution: row.metadata?.resolution || 'sum',
      result: {
        expression: row.expression,
        count: row.dice_count,
        sides: row.dice_sides,
        rolls,
        diceTotal: row.subtotal ?? rolls.reduce((sum, value) => sum + value, 0),
        modifier: Number(row.modifier) || 0,
        total: Number(row.total) || 0
      },
      confrontationId: row.confrontation_id || null
    };
  }

  async function listOnlineDestinations(localCharacterId) {
    if (!localCharacterId) return [];
    let auth;
    try { auth = await context(); } catch (_) { return []; }
    const { data: characters, error: characterError } = await auth.client
      .from('online_characters')
      .select('id')
      .eq('owner_id', auth.user.id)
      .eq('source_local_id', localCharacterId);
    if (characterError || !characters?.length) return [];
    const characterIds = characters.map(row => row.id);
    const { data: links, error: linkError } = await auth.client
      .from('chronicle_cast_members')
      .select('chronicle_id, character_id')
      .in('character_id', characterIds);
    if (linkError || !links?.length) return [];
    const chronicleIds = [...new Set(links.map(row => row.chronicle_id))];
    const [{ data: chronicles, error: chronicleError }, { data: combats, error: combatError }] = await Promise.all([
      auth.client.from('chronicles').select('id, name').in('id', chronicleIds),
      auth.client.from('chronicle_confrontations').select('id, chronicle_id, name').in('chronicle_id', chronicleIds).eq('active', true)
    ]);
    if (chronicleError || combatError) throw chronicleError || combatError;
    const characterByChronicle = new Map(links.map(row => [row.chronicle_id, row.character_id]));
    const confrontationIds = (combats || []).map(row => row.id);
    let combatLinks = [];
    if (confrontationIds.length) {
      const result = await auth.client.from('confrontation_character_links')
        .select('confrontation_id, character_id').in('confrontation_id', confrontationIds).in('character_id', characterIds);
      if (result.error) throw result.error;
      combatLinks = result.data || [];
    }
    const permittedCombats = new Set(combatLinks.map(row => `${row.confrontation_id}:${row.character_id}`));
    const names = new Map((chronicles || []).map(row => [row.id, text(row.name) || 'Crônica online']));
    const destinations = chronicleIds.map(chronicleId => ({
      id: `${CHRONICLE_PREFIX}${chronicleId}:${characterByChronicle.get(chronicleId)}`,
      name: names.get(chronicleId) || 'Crônica online',
      storage: 'online'
    }));
    (combats || []).forEach(combat => {
      const characterId = characterByChronicle.get(combat.chronicle_id);
      if (!permittedCombats.has(`${combat.id}:${characterId}`)) return;
      destinations.push({
        id: `${COMBAT_PREFIX}${combat.chronicle_id}:${combat.id}:${characterId}`,
        name: `${names.get(combat.chronicle_id) || 'Crônica online'} · Combate ativo`,
        storage: 'online',
        confrontationId: combat.id
      });
    });
    return destinations;
  }

  async function appendOnlineRoll(record, destination) {
    const target = parseDestination(destination);
    if (!target) throw new Error('INVALID_ONLINE_ROLL_DESTINATION');
    const { client } = await context();
    const result = record?.result || {};
    const { data, error } = await client.rpc('append_online_roll', {
      p_id: record.id,
      p_chronicle_id: target.chronicleId,
      p_confrontation_id: target.confrontationId,
      p_online_character_id: target.characterId,
      p_character_name: text(record.characterName) || 'Personagem',
      p_source: record.source || 'quick-dice',
      p_category: record.category || 'expression',
      p_expression: result.expression,
      p_dice_count: Number.isFinite(result.count) ? result.count : (Number.isFinite(result.quantity) ? result.quantity : null),
      p_dice_sides: Number.isFinite(result.sides) ? result.sides : (Number.isFinite(result.faces) ? result.faces : null),
      p_rolls: Array.isArray(result.rolls) ? result.rolls : [],
      p_modifier: Number(result.modifier) || 0,
      p_subtotal: Number.isFinite(result.diceTotal) ? result.diceTotal : null,
      p_total: Number(result.total) || 0,
      p_metadata: { resolution: record.resolution || 'sum' }
    });
    if (error) throw error;
    return data;
  }

  async function listChronicleRolls(chronicleId, options = {}) {
    const remoteId = String(chronicleId || '').replace(/^online:/, '');
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 50));
    const { client } = await context();
    let query = client.from('online_roll_records')
      .select('id, chronicle_id, confrontation_id, online_character_id, character_name, source, category, expression, dice_count, dice_sides, rolls, modifier, subtotal, total, metadata, created_at')
      .eq('chronicle_id', remoteId)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
    if (options.confrontationId) query = query.eq('confrontation_id', options.confrontationId);
    if (options.characterId) query = query.eq('online_character_id', options.characterId);
    if (options.category) query = query.eq('category', options.category);
    if (options.before?.createdAt && options.before?.id) {
      const createdAt = String(options.before.createdAt).replaceAll('"', '');
      const id = String(options.before.id).replaceAll('"', '');
      query = query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
    } else if (options.before?.createdAt) {
      query = query.lt('created_at', options.before.createdAt);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    const records = rows.slice(0, limit).map(normalizeRow);
    const last = records[records.length - 1];
    return { records, next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null, destinations: {} };
  }

  async function listActors(chronicleId) {
    const result = await listChronicleRolls(chronicleId, { limit: 100 });
    return [...new Map(result.records.map(row => [row.characterId, { id: row.characterId, name: row.characterName }])).values()];
  }

  function createRouter(base) {
    return Object.freeze({
      ...base,
      async listCharacterChronicles(characterId) {
        const [local, online] = await Promise.all([
          base.listCharacterChronicles(characterId),
          listOnlineDestinations(characterId)
        ]);
        return [...local, ...online];
      },
      async appendRoll(record, destination) {
        const online = parseDestination(destination);
        if (!online) return base.appendRoll(record, destination);
        await base.appendRoll(record, null);
        await appendOnlineRoll(record, destination);
        return { characterLinked: true, chronicleLinked: true, online: true };
      },
      async listRollHistory(scope, ownerId, options) {
        if (scope === 'chronicle' && String(ownerId).startsWith('online:')) return listChronicleRolls(ownerId, options);
        return base.listRollHistory(scope, ownerId, options);
      },
      async listRollActors(scope, ownerId) {
        if (scope === 'chronicle' && String(ownerId).startsWith('online:')) return listActors(ownerId);
        return base.listRollActors(scope, ownerId);
      },
      async clearRollHistory(scope, ownerId) {
        if (scope === 'chronicle' && String(ownerId).startsWith('online:')) {
          const { client } = await context();
          const { error } = await client.rpc('clear_online_roll_history', { p_chronicle_id: ownerId.slice(7) });
          if (error) throw error;
          return true;
        }
        return base.clearRollHistory(scope, ownerId);
      }
    });
  }

  global.ChroniclesOnlineRolls = Object.freeze({
    createRouter,
    listOnlineDestinations,
    appendOnlineRoll,
    listChronicleRolls,
    parseDestination,
    normalizeRow
  });
})(window);
