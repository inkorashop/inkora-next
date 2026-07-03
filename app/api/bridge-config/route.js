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
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
      .select('value')
      .eq('key', 'bridge_token')
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ token: data?.value || '' });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { token } = await req.json();
    if (typeof token !== 'string') return NextResponse.json({ error: 'token requerido' }, { status: 400 });

    const admin = getAdminClient();

    const { error } = await admin
      .from('app_config')
      .upsert({ key: 'bridge_token', value: String(token).trim(), updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
