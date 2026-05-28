import crypto from 'crypto';

export const INVITE_LINKS_SETTING_KEY = 'invite_access_links_v1';

export function cleanSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.inkora.com.ar').replace(/\/+$/, '');
}

export function normalizeNextPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '/';

  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const url = new URL(raw);
      const allowed = new URL(cleanSiteUrl());
      const normalizeHost = (host) => host.replace(/^www\./i, '');
      if (normalizeHost(url.host) !== normalizeHost(allowed.host)) return '/';
      return `${url.pathname || '/'}${url.search || ''}${url.hash || ''}`;
    }
  } catch {
    return '/';
  }

  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export function createInviteToken() {
  return crypto.randomBytes(12).toString('base64url');
}

export function slugifyInviteName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function hashInviteToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function parseState(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function normalizeInviteState(value) {
  const parsed = parseState(value);
  const links = Array.isArray(parsed?.links) ? parsed.links : [];
  return {
    globalDisabled: parsed?.globalDisabled === true,
    links: links.map(link => ({
      id: String(link.id || crypto.randomUUID()),
      user_id: link.user_id || null,
      email: String(link.email || '').trim().toLowerCase(),
      client_name: String(link.client_name || '').trim(),
      kind: link.kind === 'permanent' ? 'permanent' : 'single',
      token: link.token || null,
      token_hash: String(link.token_hash || ''),
      next_path: normalizeNextPath(link.next_path || '/'),
      disabled: link.disabled === true,
      deleted_at: link.deleted_at || null,
      used_at: link.used_at || null,
      last_used_at: link.last_used_at || null,
      usage_count: Number(link.usage_count || 0),
      created_at: link.created_at || new Date().toISOString(),
      updated_at: link.updated_at || link.created_at || new Date().toISOString(),
    })).filter(link => link.email && link.token_hash),
  };
}

export async function loadInviteState(supabaseAdmin) {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', INVITE_LINKS_SETTING_KEY)
    .maybeSingle();

  if (error) throw error;
  return normalizeInviteState(data?.value);
}

export async function saveInviteState(supabaseAdmin, state) {
  const normalized = normalizeInviteState(state);
  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({
      key: INVITE_LINKS_SETTING_KEY,
      value: JSON.stringify(normalized),
    });

  if (error) throw error;
  return normalized;
}

function buildPublicInviteUrl(link, token) {
  if (!token) return null;
  const nameSlug = slugifyInviteName(link.client_name);
  const encodedToken = encodeURIComponent(token);
  return nameSlug
    ? `${cleanSiteUrl()}/i/${encodeURIComponent(nameSlug)}/${encodedToken}`
    : `${cleanSiteUrl()}/i/${encodedToken}`;
}

export function publicInviteLink(link) {
  const { token, token_hash, ...safe } = link;
  return {
    ...safe,
    link_url: buildPublicInviteUrl(link, token),
  };
}

export function publicInviteState(state) {
  return {
    globalDisabled: state.globalDisabled,
    links: state.links.filter(link => !link.deleted_at).map(publicInviteLink),
  };
}

export async function createStoredInviteLink(supabaseAdmin, { email, userId = null, clientName = '', kind = 'permanent', nextPath = '/' }) {
  const state = await loadInviteState(supabaseAdmin);
  const now = new Date().toISOString();
  const token = createInviteToken();
  const link = {
    id: crypto.randomUUID(),
    user_id: userId || null,
    email: String(email || '').trim().toLowerCase(),
    client_name: String(clientName || '').trim(),
    kind: kind === 'permanent' ? 'permanent' : 'single',
    token,
    token_hash: hashInviteToken(token),
    next_path: normalizeNextPath(nextPath),
    disabled: false,
    deleted_at: null,
    used_at: null,
    last_used_at: null,
    usage_count: 0,
    created_at: now,
    updated_at: now,
  };

  if (!link.email) throw new Error('Email requerido');

  const nextState = {
    ...state,
    links: [link, ...state.links],
  };
  await saveInviteState(supabaseAdmin, nextState);

  return {
    link: buildPublicInviteUrl(link, token),
    record: publicInviteLink(link),
  };
}

export async function updateStoredInviteLink(supabaseAdmin, linkId, patch) {
  const state = await loadInviteState(supabaseAdmin);
  const now = new Date().toISOString();
  const nextLinks = state.links.map(link => {
    if (link.id !== linkId) return link;
    return {
      ...link,
      kind: patch.kind === 'permanent' || patch.kind === 'single' ? patch.kind : link.kind,
      client_name: Object.prototype.hasOwnProperty.call(patch, 'client_name') ? String(patch.client_name || '').trim() : link.client_name,
      next_path: Object.prototype.hasOwnProperty.call(patch, 'next_path') ? normalizeNextPath(patch.next_path) : link.next_path,
      disabled: Object.prototype.hasOwnProperty.call(patch, 'disabled') ? patch.disabled === true : link.disabled,
      deleted_at: patch.deleted === true ? now : link.deleted_at,
      updated_at: now,
    };
  });

  const nextState = await saveInviteState(supabaseAdmin, { ...state, links: nextLinks });
  return publicInviteState(nextState);
}

export async function setInviteLinksGlobalDisabled(supabaseAdmin, disabled) {
  const state = await loadInviteState(supabaseAdmin);
  const nextState = await saveInviteState(supabaseAdmin, { ...state, globalDisabled: disabled === true });
  return publicInviteState(nextState);
}

export async function consumeInviteLink(supabaseAdmin, token) {
  const state = await loadInviteState(supabaseAdmin);
  const tokenHash = hashInviteToken(token);
  const link = state.links.find(item => item.token_hash === tokenHash);

  if (
    state.globalDisabled
    || !link
    || link.disabled
    || link.deleted_at
    || (link.kind !== 'permanent' && link.used_at)
  ) {
    throw new Error('El token no es valido');
  }

  const now = new Date().toISOString();
  const nextLinks = state.links.map(item => {
    if (item.id !== link.id) return item;
    return {
      ...item,
      used_at: item.kind === 'permanent' ? item.used_at : now,
      last_used_at: now,
      usage_count: Number(item.usage_count || 0) + 1,
      updated_at: now,
    };
  });

  await saveInviteState(supabaseAdmin, { ...state, links: nextLinks });
  return publicInviteLink({ ...link, last_used_at: now, usage_count: Number(link.usage_count || 0) + 1 });
}
