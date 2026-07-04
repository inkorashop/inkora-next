import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { consumeInviteLink, cleanSiteUrl } from '@/lib/invite-access-links';

const INVALID_TOKEN_MESSAGE = 'El token no es valido';

function encodeBase64Url(value) {
  return Buffer.from(String(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function POST(req) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });

    const supabaseAdmin = getAdminClient();
    const storedLink = await consumeInviteLink(supabaseAdmin, token);

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: storedLink.email,
      options: { redirectTo: cleanSiteUrl() },
    });

    if (error) return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });

    const properties = data?.properties || {};
    if (properties.email_otp) {
      return NextResponse.json({
        email: storedLink.email,
        encodedEmail: encodeBase64Url(storedLink.email),
        emailOtp: properties.email_otp,
        next: storedLink.next_path || '/',
      });
    }

    if (properties.hashed_token) {
      return NextResponse.json({
        tokenHash: properties.hashed_token,
        next: storedLink.next_path || '/',
      });
    }

    return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
  } catch {
    return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
  }
}
