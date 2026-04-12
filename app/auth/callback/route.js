import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    console.log('AUTH CALLBACK - code:', code);
    console.log('AUTH CALLBACK - data:', data);
    console.log('AUTH CALLBACK - error:', error);
    if (error) {
      return NextResponse.redirect(`${origin}?auth_error=${error.message}`);
    }
  }

  return NextResponse.redirect(`${origin}/admin`);
}
