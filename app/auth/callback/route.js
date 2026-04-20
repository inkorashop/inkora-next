import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get('next') || '/';
  const redirectUrl = new URL(`${origin}${next}`);
  redirectUrl.searchParams.set('auth_success', '1');
  return NextResponse.redirect(redirectUrl.toString());
}