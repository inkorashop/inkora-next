// Servidor local para el programita de backups de Inkora.
// No forma parte del sitio Next.js — corre solo en esta PC, nunca se despliega.
// Sirve la mini-UI (public/) y expone unos pocos endpoints locales:
//   GET  /api/status       -> ultimo backup + estadisticas en vivo de Supabase
//   GET  /api/run-backup   -> dispara pg_dump y transmite el progreso por SSE
//   GET  /api/open-folder  -> abre la carpeta de backups en el Explorador
//   POST /api/shutdown     -> apaga este servidor (lo llama la ventana al cerrarse)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Client } = require('pg');

const PORT = 4173;
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'backups', 'supabase');
const PG_DUMP = path.join(PROJECT_ROOT, 'tools', 'pg-bin', 'pg_dump.exe');
const PUBLIC_DIR = path.join(__dirname, 'public');
const KEEP = 30;

function formatTimestamp(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function getLastBackupInfo() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const files = fs.readdirSync(BACKUP_DIR).filter(f => /^supabase_.*\.sql$/.test(f));
  if (!files.length) return null;
  const withStats = files.map(f => {
    const full = path.join(BACKUP_DIR, f);
    const st = fs.statSync(full);
    return { file: f, path: full, mtime: st.mtime.toISOString(), sizeBytes: st.size };
  });
  withStats.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
  return withStats[0];
}

function pruneOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => /^supabase_.*\.sql$/.test(f))
    .map(f => {
      const full = path.join(BACKUP_DIR, f);
      return { full, mtime: fs.statSync(full).mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
  files.slice(KEEP).forEach(f => { try { fs.unlinkSync(f.full); } catch {} });
}

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

async function handleStatus(req, res) {
  const [lastBackup, db] = await Promise.all([
    Promise.resolve(getLastBackupInfo()),
    getDbStats(),
  ]);
  sendJson(res, 200, { lastBackup, db });
}

function handleRunBackup(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    send('error', { message: 'Falta la variable de entorno SUPABASE_DB_URL. Ver BACKUPS.md.' });
    return res.end();
  }
  if (!fs.existsSync(PG_DUMP)) {
    send('error', { message: `No se encontro pg_dump.exe en ${PG_DUMP}` });
    return res.end();
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const outFile = path.join(BACKUP_DIR, `supabase_${formatTimestamp(new Date())}.sql`);
  send('start', { file: outFile });

  const child = spawn(PG_DUMP, [dbUrl, '--schema=public', '--no-owner', '--no-privileges', '--verbose', '-f', outFile]);

  let buffer = '';
  child.stderr.on('data', chunk => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) send('progress', { line });
    }
  });

  child.on('error', err => {
    send('error', { message: err.message });
    res.end();
  });

  child.on('close', code => {
    if (code === 0 && fs.existsSync(outFile)) {
      pruneOldBackups();
      const st = fs.statSync(outFile);
      send('done', { file: outFile, sizeBytes: st.size, date: st.mtime.toISOString() });
    } else {
      send('error', { message: `pg_dump termino con codigo ${code}` });
    }
    res.end();
  });
}

function handleOpenFolder(req, res) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  try { spawn('explorer.exe', [BACKUP_DIR], { detached: true }).unref(); } catch {}
  sendJson(res, 200, { ok: true });
}

function handleShutdown(req, res) {
  sendJson(res, 200, { ok: true });
  setTimeout(() => process.exit(0), 150);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  if (urlPath === '/api/status') return handleStatus(req, res);
  if (urlPath === '/api/run-backup') return handleRunBackup(req, res);
  if (urlPath === '/api/open-folder') return handleOpenFolder(req, res);
  if (urlPath === '/api/shutdown') return handleShutdown(req, res);
  return serveStatic(req, res, urlPath);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Inkora backup app escuchando en http://localhost:${PORT}`);
});
