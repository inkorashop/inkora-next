/**
 * Parses free-form order text into structured { name, qty } items.
 *
 * Handles all these formats (and mixtures):
 *   "24 de cada / Arg 1 2 3"  → group header + variant expansion
 *   "24 arg 2"                 → qty-first per-line
 *   "- Dragon Ball 1 x 20"    → explicit x format
 *   "Messi 30"                 → qty-at-end (large number threshold)
 *
 * Blank lines reset the active group quantity.
 * Trailing numbers ≥ QTY_THRESHOLD are treated as quantities.
 * Multiple trailing small numbers → variant expansion ("Arg 1 2 3" → Arg 1, Arg 2, Arg 3).
 */

const QTY_THRESHOLD = 10; // numbers ≥ this at end of line = quantity, not variant

function detectGroupHeader(line) {
  const patterns = [
    /^(\d+)\s+de\s+cada\b/i,
    /^(\d+)\s+cada\b/i,
    /^(\d+)\s*c\/u\b/i,
    /^cada\s+(\d+)/i,
    /^(\d+)\s+por\s+dise[ñn]o/i,
    /^cantidad[:\s]+(\d+)/i,
  ];
  for (const p of patterns) {
    const m = line.match(p);
    if (m) return parseInt(m[1] ?? m[2], 10);
  }
  return null;
}

// Returns { qty, name } for explicit markers like "name x N", "N x name", "name: N"
function detectExplicitQty(line) {
  let m;
  // "N × name" or "N x name"
  m = line.match(/^(\d+)\s*[×xX]\s+(.+)$/);
  if (m) return { qty: parseInt(m[1], 10), name: m[2].trim() };
  // "name × N" or "name x N"
  m = line.match(/^(.+?)\s+[×xX]\s*(\d+)\s*$/);
  if (m) return { qty: parseInt(m[2], 10), name: m[1].trim() };
  // "name: N"
  m = line.match(/^(.+?):\s*(\d+)\s*$/);
  if (m) return { qty: parseInt(m[2], 10), name: m[1].trim() };
  // "name – N" or "name - N"
  m = line.match(/^(.+?)\s+[-–]\s+(\d+)\s*$/);
  if (m) return { qty: parseInt(m[2], 10), name: m[1].trim() };
  return null;
}

// In group mode: collect ALL trailing integers as variant identifiers.
// Multiple → expand ("Arg 1 2 3" → ["Arg 1","Arg 2","Arg 3"]).
// Single   → keep full line as-is ("Capibara 3" → ["Capibara 3"]).
function expandGroupLine(line) {
  const tokens = line.split(/\s+/);
  const variants = [];
  let i = tokens.length - 1;
  while (i >= 0 && /^\d+$/.test(tokens[i])) {
    variants.unshift(tokens[i]);
    i--;
  }
  const base = tokens.slice(0, i + 1).join(' ');
  if (!base) return [];
  if (variants.length > 1) return variants.map(v => `${base} ${v}`);
  return [line]; // 0 or 1 trailing integer → keep full line
}

/**
 * @param {string} text
 * @returns {{ name: string, qty: number }[]}
 */
export function parseOrderText(text) {
  const lines = text.split('\n');
  const items = [];
  let groupQty = null;

  for (const rawLine of lines) {
    const line = rawLine
      .trim()
      .replace(/^[-•*]\s*/, ''); // strip leading bullet/dash

    // Blank line → reset group
    if (!line) { groupQty = null; continue; }

    // 1. Group header?
    const gQty = detectGroupHeader(line);
    if (gQty !== null) { groupQty = gQty; continue; }

    // 2. Explicit qty marker? (x, :, –)  — always wins
    const explicit = detectExplicitQty(line);
    if (explicit) {
      // Still expand variants in the name portion
      for (const name of expandGroupLine(explicit.name)) {
        items.push({ name, qty: explicit.qty });
      }
      continue;
    }

    // 3. In group mode → expand variant lines
    if (groupQty !== null) {
      for (const name of expandGroupLine(line)) {
        items.push({ name, qty: groupQty });
      }
      continue;
    }

    // 4. Standalone (no group) — try to infer qty from the line itself

    // 4a. Starts with a number: "24 arg 2" → qty=24, name="arg 2"
    const startNum = line.match(/^(\d+)\s+(.+)$/);
    if (startNum) {
      items.push({ qty: parseInt(startNum[1], 10), name: startNum[2].trim() });
      continue;
    }

    // 4b. Ends with a large number: "Messi 30", "Selección 1 30"
    const endNum = line.match(/^(.+)\s+(\d+)$/);
    if (endNum && parseInt(endNum[2], 10) >= QTY_THRESHOLD) {
      items.push({ qty: parseInt(endNum[2], 10), name: endNum[1].trim() });
      continue;
    }

    // 4c. Plain name, unknown qty → qty = 1
    items.push({ name: line, qty: 1 });
  }

  return items;
}
