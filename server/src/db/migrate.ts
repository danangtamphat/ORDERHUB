import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('orderhub-schema-migrations'))");
  await client.query(`CREATE TABLE IF NOT EXISTS orderhub_schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const { rows: stateRows } = await client.query("SELECT to_regclass('public.users') IS NOT NULL AS has_users");
  if (!stateRows[0].has_users) {
    const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));
    await client.query('BEGIN');
    try {
      await client.query(await readFile(path.resolve(schemaPath), 'utf8'));
      await client.query("INSERT INTO orderhub_schema_migrations(version) VALUES('0000_initial_schema') ON CONFLICT DO NOTHING");
      await client.query('COMMIT');
      console.log('Initialized empty OrderHub database from the base schema.');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } else {
    // Existing databases have already received the legacy schema. Never replay its
    // data-adjustment statements during deploy; only versioned migrations run below.
    await client.query("INSERT INTO orderhub_schema_migrations(version) VALUES('0000_existing_schema') ON CONFLICT DO NOTHING");
  }

  const migrationDir = fileURLToPath(new URL('./migrations/', import.meta.url));
  const files = (await readdir(migrationDir)).filter(file => /^\d+.*\.sql$/.test(file)).sort();
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const { rows } = await client.query('SELECT 1 FROM orderhub_schema_migrations WHERE version=$1', [version]);
    if (rows.length) continue;
    await client.query('BEGIN');
    try {
      await client.query(await readFile(path.join(migrationDir, file), 'utf8'));
      await client.query('INSERT INTO orderhub_schema_migrations(version) VALUES($1)', [version]);
      await client.query('COMMIT');
      console.log(`Applied database migration ${version}.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log('OrderHub database migrations are up to date.');
} finally {
  client.release();
  await pool.end();
}
