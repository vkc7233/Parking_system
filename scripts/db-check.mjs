#!/usr/bin/env node
/**
 * Runs supabase/tests/schema_checks.sql against the running local database.
 *
 * Exists as a Node script rather than a one-line npm script because locating the Postgres
 * container needs a `docker ps` lookup, and shell command substitution behaves differently
 * between cmd.exe, PowerShell and bash - which would make `pnpm db:check` work for some of
 * the team and not others.
 *
 * Exits non-zero if any check fails, so CI can gate on it.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const SQL_FILE = 'supabase/tests/schema_checks.sql';

if (!existsSync(SQL_FILE)) {
  console.error(`Cannot find ${SQL_FILE} - run this from the repository root.`);
  process.exit(1);
}

function findDatabaseContainer() {
  try {
    const names = execFileSync(
      'docker',
      ['ps', '--filter', 'name=supabase_db', '--format', '{{.Names}}'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean);

    return names[0];
  } catch {
    return undefined;
  }
}

const container = findDatabaseContainer();

if (!container) {
  console.error('No running supabase_db container found. Start the stack first:\n\n  pnpm db:start\n');
  process.exit(1);
}

console.log(`Running schema checks against ${container}...\n`);

const result = spawnSync(
  'docker',
  ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: readFileSync(SQL_FILE), encoding: 'utf8' },
);

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

// psql prints the whole result table; only the verdict lines are worth the console space
// unless something failed, in which case the detail column matters.
const failed = result.status !== 0;

for (const line of output.split('\n')) {
  if (failed || /^\s*(PASS|FAIL)\s*\||checks passed|ERROR/.test(line)) {
    console.log(line);
  }
}

if (failed) {
  console.error('\nSchema checks FAILED.');
  process.exit(1);
}

console.log('\nSchema checks passed.');
