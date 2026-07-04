import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { adminAuthStatus, requireAdmin } from '@/lib/admin-api-auth';

// Genera una URL firmada para que el navegador suba el .apk DIRECTO a
// Supabase Storage, sin pasar por esta funcion (que si tiene un limite de
// tamano de body en Vercel). Esta ruta solo devuelve la URL, nunca recibe
// el archivo en si.
export async function POST(request) {
  try {
    const admin = getAdminClient();
    await requireAdmin(admin, request);

    const { fileName } = await request.json();
    const safeName = String(fileName || 'inkora-app.apk').replace(/[^a-zA-Z0-9.\-_]/g, '-');
    const path = `android-app/${Date.now()}-${safeName}`;

    const { data, error } = await admin.storage.from('assets').createSignedUploadUrl(path);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { data: publicData } = admin.storage.from('assets').getPublicUrl(path);

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path,
      publicUrl: publicData.publicUrl,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: adminAuthStatus(e) });
  }
}
