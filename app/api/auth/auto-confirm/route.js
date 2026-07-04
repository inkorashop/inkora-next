import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';

export async function POST(req) {
  try {
    const { email } = await req.json();
    if (!email?.trim()) return NextResponse.json({ confirmed: false });

    const supabaseAdmin = getAdminClient();

    // Only proceed when email confirmation is not explicitly enabled.
    const { data: settingData } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'require_email_confirmation')
      .maybeSingle();

    if (settingData?.value === 'true') {
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
