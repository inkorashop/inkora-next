// NEXT_PUBLIC_APP_VERSION / _COMMIT / _BUILD_TIME se generan una sola vez en
// scripts/generate-build-info.js (corrido antes de `next build`, ver
// package.json) y se cargan solos desde .env.production.local. No se
// calculan aca: Vercel evalua este archivo mas de una vez por deploy, y
// calcularlos aca con Date.now() hacia que el bundle del cliente y la
// funcion serverless de /api/version quedaran con valores distintos dentro
// del mismo deploy (ver commit que agrego este comentario).

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;
