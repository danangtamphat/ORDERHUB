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
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
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
  let attendance:{checkedIn?:boolean;noSchedule?:boolean;alreadyCheckedIn?:boolean;shift?:string}|undefined;
  if(row.role==='staff'||row.role==='manager'){
    const schedule=(await pool.query("SELECT shift FROM work_schedules WHERE user_id=$1 AND work_date=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date",[row.id])).rows[0];
    if(!schedule)attendance={noSchedule:true};
    else {const checked=await pool.query("INSERT INTO attendance(user_id,work_date,shift) VALUES($1,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,$2) ON CONFLICT(user_id,work_date) DO NOTHING RETURNING id",[row.id,schedule.shift]);if(checked.rowCount)await pool.query('INSERT INTO pet_settings(user_id,food_count) VALUES($1,1) ON CONFLICT(user_id) DO UPDATE SET food_count=pet_settings.food_count+1,updated_at=now()',[row.id]);attendance={checkedIn:Boolean(checked.rowCount),alreadyCheckedIn:!checked.rowCount,shift:schedule.shift};}
  }
  res.json({user:req.session.user,attendance});
}));
app.post('/api/auth/forgot-password',asyncRoute(async(req,res)=>{
  const b=z.object({username:z.string().trim().min(1).max(40),email:z.string().email().max(254)}).safeParse(req.body);if(!b.success)return res.status(400).json({error:'Vui lòng nhập tên đăng nhập và email hợp lệ.'});
  if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)return res.status(503).json({error:'Chưa cấu hình dịch vụ email khôi phục. Quản trị viên cần thêm RESEND_API_KEY và RESEND_FROM_EMAIL.'});
  const user=(await pool.query('SELECT id,recovery_email FROM users WHERE username=$1 AND active=true',[b.data.username])).rows[0];if(!user||String(user.recovery_email||'').toLowerCase()!==b.data.email.toLowerCase())return res.json({message:'Nếu tên đăng nhập và email khớp tài khoản, mã xác minh sẽ được gửi đến email đó.'});
  const recent=await pool.query("SELECT count(*)::int AS n FROM password_reset_codes WHERE user_id=$1 AND created_at>now()-interval '1 hour'",[user.id]);if(Number(recent.rows[0].n)>=3)return res.status(429).json({error:'Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau một giờ.'});
  const otp=String(randomInt(100000,1000000)),otpHash=createHash('sha256').update(otp).digest('hex');const code=(await pool.query("INSERT INTO password_reset_codes(user_id,otp_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes') RETURNING id",[user.id,otpHash])).rows[0];
  try{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type':'application/json'},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[b.data.email],subject:'Mã OTP đặt lại mật khẩu OrderHub',text:`Mã xác minh OrderHub của bạn là ${otp}. Mã có hiệu lực trong 10 phút và chỉ dùng một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này.`}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('email delivery failed')}catch{await pool.query('DELETE FROM password_reset_codes WHERE id=$1',[code.id]);return res.status(502).json({error:'Không gửi được email xác minh. Vui lòng thử lại hoặc liên hệ Admin.'})}
  res.json({message:'Nếu thông tin khớp tài khoản, mã xác minh sẽ được gửi đến email khôi phục và có hiệu lực 10 phút.'});
}));
app.post('/api/auth/reset-password',asyncRoute(async(req,res)=>{
  const b=z.object({username:z.string().trim().min(1).max(40),email:z.string().email().max(254),otp:z.string().regex(/^\d{6}$/),newPassword:z.string().min(8).max(128)}).safeParse(req.body);if(!b.success)return res.status(400).json({error:'Thông tin đặt lại mật khẩu không hợp lệ.'});
  const {rows}=await pool.query(`SELECT c.id,c.user_id AS "userId",c.otp_hash AS "otpHash",u.password_hash AS "passwordHash" FROM password_reset_codes c JOIN users u ON u.id=c.user_id WHERE u.username=$1 AND lower(u.recovery_email)=lower($2) AND c.expires_at>now() AND c.used_at IS NULL AND c.attempts<5 ORDER BY c.created_at DESC LIMIT 1`,[b.data.username,b.data.email]);const code=rows[0];if(!code)return res.status(400).json({error:'Mã OTP không đúng, đã hết hạn hoặc đã được sử dụng.'});
  const submitted=Buffer.from(createHash('sha256').update(b.data.otp).digest('hex'),'hex'),expected=Buffer.from(code.otpHash,'hex');if(submitted.length!==expected.length||!timingSafeEqual(submitted,expected)){await pool.query('UPDATE password_reset_codes SET attempts=attempts+1 WHERE id=$1',[code.id]);return res.status(400).json({error:'Mã OTP không đúng hoặc đã hết hạn.'})}
  const client=await pool.connect();try{await client.query('BEGIN');await client.query('UPDATE users SET password_hash=$1,must_change_password=false WHERE id=$2',[await bcrypt.hash(b.data.newPassword,12),code.userId]);await client.query('UPDATE password_reset_codes SET used_at=now() WHERE id=$1',[code.id]);await client.query('DELETE FROM password_reset_codes WHERE user_id=$1 AND id<>$2',[code.userId,code.id]);await client.query('COMMIT')}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}res.json({ok:true});
}));
app.post('/api/auth/logout',(req,res)=>req.session.destroy(()=>{res.clearCookie('orderhub.sid');res.status(204).end();}));
app.post('/api/auth/password',asyncRoute(async(req,res)=>{
  if(!req.session.user) return res.status(401).json({error:'Vui lòng đăng nhập.'});
  const body=z.object({currentPassword:z.string(),newPassword:z.string().min(8).max(128)}).safeParse(req.body);
  if(!body.success) return res.status(400).json({error:'Mật khẩu mới cần ít nhất 8 ký tự.'});
  const row=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[req.session.user.id])).rows[0];
  if(!await bcrypt.compare(body.data.currentPassword,row.password_hash)) return res.status(400).json({error:'Mật khẩu hiện tại không đúng.'});
  await pool.query('UPDATE users SET password_hash=$1,must_change_password=false WHERE id=$2',[await bcrypt.hash(body.data.newPassword,12),req.session.user.id]);
  req.session.user.mustChangePassword=false; res.json({ok:true});
}));
app.get('/api/users',roles('admin','manager'),asyncRoute(async(_req,res)=>{
  const {rows}=await pool.query('SELECT id,username,display_name AS "displayName",role,active,recovery_email AS "recoveryEmail",employee_grade AS "employeeGrade",created_at AS "createdAt" FROM users ORDER BY display_name');res.json({users:rows});
}));
app.post('/api/users',roles('admin'),asyncRoute(async(req,res)=>{
  const b=z.object({username:z.string().trim().min(3).max(40),displayName:z.string().trim().min(1).max(100),password:z.string().min(8).max(128),role:z.enum(['manager','staff']),recoveryEmail:z.union([z.string().email().max(254),z.literal('')]).optional(),employeeGrade:z.number().int().min(1).max(3).default(2)}).safeParse(req.body);
  if(!b.success)return res.status(400).json({error:'Thông tin không hợp lệ. Mật khẩu cần ít nhất 8 ký tự và email phải đúng định dạng.'});
  const {username,displayName,password,role,recoveryEmail,employeeGrade}=b.data;
  const result=await pool.query(`INSERT INTO users(username,display_name,password_hash,role,must_change_password,recovery_email,employee_grade) VALUES($1,$2,$3,$4,true,NULLIF($5,''),$6) RETURNING id,username,display_name AS "displayName",role,active,recovery_email AS "recoveryEmail",employee_grade AS "employeeGrade"`,[username,displayName,await bcrypt.hash(password,12),role,recoveryEmail||'',role==='staff'?employeeGrade:2]);res.status(201).json({user:result.rows[0]});
}));
app.patch('/api/users/:id/role',roles('admin'),asyncRoute(async(req,res)=>{
  const b=z.object({role:z.enum(['manager','staff']),adminPassword:z.string().min(1)}).safeParse(req.body);if(!b.success)return res.status(400).json({error:'Thông tin không hợp lệ.'});
  const admin=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[req.session.user!.id])).rows[0];if(!await bcrypt.compare(b.data.adminPassword,admin.password_hash))return res.status(403).json({error:'Mật khẩu xác nhận không đúng.'});
  if(req.params.id===req.session.user!.id)return res.status(400).json({error:'Không thể thay đổi vai trò tài khoản đang sử dụng.'});
  const {rows}=await pool.query('UPDATE users SET role=$1 WHERE id=$2 AND role<>\'admin\' RETURNING id,username,role',[b.data.role,req.params.id]);if(!rows[0])return res.status(404).json({error:'Không tìm thấy tài khoản.'});res.json({user:rows[0]});
}));
app.patch('/api/users/:id/settings',roles('admin'),asyncRoute(async(req,res)=>{
  const b=z.object({recoveryEmail:z.union([z.string().email().max(254),z.literal('')]),employeeGrade:z.number().int().min(1).max(3)}).safeParse(req.body);if(!b.success)return res.status(400).json({error:'Email hoặc bậc nhân viên không hợp lệ.'});
  const {rows}=await pool.query(`UPDATE users SET recovery_email=NULLIF($1,''),employee_grade=CASE WHEN role='staff' THEN $2 ELSE employee_grade END WHERE id=$3 AND (role<>'admin' OR id=$4) RETURNING id,username,employee_grade AS "employeeGrade",recovery_email AS "recoveryEmail"`,[b.data.recoveryEmail,b.data.employeeGrade,req.params.id,req.session.user!.id]);if(!rows[0])return res.status(404).json({error:'Không tìm thấy tài khoản.'});res.json({user:rows[0]});
}));
app.post('/api/users/:id/reset-password',roles('admin'),asyncRoute(async(req,res)=>{
  const b=z.object({adminPassword:z.string().min(1)}).safeParse(req.body);if(!b.success)return res.status(400).json({error:'Nhập mật khẩu Admin để xác nhận.'});
  const admin=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[req.session.user!.id])).rows[0];if(!admin||!await bcrypt.compare(b.data.adminPassword,admin.password_hash))return res.status(403).json({error:'Mật khẩu Admin không đúng.'});
  const target=(await pool.query("SELECT id,username,display_name AS \"displayName\",recovery_email AS \"recoveryEmail\" FROM users WHERE id=$1 AND role<>'admin' AND active=true",[req.params.id])).rows[0];if(!target)return res.status(404).json({error:'Không tìm thấy tài khoản nhân viên đang hoạt động.'});if(!target.recoveryEmail)return res.status(400).json({error:'Tài khoản chưa có email khôi phục. Hãy thêm và lưu email trước khi đặt lại mật khẩu.'});
  if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)return res.status(503).json({error:'Chưa cấu hình email khôi phục. Railway cần có RESEND_API_KEY và RESEND_FROM_EMAIL.'});
  const temporaryPassword=randomBytes(18).toString('base64url');
  try{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[target.recoveryEmail],subject:'Mật khẩu tạm thời OrderHub',text:`Xin chào ${target.displayName},\n\nQuản trị viên đã hỗ trợ đặt lại mật khẩu tài khoản ${target.username}.\n\nMật khẩu tạm thời: ${temporaryPassword}\n\nHãy đăng nhập và đổi mật khẩu ngay. Mật khẩu tạm thời chỉ dùng để đăng nhập lần đầu. Nếu bạn không yêu cầu, hãy liên hệ quản trị viên.`}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('email delivery failed')}catch{return res.status(502).json({error:'Không gửi được email. Kiểm tra API key và địa chỉ gửi trong cấu hình email.'})}
  await pool.query('UPDATE users SET password_hash=$1,must_change_password=true WHERE id=$2',[await bcrypt.hash(temporaryPassword,12),target.id]);await pool.query('DELETE FROM password_reset_codes WHERE user_id=$1',[target.id]);res.json({ok:true,message:`Đã gửi mật khẩu tạm thời đến ${target.recoveryEmail}. Nhân viên cần đổi mật khẩu khi đăng nhập.`});
}));
const profileKey=()=>{const key=process.env.PROFILE_ENCRYPTION_KEY;if(key&&key.length>=32)return key;const sessionSecret=process.env.SESSION_SECRET;if(!sessionSecret||sessionSecret.length<32)throw Object.assign(new Error('Máy chủ chưa cấu hình khóa mã hóa hồ sơ nhân viên.'),{status:503});return createHash('sha256').update(`OrderHub employee profile encryption v1:${sessionSecret}`).digest('hex');};
app.get('/api/profile',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});
  const requested=(req.query.userId as string|undefined)||req.session.user.id;
  if(requested!==req.session.user.id&&req.session.user.role!=='admin')return res.status(403).json({error:'Chỉ Admin mới được xem hồ sơ nhân viên khác.'});
  const key=profileKey();
  const {rows}=await pool.query(`SELECT u.id AS "userId",u.username,u.display_name AS "displayName",u.role,u.employee_grade AS "employeeGrade",p.full_name AS "fullName",to_char(p.birth_date,'YYYY-MM-DD') AS "birthDate",p.hometown,pgp_sym_decrypt(p.national_id_ciphertext,$2) AS "nationalId",p.position,to_char(p.start_date,'YYYY-MM-DD') AS "startDate",p.phone,p.address,p.updated_at AS "updatedAt" FROM users u LEFT JOIN employee_profiles p ON p.user_id=u.id WHERE u.id=$1`,[requested,key]);
  if(!rows[0])return res.status(404).json({error:'Không tìm thấy tài khoản.'});res.json({profile:rows[0]});
}));
app.put('/api/profile',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});
  const b=z.object({fullName:z.string().trim().min(1).max(120),birthDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),hometown:z.string().trim().min(1).max(160),nationalId:z.string().regex(/^(\d{9}|\d{12})$/),position:z.string().trim().min(1).max(100),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),phone:z.string().max(30).default(''),address:z.string().max(200).default('')}).safeParse(req.body);
  if(!b.success)return res.status(400).json({error:'Vui lòng nhập đủ thông tin bắt buộc; CCCD gồm 9 hoặc 12 chữ số.'});
  if(req.session.user.role==='admin')return res.status(403).json({error:'Admin chỉ xem hồ sơ nhân viên, không nhập thay.'});
  const key=profileKey();const p=b.data;
  await pool.query(`INSERT INTO employee_profiles(user_id,full_name,birth_date,hometown,national_id_ciphertext,position,start_date,phone,address) VALUES($1,$2,$3::date,$4,pgp_sym_encrypt($5,$6),$7,$8::date,$9,$10) ON CONFLICT(user_id) DO UPDATE SET full_name=EXCLUDED.full_name,birth_date=EXCLUDED.birth_date,hometown=EXCLUDED.hometown,national_id_ciphertext=EXCLUDED.national_id_ciphertext,position=EXCLUDED.position,start_date=EXCLUDED.start_date,phone=EXCLUDED.phone,address=EXCLUDED.address,updated_at=now()`,[req.session.user.id,p.fullName,p.birthDate,p.hometown,p.nationalId,key,p.position,p.startDate,p.phone,p.address]);
  res.json({ok:true});
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
  const result=await pool.query(`SELECT o.id,o.tracking_code AS "trackingCode",o.amount_vnd AS "amountVnd",COALESCE((SELECT sum(part.amount_vnd) FROM orders part WHERE part.share_group_id=o.share_group_id),o.amount_vnd) AS "grossAmountVnd",o.status,o.invoice_status AS "invoiceStatus",o.owner_user_id AS "ownerUserId",usr.display_name AS "ownerName",o.share_group_id AS "shareGroupId",o.created_at AS "createdAt" FROM orders o JOIN users usr ON usr.id=o.owner_user_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY o.created_at DESC`,vals);res.json({orders:result.rows});
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
    for(const id of all){const assigned=each+(remainder>0?1:0);if(remainder>0)remainder--;await client.query(`INSERT INTO orders(tracking_code,owner_user_id,amount_vnd,status,invoice_status,share_group_id,created_by,delivered_at) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $4='delivered' THEN now() ELSE NULL END)`,[trackingCode,id,assigned,status,invoiceStatus,group,actor.id]);}
    await client.query('COMMIT');res.status(201).json({ok:true,warning:amountVnd>=20000000?'Giá trị cao bất thường. Vui lòng kiểm tra lại.':null});
  }catch(e){await client.query('ROLLBACK');const err=e as Error&{code?:string;status?:number};if(err.code==='23505')return res.status(409).json({error:'Mã vận đơn này đã được ghi nhận cho nhân viên nhận doanh thu.'});return res.status(err.status||400).json({error:err.message||'Không thể lưu đơn.'});}finally{client.release();}
}));
app.patch('/api/orders/:id',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});
  const p=orderSchema.omit({shareUserIds:true}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'Thông tin đơn hàng không hợp lệ.'});
  const u=req.session.user;const ownerId=u.role==='staff'?u.id:(p.data.ownerUserId||null);
  const vals=[p.data.trackingCode,p.data.amountVnd,p.data.status,p.data.invoiceStatus,req.params.id];
  const query=`UPDATE orders SET tracking_code=$1,amount_vnd=$2,status=$3,invoice_status=$4,delivered_at=CASE WHEN $3='delivered' THEN COALESCE(delivered_at,now()) ELSE NULL END,updated_at=now() WHERE id=$5 ${u.role==='staff'?'AND owner_user_id=$6':''} RETURNING id`;
  if(u.role==='staff')vals.push(u.id);const out=await pool.query(query,vals);if(!out.rowCount)return res.status(404).json({error:'Không tìm thấy đơn hàng.'});res.json({ok:true});
}));
app.post('/api/orders/bulk-status',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});
  const b=z.object({rows:z.array(z.object({trackingCode:z.string().trim().min(1).max(100),status:z.enum(['pending','delivered','returned'])})).min(1).max(5000)}).safeParse(req.body);if(!b.success)return res.status(400).json({error:'Tệp cần có mã vận đơn và trạng thái hợp lệ.'});
  const client=await pool.connect();let updated=0;const missing:string[]=[];try{await client.query('BEGIN');for(const row of b.data.rows){const values:unknown[]=[row.trackingCode,row.status];const ownership=req.session.user.role==='staff'?'AND owner_user_id=$3':'';if(ownership)values.push(req.session.user.id);const r=await client.query(`UPDATE orders SET status=$2,delivered_at=CASE WHEN $2='delivered' THEN COALESCE(delivered_at,now()) ELSE NULL END,updated_at=now() WHERE lower(tracking_code)=lower($1) ${ownership} RETURNING id`,values);if(r.rowCount)updated+=r.rowCount;else missing.push(row.trackingCode)}await client.query('COMMIT')}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}res.json({updated,missing});
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
app.get('/api/tasks',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});
  const actor=req.session.user;const {month='',year='',userId=''}=req.query as Record<string,string>;
  const args:unknown[]=[];const where:string[]=[];
  if(actor.role!=='admin'){args.push(actor.id);where.push(`t.assignee_user_id=$${args.length}`)}
  else if(userId){args.push(userId);where.push(`t.assignee_user_id=$${args.length}`)}
  if(month&&year){args.push(`${year}-${month.padStart(2,'0')}-01`);where.push(`date_trunc('month',t.deadline)=$${args.length}::date`)}
  const {rows}=await pool.query(`SELECT t.id,t.assignee_user_id AS "assigneeUserId",u.username AS "assigneeUsername",u.display_name AS "assigneeName",t.title,t.description,to_char(t.deadline,'YYYY-MM-DD') AS deadline,t.completed_at AS "completedAt",t.created_at AS "createdAt" FROM assigned_tasks t JOIN users u ON u.id=t.assignee_user_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY t.deadline,t.created_at DESC`,args);
  res.json({tasks:rows});
}));
app.get('/api/schedules',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});
  const {month='',year='',userId=''}=req.query as Record<string,string>;const args:unknown[]=[];const where:string[]=[];const actor=req.session.user;
  if(actor.role!=='admin'){args.push(actor.id);where.push(`s.user_id=$${args.length}`)}else if(userId){args.push(userId);where.push(`s.user_id=$${args.length}`)}
  if(/^\d{1,2}$/.test(month)&&/^\d{4}$/.test(year)){args.push(`${year}-${month.padStart(2,'0')}-01`);where.push(`s.work_date >= $${args.length}::date AND s.work_date < ($${args.length}::date + interval '1 month')`)}
  const {rows}=await pool.query(`SELECT s.id,s.user_id AS "userId",u.username,u.display_name AS "displayName",to_char(s.work_date,'YYYY-MM-DD') AS "workDate",s.shift,(a.id IS NOT NULL) AS attended FROM work_schedules s JOIN users u ON u.id=s.user_id LEFT JOIN attendance a ON a.user_id=s.user_id AND a.work_date=s.work_date ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY s.work_date,s.shift,u.display_name`,args);res.json({schedules:rows});
}));
app.put('/api/schedules',roles('admin'),asyncRoute(async(req,res)=>{
  const b=z.object({userIds:z.array(z.string().uuid()).max(20),workDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),shift:z.enum(['morning','afternoon'])}).safeParse(req.body);
  if(!b.success)return res.status(400).json({error:'Lịch làm việc không hợp lệ.'});
  const people=await pool.query("SELECT id FROM users WHERE id=ANY($1::uuid[]) AND active=true AND role IN ('staff','manager')",[b.data.userIds]);if(people.rows.length!==new Set(b.data.userIds).size)return res.status(400).json({error:'Danh sách có tài khoản không hợp lệ hoặc đã bị khóa.'});
  const client=await pool.connect();try{await client.query('BEGIN');for(const id of b.data.userIds)await client.query(`INSERT INTO work_schedules(user_id,work_date,shift,created_by) VALUES($1,$2::date,$3,$4) ON CONFLICT(user_id,work_date) DO UPDATE SET shift=EXCLUDED.shift,created_by=EXCLUDED.created_by`,[id,b.data.workDate,b.data.shift,req.session.user!.id]);await client.query('COMMIT');res.json({ok:true});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.delete('/api/schedules/week',roles('admin'),asyncRoute(async(req,res)=>{const b=z.object({weekStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).safeParse(req.body);if(!b.success)return res.status(400).json({error:'Tuần cần xóa lịch không hợp lệ.'});const r=await pool.query('DELETE FROM work_schedules WHERE work_date >= $1::date AND work_date < $1::date+7 RETURNING id',[b.data.weekStart]);res.json({deleted:r.rowCount||0});}));
app.delete('/api/schedules/:id',roles('admin'),asyncRoute(async(req,res)=>{const r=await pool.query('DELETE FROM work_schedules WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'Không tìm thấy lịch.'});res.status(204).end();}));
app.post('/api/schedules/copy-previous-week',roles('admin'),asyncRoute(async(req,res)=>{
  const b=z.object({weekStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).safeParse(req.body);if(!b.success)return res.status(400).json({error:'Tuần cần sao chép không hợp lệ.'});
  const r=await pool.query(`INSERT INTO work_schedules(user_id,work_date,shift,created_by) SELECT user_id,work_date+7,shift,$2 FROM work_schedules WHERE work_date >= $1::date-7 AND work_date < $1::date ON CONFLICT(user_id,work_date) DO NOTHING`,[b.data.weekStart,req.session.user!.id]);res.json({copied:r.rowCount||0});
}));
app.get('/api/payroll',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});const actor=req.session.user;
  if(actor.role==='manager')return res.status(403).json({error:'Quản lý không có quyền xem bảng lương.'});
  const {month='',year='',userId=''}=req.query as Record<string,string>;if(!/^\d{1,2}$/.test(month)||!/^\d{4}$/.test(year))return res.status(400).json({error:'Cần chọn kỳ lương hợp lệ.'});
  const period=`${year}-${month.padStart(2,'0')}-01`;const args:unknown[]=[period];const scope=actor.role==='staff'?'AND u.id=$2':userId?'AND u.id=$2':'';if(actor.role==='staff')args.push(actor.id);else if(userId)args.push(userId);
  const query=`WITH shifts AS (SELECT user_id,count(*)::int AS count FROM attendance WHERE work_date >= $1::date AND work_date < ($1::date+interval '1 month') GROUP BY user_id), revenue AS (SELECT owner_user_id,sum(amount_vnd)::bigint AS total FROM orders WHERE status='delivered' AND delivered_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND delivered_at < (($1::date+interval '1 month')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') GROUP BY owner_user_id) SELECT u.id AS "userId",u.username,u.display_name AS "displayName",u.role,u.employee_grade AS "employeeGrade",COALESCE(s.count,0) AS "workShifts",COALESCE(r.total,0) AS revenue,COALESCE(p.base_override_vnd,0) AS "baseOverride",(p.base_override_vnd IS NOT NULL) AS "hasBaseOverride",COALESCE(p.completion_rate,100) AS "completionRate",COALESCE(p.other_income_vnd,0) AS "otherIncome",COALESCE(p.late_penalty_vnd,0) AS "latePenalty",COALESCE(p.loss_penalty_vnd,0) AS "lossPenalty",COALESCE(p.insurance_vnd,500000) AS insurance,COALESCE(p.advance_vnd,0) AS advance,COALESCE(p.holdback_vnd,0) AS holdback FROM users u LEFT JOIN shifts s ON s.user_id=u.id LEFT JOIN revenue r ON r.owner_user_id=u.id LEFT JOIN payroll_adjustments p ON p.user_id=u.id AND p.period_start=$1::date WHERE u.active=true AND u.role IN ('staff','manager') ${scope} ORDER BY u.display_name`;
  const {rows}=await pool.query(query,args);const payslips=rows.map(r=>{const rate=r.role==='manager'?40000:[20000,25000,30000][Math.max(0,Math.min(2,Number(r.employeeGrade)-1))];const base=Number(r.hasBaseOverride?r.baseOverride:Number(r.workShifts)*8*rate);const allowanceRatio=Math.min(Number(r.workShifts),26)/26;const attendanceBonus=Math.round(200000*allowanceRatio),mealAllowance=Math.round(500000*allowanceRatio),revenue=Number(r.revenue),revenueBonus=Math.round(revenue*.015);const net=Math.round(base*Number(r.completionRate)/100+revenueBonus+attendanceBonus+mealAllowance+Number(r.otherIncome)-Number(r.latePenalty)-Number(r.lossPenalty)-Number(r.insurance)-Number(r.advance)-Number(r.holdback));return {...r,hourlyRate:rate,baseSalary:base,attendanceBonus,mealAllowance,revenueBonus,netSalary:net};});
  let totalAll=0;if(actor.role==='admin'&&userId){const all=await pool.query(query.replace('AND u.id=$2',''),[period]);for(const r of all.rows){const rate=r.role==='manager'?40000:[20000,25000,30000][Math.max(0,Math.min(2,Number(r.employeeGrade)-1))];const base=Number(r.hasBaseOverride?r.baseOverride:Number(r.workShifts)*8*rate);const ratio=Math.min(Number(r.workShifts),26)/26;totalAll+=Math.round(base*Number(r.completionRate)/100+Math.round(Number(r.revenue)*.015)+Math.round(700000*ratio)+Number(r.otherIncome)-Number(r.latePenalty)-Number(r.lossPenalty)-Number(r.insurance)-Number(r.advance)-Number(r.holdback));}}else totalAll=payslips.reduce((n,p)=>n+Number(p.netSalary),0);
  res.json({payslips,totalAll,period});
}));
app.put('/api/payroll/:userId',roles('admin'),asyncRoute(async(req,res)=>{
  const b=z.object({month:z.number().int().min(1).max(12),year:z.number().int().min(2020).max(2100),baseOverride:z.number().int().nonnegative().nullable().default(null),completionRate:z.number().min(0).max(300).default(100),otherIncome:z.number().int().nonnegative().default(0),latePenalty:z.number().int().nonnegative().default(0),lossPenalty:z.number().int().nonnegative().default(0),insurance:z.number().int().nonnegative().default(500000),advance:z.number().int().nonnegative().default(0),holdback:z.number().int().nonnegative().default(0)}).safeParse(req.body);
  if(!b.success)return res.status(400).json({error:'Các khoản lương phải là số không âm; tỷ lệ hoàn thành từ 0 đến 300%.'});
  const exists=await pool.query("SELECT id FROM users WHERE id=$1 AND role IN ('staff','manager') AND active=true",[req.params.userId]);if(!exists.rowCount)return res.status(404).json({error:'Không tìm thấy nhân viên.'});const p=b.data;const period=`${p.year}-${String(p.month).padStart(2,'0')}-01`;
  await pool.query(`INSERT INTO payroll_adjustments(user_id,period_start,base_override_vnd,completion_rate,other_income_vnd,late_penalty_vnd,loss_penalty_vnd,insurance_vnd,advance_vnd,holdback_vnd) VALUES($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(user_id,period_start) DO UPDATE SET base_override_vnd=EXCLUDED.base_override_vnd,completion_rate=EXCLUDED.completion_rate,other_income_vnd=EXCLUDED.other_income_vnd,late_penalty_vnd=EXCLUDED.late_penalty_vnd,loss_penalty_vnd=EXCLUDED.loss_penalty_vnd,insurance_vnd=EXCLUDED.insurance_vnd,advance_vnd=EXCLUDED.advance_vnd,holdback_vnd=EXCLUDED.holdback_vnd,updated_at=now()`,[req.params.userId,period,p.baseOverride,p.completionRate,p.otherIncome,p.latePenalty,p.lossPenalty,p.insurance,p.advance,p.holdback]);res.json({ok:true});
}));
app.post('/api/tasks',roles('admin'),asyncRoute(async(req,res)=>{
  const b=z.object({assigneeUserId:z.string().uuid(),title:z.string().trim().min(1).max(160),description:z.string().max(1000).default(''),deadline:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).safeParse(req.body);
  if(!b.success)return res.status(400).json({error:'Vui lòng kiểm tra nhân viên, tên công việc và deadline.'});
  const check=await pool.query("SELECT id FROM users WHERE id=$1 AND active=true AND role IN ('staff','manager')",[b.data.assigneeUserId]);
  if(!check.rowCount)return res.status(400).json({error:'Chỉ có thể giao việc cho nhân viên hoặc quản lý đang hoạt động.'});
  const {rows}=await pool.query(`INSERT INTO assigned_tasks(assignee_user_id,title,description,deadline,created_by) VALUES($1,$2,$3,$4::date,$5) RETURNING id,assignee_user_id AS "assigneeUserId",title,description,to_char(deadline,'YYYY-MM-DD') AS deadline,completed_at AS "completedAt"`,[b.data.assigneeUserId,b.data.title,b.data.description, b.data.deadline,req.session.user!.id]);
  res.status(201).json({task:rows[0]});
}));
app.patch('/api/tasks/:id/completion',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});
  const b=z.object({completed:z.boolean()}).safeParse(req.body);if(!b.success)return res.status(400).json({error:'Trạng thái hoàn thành không hợp lệ.'});
  const {rows}=await pool.query(`WITH changed AS (UPDATE assigned_tasks SET completed_at=CASE WHEN $1 THEN now() ELSE NULL END WHERE id=$2 AND assignee_user_id=$3 AND (deadline >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date OR completed_at IS NOT NULL) AND (($1 AND completed_at IS NULL) OR (NOT $1 AND completed_at IS NOT NULL)) RETURNING id,completed_at,assignee_user_id),reward AS (INSERT INTO pet_settings(user_id,food_count) SELECT assignee_user_id,1 FROM changed WHERE $1 AND completed_at IS NOT NULL ON CONFLICT(user_id) DO UPDATE SET food_count=pet_settings.food_count+1,updated_at=now() RETURNING user_id) SELECT id,completed_at AS "completedAt" FROM changed`,[b.data.completed,req.params.id,req.session.user.id]);
  if(!rows[0])return res.status(409).json({error:'Không tìm thấy công việc của bạn hoặc công việc đã quá deadline.'});
  res.json({task:rows[0]});
}));
app.delete('/api/tasks/:id',roles('admin'),asyncRoute(async(req,res)=>{
  const {rowCount}=await pool.query('DELETE FROM assigned_tasks WHERE id=$1',[req.params.id]);
  if(!rowCount)return res.status(404).json({error:'Không tìm thấy công việc.'});res.status(204).end();
}));
app.get('/api/pet',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});const userId=req.session.user.id;
  const {rows}=await pool.query(`SELECT COALESCE(p.pet_type,'cat') AS "petType",COALESCE(p.food_count,0) AS "foodCount",(p.fed_date=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS "fedToday",count(t.id) FILTER(WHERE t.completed_at IS NOT NULL AND (t.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date<=t.deadline)::int AS "onTimeTasks",count(t.id) FILTER(WHERE (t.completed_at IS NULL AND t.deadline<(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) OR (t.completed_at IS NOT NULL AND (t.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date>t.deadline))::int AS "lateTasks" FROM users u LEFT JOIN pet_settings p ON p.user_id=u.id LEFT JOIN assigned_tasks t ON t.assignee_user_id=u.id WHERE u.id=$1 GROUP BY p.pet_type,p.food_count,p.fed_date`,[userId]);const p=rows[0];const total=Number(p.onTimeTasks)+Number(p.lateTasks);const mood=total===0?'relaxed':Number(p.onTimeTasks)/total>=.5?'happy':'sad';res.json({pet:{...p,mood}});
}));
app.put('/api/pet',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});const b=z.object({petType:z.enum(['cat','dog','rabbit','panda','fox','frog','bear','unicorn'])}).safeParse(req.body);if(!b.success)return res.status(400).json({error:'Loại pet không hợp lệ.'});
  const {rows}=await pool.query('INSERT INTO pet_settings(user_id,pet_type) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET pet_type=EXCLUDED.pet_type,updated_at=now() RETURNING pet_type AS "petType",food_count AS "foodCount",fed_date AS "fedDate"',[req.session.user.id,b.data.petType]);res.json({pet:rows[0]});
}));
app.post('/api/pet/feed',asyncRoute(async(req,res)=>{
  if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});const {rows}=await pool.query(`UPDATE pet_settings SET food_count=food_count-1,fed_date=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,updated_at=now() WHERE user_id=$1 AND food_count>0 AND (fed_date IS NULL OR fed_date<>(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) RETURNING food_count AS "foodCount"`,[req.session.user.id]);if(!rows[0])return res.status(409).json({error:'Chưa có thức ăn hoặc hôm nay pet đã được ăn.'});res.json({pet:{...rows[0],excited:true}});
}));
app.get('/api/reminders',asyncRoute(async(req,res)=>{if(!req.session.user)return res.status(401).json({error:'Vui lòng đăng nhập.'});const u=req.session.user;const {rows}=await pool.query(`SELECT r.id,r.user_id AS "userId",u.username,u.display_name AS "displayName",r.title,r.description,r.created_at AS "createdAt" FROM daily_reminders r LEFT JOIN users u ON u.id=r.user_id WHERE r.active=true AND ($1='admin' OR r.user_id IS NULL OR r.user_id=$2) ORDER BY r.created_at DESC`,[u.role,u.id]);res.json({reminders:rows});}));
app.post('/api/reminders/claim',roles('staff','manager'),asyncRoute(async(req,res)=>{const b=z.object({slot:z.enum(['09','14'])}).safeParse(req.body);if(!b.success)return res.status(400).json({error:'Khung giờ nhắc việc không hợp lệ.'});const {rowCount}=await pool.query("INSERT INTO reminder_prompts(user_id,prompt_date,slot) VALUES($1,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,$2) ON CONFLICT(user_id,prompt_date,slot) DO NOTHING",[req.session.user!.id,b.data.slot]);res.json({shouldShow:Boolean(rowCount)});}));
app.post('/api/reminders',roles('admin'),asyncRoute(async(req,res)=>{const b=z.object({userId:z.string().uuid().nullable(),title:z.string().trim().min(1).max(160),description:z.string().max(500).default('')}).safeParse(req.body);if(!b.success)return res.status(400).json({error:'Thông tin nhắc việc không hợp lệ.'});const {rows}=await pool.query('INSERT INTO daily_reminders(user_id,title,description,created_by) VALUES($1,$2,$3,$4) RETURNING id,user_id AS "userId",title,description,created_at AS "createdAt"',[b.data.userId,b.data.title,b.data.description,req.session.user!.id]);res.status(201).json({reminder:rows[0]});}));
app.delete('/api/reminders/:id',roles('admin'),asyncRoute(async(req,res)=>{const r=await pool.query('UPDATE daily_reminders SET active=false WHERE id=$1 AND active=true RETURNING id',[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'Không tìm thấy nhắc việc.'});res.status(204).end();}));
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
