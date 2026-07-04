import { execSync } from 'node:child_process';

function getBuildVersion() {
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
  },
};

export default nextConfig;
