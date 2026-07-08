// Servidor local del programita de backups de Inkora.
// No forma parte del sitio Next.js — corre solo en esta PC, nunca se despliega.
//
// Endpoints:
//   GET  /api/status          -> ultimo backup + stats de DB + info de proxima corrida (db y codigo)
//   GET  /api/config          -> configuracion actual (rutas, frecuencias)
//   POST /api/config          -> actualiza configuracion (merge parcial)
//   POST /api/browse-folder   -> abre el selector nativo de carpetas de Windows
//   GET  /api/run-backup      -> corre el backup de la base de datos (SSE con progreso real)
//   GET  /api/run-code-backup -> corre el backup del codigo (zip, SSE con progreso real)
//   GET  /api/open-folder?dir=db|code&target=local|drive -> abre esa carpeta en el Explorador
//   POST /api/shutdown        -> apaga este servidor

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Client } = require('pg');
const archiver = require('archiver');
const cfg = require('./config');

const PORT = 4173;
const PROJECT_ROOT = cfg.PROJECT_ROOT;
const PG_DUMP = path.join(PROJECT_ROOT, 'tools', 'pg-bin', 'pg_dump.exe');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Carpetas/rutas que nunca se incluyen en el backup de codigo: dependencias,
// artefactos de build (JS y .NET), historial de git (ya respaldado en GitHub),
// modelos/binarios grandes descargables, y los propios backups ya excluidos de git.
const CODE_EXCLUDE_DIR_NAMES = new Set(['node_modules', '.next', '.git', '.vercel', 'coverage', '.gradle', 'bin', 'obj', 'build', '.vs']);
const CODE_EXCLUDE_REL_PATHS = new Set([
  'backups',
  path.join('tools', 'pg-bin'),
  path.join('android-app', 'keystore'),
  path.join('public', 'models'),
  path.join('bridge', 'Inkora.PrintBridge', 'tools'),
  'Inkora.PrintBridge.zip',
  'repomix-output.xml',
]);

