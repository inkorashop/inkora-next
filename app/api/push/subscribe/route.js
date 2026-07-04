import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { adminAuthStatus, requireAdmin } from '@/lib/admin-api-auth';

export async function POST(request) {
  try {
    const admin = getAdminClient();
    const { email } = await requireAdmin(admin, request);

    const { subscription } = await request.json();
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Suscripcion incompleta.' }, { status: 400 });
    }

    const { error } = await admin
      .from('push_subscriptions')
      .upsert({ email, endpoint, p256dh, auth }, { onConflict: 'endpoint' });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: adminAuthStatus(e) });
  }
}
