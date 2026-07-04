import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { adminAuthStatus, requireAdminOrOperator } from '@/lib/admin-api-auth';

const DIACRITICS_REGEX = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g');

function sanitizeFileName(name) {
  return String(name || 'archivo')
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/[^a-zA-Z0-9.\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export async function POST(request) {
  try {
    const supabase = getAdminClient();
    await requireAdminOrOperator(supabase, request);

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
    return NextResponse.json({ error: err.message }, { status: adminAuthStatus(err) });
  }
}
