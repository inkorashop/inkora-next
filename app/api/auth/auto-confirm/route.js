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
    const { email } = await req.json();
    if (!email?.trim()) return NextResponse.json({ confirmed: false });

    const supabaseAdmin = getAdminClient();

    // Only proceed if email confirmation is disabled
    const { data: settingData } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'require_email_confirmation')
      .maybeSingle();

    if (settingData?.value !== 'false') {
      return NextResponse.json({ confirmed: false });
    }

    // Look up user ID via profiles table
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (!profile?.id) return NextResponse.json({ confirmed: false });

    // Mark email as confirmed
    const { error } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      email_confirm: true,
    });

    if (error) return NextResponse.json({ confirmed: false });

    return NextResponse.json({ confirmed: true });
  } catch {
    return NextResponse.json({ confirmed: false });
  }
}
