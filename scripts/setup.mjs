#!/usr/bin/env node
/**
 * One-time local setup: writes apps/web/.env.local from .env.example.
 *
 * Next.js reads .env.local from the app directory, not the repository root, which is a
 * reliable way to lose half an hour wondering why the app cannot see Supabase. This puts it in
 * the right place and generates the one value that must be unique per install.
 *
 * Safe to re-run: an existing .env.local is never overwritten.
 */
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const template = join(root, '.env.example');
const target = join(root, 'apps', 'web', '.env.local');

if (!existsSync(template)) {
  console.error('Cannot find .env.example - run this from the repository root.');
  process.exit(1);
}

if (existsSync(target)) {
  console.log(`apps/web/.env.local already exists - leaving it alone.`);
  console.log('Delete it and re-run this if you want to start from the template again.\n');
} else {
  let contents = readFileSync(template, 'utf8');

  // The access pass HMAC key is the one value that must not be shared between installs, since
  // it is what makes a booking's QR code unforgeable (assumption A5).
  contents = contents.replace(
    /^ACCESS_PASS_SECRET=.*$/m,
    `ACCESS_PASS_SECRET=${randomBytes(32).toString('hex')}`,
  );

  writeFileSync(target, contents);
  console.log('Wrote apps/web/.env.local with the local Supabase defaults.');
  console.log('Generated a fresh ACCESS_PASS_SECRET.\n');
}

console.log('Next:');
console.log('  pnpm db:start     # starts Postgres, Auth and Storage in Docker');
console.log('  pnpm db:reset     # applies every migration, then the seed');
console.log('  pnpm dev          # http://localhost:3000\n');
console.log('Sign in with 9000000002 / code 100002 (a seeded host).');
console.log('The full list of test accounts is in the README.');
