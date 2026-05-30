import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!url || !key) throw new Error('Faltan variables de entorno de Supabase');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function sanitizeFileName(name) {
  return String(name || 'archivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export async function POST(request) {
  try {
    const { fileBase64, fileName, mimeType, folder } = await request.json();

    if (!fileBase64 || !fileName || !mimeType) {
      return NextResponse.json({ error: 'Archivo incompleto.' }, { status: 400 });
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Archivo vacio.' }, { status: 400 });
    }

    const safeFolder = String(folder || 'thumbnails').replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+|\/+$/g, '') || 'thumbnails';
    const safeName = sanitizeFileName(fileName);
    const uniqueName = `${safeFolder}/${Date.now()}-${safeName}`;
    const supabase = getAdminClient();

    const { error } = await supabase.storage
      .from('assets')
      .upload(uniqueName, buffer, {
        contentType: mimeType,
        upsert: false,
        cacheControl: '31536000',
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data } = supabase.storage.from('assets').getPublicUrl(uniqueName);
    return NextResponse.json({ url: data.publicUrl });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
