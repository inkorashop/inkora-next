import { execSync } from 'node:child_process';

// Version "semver-like" derivada del numero de commits (1.0.<n>), para que
// se lea como una version real en vez de un hash de git, sin necesitar que
// alguien la actualice a mano en cada cambio. El hash real queda disponible
// aparte (NEXT_PUBLIC_APP_COMMIT) para quien lo necesite en un tooltip.
function getBuildVersion() {
  try {
    // Vercel clona con --depth limitado: si el repo quedo shallow, el conteo
    // de commits da un numero chico y sin sentido (visto en produccion: "10"
    // en vez de ~700). Se pide el historial completo antes de contar.
    try {
      const isShallow = execSync('git rev-parse --is-shallow-repository').toString().trim() === 'true';
      if (isShallow) execSync('git fetch --unshallow --quiet', { stdio: 'ignore' });
    } catch {
      // Sin red o sin remoto configurado: seguimos con el historial que haya.
    }
    const count = execSync('git rev-list --count HEAD').toString().trim();
    return `1.0.${count}`;
  } catch {
    return 'dev';
  }
}

function getBuildCommit() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: getBuildVersion(),
    NEXT_PUBLIC_APP_COMMIT: getBuildCommit(),
    NEXT_PUBLIC_APP_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
