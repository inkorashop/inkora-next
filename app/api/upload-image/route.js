import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
);

export async function POST(request) {
  try {
    const { fileBase64, fileName, mimeType } = await request.json();

    const buffer = Buffer.from(fileBase64, 'base64');
    const uniqueName = `${Date.now()}-${fileName}`;

    const { error } = await supabase.storage
      .from('designs')
      .upload(uniqueName, buffer, { contentType: mimeType, upsert: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data } = supabase.storage.from('designs').getPublicUrl(uniqueName);

    return NextResponse.json({ url: data.publicUrl });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
