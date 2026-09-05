import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source rather than a build step, so Next compiles them
  // alongside the app. This is what lets packages/core stay runtime-agnostic for Phase 2.
  transpilePackages: [
    '@parking/ui',
    '@parking/core',
    '@parking/config',
    '@parking/api-client',
    '@parking/types',
  ],
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
};

export default nextConfig;
