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
import { execFileSync } from 'node:child_process';
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

/**
 * Identifies what is holding the port, so the message can name it rather than sending the
 * developer off to look it up. Best effort - if the lookup fails, the generic advice stands.
 */
function findHolder(p) {
  try {
    if (process.platform === 'win32') {
      const listening = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' })
        .split(/\r?\n/)
        .filter((line) => line.includes(':' + p + ' ') && line.includes('LISTENING'));

      const pid = listening[0]?.trim().split(/\s+/).pop();
      if (!pid) return null;

      const row = execFileSync('tasklist', ['/FI', 'PID eq ' + pid, '/NH', '/FO', 'CSV'], {
        encoding: 'utf8',
      });
      const name = row.split(',')[0]?.replace(/"/g, '').trim();
      return { pid, name: name || 'unknown' };
    }

    const pid = execFileSync('lsof', ['-ti', ':' + p], { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/)[0];
    if (!pid) return null;

    const name = execFileSync('ps', ['-p', pid, '-o', 'comm='], { encoding: 'utf8' }).trim();
    return { pid, name: name || 'unknown' };
  } catch {
    return null;
  }
}

if (await portInUse(port)) {
  const holder = findHolder(port);

  const stopCommand =
    process.platform === 'win32'
      ? holder
        ? 'Stop-Process -Id ' + holder.pid + ' -Force'
        : 'Get-NetTCPConnection -LocalPort ' +
          port +
          ' -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }'
      : holder
        ? 'kill ' + holder.pid
        : 'lsof -ti :' + port + ' | xargs kill';

  const heldBy = holder ? ' by ' + holder.name + ' (PID ' + holder.pid + ')' : '';

  console.error(
    [
      '',
      'Port ' + port + ' is already in use' + heldBy + '.',
      '',
      'The app has to run on ' + port + ': the local Supabase Auth config pins its redirect',
      'URLs there, so sign-in breaks on any other port. Next.js would quietly start on ' +
        (port + 1) +
        ' instead,',
      'which is why this check exists.',
      '',
      'To free it:',
      '',
      '  ' + stopCommand,
      '',
      'A dev server left running from an earlier session is the usual cause.',
      '',
    ].join('\n'),
  );

  process.exit(1);
}
