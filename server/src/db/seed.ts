import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!username || !password || password === 'CHANGE_THIS_TO_A_LONG_UNIQUE_PASSWORD' || password.length < 14) {
  throw new Error('Set BOOTSTRAP_ADMIN_USERNAME and a unique BOOTSTRAP_ADMIN_PASSWORD of at least 14 characters in server/.env.');
}
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Quản trị viên';
const hash = await bcrypt.hash(password, 12);
await pool.query(
  `INSERT INTO users(username,display_name,password_hash,role,must_change_password)
   VALUES($1,$2,$3,'admin',true) ON CONFLICT(username) DO NOTHING`, [username,name,hash]
);
if (process.env.SEED_DEMO === 'true') {
  const demoHash = await bcrypt.hash(crypto.randomUUID() + crypto.randomUUID(), 12);
  const staff = await pool.query(
    `INSERT INTO users(username,display_name,password_hash,role,active) VALUES('demo-staff','Nhân viên demo',$1,'staff',false)
     ON CONFLICT(username) DO UPDATE SET active=false RETURNING id`, [demoHash]
  );
  await pool.query(`INSERT INTO orders(tracking_code,owner_user_id,amount_vnd,status,created_by)
    SELECT 'DEMO-ORDER-001',id,1500000,'pending',(SELECT id FROM users WHERE username=$2)
    FROM users WHERE id=$1 ON CONFLICT DO NOTHING`, [staff.rows[0].id,username]);
}
console.log('Admin bootstrap complete. Sign in and change the password before creating accounts.');
await pool.end();
