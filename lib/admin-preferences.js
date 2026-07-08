// Preferencias visuales por admin/operario individual (anchos de columna,
// filtros, orden, etc.), guardadas en la misma tabla `settings` que el resto
// de la configuración, con la key sufijada por email. Centralizado acá para
// que cualquier tabla nueva que sume una preferencia de este tipo reutilice
// el mismo mecanismo en vez de reinventarlo.

export function adminPreferenceKey(baseKey, email) {
  const safeEmail = String(email || 'anon')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${baseKey}_${safeEmail || 'anon'}`;
}

export function parseColumnWidths(value, defaults) {
  const result = { ...defaults };
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.keys(defaults).forEach(key => {
        const width = Number(parsed[key]);
        if (Number.isFinite(width) && width > 0) result[key] = width;
      });
    }
  } catch {
    // valor corrupto o de una version anterior: se ignora, quedan los defaults
  }
  return result;
}

export function clampColumnWidth(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
