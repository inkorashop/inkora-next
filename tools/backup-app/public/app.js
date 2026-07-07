const params = new URLSearchParams(location.search);
const AUTORUN = params.get('autorun') === '1';

const dot = document.getElementById('dot');
const lastDate = document.getElementById('lastDate');
const lastMeta = document.getElementById('lastMeta');
const statTables = document.getElementById('statTables');
const statRows = document.getElementById('statRows');
const statSize = document.getElementById('statSize');
const btnRun = document.getElementById('btnRun');
const btnOpenFolder = document.getElementById('btnOpenFolder');
const progressBox = document.getElementById('progressBox');
const progressLine = document.getElementById('progressLine');
const progressLog = document.getElementById('progressLog');
const doneBox = document.getElementById('doneBox');
const donePath = document.getElementById('donePath');
const autoCloseNote = document.getElementById('autoCloseNote');
const autoCloseSecs = document.getElementById('autoCloseSecs');
const errorBox = document.getElementById('errorBox');
const errorMsg = document.getElementById('errorMsg');

function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtRelative(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'hace instantes';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? '' : 's'}`;
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.lastBackup) {
      lastDate.textContent = fmtDateTime(data.lastBackup.mtime);
      lastMeta.textContent = `${fmtRelative(data.lastBackup.mtime)} · ${fmtBytes(data.lastBackup.sizeBytes)}`;
      dot.className = 'dot dot-ok';
    } else {
      lastDate.textContent = 'Todavía no hay backups';
      lastMeta.textContent = '';
    }
    if (data.db && !data.db.error) {
      statTables.textContent = data.db.tableCount;
      statRows.textContent = data.db.approxRows.toLocaleString('es-AR');
      statSize.textContent = data.db.dbSize;
    } else {
      statTables.textContent = statRows.textContent = statSize.textContent = '?';
    }
  } catch (err) {
    lastDate.textContent = 'No se pudo leer el estado';
    lastMeta.textContent = err.message;
  }
}

function resetPanels() {
  progressBox.classList.add('hidden');
  doneBox.classList.add('hidden');
  errorBox.classList.add('hidden');
  autoCloseNote.classList.add('hidden');
  progressLog.innerHTML = '';
}

function runBackup() {
  resetPanels();
  btnRun.disabled = true;
  progressBox.classList.remove('hidden');
  progressLine.textContent = 'Iniciando…';
  dot.className = 'dot dot-running';

  const es = new EventSource('/api/run-backup');

  es.addEventListener('start', () => {
    progressLine.textContent = 'Conectando con Supabase…';
  });

  es.addEventListener('progress', e => {
    const { line } = JSON.parse(e.data);
    progressLine.textContent = line.replace(/^pg_dump:\s*/, '');
    const row = document.createElement('div');
    row.textContent = line.replace(/^pg_dump:\s*/, '');
    progressLog.appendChild(row);
    progressLog.scrollTop = progressLog.scrollHeight;
  });

  es.addEventListener('done', e => {
    const data = JSON.parse(e.data);
    es.close();
    btnRun.disabled = false;
    progressBox.classList.add('hidden');
    doneBox.classList.remove('hidden');
    donePath.textContent = data.file;
    dot.className = 'dot dot-ok';
    loadStatus();
    if (AUTORUN) startAutoClose();
  });

  es.addEventListener('error', e => {
    let message = 'Se perdió la conexión con el servidor local.';
    try { message = JSON.parse(e.data).message; } catch {}
    es.close();
    btnRun.disabled = false;
    progressBox.classList.add('hidden');
    errorBox.classList.remove('hidden');
    errorMsg.textContent = message;
    dot.className = 'dot dot-error';
    if (AUTORUN) startAutoClose();
  });
}

function startAutoClose() {
  autoCloseNote.classList.remove('hidden');
  let secs = 10;
  autoCloseSecs.textContent = secs;
  const timer = setInterval(() => {
    secs -= 1;
    autoCloseSecs.textContent = Math.max(secs, 0);
    if (secs <= 0) {
      clearInterval(timer);
      window.close();
    }
  }, 1000);
}

btnRun.addEventListener('click', runBackup);
btnOpenFolder.addEventListener('click', () => fetch('/api/open-folder'));

window.addEventListener('pagehide', () => {
  try { navigator.sendBeacon('/api/shutdown'); } catch {}
});

loadStatus();
if (AUTORUN) runBackup();