function formatTimestamp(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// ── Archivos: listar / podar / copiar a Drive ─────────────────────────────────

function listBackupFiles(dir, prefix) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.startsWith(prefix))
    .map(f => {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      return { file: f, path: full, mtime: st.mtime, sizeBytes: st.size };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function getLastBackupInfo(dir, prefix) {
  const files = listBackupFiles(dir, prefix);
  return files[0] || null;
}

// Solo poda la carpeta LOCAL. La carpeta de Drive nunca se toca/borra desde aca
// a proposito (pedido explicito: nunca borrar nada ahi).
function pruneOldBackups(dir, prefix, keep) {
  const files = listBackupFiles(dir, prefix);
  files.slice(keep).forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
}

function copyToDrive(filePath, driveDir, send) {
  if (!driveDir) return;
  try {
    fs.mkdirSync(driveDir, { recursive: true });
    const dest = path.join(driveDir, path.basename(filePath));
    fs.copyFileSync(filePath, dest);
    send('drive', { ok: true, path: dest });
  } catch (err) {
    send('drive', { ok: false, error: err.message });
  }
}

// ── Estadisticas en vivo de Supabase ──────────────────────────────────────────

async function getDbStats() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) return { error: 'Falta la variable de entorno SUPABASE_DB_URL' };
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT
        (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS table_count,
        (SELECT COALESCE(sum(n_live_tup),0)::bigint FROM pg_stat_user_tables WHERE schemaname='public') AS approx_rows,
        pg_size_pretty(pg_database_size(current_database())) AS db_size
    `);
    return { tableCount: rows[0].table_count, approxRows: Number(rows[0].approx_rows), dbSize: rows[0].db_size };
  } catch (err) {
    return { error: err.message };
  } finally {
    try { await client.end(); } catch {}
  }
}

// ── /api/status ────────────────────────────────────────────────────────────────

async function handleStatus(req, res) {
  const conf = cfg.load();
  const [dbLast, db] = await Promise.all([
    Promise.resolve(getLastBackupInfo(conf.db.localDir, 'supabase_')),
    getDbStats(),
  ]);
  const codeLast = getLastBackupInfo(conf.code.localDir, 'codigo_');

  sendJson(res, 200, {
    config: conf,
    db: {
      stats: db,
      lastBackup: dbLast,
      next: cfg.nextRunInfo(conf.db),
    },
    code: {
      lastBackup: codeLast,
      next: cfg.nextRunInfo(conf.code),
    },
  });
}

// ── /api/config ───────────────────────────────────────────────────────────────

function handleGetConfig(req, res) {
  sendJson(res, 200, cfg.load());
}

function handlePostConfig(req, res) {
  readJsonBody(req, body => {
    const updated = cfg.update(body || {});
    sendJson(res, 200, updated);
  });
}

// ── /api/browse-folder: selector nativo de carpetas de Windows ──────────────────

function handleBrowseFolder(req, res) {
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Elegir carpeta de destino"
$dialog.ShowNewFolderButton = $true
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }
`;
  const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', psScript]);
  let out = '';
  child.stdout.on('data', d => { out += d.toString(); });
  child.on('close', () => {
    const selected = out.trim();
    sendJson(res, 200, { path: selected || null });
  });
  child.on('error', err => sendJson(res, 500, { error: err.message }));
}

// ── /api/run-backup: dump de la base de datos ────────────────────────────────

function handleRunBackup(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const conf = cfg.load();
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) { send('error', { message: 'Falta la variable de entorno SUPABASE_DB_URL. Ver BACKUPS.md.' }); return res.end(); }
  if (!fs.existsSync(PG_DUMP)) { send('error', { message: `No se encontro pg_dump.exe en ${PG_DUMP}` }); return res.end(); }

  fs.mkdirSync(conf.db.localDir, { recursive: true });
  const outFile = path.join(conf.db.localDir, `supabase_${formatTimestamp(new Date())}.sql`);

  getDbStats().then(stats => {
    const totalTables = stats && !stats.error ? stats.tableCount : 0;
    send('start', { file: outFile, totalTables });

    const child = spawn(PG_DUMP, [dbUrl, '--schema=public', '--no-owner', '--no-privileges', '--verbose', '-f', outFile]);
    let buffer = '';
    let dumped = 0;
    child.stderr.on('data', chunk => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        if (/dumping contents of table/.test(line)) dumped += 1;
        const percent = totalTables > 0 ? Math.min(99, Math.round((dumped / totalTables) * 100)) : null;
        send('progress', { line: line.replace(/^pg_dump:\s*/, ''), percent });
      }
    });
    child.on('error', err => { send('error', { message: err.message }); res.end(); });
    child.on('close', code => {
      if (code === 0 && fs.existsSync(outFile)) {
        pruneOldBackups(conf.db.localDir, 'supabase_', conf.db.keep);
        cfg.markRun('db');
        const st = fs.statSync(outFile);
        send('done', { file: outFile, sizeBytes: st.size, date: st.mtime.toISOString() });
        copyToDrive(outFile, conf.db.driveDir, send);
      } else {
        send('error', { message: `pg_dump termino con codigo ${code}` });
      }
      res.end();
    });
  });
}

// ── /api/run-code-backup: zip del codigo del proyecto ────────────────────────

function shouldSkip(relPath, isDir) {
  const parts = relPath.split(path.sep);
  const name = parts[parts.length - 1];
  if (isDir && CODE_EXCLUDE_DIR_NAMES.has(name)) return true;
  if (CODE_EXCLUDE_REL_PATHS.has(relPath)) return true;
  for (const excluded of CODE_EXCLUDE_REL_PATHS) {
    if (relPath === excluded || relPath.startsWith(excluded + path.sep)) return true;
  }
  return false;
}

function collectFiles(dir, base, acc) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full);
    if (entry.isDirectory()) {
      if (shouldSkip(rel, true)) continue;
      collectFiles(full, base, acc);
    } else if (entry.isFile()) {
      if (shouldSkip(rel, false)) continue;
      acc.push({ full, rel });
    }
  }
  return acc;
}

