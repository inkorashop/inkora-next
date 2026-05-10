import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan variables de entorno de Supabase');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(req) {
  try {
    const { email, password, name, phone } = await req.json();

    if (!email?.trim() || !password || !name?.trim()) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();

    const { data: settingData } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'require_email_confirmation')
      .maybeSingle();

    const requireConfirmation = settingData?.value !== 'false';

    if (requireConfirmation) {
      // Client should use standard supabase.auth.signUp()
      return NextResponse.json({ confirmationRequired: true });
    }

    // Create user with email already confirmed — no confirmation email sent
    const { data: { user }, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: name.trim(), phone: phone?.trim() || '' },
    });

    if (createError) {
      const msg = createError.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        return NextResponse.json({ error: 'Ya existe una cuenta con ese email.' }, { status: 400 });
      }
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    await supabaseAdmin.from('profiles').upsert({
      id: user.id,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      phone: phone?.trim() || null,
      registration_source: 'self_email',
    });

    return NextResponse.json({ confirmationRequired: false });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
