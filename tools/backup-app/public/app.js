const params = new URLSearchParams(location.search);
const AUTORUN = params.get('autorun') === '1';

// La ventana arranca con un tamaño de respaldo (fijado en Inkora-Backups.vbs) y
// se redimensiona sola aca a un cuarto de la pantalla real, centrada. Es más
// rápido/confiable que calcularlo desde VBScript vía WMI (que puede colgarse
// en máquinas virtuales). Si el navegador bloquea resizeTo/moveTo (ventana no
// abierta en modo app), no pasa nada — se queda con el tamaño de respaldo.
try {
  const w = Math.round(screen.availWidth / 2);
  const h = Math.round(screen.availHeight / 2);
  window.resizeTo(w, h);
  window.moveTo(Math.round((screen.availWidth - w) / 2), Math.round((screen.availHeight - h) / 2));
} catch {}

const SECTIONS = [
  { kind: 'db', title: 'Base de datos', hasStats: true, runEndpoint: '/api/run-backup' },
  { kind: 'code', title: 'Código del proyecto', hasStats: false, runEndpoint: '/api/run-code-backup' },
];

const grid = document.getElementById('grid');
const template = document.getElementById('sectionTemplate');
const els = {};
const autoCloseNote = document.getElementById('autoCloseNote');
const autoCloseSecs = document.getElementById('autoCloseSecs');

function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtRelative(iso) {
  if (!iso) return '';
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
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtNextRun(next) {
  if (!next) return '';
  if (next.dueNow) return 'Le toca en la próxima corrida automática';
  const ms = new Date(next.nextRun).getTime() - Date.now();
  const h = Math.round(ms / 3600000);
  if (h < 1) return 'En menos de una hora';
  if (h < 24) return `En ${h} h`;
  const d = Math.round(h / 24);
  return `En ${d} día${d === 1 ? '' : 's'}`;
}

function buildSection(def) {
  const frag = template.content.cloneNode(true);
  const section = frag.querySelector('.section');
  section.dataset.kind = def.kind;
  section.querySelector('.section-title').textContent = def.title;

  if (def.hasStats) {
    const row = section.querySelector('.stats-row');
    ['tables', 'rows', 'size'].forEach(key => {
      const stat = document.createElement('div');
      stat.className = 'stat';
      stat.innerHTML = `<div class="stat-value" data-stat="${key}">—</div><div class="stat-label">${{ tables: 'Tablas', rows: 'Filas (aprox.)', size: 'Tamaño BD' }[key]}</div>`;
      row.appendChild(stat);
    });
  }

  grid.appendChild(frag);
  wireSection(def, section);
  els[def.kind] = section;
  return section;
}

function wireSection(def, section) {
  const freqSelect = section.querySelector('.freq-select');
  const browseLocal = section.querySelector('.browse-local');
  const browseDrive = section.querySelector('.browse-drive');
  const btnRun = section.querySelector('.btn-run');
  const openLocal = section.querySelector('.open-local');
  const openDrive = section.querySelector('.open-drive');

  freqSelect.addEventListener('change', async () => {
    await fetch('/api/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [def.kind]: { frequencyDays: Number(freqSelect.value) } }),
    });
    loadStatus();
  });

  browseLocal.addEventListener('click', () => pickFolder(def.kind, 'localDir', browseLocal));
  browseDrive.addEventListener('click', () => pickFolder(def.kind, 'driveDir', browseDrive));

  openLocal.addEventListener('click', () => fetch(`/api/open-folder?dir=${def.kind}&target=local`));
  openDrive.addEventListener('click', () => fetch(`/api/open-folder?dir=${def.kind}&target=drive`));

  btnRun.addEventListener('click', () => runBackup(def, section));
}

async function pickFolder(kind, field, btn) {
  // Feedback inmediato: el selector de Windows puede tardar en aparecer (o
  // abrirse detrás de esta ventana), así que el botón muestra que está
  // esperando en vez de no reaccionar y parecer roto.
  btn.disabled = true;
  btn.classList.add('loading');
  btn.title = 'Buscá la ventana del explorador (puede abrirse detrás)…';
  try {
    const res = await fetch('/api/browse-folder', { method: 'POST' });
    const data = await res.json();
    if (!data.path) return; // el usuario canceló o hubo timeout
    await fetch('/api/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [kind]: { [field]: data.path } }),
    });
    loadStatus();
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.title = 'Elegir carpeta';
  }
}

function resetPanels(section) {
  section.querySelector('.progress-box').classList.add('hidden');
  section.querySelector('.done-box').classList.add('hidden');
  section.querySelector('.error-box').classList.add('hidden');
  section.querySelector('.progress-log').innerHTML = '';
  section.querySelector('.open-drive').classList.add('hidden');
  section.querySelector('.done-drive').textContent = '';
}

function setProgress(section, percent) {
  const fill = section.querySelector('.progress-fill');
  const pct = section.querySelector('.progress-pct');
  if (percent == null) {
    fill.classList.add('indeterminate');
    fill.style.width = '';
    pct.textContent = '';
  } else {
    fill.classList.remove('indeterminate');
    fill.style.width = `${percent}%`;
    pct.textContent = `${percent}%`;
  }
}

