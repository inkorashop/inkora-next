import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';

export async function POST(req) {
  try {
    const { email, password, name, phone } = await req.json();
    const normalizedEmail = email?.trim().toLowerCase();
    const trimmedName = name?.trim();
    const trimmedPhone = phone?.trim() || null;

    if (!normalizedEmail || !password || !trimmedName) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    if (String(password).length < 6) {
      return NextResponse.json({ error: 'La contrasena debe tener al menos 6 caracteres.' }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();

    const { data: matchingProfiles, error: profileLookupError } = await supabaseAdmin
      .from('profiles')
      .select('id,email,deleted_at')
      .ilike('email', normalizedEmail)
      .limit(1);

    if (profileLookupError) {
      return NextResponse.json({ error: profileLookupError.message }, { status: 400 });
    }

    const existingProfile = matchingProfiles?.[0] || null;

    if (existingProfile?.id && !existingProfile.deleted_at) {
      return NextResponse.json({ error: 'Ya existe una cuenta con ese email.' }, { status: 400 });
    }

    const { data: settingData } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'require_email_confirmation')
      .maybeSingle();

    const requireConfirmation = settingData?.value === 'true';

    if (requireConfirmation && !existingProfile?.deleted_at) {
      return NextResponse.json({ confirmationRequired: true });
    }

    if (existingProfile?.id && existingProfile.deleted_at) {
      const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(
        existingProfile.id,
        {
          email: normalizedEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: trimmedName, phone: trimmedPhone || '' },
        }
      );

      if (updateUserError) {
        return NextResponse.json({ error: updateUserError.message }, { status: 400 });
      }

      const { error: reactivateProfileError } = await supabaseAdmin
        .from('profiles')
        .update({
          email: normalizedEmail,
          name: trimmedName,
          phone: trimmedPhone,
          registration_source: 'self_email',
          password_changed_by_user: false,
          password_changed_at: null,
          password_prompt_dismissed_on: null,
          password_prompt_manual_requested_at: null,
          password_prompt_manual_seen_at: null,
          send_confirmation_email: false,
          deleted_at: null,
          deleted_by: null,
          deleted_reason: null,
        })
        .eq('id', existingProfile.id);

      if (reactivateProfileError) {
        return NextResponse.json({ error: reactivateProfileError.message }, { status: 400 });
      }

      return NextResponse.json({
        confirmationRequired: false,
        reactivated: true,
        user_id: existingProfile.id,
        email: normalizedEmail,
      });
    }

    const { data: { user }, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: trimmedName, phone: trimmedPhone || '' },
    });

    if (createError) {
      const msg = createError.message?.toLowerCase?.() || '';
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        return NextResponse.json({ error: 'Ya existe una cuenta con ese email.' }, { status: 400 });
      }
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: user.id,
      email: normalizedEmail,
      name: trimmedName,
      phone: trimmedPhone,
      registration_source: 'self_email',
      password_changed_by_user: false,
      send_confirmation_email: false,
      deleted_at: null,
      deleted_by: null,
      deleted_reason: null,
    });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({
      confirmationRequired: false,
      user_id: user.id,
      email: normalizedEmail,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
