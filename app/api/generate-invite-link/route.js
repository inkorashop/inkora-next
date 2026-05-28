import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createStoredInviteLink } from '@/lib/invite-access-links';
import { requireAdmin } from '@/lib/admin-api-auth';

export async function POST(req) {
  try {
    const { email, user_id, client_name, kind, next_path } = await req.json();
    if (!email?.trim()) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor' }, { status: 500 });

    const supabaseAdmin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    await requireAdmin(supabaseAdmin);
    const normalizedEmail = email.trim().toLowerCase();
    const { link, record } = await createStoredInviteLink(supabaseAdmin, {
      email: normalizedEmail,
      userId: user_id || null,
      clientName: client_name || '',
      kind,
      nextPath: next_path,
    });

    return NextResponse.json({ link, record });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
