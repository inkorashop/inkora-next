import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminAuthStatus, requireAdmin } from '@/lib/admin-api-auth';

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

export async function POST(request) {
  try {
    const supabaseAdmin = getAdminClient();
    await requireAdmin(supabaseAdmin);

    const body = await request.json();
    const designId = String(body.designId || '').trim();
    const fileBase64 = String(body.fileBase64 || '');
    const mimeType = String(body.mimeType || 'image/webp');
    const targetKb = Math.max(1, Math.min(2048, Number(body.targetKb) || 50));
    const originalUrl = String(body.originalUrl || '').trim();
    const previousOptimizedUrl = String(body.previousOptimizedUrl || '').trim();

    if (!designId || !fileBase64 || !/^image\/(webp|jpeg|png)$/i.test(mimeType)) {
      return NextResponse.json({ error: 'Datos de optimizacion incompletos.' }, { status: 400 });
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Archivo optimizado vacio.' }, { status: 400 });
    }

    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('jpeg') ? 'jpg' : 'webp';
    const path = `optimized/designs/${designId}/thumb-${targetKb}kb-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('assets')
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: false,
        cacheControl: '31536000',
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicData } = supabaseAdmin.storage.from('assets').getPublicUrl(path);
    const optimizedUrl = publicData.publicUrl;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('designs')
      .update({
        optimized_image_url: optimizedUrl,
        optimized_image_size_kb: Math.round(buffer.length / 1024),
        optimized_image_target_kb: targetKb,
        optimized_image_source_url: originalUrl || null,
        optimized_image_updated_at: new Date().toISOString(),
      })
      .eq('id', designId)
      .select('*, products(name)')
      .single();

    if (updateError) {
      await supabaseAdmin.storage.from('assets').remove([path]);
      const missingColumn = updateError.code === '42703' || /optimized_image_/i.test(updateError.message || '');
      return NextResponse.json({
        error: missingColumn
          ? 'Falta ejecutar sql/design_optimized_images.sql en Supabase antes de optimizar miniaturas.'
          : updateError.message,
      }, { status: 500 });
    }

    const previousPath = storagePathFromPublicUrl(previousOptimizedUrl);
    if (previousPath && previousPath.startsWith(`optimized/designs/${designId}/`) && previousPath !== path) {
      await supabaseAdmin.storage.from('assets').remove([previousPath]);
    }

    return NextResponse.json({
      design: updated,
      optimizedUrl,
      optimizedSizeKb: Math.round(buffer.length / 1024),
      path,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: adminAuthStatus(error) });
  }
}
