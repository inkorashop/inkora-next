import { execSync } from 'node:child_process';

// Version "semver-like" (1.<dias>.<minutos del dia>) derivada de la hora de
// build, no del historial de git: se probo contando commits (git rev-list
// --count) pero Vercel clona el repo en modo shallow para el build y el
// intento de pedir el historial completo (git fetch --unshallow) fallo ahi
// tambien (probablemente sin credenciales del remoto para ese comando
// arbitrario) devolviendo numeros chicos sin sentido ("1.0.10"). Esta cuenta
// no depende de git en absoluto, asi que no le puede volver a pasar eso.
const BUILD_EPOCH_MS = Date.parse('2026-01-01T00:00:00Z');

function getBuildVersion() {
  const elapsedMinutes = Math.floor((Date.now() - BUILD_EPOCH_MS) / 60000);
  const days = Math.floor(elapsedMinutes / 1440);
  const minutesOfDay = elapsedMinutes % 1440;
  return `1.${days}.${minutesOfDay}`;
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
