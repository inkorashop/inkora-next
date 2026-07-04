import { NextResponse } from 'next/server';

const ONE_YEAR_SECONDS = 31536000;
const SAFE_PATH_RE = /^[a-zA-Z0-9/_.-]+$/;

// Supabase Storage doesn't reliably send the Cache-Control header set at
// upload time to the browser (known upstream limitation), so real visitors
// re-validate every single image load. This route fetches the public asset
// once server-side and re-serves it with a real long-lived Cache-Control,
// which both the visitor's browser and Vercel's own edge can cache properly.
export async function GET(request, { params }) {
  const path = (params?.path || []).join('/');

  if (!path || !SAFE_PATH_RE.test(path)) {
    return NextResponse.json({ error: 'Invalid asset path' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }

  const upstreamUrl = `${supabaseUrl}/storage/v1/object/public/assets/${path}`;
  const upstreamRes = await fetch(upstreamUrl);

  if (!upstreamRes.ok || !upstreamRes.body) {
    return NextResponse.json({ error: 'Asset not found' }, { status: upstreamRes.status === 404 ? 404 : 502 });
  }

  const headers = new Headers();
  headers.set('Content-Type', upstreamRes.headers.get('content-type') || 'application/octet-stream');
  headers.set('Cache-Control', `public, max-age=${ONE_YEAR_SECONDS}, immutable`);

  return new Response(upstreamRes.body, { status: 200, headers });
}
