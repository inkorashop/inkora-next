import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  createStoredInviteLink,
  loadInviteState,
  publicInviteState,
  setInviteLinksGlobalDisabled,
  updateStoredInviteLink,
} from '@/lib/invite-access-links';
import { adminAuthStatus, requireAdmin } from '@/lib/admin-api-auth';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan variables de Supabase en el servidor');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function filterState(state, userId) {
  if (!userId) return state;
  return {
    ...state,
    links: state.links.filter(link => link.user_id === userId),
  };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');
    const supabaseAdmin = getAdminClient();
    await requireAdmin(supabaseAdmin);
    const state = publicInviteState(await loadInviteState(supabaseAdmin));
    return NextResponse.json(filterState(state, userId));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: adminAuthStatus(error) });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const supabaseAdmin = getAdminClient();
    await requireAdmin(supabaseAdmin);
    const created = await createStoredInviteLink(supabaseAdmin, {
      email: body.email,
      userId: body.user_id || null,
      clientName: body.client_name || '',
      kind: body.kind,
      nextPath: body.next_path,
    });
    const state = publicInviteState(await loadInviteState(supabaseAdmin));
    return NextResponse.json({ ...created, state });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 400 });
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json();
    const supabaseAdmin = getAdminClient();
    await requireAdmin(supabaseAdmin);

    if (body.scope === 'global') {
      const state = await setInviteLinksGlobalDisabled(supabaseAdmin, body.disabled === true);
      return NextResponse.json(state);
    }

    if (!body.id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    const state = await updateStoredInviteLink(supabaseAdmin, body.id, body);
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 400 });
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

    const supabaseAdmin = getAdminClient();
    await requireAdmin(supabaseAdmin);
    const state = await updateStoredInviteLink(supabaseAdmin, id, { deleted: true });
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 400 });
  }
}
