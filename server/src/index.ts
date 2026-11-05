import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db/pool.js';

const app = express();
const PgStore = connectPgSimple(session);
const prod = process.env.NODE_ENV === 'production';
if (prod) app.set('trust proxy', 1);
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(session({
  store: new PgStore({ pool, createTableIfMissing: true }),
  name: 'orderhub.sid', secret: process.env.SESSION_SECRET!, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: prod, maxAge: 8 * 60 * 60 * 1000 }
}));
const asyncRoute = (fn: (req: Request,res: Response,next: NextFunction)=>Promise<unknown>) => (req: Request,res: Response,next: NextFunction) => { void fn(req,res,next).catch(next); };
const roles = (...allowed: string[]) => (req: Request,res: Response,next: NextFunction) => {
  if (!req.session.user) return res.status(401).json({ error: 'Vui lòng đăng nhập.' });
  if (!allowed.includes(req.session.user.role)) return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này.' });
  next();
};
const orderSchema = z.object({
  trackingCode: z.string().trim().min(5).max(30).regex(/^[a-zA-Z0-9-]+$/),
  amountVnd: z.number().int().min(10000).max(50000000),
  status: z.enum(['pending','delivered','returned']),
  invoiceStatus: z.enum(['not_issued','issued']),
  ownerUserId: z.string().uuid().optional(),
  shareUserIds: z.array(z.string().uuid()).max(50).optional()
});
app.get('/api/health', (_req,res)=>res.json({ ok:true }));
app.get('/api/auth/me', (req,res)=>res.json({ user: req.session.user || null }));
app.post('/api/auth/login', asyncRoute(async(req,res)=>{
  const body=z.object({username:z.string().min(1),password:z.string().min(1)}).safeParse(req.body);
  if(!body.success) return res.status(400).json({error:'Vui lòng nhập tên đăng nhập và mật khẩu.'});
  const result=await pool.query('SELECT id,username,display_name,password_hash,role,must_change_password FROM users WHERE username=$1 AND active=true',[body.data.username.trim()]);
  const row=result.rows[0];
  if(!row || !(await bcrypt.compare(body.data.password,row.password_hash))) return res.status(401).json({error:'Tên đăng nhập hoặc mật khẩu không đúng.'});
  await new Promise<void>((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));
  req.session.user={id:row.id,username:row.username,displayName:row.display_name,role:row.role,mustChangePassword:row.must_change_password};
  res.json({user:req.session.user});
}));
app.post('/api/auth/logout',(req,res)=>req.session.destroy(()=>{res.clearCookie('orderhub.sid');res.status(204).end();}));
app.post('/api/auth/password',asyncRoute(async(req,res)=>{
  if(!req.session.user) return res.status(401).json({error:'Vui lòng đăng nhập.'});
  const body=z.object({currentPassword:z.string(),newPassword:z.string().min(14).max(128)}).safeParse(req.body);
  if(!body.success) return res.status(400).json({error:'Mật khẩu mới cần ít nhất 14 ký tự.'});
  const row=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[req.session.user.id])).rows[0];
  if(!await bcrypt.compare(body.data.currentPassword,row.password_hash)) return res.status(400).json({error:'Mật khẩu hiện tại không đúng.'});
  await pool.query('UPDATE users SET password_hash=$1,must_change_password=false WHERE id=$2',[await bcrypt.hash(body.data.newPassword,12),req.session.user.id]);
  req.session.user.mustChangePassword=false; res.json({ok:true});
}));
app.get('/api/users',roles('admin','manager'),asyncRoute(async(_req,res)=>{
  const {rows}=await pool.query('SELECT id,username,display_name AS "displayName",role,active,created_at AS "createdAt" FROM users ORDER BY display_name');res.json({users:rows});
}));
app.post('/api/users',roles('admin'),asyncRoute(async(req,res)=>{
  const b=z.object({username:z.string().trim().min(3).max(40),displayName:z.string().trim().min(1).max(100),password:z.string().min(14).max(128),role:z.enum(['manager','staff'])}).safeParse(req.body);
  if(!b.success)return res.status(400).json({error:'Thông tin không hợp lệ. Mật khẩu cần ít nhất 14 ký tự.'});
  const {username,displayName,password,role}=b.data;
  const result=await pool.query(`INSERT INTO users(username,display_name,password_hash,role,must_change_password) VALUES($1,$2,$3,$4,true) RETURNING id,username,display_name AS "displayName",role,active`,[username,displayName,await bcrypt.hash(password,12),role]);res.status(201).json({user:result.rows[0]});
}));
app.patch('/api/users/:id/role',roles('admin'),asyncRoute(async(req,res)=>{
  const b=z.object({role:z.enum(['manager','staff']),adminPassword:z.string().min(1)}).safeParse(req.body);if(!b.success)return res.status(400).json({error:'Thông tin không hợp lệ.'});
  const admin=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[req.session.user!.id])).rows[0];if(!await bcrypt.compare(b.data.adminPassword,admin.password_hash))return res.status(403).json({error:'Mật khẩu xác nhận không đúng.'});
  if(req.params.id===req.session.user!.id)return res.status(400).json({error:'Không thể thay đổi vai trò tài khoản đang sử dụng.'});
  const {rows}=await pool.query('UPDATE users SET role=$1 WHERE id=$2 AND role<>\'admin\' RETURNING id,username,role',[b.data.role,req.params.id]);if(!rows[0])return res.status(404).json({error:'Không tìm thấy tài khoản.'});res.json({user:rows[0]});
}));
app.get('/api/orders',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});
  const {q='',status='',invoiceStatus='',userId=''}=req.query as Record<string,string>;
  const vals:unknown[]=[];const where:string[]=[];const u=req.session.user;
  if(u.role==='staff'){vals.push(u.id);where.push(`o.owner_user_id=$${vals.length}`)}
  else if(userId){vals.push(userId);where.push(`o.owner_user_id=$${vals.length}`)}
  if(q){vals.push(`%${q}%`);where.push(`(o.tracking_code ILIKE $${vals.length} OR usr.display_name ILIKE $${vals.length})`)}
  if(status){vals.push(status);where.push(`o.status=$${vals.length}`)}
  if(invoiceStatus){vals.push(invoiceStatus);where.push(`o.invoice_status=$${vals.length}`)}
  const result=await pool.query(`SELECT o.id,o.tracking_code AS "trackingCode",o.amount_vnd AS "amountVnd",o.status,o.invoice_status AS "invoiceStatus",o.owner_user_id AS "ownerUserId",usr.display_name AS "ownerName",o.share_group_id AS "shareGroupId",o.created_at AS "createdAt" FROM orders o JOIN users usr ON usr.id=o.owner_user_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY o.created_at DESC`,vals);res.json({orders:result.rows});
}));
app.post('/api/orders',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});
  const p=orderSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Đơn chưa hợp lệ. Mã 5–30 ký tự; giá trị 10.000–50.000.000 VNĐ.',details:p.error.flatten()});
  const actor=req.session.user;const {trackingCode,amountVnd,status,invoiceStatus}=p.data;
  const client=await pool.connect();try{await client.query('BEGIN');
    let owner=actor.id;if(actor.role==='admin'||actor.role==='manager'){owner=p.data.ownerUserId||actor.id;const check=await client.query('SELECT role FROM users WHERE id=$1 AND active=true',[owner]);if(!check.rows[0])throw Object.assign(new Error('Không tìm thấy nhân viên.'),{status:400});}
    const recipients=[...new Set((p.data.shareUserIds||[]).filter(id=>id!==actor.id))];
    if(recipients.length && actor.role==='staff')throw Object.assign(new Error('Nhân viên không thể chia doanh thu.'),{status:403});
    if(recipients.length){const people=await client.query('SELECT id,role FROM users WHERE id=ANY($1::uuid[]) AND active=true', [recipients]);if(people.rows.length!==recipients.length||people.rows.some(x=>x.role!=='staff'))throw Object.assign(new Error('Chỉ được chia cho nhân viên Staff đang hoạt động.'),{status:400});}
    const group=recipients.length?crypto.randomUUID():null;const all=[owner,...recipients];const each=Math.floor(amountVnd/all.length);let remainder=amountVnd-each*all.length;
    for(const id of all){const assigned=each+(remainder>0?1:0);if(remainder>0)remainder--;await client.query(`INSERT INTO orders(tracking_code,owner_user_id,amount_vnd,status,invoice_status,share_group_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)`,[trackingCode,id,assigned,status,invoiceStatus,group,actor.id]);}
    await client.query('COMMIT');res.status(201).json({ok:true,warning:amountVnd>=20000000?'Giá trị cao bất thường. Vui lòng kiểm tra lại.':null});
  }catch(e){await client.query('ROLLBACK');const err=e as Error&{code?:string;status?:number};if(err.code==='23505')return res.status(409).json({error:'Mã vận đơn này đã được ghi nhận cho nhân viên nhận doanh thu.'});return res.status(err.status||400).json({error:err.message||'Không thể lưu đơn.'});}finally{client.release();}
}));
app.patch('/api/orders/:id',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});
  const p=orderSchema.omit({shareUserIds:true}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'Thông tin đơn hàng không hợp lệ.'});
  const u=req.session.user;const ownerId=u.role==='staff'?u.id:(p.data.ownerUserId||null);
  const vals=[p.data.trackingCode,p.data.amountVnd,p.data.status,p.data.invoiceStatus,req.params.id];
  const query=`UPDATE orders SET tracking_code=$1,amount_vnd=$2,status=$3,invoice_status=$4,updated_at=now() WHERE id=$5 ${u.role==='staff'?'AND owner_user_id=$6':''} RETURNING id`;
  if(u.role==='staff')vals.push(u.id);const out=await pool.query(query,vals);if(!out.rowCount)return res.status(404).json({error:'Không tìm thấy đơn hàng.'});res.json({ok:true});
}));
app.delete('/api/orders/:id',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});if(!['admin','staff'].includes(req.session.user.role))return res.status(403).json({error:'Manager không có quyền xóa đơn.'});
  const {rows}=await pool.query(`DELETE FROM orders WHERE id=$1 ${req.session.user.role==='staff'?'AND owner_user_id=$2':''} RETURNING id`,req.session.user.role==='staff'?[req.params.id,req.session.user.id]:[req.params.id]);if(!rows[0])return res.status(404).json({error:'Không tìm thấy đơn hàng.'});res.status(204).end();
}));
app.delete('/api/users/:id',roles('admin'),asyncRoute(async(req,res)=>{
  const b=z.object({adminPassword:z.string().min(1)}).safeParse(req.body);
  if(!b.success)return res.status(400).json({error:'Cần mật khẩu Admin để xác nhận.'});
  if(req.params.id===req.session.user!.id)return res.status(400).json({error:'Không thể xóa tài khoản đang sử dụng.'});
  const admin=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[req.session.user!.id])).rows[0];
  if(!await bcrypt.compare(b.data.adminPassword,admin.password_hash))return res.status(403).json({error:'Mật khẩu xác nhận không đúng.'});
  const result=await pool.query("UPDATE users SET active=false WHERE id=$1 AND role<>'admin' RETURNING id",[req.params.id]);
  if(!result.rowCount)return res.status(404).json({error:'Không tìm thấy tài khoản.'});
  res.status(204).end();
}));
app.get('/api/reports/orders.csv',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});const u=req.session.user;const args:unknown[]=[];const clauses:string[]=[];
  if(u.role==='staff'){args.push(u.id);clauses.push(`o.owner_user_id=$${args.length}`)}
  const {from='',to='',status='',userId=''}=req.query as Record<string,string>;
  if(from){args.push(from);clauses.push(`o.created_at >= $${args.length}::date`)}if(to){args.push(to);clauses.push(`o.created_at < ($${args.length}::date + interval '1 day')`)}if(status){args.push(status);clauses.push(`o.status=$${args.length}`)}if(userId&&u.role!=='staff'){args.push(userId);clauses.push(`o.owner_user_id=$${args.length}`)}
  const {rows}=await pool.query(`SELECT usr.display_name AS name,o.tracking_code,o.amount_vnd,o.status,o.invoice_status,o.created_at FROM orders o JOIN users usr ON usr.id=o.owner_user_id ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY o.created_at`,args);
  const esc=(s:unknown)=>`"${String(s??'').replaceAll('"','""')}"`;const csv=['Tên nhân viên,Mã vận đơn,Giá trị (VNĐ),Trạng thái,Trạng thái hóa đơn,Ngày tạo',...rows.map(r=>[r.name,r.tracking_code,r.amount_vnd,r.status,r.invoice_status,new Date(r.created_at).toLocaleDateString('sv-SE')].map(esc).join(','))].join('\r\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="OrderHub-${new Date().toISOString().slice(0,10)}.csv"`);res.send('\uFEFF'+csv);
}));
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
app.use(express.static(clientDist));
app.get('*',(req,res,next)=>{
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), err => { if (err) next(err); });
});
app.use((err:Error&{status?:number},_req:Request,res:Response,_next:NextFunction)=>{console.error(err);res.status(err.status||500).json({error:prod?'Đã xảy ra lỗi hệ thống.':err.message});});
const port=Number(process.env.PORT||4000);const host=process.env.HOST||'0.0.0.0';app.listen(port,host,()=>console.log(`OrderHub listening on ${host}:${port}`));
