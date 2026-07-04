import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { adminAuthStatus, requireAdminOrOperator } from '@/lib/admin-api-auth';

export async function GET(req) {
  try {
    const admin = getAdminClient();
    await requireAdminOrOperator(admin, req);

    const { data, error } = await admin
      .from('app_config')
      .select('key, value')
      .in('key', ['bridge_token', 'bridge_url']);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const map = Object.fromEntries((data || []).map(r => [r.key, r.value]));
    return NextResponse.json({ token: map.bridge_token || '', url: map.bridge_url || '' });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: adminAuthStatus(e) });
  }
}

export async function POST(req) {
  try {
    const admin = getAdminClient();
    await requireAdminOrOperator(admin, req);

    const body = await req.json();

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
    return NextResponse.json({ error: e.message }, { status: adminAuthStatus(e) });
  }
}
