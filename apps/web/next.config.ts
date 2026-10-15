import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Internal packages export TypeScript source; Next compiles them (ADR-0014).
  transpilePackages: ['@angiday/shared'],
};

export default nextConfig;
