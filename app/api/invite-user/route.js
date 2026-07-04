import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { createStoredInviteLink } from '@/lib/invite-access-links';
import { requireAdmin } from '@/lib/admin-api-auth';

async function generateInviteLink(supabaseAdmin, email, userId, clientName = '') {
  try {
    const { link, record } = await createStoredInviteLink(supabaseAdmin, {
      email,
      userId,
      clientName,
      kind: 'permanent',
      nextPath: '/',
    });
    return { link, record, link_error: null };
  } catch (error) {
    return { link: null, record: null, link_error: error.message };
  }
}

async function beginAdminPasswordMutation(supabaseAdmin, userId) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ admin_password_reset_started_at: new Date().toISOString() })
    .eq('id', userId);

  if (error && error.code !== '42703') throw error;
}

async function removeAdminGeneratedPasswordNotification(supabaseAdmin, userId, sinceIso) {
  await supabaseAdmin
    .from('admin_notifications')
    .delete()
    .eq('type', 'password_changed')
    .eq('user_id', userId)
    .gte('created_at', sinceIso);
}

export async function POST(req) {
  try {
    const { name, phone, email, password } = await req.json();

    const normalizedEmail = email?.trim().toLowerCase();
    const trimmedName = name?.trim();
    const trimmedPhone = phone?.trim() || null;

    if (!normalizedEmail || !password || !trimmedName) {
      return NextResponse.json(
        { error: 'Nombre, email y contraseña son obligatorios' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getAdminClient();
    await requireAdmin(supabaseAdmin);

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, registration_source, deleted_at')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingProfile?.id && existingProfile.deleted_at) {
      await beginAdminPasswordMutation(supabaseAdmin, existingProfile.id);
      const authUpdateStartedAt = new Date().toISOString();

      const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(
        existingProfile.id,
        {
          email: normalizedEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: trimmedName },
        }
      );

      if (updateUserError) {
        return NextResponse.json({ error: updateUserError.message }, { status: 400 });
      }

      await removeAdminGeneratedPasswordNotification(supabaseAdmin, existingProfile.id, authUpdateStartedAt);

      const { error: reactivateProfileError } = await supabaseAdmin
        .from('profiles')
        .update({
          email: normalizedEmail,
          name: trimmedName,
          phone: trimmedPhone,
          admin_set_password: password,
          registration_source: 'admin_invite',
          password_changed_by_user: false,
          password_changed_at: null,
          password_prompt_dismissed_on: null,
          password_prompt_manual_seen_at: null,
          admin_password_reset_started_at: null,
          send_confirmation_email: false,
          deleted_at: null,
          deleted_by: null,
          deleted_reason: null,
        })
        .eq('id', existingProfile.id);

      if (reactivateProfileError) {
        return NextResponse.json({ error: reactivateProfileError.message }, { status: 400 });
      }

      const { link, record, link_error } = await generateInviteLink(supabaseAdmin, normalizedEmail, existingProfile.id, trimmedName);

      return NextResponse.json({
        success: true,
        reactivated: true,
        user_id: existingProfile.id,
        link,
        link_record: record,
        link_error,
      });
    }

    const { data: { user }, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: trimmedName },
    });

    if (createError) {
      const msg = createError.message?.toLowerCase?.() || '';
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        return NextResponse.json({ error: 'Ya existe una cuenta activa con ese email.' }, { status: 400 });
      }
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: user.id,
      email: normalizedEmail,
      name: trimmedName,
      phone: trimmedPhone,
      admin_set_password: password,
      registration_source: 'admin_invite',
      password_changed_by_user: false,
      send_confirmation_email: false,
      deleted_at: null,
      deleted_by: null,
      deleted_reason: null,
    });

    if (profileError) {
      console.error('Error updating profile:', profileError);
    }

    const { link, record, link_error } = await generateInviteLink(supabaseAdmin, normalizedEmail, user.id, trimmedName);

    return NextResponse.json({
      success: true,
      reactivated: false,
      user_id: user.id,
      link,
      link_record: record,
      link_error,
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
