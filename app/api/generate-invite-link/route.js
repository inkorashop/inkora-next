import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


export async function POST(req) {
  try {
    const { email } = await req.json();
    if (!email?.trim()) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor' }, { status: 500 });

    const supabaseAdmin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://inkora.com.ar';

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email.trim().toLowerCase(),
      options: { redirectTo: siteUrl },
    });

    if (linkError) return NextResponse.json({ error: linkError.message }, { status: 400 });

    let link = null;
    const rawLink = linkData?.properties?.action_link;
    try {
      const token = new URL(rawLink).searchParams.get('token');
      link = token ? `${siteUrl}/invite?token=${encodeURIComponent(token)}` : rawLink;
    } catch {
      link = rawLink;
    }

    return NextResponse.json({ link });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
