import { NextResponse } from 'next/server';
import { notifyOpsError } from '@/lib/error-alert';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const source = body?.source ? String(body.source).slice(0, 200) : '';
    if (!source) {
      return NextResponse.json({ error: 'source requerido' }, { status: 400 });
    }
    const message = body?.message ? String(body.message).slice(0, 2000) : '';
    const details = body?.details ? String(body.details).slice(0, 2000) : '';
    const result = await notifyOpsError({ source, message, details });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'error' }, { status: 500 });
  }
}
