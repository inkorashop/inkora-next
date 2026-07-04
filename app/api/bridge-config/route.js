import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function getAuthUser(req) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data } = await supabase.auth.getUser(token);
  return data?.user ?? null;
}

export async function GET(req) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const admin = getAdminClient();
    const { data, error } = await admin
      .from('app_config')
      .select('key, value')
      .in('key', ['bridge_token', 'bridge_url']);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const map = Object.fromEntries((data || []).map(r => [r.key, r.value]));
    return NextResponse.json({ token: map.bridge_token || '', url: map.bridge_url || '' });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();
    const admin = getAdminClient();

    const rows = [];
    if (typeof body.token === 'string' && body.token.trim()) {
      rows.push({ key: 'bridge_token', value: body.token.trim(), updated_at: new Date().toISOString() });
    }
    if (typeof body.url === 'string' && body.url.trim()) {
      rows.push({ key: 'bridge_url', value: body.url.trim(), updated_at: new Date().toISOString() });
    }

    if (!rows.length) return NextResponse.json({ ok: true });

    const { error } = await admin
      .from('app_config')
      .upsert(rows, { onConflict: 'key' });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
