// ── Numeric words ─────────────────────────────────────────────────────────────
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

// Strip accents, punctuation; lowercase
function normWord(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Normalize a multi-word phrase (collapse spaces, strip accents/punctuation)
function normPhrase(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function parseQtyWord(text) {
  const t = text.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  if (!isNaN(n) && n > 0) return n;
  return WORD_TO_NUM[normWord(t)] ?? null;
}

// ── Namespace triggers ────────────────────────────────────────────────────────

const MIC_NS    = new Set(['microfono', 'voz', 'audio', 'grabacion', 'micro', 'microfon']);
const MIC_STOP  = new Set(['cerrar', 'cancelar', 'apagar', 'parar', 'detener', 'stop', 'terminar', 'para', 'apaga', 'cierra']);

const ORDER_NS     = new Set(['pedido', 'orden']);
const ORDER_SAVE   = new Set(['guardar', 'confirmar', 'enviar']);
const ORDER_CANCEL = new Set(['cancelar', 'cerrar']);
const ORDER_CLEAR  = new Set(['borrar', 'limpiar', 'eliminar', 'resetear', 'vaciar']);

// Commit current segment and continue recording (guardar now equals siguiente)
const NEXT_WORDS = new Set(['siguiente', 'proximo', 'sigue', 'next', 'guardar', 'continuar']);

// ── Field triggers ─────────────────────────────────────────────────────────────
// Each entry: { field, words[] } where words is the normalized keyword as word array.
// Ordered longest-first so multi-word matches take priority over single-word ones.
const FIELD_RULES = [
  // deliveryDate — multi-word first
  { field: 'deliveryDate', words: ['fecha', 'de', 'la', 'entrega'] },
  { field: 'deliveryDate', words: ['fecha', 'de', 'entrega'] },
  { field: 'deliveryDate', words: ['fecha', 'entrega'] },
  { field: 'deliveryDate', words: ['para', 'entregar'] },
  // date — order date
  { field: 'date', words: ['fecha', 'del', 'pedido'] },
  { field: 'date', words: ['fecha', 'de', 'pedido'] },
  { field: 'date', words: ['fecha', 'pedido'] },
  { field: 'date', words: ['fecha'] },
  // deliveryDate — single word (after multi-word)
  { field: 'deliveryDate', words: ['entrega'] },
  { field: 'deliveryDate', words: ['entregar'] },
  // customer
  { field: 'customer', words: ['para', 'el', 'cliente'] },
  { field: 'customer', words: ['para', 'la', 'cliente'] },
  { field: 'customer', words: ['clientes'] },
  { field: 'customer', words: ['cliente'] },
  { field: 'customer', words: ['comprador'] },
  { field: 'customer', words: ['compradora'] },
  // seller
  { field: 'seller', words: ['vendedoras'] },
  { field: 'seller', words: ['vendedores'] },
  { field: 'seller', words: ['vendedora'] },
  { field: 'seller', words: ['vendedor'] },
  { field: 'seller', words: ['vende'] },
  // operator
  { field: 'operator', words: ['operadores'] },
  { field: 'operator', words: ['operadoras'] },
  { field: 'operator', words: ['operadora'] },
  { field: 'operator', words: ['operador'] },
  { field: 'operator', words: ['operarios'] },
  { field: 'operator', words: ['operario'] },
  // notes
  { field: 'notes', words: ['observaciones'] },
  { field: 'notes', words: ['observacion'] },
  { field: 'notes', words: ['aclaraciones'] },
  { field: 'notes', words: ['aclaracion'] },
  { field: 'notes', words: ['comentarios'] },
  { field: 'notes', words: ['comentario'] },
  { field: 'notes', words: ['notas'] },
  { field: 'notes', words: ['nota'] },
  // time only (no date change — applies to last date field)
  { field: 'time', words: ['horario'] },
  { field: 'time', words: ['hora'] },
];

// Returns { field, remaining: original-words[] } or null.
function detectField(words) {
  const norms = words.map(normWord);
  for (const rule of FIELD_RULES) {
    const rw = rule.words;
    if (norms.length >= rw.length && rw.every((w, i) => norms[i] === w)) {
      return { field: rule.field, remaining: words.slice(rw.length) };
    }
  }
  return null;
}

// ── Design segment parsing ────────────────────────────────────────────────────

// Uses the LAST " por " as split point (handles "La Sirenita por siempre por 5")
export function parseVoiceSegment(text) {
  const t = text.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const porIdx = lower.lastIndexOf(' por ');
  if (porIdx === -1) return { name: t, qty: 1 };
  const name = t.slice(0, porIdx).trim();
  const qtyText = t.slice(porIdx + 5).trim();
  if (!name) return null;
  return { name, qty: parseQtyWord(qtyText) ?? 1 };
}

// ── Date / time parsing ───────────────────────────────────────────────────────

const MONTHS_ES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function parseYear2(y) {
  const n = parseInt(y, 10);
  if (isNaN(n)) return null;
  if (n < 100) return n < 50 ? 2000 + n : 1900 + n;
  return n;
}

// Returns { year, month, day } or null
export function parseSpanishDate(text) {
  const t = normPhrase(text);

  // "2 de junio del 2026" / "2 de junio de 2026" / "2 de junio 2026"
  let m = t.match(/(\d{1,2})\s+de\s+([a-z]+)(?:\s+del?\s+(\d{2,4})|(\d{2,4}))?/);
  if (m) {
    const month = MONTHS_ES[m[2]];
    if (month) {
      const year = m[3] ? parseYear2(m[3]) : m[4] ? parseYear2(m[4]) : new Date().getFullYear();
      return { year, month, day: parseInt(m[1]) };
    }
  }
  // "02 del 06 del 26" / "2 del 6 de 2026"
  m = t.match(/(\d{1,2})\s+del?\s+(\d{1,2})\s+del?\s+(\d{2,4})/);
  if (m) return { year: parseYear2(m[3]), month: parseInt(m[2]), day: parseInt(m[1]) };

  // "2 junio 2026" / "2 junio"
  m = t.match(/(\d{1,2})\s+([a-z]+)(?:\s+(\d{2,4}))?/);
  if (m && MONTHS_ES[m[2]]) {
    const year = m[3] ? parseYear2(m[3]) : new Date().getFullYear();
    return { year, month: MONTHS_ES[m[2]], day: parseInt(m[1]) };
  }
  return null;
}

// Returns { hour, minute } or null
export function parseSpanishTime(text) {
  const t = normPhrase(text);
  if (/mediodia/.test(t)) return { hour: 12, minute: 0 };
  if (/medianoche/.test(t)) return { hour: 0, minute: 0 };

  // "16:30"
  let m = t.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const h = parseInt(m[1]), min = parseInt(m[2]);
    if (h >= 0 && h < 24 && min >= 0 && min < 60) return { hour: h, minute: min };
  }
  // "16 y media" → :30
  m = t.match(/(\d{1,2})\s+y\s+media/);
  if (m) return { hour: parseInt(m[1]) % 24, minute: 30 };
  // "16 y cuarto" → :15
  m = t.match(/(\d{1,2})\s+y\s+cuarto/);
  if (m) return { hour: parseInt(m[1]) % 24, minute: 15 };
  // "16 menos cuarto" → h-1, :45
  m = t.match(/(\d{1,2})\s+menos\s+cuarto/);
  if (m) { const h = parseInt(m[1]); return { hour: (h === 0 ? 23 : h - 1) % 24, minute: 45 }; }
  // "4pm" / "4 pm"
  m = t.match(/(\d{1,2})\s*p\.?m\.?/);
  if (m) { const h = parseInt(m[1]); return { hour: h === 12 ? 12 : (h % 12) + 12, minute: 0 }; }
  // "4am" / "4 am"
  m = t.match(/(\d{1,2})\s*a\.?m\.?/);
  if (m) { const h = parseInt(m[1]); return { hour: h === 12 ? 0 : h % 12, minute: 0 }; }
  // "4 de la tarde/noche" → +12h if < 12
  m = t.match(/(\d{1,2})\s+de\s+la\s+(tarde|noche)/);
  if (m) { const h = parseInt(m[1]); return { hour: h < 12 ? h + 12 : h, minute: 0 }; }
  // "4 de la mañana/madrugada"
  m = t.match(/(\d{1,2})\s+de\s+la\s+(?:manana|madrugada)/);
  if (m) return { hour: parseInt(m[1]) % 12, minute: 0 };
  // "16 horas"
  m = t.match(/(\d{1,2})\s+horas?/);
  if (m) { const h = parseInt(m[1]); if (h >= 0 && h < 24) return { hour: h, minute: 0 }; }
  // Bare number (1–23) — last resort
  m = t.match(/\b(\d{1,2})\b\s*$/);
  if (m) { const h = parseInt(m[1]); if (h >= 0 && h < 24) return { hour: h, minute: 0 }; }
  return null;
}

// Merge a parsed date/time result into an existing datetime-local string.
// existingValue: "YYYY-MM-DDTHH:MM" or ""
// Returns "YYYY-MM-DDTHH:MM" or null if nothing parseable.
export function parseDateTimeValue(text, existingValue) {
  const dateResult = parseSpanishDate(text);
  const timeResult = parseSpanishTime(text);
  if (!dateResult && !timeResult) return null;

  let year, month, day, hour = 0, minute = 0;
  if (existingValue) {
    const ex = existingValue.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (ex) {
      year = parseInt(ex[1]); month = parseInt(ex[2]); day = parseInt(ex[3]);
      if (ex[4]) hour = parseInt(ex[4]);
      if (ex[5]) minute = parseInt(ex[5]);
    }
  }
  if (dateResult) { year = dateResult.year; month = dateResult.month; day = dateResult.day; }
  if (timeResult) { hour = timeResult.hour; minute = timeResult.minute; }
  if (!year) { const now = new Date(); year = now.getFullYear(); month = month || now.getMonth() + 1; day = day || now.getDate(); }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const mi = String(minute).padStart(2, '0');
  return `${year}-${mm}-${dd}T${hh}:${mi}`;
}

// ── Main parser ───────────────────────────────────────────────────────────────
//
// Processes accumulated voice text and returns structured items + remaining buffer.
//
// Item shapes:
//   { type: 'customer'|'date'|'deliveryDate'|'notes'|'time', value: string }
//   { type: 'seller'|'operator', value: string }  — caller does fuzzy match
//   { type: 'design', text: string }
//   { type: 'cmd:mic-stop' }
//   { type: 'cmd:order-save' }
//   { type: 'cmd:order-cancel' }
//   { type: 'cmd:order-clear' }
//
// remaining: unparsed words still in buffer (user hasn't said "siguiente" yet)

export function parseVoiceFull(text, buffer = '') {
  const combined = (buffer ? buffer + ' ' : '') + text;
  const rawWords = combined.trim().split(/\s+/).filter(Boolean);

  const items = [];
  let seg = [];   // words of the current segment
  let i = 0;

  function flushSeg() {
    if (!seg.length) return;
    const detected = detectField(seg);
    if (detected) {
      const value = detected.remaining.join(' ');
      items.push({ type: detected.field, value });
    } else {
      items.push({ type: 'design', text: seg.join(' ') });
    }
    seg = [];
  }

  while (i < rawWords.length) {
    const w    = rawWords[i];
    const n    = normWord(w);
    const next = i + 1 < rawWords.length ? normWord(rawWords[i + 1]) : null;

    // ── Namespace: MIC ────────────────────────────────────────────────────────
    if (MIC_NS.has(n) && next && MIC_STOP.has(next)) {
      flushSeg();
      items.push({ type: 'cmd:mic-stop' });
      i += 2; continue;
    }

    // ── Namespace: ORDER ──────────────────────────────────────────────────────
    if (ORDER_NS.has(n) && next) {
      if (ORDER_SAVE.has(next))   { flushSeg(); items.push({ type: 'cmd:order-save' });   i += 2; continue; }
      if (ORDER_CANCEL.has(next)) { flushSeg(); items.push({ type: 'cmd:order-cancel' }); i += 2; continue; }
      if (ORDER_CLEAR.has(next))  { flushSeg(); items.push({ type: 'cmd:order-clear' });  i += 2; continue; }
      // "pedido" not followed by a known action → treat as regular word
    }

    // ── NEXT_WORDS: commit current segment ────────────────────────────────────
    if (NEXT_WORDS.has(n)) {
      flushSeg();
      i++; continue;
    }

    seg.push(w);
    i++;
  }

  // Whatever is left in seg is the unfinished segment (no "siguiente" yet)
  const remaining = seg.join(' ');
  return { items, remaining };
}
