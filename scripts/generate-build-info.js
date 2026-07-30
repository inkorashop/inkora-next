// Genera version/commit/build-time UNA sola vez antes de `next build` y los
// deja en .env.production.local. Antes se calculaban con Date.now() dentro
// de next.config.mjs, pero Vercel evalua ese archivo mas de una vez por
// deploy (paginas del cliente vs. la funcion serverless de /api/version), y
// cada evaluacion recalculaba Date.now() por separado: el bundle del
// navegador y /api/version terminaban con valores distintos dentro del MISMO
// deploy, y el aviso de "nueva version" en el panel de admin quedaba pegado
// para siempre (comparaba el build contra si mismo). Escribir el valor a un
// archivo antes de build hace que toda evaluacion posterior lea el mismo
// string ya fijo, sin importar cuantas veces se re-evalue la config.
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const BUILD_EPOCH_MS = Date.parse('2026-01-01T00:00:00Z');

function getCommit() {
  // .vercelignore excluye .git de los deploys manuales, asi que
  // `git rev-parse` falla ahi; Vercel expone el SHA real como variable de
  // entorno del sistema durante el build.
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

function getVersion(nowMs) {
  const elapsedMinutes = Math.floor((nowMs - BUILD_EPOCH_MS) / 60000);
  const days = Math.floor(elapsedMinutes / 1440);
  const minutesOfDay = elapsedMinutes % 1440;
  return `1.${days}.${minutesOfDay}`;
}

const now = Date.now();
const version = getVersion(now);
const commit = getCommit();
const buildTime = new Date(now).toISOString();

const envContent = [
  `NEXT_PUBLIC_APP_VERSION=${version}`,
  `NEXT_PUBLIC_APP_COMMIT=${commit}`,
  `NEXT_PUBLIC_APP_BUILD_TIME=${buildTime}`,
  '',
].join('\n');

fs.writeFileSync(path.join(__dirname, '..', '.env.production.local'), envContent);
console.log(`[generate-build-info] v${version} (${commit}) @ ${buildTime}`);