function runBackup(def, section) {
  return new Promise(resolve => {
    resetPanels(section);
    const btnRun = section.querySelector('.btn-run');
    const dot = section.querySelector('.dot');
    const progressBox = section.querySelector('.progress-box');
    const progressLine = section.querySelector('.progress-line');
    const progressLog = section.querySelector('.progress-log');
    const doneBox = section.querySelector('.done-box');
    const donePath = section.querySelector('.done-path');
    const doneDrive = section.querySelector('.done-drive');
    const openDrive = section.querySelector('.open-drive');
    const errorBox = section.querySelector('.error-box');
    const errorMsg = section.querySelector('.error-msg');

    btnRun.disabled = true;
    progressBox.classList.remove('hidden');
    progressLine.textContent = 'Iniciando…';
    setProgress(section, null);
    dot.className = 'dot dot-running';

    const es = new EventSource(def.runEndpoint);

    es.addEventListener('start', () => { progressLine.textContent = 'Preparando…'; });

    es.addEventListener('progress', e => {
      const { line, percent } = JSON.parse(e.data);
      progressLine.textContent = line;
      setProgress(section, percent);
      const row = document.createElement('div');
      row.textContent = line;
      progressLog.appendChild(row);
      progressLog.scrollTop = progressLog.scrollHeight;
    });

    es.addEventListener('drive', e => {
      const data = JSON.parse(e.data);
      if (data.ok) {
        doneDrive.textContent = `Drive: ${data.path}`;
        openDrive.classList.remove('hidden');
      } else {
        doneDrive.textContent = `No se pudo copiar a Drive: ${data.error}`;
      }
    });

    es.addEventListener('done', e => {
      const data = JSON.parse(e.data);
      es.close();
      btnRun.disabled = false;
      progressBox.classList.add('hidden');
      doneBox.classList.remove('hidden');
      donePath.textContent = `Local: ${data.file}`;
      dot.className = 'dot dot-ok';
      loadStatus();
      resolve();
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
      resolve();
    });
  });
}

async function loadStatus() {
  const res = await fetch('/api/status');
  const data = await res.json();

  applySection('db', data.db, data.config.db);
  applySection('code', data.code, data.config.code);
}

function applySection(kind, info, conf) {
  const section = els[kind];
  if (!section) return;

  const lastDate = section.querySelector('.last-date');
  const lastMeta = section.querySelector('.last-meta');
  const dot = section.querySelector('.dot');

  if (info.lastBackup) {
    lastDate.textContent = fmtDateTime(info.lastBackup.mtime);
    lastMeta.textContent = `${fmtRelative(info.lastBackup.mtime)} · ${fmtBytes(info.lastBackup.sizeBytes)}`;
    if (dot.className.indexOf('running') === -1) dot.className = 'dot dot-ok';
  } else {
    lastDate.textContent = 'Todavía no hay backups';
    lastMeta.textContent = '';
  }

  if (kind === 'db') {
    const stats = info.stats;
    const map = { tables: stats && stats.tableCount, rows: stats && stats.approxRows != null ? stats.approxRows.toLocaleString('es-AR') : null, size: stats && stats.dbSize };
    section.querySelectorAll('[data-stat]').forEach(el => {
      const key = el.dataset.stat;
      el.textContent = (stats && !stats.error && map[key] != null) ? map[key] : '?';
    });
  }

  section.querySelector('.freq-select').value = String(conf.frequencyDays);
  section.querySelector('.local-path').textContent = conf.localDir || '(sin configurar)';
  section.querySelector('.local-path').title = conf.localDir || '';
  section.querySelector('.drive-path').textContent = conf.driveDir || '(sin configurar)';
  section.querySelector('.drive-path').title = conf.driveDir || '';

  const nextText = section.querySelector('.next-run-text');
  const nextFill = section.querySelector('.next-fill');
  nextText.textContent = fmtNextRun(info.next);
  nextFill.style.width = `${Math.round((info.next.progress || 0) * 100)}%`;
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
      // Algunos navegadores no permiten que una ventana se cierre a sí misma
      // si no fue abierta por otro script (aunque haya sido abierta en modo
      // app vía línea de comandos). Si seguimos acá 400ms después, avisamos
      // en vez de dejar la ventana colgada en "0s" sin explicación.
      setTimeout(() => {
        autoCloseNote.textContent = 'Listo — ya podés cerrar esta ventana';
      }, 400);
    }
  }, 1000);
}

async function runAutorun() {
  let plan = { db: true, code: false };
  try {
    const res = await fetch('/api/autorun-plan');
    plan = await res.json();
  } catch {}

  if (plan.db) await runBackup(SECTIONS[0], els.db);
  if (plan.code) await runBackup(SECTIONS[1], els.code);

  startAutoClose();
}

window.addEventListener('pagehide', () => {
  try { navigator.sendBeacon('/api/shutdown'); } catch {}
});

SECTIONS.forEach(buildSection);
loadStatus();
if (AUTORUN) runAutorun();
