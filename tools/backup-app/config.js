// Config persistente del programita (rutas, frecuencias, Drive). Vive fuera de git
// (config.json es especifico de esta PC) — ver .gitignore.
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CONFIG_PATH = path.join(__dirname, 'config.json');

function defaults() {
  return {
    db: {
      localDir: path.join(PROJECT_ROOT, 'backups', 'supabase'),
      driveDir: '',
      frequencyDays: 1,
      keep: 30,
      lastRun: null,
    },
    code: {
      localDir: path.join(PROJECT_ROOT, 'backups', 'code'),
      driveDir: '',
      frequencyDays: 7,
      keep: 8,
      lastRun: null,
    },
  };
}

function load() {
  let cfg = defaults();
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      cfg = { db: { ...cfg.db, ...saved.db }, code: { ...cfg.code, ...saved.code } };
    } catch {
      // config corrupto: seguimos con los defaults, no rompemos el arranque
    }
  }
  return cfg;
}

function save(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function update(partial) {
  const cfg = load();
  if (partial.db) Object.assign(cfg.db, partial.db);
  if (partial.code) Object.assign(cfg.code, partial.code);
  save(cfg);
  return cfg;
}

function markRun(kind) {
  const cfg = load();
  cfg[kind].lastRun = new Date().toISOString();
  save(cfg);
  return cfg;
}

function isDue(entry) {
  if (!entry.lastRun) return true;
  const elapsedMs = Date.now() - new Date(entry.lastRun).getTime();
  return elapsedMs >= entry.frequencyDays * 24 * 60 * 60 * 1000;
}

function nextRunInfo(entry) {
  if (!entry.lastRun) return { dueNow: true, nextRun: null, progress: 1 };
  const last = new Date(entry.lastRun).getTime();
  const periodMs = entry.frequencyDays * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - last;
  const progress = Math.min(1, elapsed / periodMs);
  return {
    dueNow: elapsed >= periodMs,
    nextRun: new Date(last + periodMs).toISOString(),
    progress,
  };
}

module.exports = { PROJECT_ROOT, load, save, update, markRun, isDue, nextRunInfo, defaults };
