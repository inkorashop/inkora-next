import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { randomBytes } from 'crypto';
import { adminAuthStatus, requireAdmin } from '@/lib/admin-api-auth';

function isMissingMigration(error) {
  return error?.code === '42703' || /admin_password_reset_started_at/i.test(error?.message || '');
}

function migrationErrorResponse(error) {
  return NextResponse.json({
    error: isMissingMigration(error)
      ? 'Falta ejecutar sql/admin_notifications.sql en Supabase para activar esta accion.'
      : error.message,
  }, { status: 400 });
}

async function loadProfile(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id,email,name,registration_source,password_changed_by_user,deleted_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function beginAdminPasswordMutation(supabaseAdmin, userId) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ admin_password_reset_started_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}

async function clearAdminPasswordMutation(supabaseAdmin, userId) {
  await supabaseAdmin
    .from('profiles')
    .update({ admin_password_reset_started_at: null })
    .eq('id', userId);
}

async function removeAdminGeneratedPasswordNotification(supabaseAdmin, userId, sinceIso) {
  await supabaseAdmin
    .from('admin_notifications')
    .delete()
    .eq('type', 'password_changed')
    .eq('user_id', userId)
    .gte('created_at', sinceIso);
}

export async function PATCH(req) {
  let supabaseAdmin;
  let userId;

  try {
    const body = await req.json();
    const action = body.action;
    userId = body.user_id;

    if (!userId) return NextResponse.json({ error: 'Usuario requerido' }, { status: 400 });

    supabaseAdmin = getAdminClient();
    const admin = await requireAdmin(supabaseAdmin);
    const profile = await loadProfile(supabaseAdmin, userId);

    if (!profile) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    if (action === 'set_password') {
      const password = String(body.password || '');
      if (password.length < 6) {
        return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, { status: 400 });
      }
      if (profile.deleted_at) {
        return NextResponse.json({ error: 'No se puede cambiar la contraseña de un registro eliminado.' }, { status: 400 });
      }
      if (profile.registration_source !== 'admin_invite') {
        return NextResponse.json({ error: 'Solo se puede cambiar desde admin la contraseña de usuarios creados por admin.' }, { status: 400 });
      }
      if (profile.password_changed_by_user === true) {
        return NextResponse.json({ error: 'Este usuario ya cambió su contraseña.' }, { status: 400 });
      }

      await beginAdminPasswordMutation(supabaseAdmin, userId);
      const authUpdateStartedAt = new Date().toISOString();

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
      });

      if (authError) {
        await clearAdminPasswordMutation(supabaseAdmin, userId);
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }

      await removeAdminGeneratedPasswordNotification(supabaseAdmin, userId, authUpdateStartedAt);

      const { data, error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
          admin_set_password: password,
          password_changed_by_user: false,
          password_changed_at: null,
          password_prompt_manual_seen_at: null,
          admin_password_reset_started_at: null,
        })
        .eq('id', userId)
        .select('admin_set_password,password_changed_by_user,password_changed_at,password_prompt_manual_seen_at')
        .maybeSingle();

      if (profileError) return migrationErrorResponse(profileError);

      return NextResponse.json({ success: true, user: data });
    }

    if (action === 'disable_access') {
      if (profile.deleted_at) {
        return NextResponse.json({ error: 'Este registro ya fue eliminado.' }, { status: 400 });
      }

      const disabledAt = new Date().toISOString();
      const randomPassword = `${randomBytes(32).toString('base64url')}Aa1!`;

      await beginAdminPasswordMutation(supabaseAdmin, userId);
      const authUpdateStartedAt = new Date().toISOString();

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: randomPassword,
      });

      if (authError) {
        await clearAdminPasswordMutation(supabaseAdmin, userId);
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }

      await removeAdminGeneratedPasswordNotification(supabaseAdmin, userId, authUpdateStartedAt);

      const { data, error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
          deleted_at: disabledAt,
          deleted_by: admin.email,
          deleted_reason: 'access_disabled_by_admin',
          admin_set_password: null,
          password_prompt_manual_seen_at: disabledAt,
          admin_password_reset_started_at: null,
        })
        .eq('id', userId)
        .select('deleted_at,deleted_by,deleted_reason,admin_set_password,password_prompt_manual_seen_at')
        .maybeSingle();

      if (profileError) return migrationErrorResponse(profileError);

      return NextResponse.json({ success: true, user: data });
    }

    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  } catch (error) {
    if (isMissingMigration(error)) return migrationErrorResponse(error);
    return NextResponse.json({ error: error.message }, { status: adminAuthStatus(error) });
  }
}
