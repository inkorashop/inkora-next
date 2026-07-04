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

function isModelUrl(url) {
  return /\.(3mf|glb|gltf|obj|usdz)$/i.test(String(url || '').split('?')[0]);
}

function originalImageUrl(design) {
  return design?.image_url || (!isModelUrl(design?.model_url) ? design?.model_url : null) || null;
}

function sizeFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return 0;
  const value = metadata.size ?? metadata.contentLength ?? metadata.content_length ?? metadata.ContentLength;
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

async function loadObjectSizes(supabaseAdmin, paths) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  const sizes = new Map();

  const folders = new Map();
  uniquePaths.forEach(path => {
    const parts = String(path).split('/');
    const fileName = parts.pop();
    if (!fileName) return;
    const folder = parts.join('/');
    if (!folders.has(folder)) folders.set(folder, new Set());
    folders.get(folder).add(fileName);
  });

  for (const [folder, fileNames] of folders.entries()) {
    let offset = 0;
    const limit = 1000;
    const pending = new Set(fileNames);

    while (pending.size > 0) {
      const { data, error } = await supabaseAdmin.storage
        .from('assets')
        .list(folder, {
          limit,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });
      if (error) throw error;

      (data || []).forEach(row => {
        if (!pending.has(row.name)) return;
        const fullPath = folder ? `${folder}/${row.name}` : row.name;
        sizes.set(fullPath, sizeFromMetadata(row.metadata));
        pending.delete(row.name);
      });

      if (!data || data.length < limit) break;
      offset += limit;
    }
  }

  return sizes;
}

export async function POST(request) {
  try {
    const supabaseAdmin = getAdminClient();
    await requireAdmin(supabaseAdmin);

    const body = await request.json();
    const designIds = Array.isArray(body.designIds) ? body.designIds.map(String).filter(Boolean) : [];
    if (designIds.length === 0) {
      return NextResponse.json({ count: 0, originalSizeKb: 0, optimizedSizeKb: 0, originalKnownCount: 0, optimizedKnownCount: 0 });
    }

    const rows = [];
    for (let i = 0; i < designIds.length; i += 500) {
      const batch = designIds.slice(i, i + 500);
      const { data, error } = await supabaseAdmin
        .from('designs')
        .select('*')
        .in('id', batch);
      if (error) throw error;
      rows.push(...(data || []));
    }

    const pathPairs = rows.map(design => ({
      id: design.id,
      originalPath: storagePathFromPublicUrl(originalImageUrl(design)),
      optimizedPath: storagePathFromPublicUrl(design.optimized_image_url),
      optimizedColumnKb: Number(design.optimized_image_size_kb) || 0,
    }));

    const objectSizes = await loadObjectSizes(supabaseAdmin, pathPairs.flatMap(pair => [pair.originalPath, pair.optimizedPath]));

    let originalBytes = 0;
    let optimizedBytes = 0;
    let originalKnownCount = 0;
    let optimizedKnownCount = 0;
    const items = [];

    pathPairs.forEach(pair => {
      const original = objectSizes.get(pair.originalPath) || 0;
      const optimized = objectSizes.get(pair.optimizedPath) || (pair.optimizedColumnKb > 0 ? pair.optimizedColumnKb * 1024 : 0);
      if (original > 0) {
        originalBytes += original;
        originalKnownCount += 1;
      }
      if (optimized > 0) {
        optimizedBytes += optimized;
        optimizedKnownCount += 1;
      }
      items.push({
        id: pair.id,
        originalSizeKb: original > 0 ? Math.round(original / 1024) : 0,
        optimizedSizeKb: optimized > 0 ? Math.round(optimized / 1024) : 0,
      });
    });

    return NextResponse.json({
      count: rows.length,
      originalSizeKb: Math.round(originalBytes / 1024),
      optimizedSizeKb: Math.round(optimizedBytes / 1024),
      originalKnownCount,
      optimizedKnownCount,
      items,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: adminAuthStatus(error) });
  }
}
