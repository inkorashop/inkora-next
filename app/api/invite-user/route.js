import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

async function generateInviteLink(supabaseAdmin, email) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://inkora.com.ar';

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: siteUrl },
  });

  let link = null;

  if (!linkError) {
    const rawLink = linkData?.properties?.action_link;

    try {
      const token = new URL(rawLink).searchParams.get('token');
      link = token ? `${siteUrl}/invite?token=${encodeURIComponent(token)}` : rawLink;
    } catch {
      link = rawLink;
    }
  }

  return {
    link,
    link_error: linkError?.message || null,
  };
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

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, registration_source, deleted_at')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (
      existingProfile?.id &&
      existingProfile.registration_source === 'admin_invite' &&
      existingProfile.deleted_at
    ) {
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

      const { error: reactivateProfileError } = await supabaseAdmin
        .from('profiles')
        .update({
          email: normalizedEmail,
          name: trimmedName,
          phone: trimmedPhone,
          admin_set_password: password,
          registration_source: 'admin_invite',
          password_changed_by_user: false,
          deleted_at: null,
          deleted_by: null,
          deleted_reason: null,
        })
        .eq('id', existingProfile.id);

      if (reactivateProfileError) {
        return NextResponse.json({ error: reactivateProfileError.message }, { status: 400 });
      }

      const { link, link_error } = await generateInviteLink(supabaseAdmin, normalizedEmail);

      return NextResponse.json({
        success: true,
        reactivated: true,
        user_id: existingProfile.id,
        link,
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
      deleted_at: null,
      deleted_by: null,
      deleted_reason: null,
    });

    if (profileError) {
      console.error('Error updating profile:', profileError);
    }

    const { link, link_error } = await generateInviteLink(supabaseAdmin, normalizedEmail);

    return NextResponse.json({
      success: true,
      reactivated: false,
      user_id: user.id,
      link,
      link_error,
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}