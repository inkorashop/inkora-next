import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

export async function POST(request) {
  try {
    const { user_id } = await request.json();
    if (!user_id) return NextResponse.json({ ok: false });
    await supabase.from('user_presence').delete().eq('user_id', user_id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}