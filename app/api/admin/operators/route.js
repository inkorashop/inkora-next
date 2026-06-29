import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminAuthStatus, requireAdmin } from '@/lib/admin-api-auth';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(req) {
  try {
    const { name, phone, email } = await req.json();

    const normalizedEmail = email?.trim().toLowerCase();
    const trimmedName = name?.trim();
    const trimmedPhone = phone?.trim() || null;

    if (!trimmedName || !normalizedEmail) {
      return NextResponse.json({ error: 'Nombre y email son obligatorios' }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();
    const admin = await requireAdmin(supabaseAdmin);

    const { data: existingOperator, error: operatorLookupError } = await supabaseAdmin
      .from('production_operators')
      .select('id, user_id, email, active')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (operatorLookupError && operatorLookupError.code !== '42P01') {
      return NextResponse.json({ error: operatorLookupError.message }, { status: 400 });
    }

    if (operatorLookupError?.code === '42P01') {
      return NextResponse.json({ error: 'Falta ejecutar sql/production_orders_and_operators.sql en Supabase.' }, { status: 400 });
    }

    if (existingOperator?.id) {
      return NextResponse.json({ error: 'Ya existe un operario con ese email.' }, { status: 400 });
    }

    const { data: operator, error: operatorError } = await supabaseAdmin
      .from('production_operators')
      .insert({
        user_id: null,
        email: normalizedEmail,
        name: trimmedName,
        phone: trimmedPhone,
        active: true,
      })
      .select('*')
      .single();

    if (operatorError) {
      return NextResponse.json({ error: operatorError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      operator,
      created_by: admin.email,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: adminAuthStatus(error) });
  }
}
