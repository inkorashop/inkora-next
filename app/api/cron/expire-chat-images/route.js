import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function storagePathFromPublicUrl(url) {
  const value = String(url || '');
  const marker = '/storage/v1/object/public/assets/';
  const idx = value.indexOf(marker);
  if (idx === -1) return null;
  const path = value.slice(idx + marker.length).split('?')[0];
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

// Corre una vez por dia (ver vercel.json). Borra del bucket las imagenes de
// chat vencidas (7 dias) y limpia image_url del mensaje; el texto del
// mensaje y el resto de la conversacion quedan intactos.
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
  }

  try {
    const supabaseAdmin = getAdminClient();
    const nowIso = new Date().toISOString();

    const { data: expired, error } = await supabaseAdmin
      .from('chat_messages')
      .select('id, image_url')
      .not('image_url', 'is', null)
      .lte('image_expires_at', nowIso)
      .limit(500);

    if (error) throw error;

    const rows = expired || [];
    const paths = rows.map(row => storagePathFromPublicUrl(row.image_url)).filter(Boolean);

    if (paths.length > 0) {
      await supabaseAdmin.storage.from('assets').remove(paths);
    }

    if (rows.length > 0) {
      await supabaseAdmin
        .from('chat_messages')
        .update({ image_url: null })
        .in('id', rows.map(row => row.id));
    }

    return NextResponse.json({ expired: rows.length });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
