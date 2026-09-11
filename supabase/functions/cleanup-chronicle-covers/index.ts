import { createClient } from 'npm:@supabase/supabase-js@2.112.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'UNAUTHORIZED' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json({ error: 'UNAUTHORIZED' }, 401);
  // No caller-supplied paths or owner IDs are accepted.
  const { data: jobs, error } = await admin.from('chronicle_cover_cleanup').select('path').eq('owner_id', user.id).lte('not_before', new Date().toISOString()).limit(100);
  if (error) return json({ error: 'QUEUE_UNAVAILABLE' }, 503);
  let removed = 0, failed = 0;
  for (const job of jobs || []) {
    const { data: live, error: lookupError } = await admin.from('chronicles').select('id').eq('cover_path', job.path).maybeSingle();
    if (lookupError || live || !job.path.startsWith(`${user.id}/`)) { failed++; continue; }
    const { error: removeError } = await admin.storage.from('chronicle-covers').remove([job.path]);
    if (removeError) { failed++; continue; }
    const { error: ackError } = await admin.from('chronicle_cover_cleanup').delete().eq('path', job.path).eq('owner_id', user.id);
    if (ackError) failed++; else removed++;
  }
  return json({ removed, failed, more: jobs?.length === 100 });
});
