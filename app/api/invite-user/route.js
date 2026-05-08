import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(req) {
  try {
    const { name, phone, email, password } = await req.json();

    if (!email?.trim() || !password || !name?.trim()) {
      return NextResponse.json({ error: 'Nombre, email y contraseña son obligatorios' }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();

    // 1. Create user in auth without sending confirmation email
    const { data: { user }, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: name.trim() },
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    // 2. Upsert profile with admin-set data
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: user.id,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      phone: phone?.trim() || null,
      admin_set_password: password,
      registration_source: 'admin_invite',
      password_changed_by_user: false,
    });

    if (profileError) {
      console.error('Error updating profile:', profileError);
    }

    // 3. Generate one-time magic link for auto-login
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://inkora.com.ar';
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email.trim().toLowerCase(),
      options: { redirectTo: siteUrl },
    });

    let link = null;
    if (!linkError) {
      const rawLink = linkData?.properties?.action_link;
      try {
        const token = new URL(rawLink).searchParams.get('token');
        link = token ? `${siteUrl}/invite?token=${encodeURIComponent(token)}` : rawLink;
      } catch {
        link = rawLink;
      }
    }

    return NextResponse.json({
      success: true,
      user_id: user.id,
      link,
      link_error: linkError?.message || null,
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
