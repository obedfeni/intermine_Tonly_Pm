/**
 * One-time DB setup: reads db/schema.sql and executes it against whatever
 * Postgres connection string is in your environment (DATABASE_URL, or
 * POSTGRES_URL as set automatically by the older Vercel Postgres
 * integration).
 *
 * Usage:
 *   npm run db:init                 # uses .env.local
 *   DATABASE_URL="postgres://..." npm run db:init
 *
 * Uses the standard `pg` driver (plain Postgres wire protocol) rather than
 * the app's runtime `@neondatabase/serverless` HTTP/WebSocket client —
 * this is a one-off local script, not a deployed edge function, so there's
 * no benefit to the serverless-optimized driver, and `pg` works against
 * any Postgres server (Neon's standard connection port included), which
 * makes this script easy to test against a local database too.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

// Load .env.local (and .env) the same way Next.js would, so this standalone
// script picks up POSTGRES_URL without you having to export it by hand.
for (const file of ['.env.local', '.env']) {
  const p = join(process.cwd(), file);
  if (existsSync(p)) {
    for (const line of readFileSync(p, 'utf-8').split('\n')) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (!m) continue;
      const key = m[1];
      let value = (m[2] ?? '').trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      if (key && !(key in process.env)) process.env[key] = value;
    }
  }
}

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('Set DATABASE_URL (or POSTGRES_URL) in .env.local before running this script — see .env.example.');
  process.exit(1);
}
const pool = new Pool({ connectionString });

async function main() {
  const sqlPath = join(process.cwd(), 'db', 'schema.sql');
  const schema = readFileSync(sqlPath, 'utf-8');

  // Split into individual statements; split on semicolons (naive but fine
  // for our schema file — no semicolons appear inside string literals here
  // except within the plpgsql function body, which we special-case below).
  const statements = splitSqlStatements(schema);

  console.log(`Running ${statements.length} statements against your database...`);
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    try {
      await pool.query(trimmed);
      console.log('OK  :', summarize(trimmed));
    } catch (err: any) {
      // "already exists" is expected/safe on re-run
      if (/already exists/i.test(err.message)) {
        console.log('SKIP:', summarize(trimmed), '(already exists)');
      } else {
        console.error('FAIL:', summarize(trimmed));
        throw err;
      }
    }
  }
  await pool.end();
  console.log('Database schema is up to date.');
}

function summarize(stmt: string): string {
  return stmt.replace(/\s+/g, ' ').slice(0, 80);
}

function splitSqlStatements(sql: string): string[] {
  // Keep dollar-quoted function bodies ($$ ... $$) intact as one statement.
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let i = 0;
  while (i < sql.length) {
    const twoChars = sql.slice(i, i + 2);
    if (twoChars === '$$') {
      depth = depth === 0 ? 1 : 0;
      current += twoChars;
      i += 2;
      continue;
    }
    const ch = sql[i];
    if (ch === ';' && depth === 0) {
      parts.push(current);
      current = '';
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
