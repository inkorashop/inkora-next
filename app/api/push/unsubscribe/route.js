import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { adminAuthStatus, requireAdmin } from '@/lib/admin-api-auth';

export async function POST(request) {
  try {
    const admin = getAdminClient();
    await requireAdmin(admin, request);

    const { endpoint } = await request.json();
    if (!endpoint) return NextResponse.json({ error: 'Falta endpoint.' }, { status: 400 });

    const { error } = await admin.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: adminAuthStatus(e) });
  }
}
