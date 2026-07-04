// Utilidades puras para el chat interno del admin (sin llamadas a Supabase aca).

export const CHAT_EDIT_WINDOW_MS = 12 * 60 * 60 * 1000; // 12hs
export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB
export const CHAT_IMAGE_EXPIRY_DAYS = 7;

export function emailHandle(email) {
  return String(email || '').split('@')[0].toLowerCase();
}

export function buildMemberDirectory(admins = [], operators = []) {
  const byEmail = new Map();
  admins.forEach(a => {
    if (!a?.email) return;
    byEmail.set(a.email, { email: a.email, name: a.name || emailHandle(a.email), role: 'admin' });
  });
  operators.forEach(o => {
    if (!o?.email || byEmail.has(o.email)) return;
    byEmail.set(o.email, { email: o.email, name: o.name || emailHandle(o.email), role: 'operator' });
  });
  return byEmail;
}

export function displayNameForEmail(directory, email) {
  if (!email) return 'Sistema';
  return directory.get(email)?.name || emailHandle(email);
}

export function canEditOrDelete(message, currentUser, isOwner) {
  if (!message || message.sender_email !== currentUser) return false;
  if (isOwner) return true;
  const ageMs = Date.now() - new Date(message.created_at).getTime();
  return ageMs < CHAT_EDIT_WINDOW_MS;
}

// Detecta @handle en el texto y devuelve los emails de miembros del canal que matchean.
export function parseMentions(body, channelMemberEmails, directory) {
  const matches = [...String(body || '').matchAll(/@([a-z0-9._-]+)/gi)].map(m => m[1].toLowerCase());
  if (matches.length === 0) return [];
  const found = new Set();
  channelMemberEmails.forEach(email => {
    const handle = emailHandle(email);
    if (matches.includes(handle)) found.add(email);
  });
  return [...found];
}

// Reemplaza @handle por el nombre para mostrar, devolviendo partes para render (texto plano / mencion).
export function splitBodyWithMentions(body, channelMemberEmails, directory) {
  const text = String(body || '');
  const handles = new Map(channelMemberEmails.map(email => [emailHandle(email), email]));
  const regex = /@([a-z0-9._-]+)/gi;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text))) {
    const handle = match[1].toLowerCase();
    if (handles.has(handle)) {
      if (match.index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
      parts.push({ type: 'mention', value: displayNameForEmail(directory, handles.get(handle)), email: handles.get(handle) });
      lastIndex = regex.lastIndex;
    }
  }
  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) });
  return parts.length > 0 ? parts : [{ type: 'text', value: text }];
}

export function referenceLabel(reference) {
  if (!reference) return '';
  if (reference.type === 'order') return `Pedido ${reference.label || ''}`.trim();
  if (reference.type === 'production') return `Producción ${reference.label || ''}`.trim();
  if (reference.type === 'design') return `Diseño: ${reference.label || ''}`.trim();
  return reference.label || '';
}

export function formatChatTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function formatChatDateSeparator(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return 'Hoy';
  if (sameDay(date, yesterday)) return 'Ayer';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

export function isSameDay(isoA, isoB) {
  if (!isoA || !isoB) return false;
  return new Date(isoA).toDateString() === new Date(isoB).toDateString();
}
