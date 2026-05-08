import { redirect } from 'next/navigation';

export default function InvitePage({ searchParams }) {
  const token = searchParams?.token;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://inkora.com.ar';
  if (!token || !supabaseUrl) redirect('/');
  // encodeURIComponent is required: Next.js searchParams gives a decoded string,
  // and the token may contain +, /, = that must be re-encoded for the Supabase verify endpoint.
  redirect(`${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(token)}&type=magiclink&redirect_to=${encodeURIComponent(siteUrl)}`);
}
