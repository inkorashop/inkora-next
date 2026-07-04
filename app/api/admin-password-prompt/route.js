import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/admin-api-auth';

export async function PATCH(req) {
  try {
    const { user_id } = await req.json();
    if (!user_id) return NextResponse.json({ error: 'Usuario requerido' }, { status: 400 });

    const supabaseAdmin = getAdminClient();
    await requireAdmin(supabaseAdmin);

    const requestedAt = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        password_prompt_manual_requested_at: requestedAt,
        password_prompt_manual_seen_at: null,
      })
      .eq('id', user_id)
      .eq('registration_source', 'admin_invite')
      .is('deleted_at', null)
      .or('password_changed_by_user.eq.false,password_changed_by_user.is.null')
      .select('password_prompt_manual_requested_at')
      .maybeSingle();

    if (error) {
      const missingColumn = error.code === '42703' || /password_prompt/i.test(error.message || '');
      return NextResponse.json({
        error: missingColumn
          ? 'Falta ejecutar sql/admin_notifications.sql en Supabase para activar este aviso.'
          : error.message,
      }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({
        error: 'No se pudo desplegar: el usuario no es de invitación admin, ya cambió su contraseña o está eliminado.',
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      password_prompt_manual_requested_at: data.password_prompt_manual_requested_at || requestedAt,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
