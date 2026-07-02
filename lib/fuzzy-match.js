// Jaro-Winkler similarity — returns 0..1
function jaro(s1, s2) {
  if (s1 === s2) return 1;
  const len1 = s1.length, len2 = s2.length;
  if (!len1 || !len2) return 0;
  const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Uint8Array(len1);
  const s2Matches = new Uint8Array(len2);
  let matches = 0, transpositions = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = s2Matches[j] = 1;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
}

function jaroWinkler(s1, s2, p = 0.1) {
  const j = jaro(s1, s2);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++; else break;
  }
  return j + prefix * p * (1 - j);
}

// Common abbreviations: expanded in queries before matching
const QUERY_ALIASES = {
  'arg': 'argentina',
};

function expandAliases(str) {
  return str.split(/\s+/).map(t => QUERY_ALIASES[t] ?? t).join(' ');
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/̀-ͯ/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

// Token overlap bonus: what fraction of words in query appear in target
function tokenOverlap(query, target) {
  const qTokens = query.split(/\s+/).filter(Boolean);
  const tStr = target + ' ';
  let hits = 0;
  for (const tok of qTokens) {
    if (tok.length >= 2 && tStr.includes(tok)) hits++;
  }
  return qTokens.length ? hits / qTokens.length : 0;
}

/**
 * Score how well `query` matches `target`. Returns 0..1.
 */
export function similarity(query, target) {
  const q = expandAliases(normalize(query));
  const t = normalize(target);
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (t.includes(q) || q.includes(t)) return 0.92;
  const jw = jaroWinkler(q, t);
  const overlap = tokenOverlap(q, t);
  // Weighted: jaro-winkler 65% + token overlap 35%
  return Math.min(1, jw * 0.65 + overlap * 0.35);
}

/**
 * Given a text query and an array of designs [{id, name}],
 * returns top N matches sorted by score descending.
 */
export function fuzzyMatchDesigns(query, designs, topN = 5) {
  if (!query || !designs?.length) return [];
  return designs
    .map(d => ({ design: d, score: similarity(query, d.name) }))
    .filter(x => x.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/**
 * Color for a similarity score: red → orange → green
 */
export function scoreColor(score) {
  if (score >= 0.8) return '#15803d';
  if (score >= 0.6) return '#b45309';
  return '#b91c1c';
}

export function scoreBg(score) {
  if (score >= 0.8) return '#dcfce7';
  if (score >= 0.6) return '#fef9c3';
  return '#fee2e2';
}