function handleRunCodeBackup(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const conf = cfg.load();
  fs.mkdirSync(conf.code.localDir, { recursive: true });
  const outFile = path.join(conf.code.localDir, `codigo_${formatTimestamp(new Date())}.zip`);

  let files;
  try {
    files = collectFiles(PROJECT_ROOT, PROJECT_ROOT, []);
  } catch (err) {
    send('error', { message: `No se pudo leer el proyecto: ${err.message}` });
    return res.end();
  }

  send('start', { file: outFile, totalFiles: files.length });

  const output = fs.createWriteStream(outFile);
  const archive = archiver('zip', { zlib: { level: 6 } });
  let added = 0;

  archive.on('entry', entry => {
    added += 1;
    const percent = files.length > 0 ? Math.min(99, Math.round((added / files.length) * 100)) : null;
    send('progress', { line: entry.name, percent });
  });
  archive.on('warning', err => send('progress', { line: `aviso: ${err.message}`, percent: null }));
  archive.on('error', err => { send('error', { message: err.message }); res.end(); });

  output.on('close', () => {
    pruneOldBackups(conf.code.localDir, 'codigo_', conf.code.keep);
    cfg.markRun('code');
    const st = fs.statSync(outFile);
    send('done', { file: outFile, sizeBytes: st.size, date: st.mtime.toISOString() });
    copyToDrive(outFile, conf.code.driveDir, send);
    res.end();
  });

  archive.pipe(output);
  for (const f of files) archive.file(f.full, { name: f.rel });
  archive.finalize();
}

// ── /api/open-folder ──────────────────────────────────────────────────────────

function handleOpenFolder(req, res, query) {
  const conf = cfg.load();
  const section = query.get('dir') === 'code' ? conf.code : conf.db;
  const target = query.get('target') === 'drive' ? section.driveDir : section.localDir;
  if (!target) { sendJson(res, 400, { ok: false, error: 'Carpeta no configurada' }); return; }
  fs.mkdirSync(target, { recursive: true });
  try { spawn('explorer.exe', [target], { detached: true }).unref(); } catch {}
  sendJson(res, 200, { ok: true });
}

// ── /api/shutdown ─────────────────────────────────────────────────────────────

function handleShutdown(req, res) {
  sendJson(res, 200, { ok: true });
  setTimeout(() => process.exit(0), 150);
}

// ── /api/autorun-plan: que corresponde correr hoy (usado por el modo automatico) ─

function handleAutorunPlan(req, res) {
  const conf = cfg.load();
  sendJson(res, 200, { db: cfg.isDue(conf.db), code: cfg.isDue(conf.code) });
}

// ── infra HTTP basica ──────────────────────────────────────────────────────────

function readJsonBody(req, cb) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try { cb(JSON.parse(body || '{}')); } catch { cb({}); }
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png' };

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const [urlPath, queryString] = req.url.split('?');
  const query = new URLSearchParams(queryString || '');

  if (urlPath === '/api/status') return handleStatus(req, res);
  if (urlPath === '/api/config' && req.method === 'GET') return handleGetConfig(req, res);
  if (urlPath === '/api/config' && req.method === 'POST') return handlePostConfig(req, res);
  if (urlPath === '/api/browse-folder') return handleBrowseFolder(req, res);
  if (urlPath === '/api/run-backup') return handleRunBackup(req, res);
  if (urlPath === '/api/run-code-backup') return handleRunCodeBackup(req, res);
  if (urlPath === '/api/open-folder') return handleOpenFolder(req, res, query);
  if (urlPath === '/api/shutdown') return handleShutdown(req, res);
  if (urlPath === '/api/autorun-plan') return handleAutorunPlan(req, res);
  return serveStatic(req, res, urlPath);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Inkora backup app escuchando en http://localhost:${PORT}`);
});
