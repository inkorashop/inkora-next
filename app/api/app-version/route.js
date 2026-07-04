import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const KEYS = ['android_app_version_code', 'android_app_version_name', 'android_app_apk_url'];

// Endpoint publico (sin auth): lo consulta la app nativa de Android para
// saber si hay una version nueva del cascaron (WebView + burbuja flotante)
// para descargar e instalar. No expone nada sensible.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  const supabase = createClient(url, anonKey);

  const { data, error } = await supabase.from('settings').select('key, value').in('key', KEYS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  return NextResponse.json({
    versionCode: Number(map.android_app_version_code) || 0,
    versionName: map.android_app_version_name || '',
    apkUrl: map.android_app_apk_url || '',
  });
}
