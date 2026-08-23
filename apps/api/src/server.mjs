import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pool, query, transaction } from './db.mjs';
import { newToken, passwordAcceptable, passwordHash, passwordValid, safeUser, tokenHash, tokenHashes } from './security.mjs';

const port = Number(process.env.PORT || 4000); const host = process.env.HOST || '0.0.0.0'; const production = process.env.NODE_ENV === 'production';
const origins = new Set((process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:8081').split(',').map((v) => v.trim()));
const accessMinutes = Number(process.env.ACCESS_TOKEN_MINUTES || 15); const refreshDays = Number(process.env.REFRESH_TOKEN_DAYS || 30); const maxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS || 5); const rateMinutes = Number(process.env.LOGIN_WINDOW_MINUTES || 15);
const developmentCredentials = [['user-admin','admin','Promise Gatsi','Promise','GATSI',['branch-cbd'],null],['user-mary','staff','Mary Dube','Mary','DUBE',['branch-avondale'],null],['user-tinashe','staff','Tinashe Moyo','Tinashe','MOYO',['branch-murewa'],null],['user-rudo-staff','staff','Rudo Nyathi','RudoStaff','NYATHI',['branch-cbd'],null],['user-customer','customer','Rudo Chikowore','Rudo','CHIKOWORE',['branch-cbd'],'customer-rudo']];
if (production && (!process.env.INITIAL_ADMIN_USERNAME || !process.env.INITIAL_ADMIN_PASSWORD)) throw new Error('INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD are required in production.');
const credentials = production ? [['user-admin','admin','Promise Gatsi',process.env.INITIAL_ADMIN_USERNAME,process.env.INITIAL_ADMIN_PASSWORD,['branch-cbd'],null]] : developmentCredentials;
const emptyState = { version: 1, activeUserId: null, activeBranchId: 'branch-cbd', branches: [{ id:'branch-cbd',name:'Harare CBD Branch',shortName:'Harare CBD',address:'12 Jason Moyo Avenue, Harare',phone:'+263 77 410 2201',managerId:'user-admin',active:true },{ id:'branch-avondale',name:'Avondale Branch',shortName:'Avondale',address:'8 King George Road, Avondale',phone:'+263 77 410 2202',managerId:'user-mary',active:true },{ id:'branch-murewa',name:'Murewa Branch',shortName:'Murewa',address:'Stand 41, Murewa Centre',phone:'+263 77 410 2203',managerId:'user-tinashe',active:true }], users: [], customers: [{ id:'customer-rudo',name:'Rudo Chikowore',phone:'+263 77 555 0199',email:'rudo@example.com',address:'32 Fife Avenue, Harare',joinedAt:new Date().toISOString(),branchId:'branch-cbd',loyaltyPoints:185 }], services: [], orders: [], payments: [], pickupRequests: [], inventory: [], activities: [] };

const nowPlus = (amount, unit) => new Date(Date.now() + amount * unit); const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const response = (res,status,body,origin) => { res.writeHead(status,{ 'content-type':'application/json; charset=utf-8','access-control-allow-origin':origin || '','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS',vary:'Origin','x-content-type-options':'nosniff','referrer-policy':'no-referrer','cache-control':'no-store' }); res.end(JSON.stringify(body)); };
const bodyOf = async (req) => { if (req.body !== undefined) { if (Buffer.isBuffer(req.body)) return req.body.length ? JSON.parse(req.body.toString('utf8')) : {}; if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {}; return req.body || {}; } const chunks=[]; let size=0; for await (const chunk of req) { size += chunk.length; if (size > 1_000_000) throw Object.assign(new Error('Request is too large.'),{status:413}); chunks.push(chunk); } return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; };
const audit = (client,userId,event,req,metadata={},entityType=null,entityId=null) => client.query('INSERT INTO audit_logs(id,user_id,event,entity_type,entity_id,ip_address,user_agent,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),userId,event,entityType,entityId,ipOf(req),req.headers['user-agent'] || '',JSON.stringify(metadata)]);
const reportError = async (error, req) => { console.error(JSON.stringify({ level:'error',message:error.message,stack:error.stack,path:req?.url,time:new Date().toISOString() })); if (!process.env.ERROR_WEBHOOK_URL) return; try { await fetch(process.env.ERROR_WEBHOOK_URL,{ method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({service:'gatsi-api',environment:process.env.APP_ENV || process.env.NODE_ENV || 'development',message:error.message,stack:error.stack,path:req?.url}) }); } catch {} };

async function migrate() { await query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'); const { readdir, readFile } = await import('node:fs/promises'); const { dirname, resolve } = await import('node:path'); const { fileURLToPath } = await import('node:url'); const dir=resolve(dirname(fileURLToPath(import.meta.url)),'../migrations'); const applied=new Set((await query('SELECT version FROM schema_migrations')).rows.map(r=>r.version)); for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()){if(applied.has(file))continue;const sql=await readFile(resolve(dir,file),'utf8');await transaction(async c=>{await c.query(sql);await c.query('INSERT INTO schema_migrations(version) VALUES($1)',[file]);});} }
async function seed() { await transaction(async c => { await c.query("INSERT INTO app_state(singleton,payload) VALUES(true,$1) ON CONFLICT(singleton) DO NOTHING",[JSON.stringify(emptyState)]); for(const [id,role,name,username,password,branchIds,customerId] of credentials){const profile={id,role,name,username,branchIds,customerId,email:'',phone:'',avatarColor:'#008D4C',verified:true,active:true};await c.query('INSERT INTO users(id,username,username_normalized,password_hash,role,verified_at,active,profile) VALUES($1,$2,$3,$4,$5,now(),true,$6) ON CONFLICT(id) DO NOTHING',[id,username,username.toLowerCase(),passwordHash(password),role,JSON.stringify(profile)]);} const state=(await c.query('SELECT payload FROM app_state WHERE singleton=true')).rows[0].payload;if(!state.users?.length){state.users=credentials.map(([id,role,name,username,,branchIds,customerId])=>({id,role,name,username,branchIds,customerId,email:'',phone:'',avatarColor:'#008D4C',verified:true,active:true}));await c.query('UPDATE app_state SET payload=$1,updated_at=now() WHERE singleton=true',[JSON.stringify(state)]);} }); }
const loadState = async (client=pool) => (await client.query('SELECT payload FROM app_state WHERE singleton=true')).rows[0].payload;
const publicUsers = (state) => ({...state,users:state.users.map(({password,passwordHash,...u})=>u)});
const scoped = (state,user) => {
  const branchIds=user.role==='admin'?state.branches.map(b=>b.id):user.profile.branchIds||[];
  const orders=user.role==='customer'?state.orders.filter(o=>o.customerId===user.profile.customerId):state.orders.filter(o=>branchIds.includes(o.branchId));
  const ids=new Set(orders.map(o=>o.id));
  const users=state.users.filter((candidate)=>{
    if(user.role==='admin'||candidate.id===user.id)return true;
    if(candidate.role==='staff'&&candidate.active===false)return false;
    return (candidate.branchIds||[]).some(id=>branchIds.includes(id));
  });
  return publicUsers({...state,activeUserId:user.id,activeBranchId:user.role==='admin'?'all':branchIds[0],branches:state.branches.filter(b=>branchIds.includes(b.id)),users,customers:user.role==='customer'?state.customers.filter(c=>c.id===user.profile.customerId):state.customers.filter(c=>branchIds.includes(c.branchId)),orders,payments:state.payments.filter(p=>ids.has(p.orderId)),pickupRequests:user.role==='customer'?state.pickupRequests.filter(p=>p.customerId===user.profile.customerId):state.pickupRequests.filter(p=>branchIds.includes(p.branchId)),inventory:user.role==='customer'?[]:state.inventory.filter(i=>branchIds.includes(i.branchId)),activities:user.role==='customer'?[]:state.activities.filter(a=>branchIds.includes(a.branchId))});
};
const canBranch=(user,id)=>user.role==='admin'||(user.profile.branchIds||[]).includes(id);
const activity=(branchId,userId,message,kind)=>({id:`activity-${randomUUID()}`,branchId,userId,message,kind,at:new Date().toISOString()});
const fail=(message,status=422)=>Object.assign(new Error(message),{status});
const requireAdmin=(user)=>{if(user.role!=='admin')throw fail('Administrator access required.',403);};
const textValue=(value,max=200)=>String(value??'').trim().slice(0,max);
const staffUsername=/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
const validStaffBranches=(state,value)=>{
  if(!Array.isArray(value))throw fail('At least one active branch is required.');
  const branchIds=[...new Set(value.map(id=>textValue(id,128)).filter(Boolean))];
  if(!branchIds.length)throw fail('At least one active branch is required.');
  const activeIds=new Set(state.branches.filter(branch=>branch.active).map(branch=>branch.id));
  if(branchIds.some(id=>!activeIds.has(id)))throw fail('Every staff branch must exist and be active.');
  return branchIds;
};
const setStateUser=(state,profile)=>{const index=state.users.findIndex(item=>item.id===profile.id);if(index===-1)state.users.unshift(profile);else state.users[index]=profile;};

async function mutate(user,action,req){return transaction(async c=>{
  const state=(await c.query('SELECT payload FROM app_state WHERE singleton=true FOR UPDATE')).rows[0].payload;
  let auditMetadata={};let auditEntityType='action';let auditEntityId=action.type;
  if(action.type==='CREATE_CUSTOMER'){
    if(user.role!=='admin'||!canBranch(user,action.customer?.branchId))throw fail('Not authorized.',403);
    if(!action.user?.username||!action.user?.password)throw fail('Login details are required.');
    const normalized=action.user.username.toLowerCase();
    if((await c.query('SELECT 1 FROM users WHERE username_normalized=$1',[normalized])).rowCount)throw fail('Username already exists.',409);
    const profile={...action.user,password:undefined,verified:false,active:true};
    await c.query('INSERT INTO users(id,username,username_normalized,password_hash,role,email,phone,active,profile) VALUES($1,$2,$3,$4,$5,$6,$7,true,$8)',[profile.id,profile.username,normalized,passwordHash(action.user.password),profile.role,profile.email,profile.phone,JSON.stringify(profile)]);
    state.customers.unshift(action.customer);state.users.unshift(profile);await issueOneTime(c,profile.id,'account_verification',profile.email,profile.phone,req);
  }
  else if(action.type==='CREATE_STAFF'){
    requireAdmin(user);
    const incoming=action.user||{};
    const id=textValue(incoming.id,128),name=textValue(incoming.name),username=textValue(incoming.username,64);
    const email=textValue(incoming.email,254),phone=textValue(incoming.phone,64),jobTitle=textValue(incoming.jobTitle,120);
    if(!id||!name)throw fail('Staff ID and name are required.');
    if(!staffUsername.test(username))throw fail('Username must be 3 to 64 characters and use only letters, numbers, dots, underscores or hyphens.');
    if(!passwordAcceptable(incoming.password))throw fail('Password must be at least 10 characters and include upper, lower and numeric characters.');
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('Email address is invalid.');
    const branchIds=validStaffBranches(state,incoming.branchIds);
    const normalized=username.toLowerCase();
    const conflict=(await c.query('SELECT id,username_normalized FROM users WHERE id=$1 OR username_normalized=$2',[id,normalized])).rows[0];
    if(conflict)throw fail(conflict.username_normalized===normalized?'Username already exists.':'Staff ID already exists.',409);
    if(state.users.some(item=>item.id===id||textValue(item.username,64).toLowerCase()===normalized))throw fail('Staff account already exists.',409);
    const profile={id,role:'staff',name,email,phone,branchIds,jobTitle,avatarColor:textValue(incoming.avatarColor,32)||'#1677ff',clockedIn:false,username,verified:true,active:true};
    await c.query("INSERT INTO users(id,username,username_normalized,password_hash,role,email,phone,verified_at,active,profile) VALUES($1,$2,$3,$4,'staff',$5,$6,now(),true,$7)",[id,username,normalized,passwordHash(incoming.password),email,phone,JSON.stringify(profile)]);
    state.users.unshift(profile);state.activities.unshift(activity(branchIds[0],user.id,`added ${name} to the team`,'staff'));
    auditMetadata={username,branchIds};auditEntityType='user';auditEntityId=id;
  }
  else if(action.type==='ARCHIVE_STAFF'){
    requireAdmin(user);
    const userId=textValue(action.userId,128);if(!userId)throw fail('Staff user ID is required.');
    const account=(await c.query("SELECT id,role,active,profile FROM users WHERE id=$1 FOR UPDATE",[userId])).rows[0];
    if(!account||account.role!=='staff')throw fail('Staff account was not found.',404);
    if(!account.active)throw fail('Staff account is already archived.',409);
    const stateAccount=state.users.find(item=>item.id===userId);
    const before={active:true,branchIds:stateAccount?.branchIds||account.profile.branchIds||[]};
    const archivedAt=new Date().toISOString();
    const profile={...account.profile,...stateAccount,id:userId,role:'staff',active:false,clockedIn:false,archivedAt,archivedByUserId:user.id};
    delete profile.password;delete profile.restoredAt;delete profile.restoredByUserId;
    await c.query('UPDATE users SET active=false,profile=$2,updated_at=now() WHERE id=$1',[userId,JSON.stringify(profile)]);
    await c.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',[userId]);
    await c.query('UPDATE one_time_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1',[userId]);
    setStateUser(state,profile);state.activities.unshift(activity((profile.branchIds||[])[0]||state.activeBranchId,user.id,`archived ${profile.name}'s team account`,'staff'));
    auditMetadata={before,after:{active:false,branchIds:profile.branchIds},archivedAt};auditEntityType='user';auditEntityId=userId;
  }
  else if(action.type==='RESTORE_STAFF'){
    requireAdmin(user);
    const userId=textValue(action.userId,128);if(!userId)throw fail('Staff user ID is required.');
    const account=(await c.query("SELECT id,role,active,profile FROM users WHERE id=$1 FOR UPDATE",[userId])).rows[0];
    if(!account||account.role!=='staff')throw fail('Staff account was not found.',404);
    if(account.active)throw fail('Staff account is already active.',409);
    const stateAccount=state.users.find(item=>item.id===userId);
    const existing={...account.profile,...stateAccount,id:userId,role:'staff'};
    const branchIds=validStaffBranches(state,action.branchIds===undefined?existing.branchIds:action.branchIds);
    const passwordChanged=action.password!==undefined;
    if(passwordChanged&&!passwordAcceptable(action.password))throw fail('Password must be at least 10 characters and include upper, lower and numeric characters.');
    const restoredAt=new Date().toISOString();
    const profile={...existing,branchIds,active:true,clockedIn:false,restoredAt,restoredByUserId:user.id};
    delete profile.password;delete profile.archivedAt;delete profile.archivedByUserId;
    if(passwordChanged)await c.query('UPDATE users SET active=true,password_hash=$2,profile=$3,updated_at=now() WHERE id=$1',[userId,passwordHash(action.password),JSON.stringify(profile)]);
    else await c.query('UPDATE users SET active=true,profile=$2,updated_at=now() WHERE id=$1',[userId,JSON.stringify(profile)]);
    await c.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',[userId]);
    await c.query('UPDATE one_time_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1',[userId]);
    setStateUser(state,profile);state.activities.unshift(activity(branchIds[0],user.id,`restored ${profile.name}'s team account`,'staff'));
    auditMetadata={before:{active:false,branchIds:existing.branchIds||[]},after:{active:true,branchIds},passwordChanged,restoredAt};auditEntityType='user';auditEntityId=userId;
  }
  else if(action.type==='UPDATE_STAFF_BRANCHES'){
    requireAdmin(user);
    const userId=textValue(action.userId,128);if(!userId)throw fail('Staff user ID is required.');
    const account=(await c.query("SELECT id,role,active,profile FROM users WHERE id=$1 FOR UPDATE",[userId])).rows[0];
    if(!account||account.role!=='staff')throw fail('Staff account was not found.',404);
    if(!account.active)throw fail('Restore this staff account before changing its branch assignment.',409);
    const branchIds=validStaffBranches(state,action.branchIds),stateAccount=state.users.find(item=>item.id===userId);
    const profile={...account.profile,...stateAccount,id:userId,role:'staff',active:true,branchIds};delete profile.password;
    const previousBranchIds=account.profile.branchIds||stateAccount?.branchIds||[];
    await c.query('UPDATE users SET profile=$2,updated_at=now() WHERE id=$1',[userId,JSON.stringify(profile)]);
    setStateUser(state,profile);state.activities.unshift(activity(branchIds[0],user.id,`updated ${profile.name}'s branch assignment`,'staff'));
    auditMetadata={before:{branchIds:previousBranchIds},after:{branchIds}};auditEntityType='user';auditEntityId=userId;
  }
  else if(action.type==='CREATE_ORDER'){if(user.role==='customer'||!canBranch(user,action.order?.branchId))throw fail('Not authorized.',403);state.orders.unshift(action.order);state.activities.unshift(activity(action.order.branchId,user.id,`created ${action.order.number}`,'order'));}
  else if(action.type==='UPDATE_ORDER_STATUS'){const o=state.orders.find(x=>x.id===action.orderId);if(!o||user.role==='customer'||!canBranch(user,o.branchId))throw fail('Not authorized.',403);o.status=action.status;if(action.status==='collected')o.collectedAt=new Date().toISOString();o.events.push({id:`event-${randomUUID()}`,status:action.status,at:new Date().toISOString(),byUserId:user.id,note:action.note});}
  else if(action.type==='ADD_PAYMENT'){const o=state.orders.find(x=>x.id===action.payment?.orderId);if(!o||user.role==='customer'||!canBranch(user,o.branchId)||!(action.payment.amount>0))throw fail('Invalid payment or permission.',403);state.payments.unshift({...action.payment,receivedByUserId:user.id});}
  else if(action.type==='CREATE_PICKUP'){if((user.role==='customer'&&action.request?.customerId!==user.profile.customerId)||!canBranch(user,action.request?.branchId))throw fail('Not authorized.',403);state.pickupRequests.unshift(action.request);}
  else if(action.type==='UPDATE_PICKUP'){const p=state.pickupRequests.find(x=>x.id===action.requestId);if(!p||user.role==='customer'||!canBranch(user,p.branchId))throw fail('Not authorized.',403);p.status=action.status;}
  else if(action.type==='ADJUST_INVENTORY'){const i=state.inventory.find(x=>x.id===action.itemId);if(!i||user.role==='customer'||!canBranch(user,i.branchId))throw fail('Not authorized.',403);i.quantity=Math.max(0,i.quantity+Number(action.delta));}
  else if(action.type==='CLOCK_TOGGLE'){const target=state.users.find(x=>x.id===action.userId);if(!target||target.active===false||(user.role!=='admin'&&user.id!==target.id))throw fail('Not authorized.',403);target.clockedIn=!target.clockedIn;if(target.clockedIn)target.lastClockIn=new Date().toISOString();}
  else throw fail('Unsupported action.');
  await c.query('UPDATE app_state SET payload=$1,updated_at=now() WHERE singleton=true',[JSON.stringify(state)]);
  await audit(c,user.id,`action.${action.type.toLowerCase()}`,req,auditMetadata,auditEntityType,auditEntityId);
  return scoped(state,user);
});}

async function rateCheck(client,key){const hash=tokenHash(key);const row=(await client.query('SELECT * FROM login_limits WHERE key_hash=$1',[hash])).rows[0];if(row?.blocked_until&&new Date(row.blocked_until)>new Date())throw Object.assign(new Error('Too many sign-in attempts. Try again later.'),{status:429});return hash;}
async function rateFailure(client,hash){await client.query(`INSERT INTO login_limits(key_hash,attempts,window_started_at) VALUES($1,1,now()) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN login_limits.window_started_at < now()-($2||' minutes')::interval THEN 1 ELSE login_limits.attempts+1 END,window_started_at=CASE WHEN login_limits.window_started_at < now()-($2||' minutes')::interval THEN now() ELSE login_limits.window_started_at END,blocked_until=CASE WHEN login_limits.attempts+1 >= $3 THEN now()+($2||' minutes')::interval ELSE login_limits.blocked_until END`,[hash,String(rateMinutes),maxAttempts]);}
async function session(client,user,req,familyId=randomUUID()){const id=randomUUID(),accessToken=newToken(),refreshToken=newToken();await client.query(`INSERT INTO auth_sessions(id,family_id,user_id,access_token_hash,refresh_token_hash,access_expires_at,refresh_expires_at,ip_address,user_agent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,familyId,user.id,tokenHash(accessToken),tokenHash(refreshToken),nowPlus(accessMinutes,60000),nowPlus(refreshDays,86400000),ipOf(req),req.headers['user-agent']||'']);return{id,accessToken,refreshToken,accessExpiresAt:nowPlus(accessMinutes,60000).toISOString(),refreshExpiresAt:nowPlus(refreshDays,86400000).toISOString()};}
async function authUser(req){const token=req.headers.authorization?.replace(/^Bearer\s+/i,'');if(!token)return null;const hashes=tokenHashes(token);const found=await query(`SELECT u.* FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.access_token_hash=ANY($1) AND s.revoked_at IS NULL AND s.access_expires_at>now() AND u.active=true`,[hashes]);return found.rows[0]||null;}
async function issueOneTime(client,userId,purpose,email,phone,req){const raw=newToken();await client.query('DELETE FROM one_time_tokens WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL',[userId,purpose]);await client.query('INSERT INTO one_time_tokens(id,user_id,purpose,token_hash,expires_at) VALUES($1,$2,$3,$4,$5)',[randomUUID(),userId,purpose,tokenHash(raw),nowPlus(purpose==='password_reset'?30:1440,60000)]);const channel=email?'email':'sms',destination=email||phone;if(destination){const payload={token:raw,purpose},notificationId=randomUUID();await client.query('INSERT INTO notification_outbox(id,channel,destination,template,payload) VALUES($1,$2,$3,$4,$5)',[notificationId,channel,destination,purpose,JSON.stringify(payload)]);void deliver(notificationId,channel,destination,purpose,payload);}await audit(client,userId,`${purpose}.requested`,req);return production?undefined:raw;}
async function deliver(id,channel,destination,template,payload){if(!process.env.NOTIFICATION_WEBHOOK_URL)return;const body=JSON.stringify({channel,destination,template,payload});const signature=createHmac('sha256',process.env.NOTIFICATION_WEBHOOK_SECRET_CURRENT||'development').update(body).digest('hex');try{const result=await fetch(process.env.NOTIFICATION_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json','x-gatsi-signature':signature},body});if(!result.ok)throw new Error(`Notification webhook returned ${result.status}`);await query('UPDATE notification_outbox SET delivered_at=now(),attempts=attempts+1 WHERE id=$1',[id]);}catch(error){await query('UPDATE notification_outbox SET attempts=attempts+1,last_error=$2 WHERE id=$1',[id,error.message]);await reportError(error);}}

let initialization;
const initialize = () => initialization ||= (async () => { if (!process.env.VERCEL) await migrate(); await seed(); })();
const handler=async(req,res)=>{const origin=origins.has(req.headers.origin)?req.headers.origin:'';if(req.method==='OPTIONS')return response(res,204,{},origin);try{await initialize();const url=new URL(req.url,`http://${req.headers.host}`);if(url.pathname==='/api/health'&&req.method==='GET'){await query('SELECT 1');return response(res,200,{ok:true,service:'gatsi-api',environment:process.env.APP_ENV||'development'},origin);}if(url.pathname==='/api/auth/login'&&req.method==='POST'){const b=await bodyOf(req),normalized=String(b.username||'').trim().toLowerCase();const result=await transaction(async c=>{const limit=await rateCheck(c,`${ipOf(req)}:${normalized}`);const user=(await c.query('SELECT * FROM users WHERE username_normalized=$1',[normalized])).rows[0];if(!user||!passwordValid(String(b.password||''),user.password_hash)){await rateFailure(c,limit);await audit(c,user?.id||null,'auth.login_failed',req,{username:normalized});return{failed:true};}if(!user.active||!user.verified_at)return{forbidden:true};await c.query('DELETE FROM login_limits WHERE key_hash=$1',[limit]);const tokens=await session(c,user,req);await audit(c,user.id,'auth.login_succeeded',req);return{user,tokens};});if(result.failed)throw Object.assign(new Error('Username or password is incorrect.'),{status:401});if(result.forbidden)throw Object.assign(new Error('Account is inactive or unverified.'),{status:403});const state=scoped(await loadState(),result.user);return response(res,200,{...result.tokens,user:safeUser(result.user),state},origin);}
if(url.pathname==='/api/auth/refresh'&&req.method==='POST'){const {refreshToken}=await bodyOf(req);const hashes=tokenHashes(String(refreshToken||''));const result=await transaction(async c=>{const old=(await c.query('SELECT * FROM auth_sessions WHERE refresh_token_hash=ANY($1)',[hashes])).rows[0];if(!old||old.refresh_expires_at<new Date())return{invalid:true};if(old.revoked_at){await c.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE family_id=$1',[old.family_id]);return{reused:true};}const user=(await c.query('SELECT * FROM users WHERE id=$1 AND active=true',[old.user_id])).rows[0];if(!user)return{invalid:true};const fresh=await session(c,user,req,old.family_id);await c.query('UPDATE auth_sessions SET revoked_at=now(),replaced_by=$1,last_used_at=now() WHERE id=$2',[fresh.id,old.id]);await audit(c,user.id,'auth.token_refreshed',req);return{fresh,user};});if(result.invalid)throw Object.assign(new Error('Refresh token is invalid or expired.'),{status:401});if(result.reused)throw Object.assign(new Error('Refresh token reuse detected. Sign in again.'),{status:401});return response(res,200,{...result.fresh,user:safeUser(result.user),state:scoped(await loadState(),result.user)},origin);}
if(url.pathname==='/api/auth/password-reset/request'&&req.method==='POST'){const b=await bodyOf(req);const debug=await transaction(async c=>{const value=String(b.identifier||'').toLowerCase();const user=(await c.query('SELECT * FROM users WHERE username_normalized=$1 OR lower(email)=$1 OR phone=$2',[value,String(b.identifier||'')])).rows[0];return user?issueOneTime(c,user.id,'password_reset',user.email,user.phone,req):undefined;});return response(res,202,{ok:true,...(debug?{debugToken:debug}:{})},origin);}
if(url.pathname==='/api/auth/password-reset/confirm'&&req.method==='POST'){const b=await bodyOf(req);if(!passwordAcceptable(b.newPassword))throw new Error('Password must be at least 10 characters and include upper, lower and numeric characters.');await transaction(async c=>{const token=(await c.query("SELECT * FROM one_time_tokens WHERE token_hash=ANY($1) AND purpose='password_reset' AND used_at IS NULL AND expires_at>now() FOR UPDATE",[tokenHashes(String(b.token||''))])).rows[0];if(!token)throw Object.assign(new Error('Reset token is invalid or expired.'),{status:400});await c.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[passwordHash(b.newPassword),token.user_id]);await c.query('UPDATE one_time_tokens SET used_at=now() WHERE id=$1',[token.id]);await c.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',[token.user_id]);await audit(c,token.user_id,'password_reset.completed',req);});return response(res,200,{ok:true},origin);}
if(url.pathname==='/api/auth/verification/confirm'&&req.method==='POST'){const b=await bodyOf(req);await transaction(async c=>{const token=(await c.query("SELECT * FROM one_time_tokens WHERE token_hash=ANY($1) AND purpose='account_verification' AND used_at IS NULL AND expires_at>now() FOR UPDATE",[tokenHashes(String(b.token||''))])).rows[0];if(!token)throw Object.assign(new Error('Verification token is invalid or expired.'),{status:400});const account=(await c.query('SELECT profile FROM users WHERE id=$1 FOR UPDATE',[token.user_id])).rows[0];account.profile={...account.profile,verified:true};await c.query('UPDATE users SET verified_at=now(),profile=$2,updated_at=now() WHERE id=$1',[token.user_id,JSON.stringify(account.profile)]);const state=(await c.query('SELECT payload FROM app_state WHERE singleton=true FOR UPDATE')).rows[0].payload;const stateUser=state.users.find(item=>item.id===token.user_id);if(stateUser)stateUser.verified=true;await c.query('UPDATE app_state SET payload=$1,updated_at=now() WHERE singleton=true',[JSON.stringify(state)]);await c.query('UPDATE one_time_tokens SET used_at=now() WHERE id=$1',[token.id]);await audit(c,token.user_id,'account_verification.completed',req);});return response(res,200,{ok:true},origin);}
const user=await authUser(req);if(!user)throw Object.assign(new Error('Authentication required.'),{status:401});if(url.pathname==='/api/admin/customers/verify'&&req.method==='POST'){if(user.role!=='admin')throw Object.assign(new Error('Administrator access required.'),{status:403});if(process.env.NOTIFICATION_WEBHOOK_URL)throw Object.assign(new Error('This account must use the delivered verification code.'),{status:409});const b=await bodyOf(req);const verified=await transaction(async c=>{const target=(await c.query("SELECT id,profile FROM users WHERE id=$1 AND role='customer' AND active=true FOR UPDATE",[String(b.userId||'')])).rows[0];if(!target)throw Object.assign(new Error('Customer account was not found.'),{status:404});target.profile={...target.profile,verified:true};await c.query('UPDATE users SET verified_at=COALESCE(verified_at,now()),profile=$2,updated_at=now() WHERE id=$1',[target.id,JSON.stringify(target.profile)]);await c.query("UPDATE one_time_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1 AND purpose='account_verification'",[target.id]);const state=(await c.query('SELECT payload FROM app_state WHERE singleton=true FOR UPDATE')).rows[0].payload;const stateUser=state.users.find(item=>item.id===target.id);if(stateUser)stateUser.verified=true;await c.query('UPDATE app_state SET payload=$1,updated_at=now() WHERE singleton=true',[JSON.stringify(state)]);await audit(c,user.id,'account_verification.admin_completed',req,{},'user',target.id);return state;});return response(res,200,scoped(verified,user),origin);}if(url.pathname==='/api/auth/logout'&&req.method==='POST'){await transaction(async c=>{const hashes=tokenHashes(req.headers.authorization.replace(/^Bearer\s+/i,''));await c.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE access_token_hash=ANY($1)',[hashes]);await audit(c,user.id,'auth.logout',req);});return response(res,200,{ok:true},origin);}if(url.pathname==='/api/state'&&req.method==='GET')return response(res,200,scoped(await loadState(),user),origin);if(url.pathname==='/api/audit'&&req.method==='GET'){if(user.role!=='admin')throw Object.assign(new Error('Administrator access required.'),{status:403});const rows=(await query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500')).rows;return response(res,200,{items:rows},origin);}if(url.pathname==='/api/actions'&&req.method==='POST')return response(res,200,await mutate(user,await bodyOf(req),req),origin);if(url.pathname==='/api/bootstrap'&&req.method==='POST'){if(user.role!=='admin')throw Object.assign(new Error('Administrator access required.'),{status:403});const incoming=await bodyOf(req);const result=await transaction(async c=>{const current=(await c.query('SELECT payload FROM app_state WHERE singleton=true FOR UPDATE')).rows[0].payload;if(current.services.length||current.orders.length)throw Object.assign(new Error('Backend is already initialized.'),{status:409});for(const k of ['branches','customers','services','orders','payments','pickupRequests','inventory','activities'])if(Array.isArray(incoming[k]))current[k]=incoming[k];await c.query('UPDATE app_state SET payload=$1,updated_at=now() WHERE singleton=true',[JSON.stringify(current)]);await audit(c,user.id,'system.bootstrap',req);return current;});return response(res,200,scoped(result,user),origin);}throw Object.assign(new Error('Route not found.'),{status:404});}catch(error){const status=error.status||422;if(status>=500)await reportError(error,req);else console.warn(JSON.stringify({level:'warning',message:error.message,path:req.url,status,time:new Date().toISOString()}));return response(res,status,{error:error.message||'Request failed.'},origin);}};

export default handler;

if (!process.env.VERCEL) {
  await initialize();
  const server=createServer(handler);
  server.listen(port,host,()=>console.log(JSON.stringify({level:'info',message:`Gatsi API listening on ${host}:${port}`,environment:process.env.APP_ENV||'development'})));
  const shutdown=async()=>{server.close();await pool.end();process.exit(0);};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);process.on('unhandledRejection',(error)=>void reportError(error));process.on('uncaughtException',(error)=>void reportError(error).finally(()=>process.exit(1)));
}
