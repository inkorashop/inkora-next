import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect('https://www.inkora.com.ar/auth/popup-callback?error=access_denied');
  }

  // Intercambiar code por tokens de Google
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: 'https://www.inkora.com.ar/api/auth/google/callback',
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokens.id_token) {
    return NextResponse.redirect('https://www.inkora.com.ar/auth/popup-callback?error=token_error');
  }

  // Pasar el id_token a Supabase
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { error: supabaseError } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: tokens.id_token,
  });

  if (supabaseError) {
    return NextResponse.redirect(`https://www.inkora.com.ar/auth/popup-callback?error=${encodeURIComponent(supabaseError.message)}`);
  }

  return NextResponse.redirect('https://www.inkora.com.ar/auth/popup-callback');
}