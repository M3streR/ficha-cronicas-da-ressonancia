from pathlib import Path
import re

path = Path('js/chronicles-online-combat.js')
text = path.read_text(encoding='utf-8')

old = '''  async function setConfrontationActive(id, active, options = {}) {
    const { client } = await context();
    const { data, error } = await client.rpc('set_chronicle_confrontation_active', {
      p_confrontation_id: id,
      p_active: Boolean(active),
      p_expected_updated_at: options.expectedUpdatedAt || null
    });
    if (error) throw error;
    return getConfrontation(data);
  }'''
new = '''  async function setConfrontationActive(id, active, _options = {}) {
    const { client } = await context();
    const commit = async expectedUpdatedAt => {
      const { data, error } = await client.rpc('set_chronicle_confrontation_active', {
        p_confrontation_id: id,
        p_active: Boolean(active),
        p_expected_updated_at: expectedUpdatedAt
      });
      if (error) throw error;
      return getConfrontation(data);
    };

    let current = await getConfrontation(id);
    try {
      return await commit(current.updatedAt);
    } catch (error) {
      const message = String(error?.message || '');
      if (!message.includes('CONFRONTATION_UPDATE_CONFLICT')) throw error;
      current = await getConfrontation(id);
      return commit(current.updatedAt);
    }
  }'''
if old not in text:
    raise SystemExit('setConfrontationActive anchor missing')
text = text.replace(old, new, 1)

old = '''  async function stepTurn(id, direction, expectedUpdatedAt) {
    const { client } = await context();
    const { data, error } = await client.rpc('step_confrontation_turn', {
      p_confrontation_id: id,
      p_direction: direction,
      p_expected_updated_at: expectedUpdatedAt
    });
    if (error) throw error;
    return getConfrontation(data);
  }'''
new = '''  async function stepTurn(id, direction, _expectedUpdatedAt) {
    const { client } = await context();
    const current = await getConfrontation(id);
    const { data, error } = await client.rpc('step_confrontation_turn', {
      p_confrontation_id: id,
      p_direction: direction,
      p_expected_updated_at: current.updatedAt
    });
    if (error) throw error;
    return getConfrontation(data);
  }'''
if old not in text:
    raise SystemExit('stepTurn anchor missing')
path.write_text(text.replace(old, new, 1), encoding='utf-8')

index = Path('index.html')
html = index.read_text(encoding='utf-8')
html, count = re.subn(
    r'js/chronicles-online-combat\.js\?v=[^"\']+',
    'js/chronicles-online-combat.js?v=confrontation-sync-fix',
    html,
    count=1
)
if count != 1:
    raise SystemExit('online combat cache reference missing')
index.write_text(html, encoding='utf-8')
