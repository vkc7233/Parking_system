import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /*
   * Dev and production builds get separate output directories.
   *
   * They both default to `.next`, so running `pnpm build` while a dev server is up overwrites
   * the chunks that server is serving. The page then dies with
   * "Cannot read properties of undefined (reading 'call')" inside webpack.js — an error that
   * points at the bundler and says nothing about the actual cause, and which survives a reload
   * until the directory is deleted by hand.
   *
   * `next build` and `next start` keep `.next`, so nothing about deployment changes.
   */
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
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
