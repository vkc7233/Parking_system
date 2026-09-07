#!/usr/bin/env node
/**
 * Refuses to start the dev server if its port is already taken.
 *
 * Next.js silently moves to the next free port instead, which is worse than failing here: the
 * local Supabase Auth config pins redirect URLs to http://127.0.0.1:3000, so an app that ends
 * up on 3001 looks like it works right up until sign-in, and the failure gives no hint that the
 * port is why.
 *
 * Usage: node scripts/ensure-port.mjs 3000
 */
import { createServer } from 'node:net';

const port = Number(process.argv[2] ?? 3000);

function portInUse(p) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (err) => resolve(err.code === 'EADDRINUSE'));
    server.once('listening', () => server.close(() => resolve(false)));
    // Bind every interface, the way Next.js does. Checking only 127.0.0.1 succeeds on Windows
    // even while another process holds 0.0.0.0 on the same port, so the guard never fired.
    server.listen(p);
  });
}

if (await portInUse(port)) {
  console.error(`
Port ${port} is already in use.

The app has to run on ${port}: the local Supabase Auth config pins its redirect URLs there, so
sign-in breaks on any other port. Next.js would quietly start on ${port + 1} instead, which is
why this check exists.

Another dev server is probably still running. To find and stop it:

  Windows:  Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object OwningProcess
            Stop-Process -Id <pid> -Force

  macOS/Linux:  lsof -ti :${port} | xargs kill
`);
  process.exit(1);
}
