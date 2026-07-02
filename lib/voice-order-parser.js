const WORD_TO_NUM = {
  'uno': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
  'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10,
  'once': 11, 'doce': 12, 'trece': 13, 'catorce': 14, 'quince': 15,
  'dieciseis': 16, 'diecisiete': 17, 'dieciocho': 18, 'diecinueve': 19,
  'veinte': 20, 'veintiuno': 21, 'veintidos': 22, 'veintitres': 23,
  'veinticuatro': 24, 'veinticinco': 25, 'veintiseis': 26,
  'veintisiete': 27, 'veintiocho': 28, 'veintinueve': 29,
  'treinta': 30, 'cuarenta': 40, 'cincuenta': 50,
  'sesenta': 60, 'setenta': 70, 'ochenta': 80, 'noventa': 90,
  'cien': 100, 'ciento': 100, 'doscientos': 200, 'trescientos': 300,
  'cuatrocientos': 400, 'quinientos': 500,
};

// Strip accents + punctuation, lowercase
function normWord(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function parseQty(text) {
  const t = text.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  if (!isNaN(n) && n > 0) return n;
  return WORD_TO_NUM[normWord(t)] ?? null;
}

// Words that signal "move to next item"
const NEXT_WORDS = new Set(['siguiente', 'proximo', 'sigue', 'next']);
// Words that signal "stop recording"
const STOP_WORDS = new Set(['guardar', 'cerrar', 'cancelar', 'terminar', 'fin', 'listo', 'stop']);

/**
 * Split accumulated voice text on trigger words.
 * Returns { segments: string[], remaining: string, shouldStop: boolean }
 *
 * "siguiente" → finalize current item, start next
 * "guardar"/"cerrar"/"cancelar" → finalize current item, stop recording
 */
export function splitVoiceText(text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const segments = [];
  let current = [];
  let shouldStop = false;

  for (const tok of tokens) {
    const n = normWord(tok);
    if (STOP_WORDS.has(n)) {
      if (current.length > 0) segments.push(current.join(' '));
      current = [];
      shouldStop = true;
      break;
    }
    if (NEXT_WORDS.has(n)) {
      if (current.length > 0) segments.push(current.join(' '));
      current = [];
    } else {
      current.push(tok);
    }
  }

  return { segments, remaining: current.join(' '), shouldStop };
}

/**
 * Parse a single voice segment: "[design name] por [qty]"
 * Uses the LAST occurrence of " por " as the split point so that
 * design names like "La Sirenita por siempre" are handled correctly.
 * Falls back to qty=1 if "por" is absent.
 * Returns { name: string, qty: number } or null.
 */
export function parseVoiceSegment(text) {
  const t = text.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  // Last " por " in the string
  const porIdx = lower.lastIndexOf(' por ');
  if (porIdx === -1) {
    return { name: t, qty: 1 };
  }
  const name = t.slice(0, porIdx).trim();
  const qtyText = t.slice(porIdx + 5).trim();
  if (!name) return null;
  return { name, qty: parseQty(qtyText) ?? 1 };
}
