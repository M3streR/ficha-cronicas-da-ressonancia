// Opt-in integration test against the configured project. Uses only the
// disposable accounts from the ignored .test-secrets.json file.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');

if (process.env.AUDIT_INVITES !== '1') {
  console.error('Defina AUDIT_INVITES=1 para executar este teste destrutivo com fixtures descartáveis.');
  process.exit(2);
}

const root = path.resolve(__dirname, '..');
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html');
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${path.sep}`) || file.endsWith('.test-secrets.json')) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});

(async () => {
  const users = JSON.parse(await fs.readFile(path.join(root, '.test-secrets.json'), 'utf8'));
  assert.equal(users.length >= 5, true, 'Cinco contas descartáveis são obrigatórias');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const pages = [];
  const records = [];
  const checks = [];
  const ok = (value, label) => { assert.ok(value, label); checks.push(label); console.log('OK', label); };
  const login = async (page, user) => {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => Boolean(window.CronicasSupabase));
    const result = await page.evaluate(async credentials => {
      await CronicasSupabase.ready;
      const result = await CronicasSupabase.client.auth.signInWithPassword(credentials);
      return { error: result.error?.message || '', userId: result.data?.user?.id || '' };
    }, user);
    assert.equal(result.error, '');
    assert.equal(result.userId, user.id);
  };
  const rpc = (page, name, args) => page.evaluate(async ({ name, args }) => {
    const result = await CronicasSupabase.client.rpc(name, args);
    return { data: result.data, error: result.error?.message || '' };
  }, { name, args });
  const createChronicle = async (owner, suffix) => {
    const record = await owner.evaluate(s => ChroniclesOnline.createChronicle({
      name: `AUDIT • Convite ${s}`,
      type: 'campaign',
      synopsis: 'Fixture descartável de convite multiuso'
    }), suffix);
    records.push(record);
    return record;
  };

  try {
    for (const user of users.slice(0, 5)) {
      const page = await browser.newPage();
      pages.push(page);
      await login(page, user);
    }
    const [owner, playerA, playerB, playerC, playerD] = pages;
    const main = await createChronicle(owner, 'grupo');

    await owner.evaluate(record => ChroniclesSharing.applyDetailMode(record), main);
    await owner.evaluate(() => ChroniclesSharing.openOwnerInviteDialog());
    await owner.getByRole('button', { name: 'Gerar novo convite' }).click();
    const inviteInput = owner.locator('.chronicle-invite-card.is-active input').first();
    await inviteInput.waitFor({ state: 'visible' });
    const inviteUrl = await inviteInput.inputValue();
    const code = new URL(inviteUrl).searchParams.get('invite');
    ok(Boolean(code), 'Mestre gera um único link multiuso pela interface');

    for (const page of [playerA, playerB]) {
      const accepted = await rpc(page, 'accept_reusable_chronicle_invite', { p_code: code });
      ok(!accepted.error && accepted.data === main.remoteId, 'Jogador aceita o mesmo link');
    }

    await playerC.evaluate(() => CronicasSupabase.client.auth.signOut());
    await playerC.goto(`http://127.0.0.1:${server.address().port}/?invite=${code}`);
    await playerC.waitForFunction(() => Boolean(window.CronicasSupabase));
    await playerC.getByRole('button', { name: 'Entrar na conta' }).waitFor();
    await playerC.evaluate(credentials => CronicasSupabase.client.auth.signInWithPassword(credentials), users[3]);
    await playerC.getByRole('button', { name: 'Aceitar convite' }).waitFor();
    await playerC.getByRole('button', { name: 'Aceitar convite' }).click();
    await playerC.getByText('Acesso confirmado').waitFor();
    ok(!new URL(playerC.url()).searchParams.has('invite'), 'Auth preserva o convite até o aceite e limpa a URL depois');

    const membership = await owner.evaluate(async chronicleId => {
      const members = await CronicasSupabase.client.from('chronicle_members').select('user_id').eq('chronicle_id', chronicleId);
      const invites = await CronicasSupabase.client.from('chronicle_invites').select('use_count,max_uses,revoked_at').eq('chronicle_id', chronicleId).single();
      return { memberIds: members.data?.map(item => item.user_id) || [], invite: invites.data, error: members.error?.message || invites.error?.message || '' };
    }, main.remoteId);
    ok(!membership.error && membership.memberIds.length === 3 && membership.invite.use_count === 3, 'Três jogadores aparecem e o contador registra três usos');

    const repeated = await rpc(playerA, 'accept_reusable_chronicle_invite', { p_code: code });
    const countAfterRepeat = await owner.evaluate(async chronicleId => (await CronicasSupabase.client.from('chronicle_invites').select('use_count').eq('chronicle_id', chronicleId).single()).data.use_count, main.remoteId);
    ok(!repeated.error && countAfterRepeat === 3, 'Participante existente não duplica membership nem consome uso');

    await owner.evaluate(() => ChroniclesSharing.openOwnerInviteDialog());
    await owner.getByText('3 pessoas entraram').waitFor();
    ok(await owner.getByText('Ativo', { exact: true }).isVisible(), 'Link multiuso continua ativo depois de três entradas');
    await owner.getByRole('button', { name: 'Revogar' }).click();
    await owner.getByText('Link revogado. Novos jogadores não poderão usá-lo.').waitFor();
    const denied = await rpc(playerD, 'accept_reusable_chronicle_invite', { p_code: code });
    ok(/revoked|unavailable/i.test(denied.error), `Link revogado nega acesso a outro jogador${denied.error ? '' : ' (RPC não retornou erro)'}`);
    const existingAfterRevoke = await rpc(playerA, 'accept_reusable_chronicle_invite', { p_code: code });
    ok(!existingAfterRevoke.error && existingAfterRevoke.data === main.remoteId, 'Participante existente continua idempotente após revogação');

    await owner.evaluate(async ({ chronicleId, userId }) => {
      const result = await CronicasSupabase.client.from('chronicle_members').delete().eq('chronicle_id', chronicleId).eq('user_id', userId);
      if (result.error) throw result.error;
    }, { chronicleId: main.remoteId, userId: users[2].id });
    ok(!(await playerB.evaluate(async id => ChroniclesOnline.getChronicle(`online:${id}`), main.remoteId)), 'Remover participante revoga o acesso à Crônica');

    const limited = await createChronicle(owner, 'limite');
    const limitedCode = (await rpc(owner, 'create_chronicle_invite', { p_chronicle_id: limited.remoteId, p_max_uses: 1, p_expires_at: null })).data;
    ok(!(await rpc(playerA, 'accept_reusable_chronicle_invite', { p_code: limitedCode })).error, 'Primeiro uso respeita convite limitado');
    ok(/limit|unavailable/i.test((await rpc(playerB, 'accept_reusable_chronicle_invite', { p_code: limitedCode })).error), 'Limite atingido bloqueia o próximo jogador');

    const expiring = await createChronicle(owner, 'expiração');
    const expiresAt = new Date(Date.now() + 2500).toISOString();
    const expiringInvite = await rpc(owner, 'create_chronicle_invite', { p_chronicle_id: expiring.remoteId, p_max_uses: null, p_expires_at: expiresAt });
    ok(!expiringInvite.error && Boolean(expiringInvite.data), 'Mestre cria convite com expiração');
    // The hosted REST pool can trail the browser clock by a few seconds.
    await new Promise(resolve => setTimeout(resolve, 12000));
    const expiryState = await owner.evaluate(async inviteCode => {
      const result = await CronicasSupabase.client.from('chronicle_invites').select('expires_at,use_count,chronicle_id').eq('code', inviteCode).single();
      const members = await CronicasSupabase.client.from('chronicle_members').select('user_id').eq('chronicle_id', result.data?.chronicle_id);
      return { ...result.data, members: members.data?.map(item => item.user_id) || [], error: result.error?.message || members.error?.message || '', browserNow: new Date().toISOString() };
    }, expiringInvite.data);
    ok(!expiryState.error && Date.parse(expiryState.expires_at) <= Date.parse(expiryState.browserNow), 'Convite chegou ao horário de expiração');
    ok(!expiryState.members.includes(users[4].id), 'Jogador de teste ainda não participa da Crônica expirada');
    const playerDId = await playerD.evaluate(async () => (await CronicasSupabase.client.auth.getUser()).data.user?.id || '');
    ok(playerDId === users[4].id, 'Sessão da conta que testa expiração permanece isolada');
    const expired = await rpc(playerD, 'accept_reusable_chronicle_invite', { p_code: expiringInvite.data });
    const afterExpiredAttempt = await owner.evaluate(async chronicleId => {
      const result = await CronicasSupabase.client.from('chronicle_members').select('user_id').eq('chronicle_id', chronicleId);
      return result.data?.map(item => item.user_id) || [];
    }, expiring.remoteId);
    ok(/expired|unavailable/i.test(expired.error) && !afterExpiredAttempt.includes(users[4].id), `Convite expirado é recusado: ${expired.error || `RPC retornou ${JSON.stringify(expired.data)}, estado ${JSON.stringify(expiryState)} e memberships ${JSON.stringify(afterExpiredAttempt)}`}`);

    const concurrent = await createChronicle(owner, 'concorrência');
    const concurrentCode = (await rpc(owner, 'create_chronicle_invite', { p_chronicle_id: concurrent.remoteId, p_max_uses: 2, p_expires_at: null })).data;
    const simultaneous = await Promise.all([
      rpc(playerB, 'accept_reusable_chronicle_invite', { p_code: concurrentCode }),
      rpc(playerC, 'accept_reusable_chronicle_invite', { p_code: concurrentCode })
    ]);
    const concurrentState = await owner.evaluate(async chronicleId => {
      const members = await CronicasSupabase.client.from('chronicle_members').select('user_id').eq('chronicle_id', chronicleId);
      const invite = await CronicasSupabase.client.from('chronicle_invites').select('use_count').eq('chronicle_id', chronicleId).single();
      return { members: members.data?.length, uses: invite.data?.use_count };
    }, concurrent.remoteId);
    ok(simultaneous.every(result => !result.error) && concurrentState.members === 2 && concurrentState.uses === 2, 'Duas aceitações simultâneas são atômicas');

    await playerA.reload();
    await playerA.waitForFunction(() => Boolean(window.ChroniclesOnline));
    ok(await playerA.evaluate(async id => Boolean(await ChroniclesOnline.getChronicle(`online:${id}`)), limited.remoteId), 'Participação permanece após refresh');

    await fs.mkdir(path.join(__dirname, 'artifacts', 'stabilization-ux'), { recursive: true });
    await fs.writeFile(path.join(__dirname, 'artifacts', 'stabilization-ux', 'reusable-invites-report.json'), JSON.stringify({ checks }, null, 2));
  } finally {
    if (pages[0]) {
      for (const record of records) await pages[0].evaluate(id => ChroniclesOnline.deleteChronicle(id).catch(() => null), record.id).catch(() => null);
    }
    for (const page of pages) await page.evaluate(() => CronicasSupabase.client.auth.signOut()).catch(() => null);
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
