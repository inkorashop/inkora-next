import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}?auth_error=${encodeURIComponent(error.message)}`);
    }
  }

  const redirectUrl = new URL(`${origin}${next}`);
  redirectUrl.searchParams.set('auth_success', '1');
  return NextResponse.redirect(redirectUrl.toString());
}
