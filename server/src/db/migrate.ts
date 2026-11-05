import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const file = fileURLToPath(new URL('./schema.sql', import.meta.url));
  await pool.query(await readFile(path.resolve(file), 'utf8'));
  console.log('OrderHub database schema is up to date.');
} finally { await pool.end(); }
