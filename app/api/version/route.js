import { NextResponse } from 'next/server';

// Refleja siempre la version realmente desplegada en el momento de la
// request (las funciones serverless se reemplazan enteras en cada deploy),
// para que el panel de admin pueda detectar si el bundle que ya tiene
// cargado en el navegador quedo desactualizado.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      version: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
      commit: process.env.NEXT_PUBLIC_APP_COMMIT || '',
      buildTime: process.env.NEXT_PUBLIC_APP_BUILD_TIME || null,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
