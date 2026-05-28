import { redirect } from 'next/navigation';

export default function InvitePage({ searchParams }) {
  const email = searchParams?.e;
  const code = searchParams?.c;
  const tokenHash = searchParams?.t || searchParams?.token_hash;
  const next = searchParams?.next;
  if ((email && code) || tokenHash) {
    const params = new URLSearchParams();
    if (email) params.set('e', email);
    if (code) params.set('c', code);
    if (tokenHash) params.set('t', tokenHash);
    if (next) params.set('next', next);
    redirect(`/i?${params.toString()}`);
  }

  const token = searchParams?.token;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.inkora.com.ar').replace(/\/+$/, '');
  if (!token || !supabaseUrl) redirect('/');
  // encodeURIComponent is required: Next.js searchParams gives a decoded string,
  // and the token may contain +, /, = that must be re-encoded for the Supabase verify endpoint.
  redirect(`${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(token)}&type=magiclink&redirect_to=${encodeURIComponent(siteUrl)}`);
}
