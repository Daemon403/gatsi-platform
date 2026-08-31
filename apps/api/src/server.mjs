import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pool, query, transaction } from './db.mjs';
import { generateAndStoreDailyOperationsSummary, listDailyOperationsSummaries, previousHarareDateKey, validSummaryDate } from './operations-summary.mjs';
import { newToken, passwordAcceptable, passwordHash, passwordValid, safeUser, tokenHash, tokenHashes } from './security.mjs';

const port = Number(process.env.PORT || 4000); const host = process.env.HOST || '0.0.0.0'; const production = process.env.NODE_ENV === 'production';
const origins = new Set((process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:8081').split(',').map((v) => v.trim()));
const accessMinutes = Number(process.env.ACCESS_TOKEN_MINUTES || 15); const refreshDays = Number(process.env.REFRESH_TOKEN_DAYS || 30); const maxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS || 5); const rateMinutes = Number(process.env.LOGIN_WINDOW_MINUTES || 15);
const configuredIdempotencyRetentionDays = Number.parseInt(process.env.IDEMPOTENCY_RETENTION_DAYS || '365', 10);
const idempotencyRetentionDays = Number.isInteger(configuredIdempotencyRetentionDays) && configuredIdempotencyRetentionDays >= 30 ? Math.min(configuredIdempotencyRetentionDays, 3650) : 365;
if (production && (!process.env.INITIAL_ADMIN_USERNAME || !process.env.INITIAL_ADMIN_PASSWORD)) throw new Error('INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD are required in production.');
const initialAdmin = {
  id: 'user-admin',
  name: process.env.INITIAL_ADMIN_NAME || 'Promise Gatsi',
  username: process.env.INITIAL_ADMIN_USERNAME || 'Promise',
  password: process.env.INITIAL_ADMIN_PASSWORD || 'GATSI',
  email: process.env.INITIAL_ADMIN_EMAIL || '',
  phone: process.env.INITIAL_ADMIN_PHONE || '',
};
const emptyState = { version: 1, dataRevision: 2, activeUserId: null, activeBranchId: 'all', branches: [], users: [], customers: [], services: [], orders: [], payments: [], pickupRequests: [], inventory: [], clothingItems: [], clothingSales: [], activities: [], notifications: [] };

const nowPlus = (amount, unit) => new Date(Date.now() + amount * unit); const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const response = (res,status,body,origin) => { res.writeHead(status,{ 'content-type':'application/json; charset=utf-8','access-control-allow-origin':origin || '','access-control-allow-headers':'authorization,content-type,x-idempotency-key','access-control-allow-methods':'GET,POST,OPTIONS',vary:'Origin','x-content-type-options':'nosniff','referrer-policy':'no-referrer','cache-control':'no-store' }); res.end(JSON.stringify(body)); };
const bodyOf = async (req) => { if (req.body !== undefined) { if (Buffer.isBuffer(req.body)) return req.body.length ? JSON.parse(req.body.toString('utf8')) : {}; if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {}; return req.body || {}; } const chunks=[]; let size=0; for await (const chunk of req) { size += chunk.length; if (size > 1_000_000) throw Object.assign(new Error('Request is too large.'),{status:413}); chunks.push(chunk); } return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; };
const audit = (client,userId,event,req,metadata={},entityType=null,entityId=null) => client.query('INSERT INTO audit_logs(id,user_id,event,entity_type,entity_id,ip_address,user_agent,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),userId,event,entityType,entityId,ipOf(req),req.headers['user-agent'] || '',JSON.stringify(metadata)]);
const reportError = async (error, req) => { console.error(JSON.stringify({ level:'error',message:error.message,stack:error.stack,path:req?.url,time:new Date().toISOString() })); if (!process.env.ERROR_WEBHOOK_URL) return; try { await fetch(process.env.ERROR_WEBHOOK_URL,{ method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({service:'gatsi-api',environment:process.env.APP_ENV || process.env.NODE_ENV || 'development',message:error.message,stack:error.stack,path:req?.url}) }); } catch {} };

async function migrate() { await query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'); const { readdir, readFile } = await import('node:fs/promises'); const { dirname, resolve } = await import('node:path'); const { fileURLToPath } = await import('node:url'); const dir=resolve(dirname(fileURLToPath(import.meta.url)),'../migrations'); const applied=new Set((await query('SELECT version FROM schema_migrations')).rows.map(r=>r.version)); for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()){if(applied.has(file))continue;const sql=await readFile(resolve(dir,file),'utf8');await transaction(async c=>{await c.query(sql);await c.query('INSERT INTO schema_migrations(version) VALUES($1)',[file]);});} }
async function seed() { await transaction(async c => {
  await c.query("INSERT INTO app_state(singleton,payload) VALUES(true,$1) ON CONFLICT(singleton) DO NOTHING",[JSON.stringify(emptyState)]);
  const existingAdmin=(await c.query("SELECT id FROM users WHERE role='admin' ORDER BY created_at,id LIMIT 1")).rows[0];
  if(!existingAdmin){
    const profile={id:initialAdmin.id,role:'admin',name:initialAdmin.name,username:initialAdmin.username,branchIds:[],email:initialAdmin.email,phone:initialAdmin.phone,avatarColor:'#008D4C',verified:true,active:true};
    await c.query('INSERT INTO users(id,username,username_normalized,password_hash,role,email,phone,verified_at,active,profile) VALUES($1,$2,$3,$4,$5,$6,$7,now(),true,$8) ON CONFLICT DO NOTHING',[initialAdmin.id,initialAdmin.username,initialAdmin.username.toLowerCase(),passwordHash(initialAdmin.password),'admin',initialAdmin.email,initialAdmin.phone,JSON.stringify(profile)]);
  }
  const state=(await c.query('SELECT payload FROM app_state WHERE singleton=true FOR UPDATE')).rows[0].payload;
  if(!Array.isArray(state.users)||!state.users.length){
    const admins=(await c.query("SELECT id,username,email,phone,verified_at,active,profile FROM users WHERE role='admin' ORDER BY created_at,id")).rows;
    state.users=admins.map(account=>({...account.profile,id:account.id,role:'admin',name:account.profile?.name||account.username,username:account.username,email:account.email??account.profile?.email??'',phone:account.phone??account.profile?.phone??'',branchIds:[],verified:Boolean(account.verified_at),active:account.active}));
    state.version=1;state.dataRevision=2;state.activeUserId=null;state.activeBranchId='all';
    await c.query('UPDATE app_state SET payload=$1,updated_at=now() WHERE singleton=true',[JSON.stringify(state)]);
  }
}); }
const normalizeNotifications = (value) => Array.isArray(value)?value.filter(item=>item&&typeof item==='object'&&typeof item.id==='string'&&typeof item.title==='string'&&typeof item.message==='string'&&typeof item.at==='string').map(item=>({...item,recipientUserIds:Array.isArray(item.recipientUserIds)?item.recipientUserIds.filter(id=>typeof id==='string'):[],readByUserIds:Array.isArray(item.readByUserIds)?item.readByUserIds.filter(id=>typeof id==='string'):[]})).slice(0,500):[];
const normalizeClothingSales = (value) => Array.isArray(value)?value.filter(item=>item&&typeof item==='object'&&!Array.isArray(item)).map(item=>{const unitPrice=typeof item.unitPrice==='number'&&Number.isFinite(item.unitPrice)?item.unitPrice:0;return {...item,unitPrice,listUnitPrice:typeof item.listUnitPrice==='number'&&Number.isFinite(item.listUnitPrice)?item.listUnitPrice:unitPrice};}):[];
const normalizeState = (state) => ({...state,dataRevision:Number(state?.dataRevision||0),notifications:normalizeNotifications(state?.notifications),clothingItems:Array.isArray(state?.clothingItems)?state.clothingItems:[],clothingSales:normalizeClothingSales(state?.clothingSales)});
const loadState = async (client=pool) => normalizeState((await client.query('SELECT payload FROM app_state WHERE singleton=true')).rows[0].payload);
const publicUsers = (state) => ({...state,users:state.users.map(({password,passwordHash,...u})=>u)});
const scoped = (state,user) => {
  state=normalizeState(state);
  const branchIds=user.role==='admin'?state.branches.map(b=>b.id):user.profile.branchIds||[];
  const orders=user.role==='customer'?state.orders.filter(o=>o.customerId===user.profile.customerId):state.orders.filter(o=>branchIds.includes(o.branchId));
  const ids=new Set(orders.map(o=>o.id));
  const users=state.users.filter((candidate)=>{
    if(user.role==='admin'||candidate.id===user.id)return true;
    if(candidate.role==='staff'&&candidate.active===false)return false;
    return (candidate.branchIds||[]).some(id=>branchIds.includes(id));
  });
  const notifications=user.role==='admin'?state.notifications:state.notifications.filter(item=>notificationRelatesToUser(state,item,user)).map(item=>({...item,recipientUserIds:(item.recipientUserIds||[]).includes(user.id)?[user.id]:[],readByUserIds:(item.readByUserIds||[]).includes(user.id)?[user.id]:[]}));
  const visibleBranchIds=user.role==='customer'?new Set([...branchIds,...orders.map(order=>order.branchId),...state.pickupRequests.filter(item=>item.customerId===user.profile.customerId).map(item=>item.branchId)]):new Set(branchIds);
  return publicUsers({...state,activeUserId:user.id,activeBranchId:user.role==='admin'?'all':branchIds[0],branches:state.branches.filter(b=>visibleBranchIds.has(b.id)),users,customers:user.role==='customer'?state.customers.filter(c=>c.id===user.profile.customerId):state.customers.filter(c=>branchIds.includes(c.branchId)),orders,payments:state.payments.filter(p=>ids.has(p.orderId)),pickupRequests:user.role==='customer'?state.pickupRequests.filter(p=>p.customerId===user.profile.customerId):state.pickupRequests.filter(p=>branchIds.includes(p.branchId)),inventory:user.role==='customer'?[]:state.inventory.filter(i=>branchIds.includes(i.branchId)),clothingItems:user.role==='customer'?[]:state.clothingItems.filter(i=>branchIds.includes(i.branchId)),clothingSales:user.role==='customer'?[]:state.clothingSales.filter(s=>branchIds.includes(s.branchId)),activities:user.role==='customer'?[]:state.activities.filter(a=>branchIds.includes(a.branchId)),notifications});
};
const canBranch=(user,id)=>user.role==='admin'||(user.profile.branchIds||[]).includes(id);
const activity=(branchId,userId,message,kind)=>({id:`activity-${randomUUID()}`,branchId,userId,message,kind,at:new Date().toISOString()});
const notificationRelatesToUser=(state,item,user)=>user.role==='admin'||(item.recipientUserIds||[]).includes(user.id)||item.actorUserId===user.id||(user.role==='customer'&&user.profile.customerId&&item.customerId===user.profile.customerId)||(user.role==='staff'&&item.orderId&&state.orders.some(order=>order.id===item.orderId&&order.assignedStaffId===user.id));
const orderRecipientUserIds=(state,order,actorUserId)=>[...new Set([actorUserId,order.assignedStaffId,...state.users.filter(candidate=>candidate.role==='customer'&&candidate.active!==false&&candidate.customerId===order.customerId).map(candidate=>candidate.id)].filter(Boolean))];
const orderNotification=(state,order,actorUserId,title,message)=>({id:`notification-${randomUUID()}`,title,message,kind:'order',at:new Date().toISOString(),branchId:order.branchId,orderId:order.id,customerId:order.customerId,actorUserId,recipientUserIds:orderRecipientUserIds(state,order,actorUserId),readByUserIds:[]});
const addNotification=(state,item)=>{state.notifications=[item,...state.notifications].slice(0,500);};
const fail=(message,status=422)=>Object.assign(new Error(message),{status});
const requireAdmin=(user)=>{if(user.role!=='admin')throw fail('Administrator access required.',403);};
const textValue=(value,max=200)=>String(value??'').trim().slice(0,max);
const finiteNumber=(value)=>typeof value==='number'&&Number.isFinite(value)?value:0;
const integerCents=(value)=>{
  const scaled=finiteNumber(value)*100,absolute=Math.abs(scaled);
  return Math.sign(scaled)*Math.round(absolute+Number.EPSILON*Math.max(1,absolute));
};
const hasCentPrecision=(value)=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value-integerCents(value)/100)<=1e-9;
const orderSubtotalCents=(order)=>(order.items||[]).reduce((sum,item)=>sum+integerCents(finiteNumber(item.quantity)*finiteNumber(item.unitPrice)),0);
const orderTotalCents=(order)=>Math.max(0,orderSubtotalCents(order)-integerCents(order.discount)+integerCents(order.deliveryFee));
const orderPaidCents=(state,orderId)=>state.payments.filter(payment=>payment.orderId===orderId).reduce((sum,payment)=>sum+integerCents(payment.amount),0);
const clientOccurrenceTime=(value)=>{
  const now=Date.now(),parsed=Date.parse(String(value??'')),oldest=now-Math.min(idempotencyRetentionDays,365)*86_400_000;
  return Number.isFinite(parsed)&&parsed>=oldest&&parsed<=now+5*60_000?parsed:now;
};
const canonicalJson=(value)=>{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
};
const actionRequestHashes=(action)=>tokenHashes(canonicalJson(action??null));
const secureEqual=(left,right)=>{const a=Buffer.from(String(left??'')),b=Buffer.from(String(right??''));return a.length===b.length&&timingSafeEqual(a,b);};
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
const normalizedMeasurements=(value)=>{
  if(value===undefined||value===null)return undefined;
  if(!value||typeof value!=='object'||Array.isArray(value)||!['cm','in'].includes(value.unit))throw fail('Measurement unit must be centimetres or inches.');
  const fields=['height','neck','chest','waist','hips','shoulder','sleeve','inseam'];
  if(Object.keys(value).some(field=>field!=='unit'&&!fields.includes(field)))throw fail('Customer measurements contain an unsupported field.');
  const measurements={unit:value.unit};
  for(const field of fields){
    if(value[field]===undefined||value[field]===null||value[field]==='')continue;
    const measurement=value[field];
    if(typeof measurement!=='number'||!Number.isFinite(measurement)||measurement<=0||measurement>1000)throw fail(`${field[0].toUpperCase()}${field.slice(1)} measurement is invalid.`);
    measurements[field]=measurement;
  }
  return measurements;
};
async function createCustomerAccount(client,state,incomingCustomer,incomingUser){
  const customerInput=incomingCustomer||{},userInput=incomingUser||{};
  const id=textValue(customerInput.id,128),branchId=textValue(customerInput.branchId,128),name=textValue(customerInput.name,160);
  const phone=textValue(customerInput.phone,64),email=textValue(customerInput.email,254).toLowerCase(),address=textValue(customerInput.address,300);
  const userId=textValue(userInput.id,128),username=textValue(userInput.username,64),suppliedPassword=String(userInput.password??'');
  const nameSuffix=name.slice(username.length),usernameMatchesName=name.toLocaleLowerCase().startsWith(username.toLocaleLowerCase())&&/^\s/.test(nameSuffix);
  const derivedPassword=usernameMatchesName?nameSuffix.trim().toUpperCase():'',password=derivedPassword;
  if(!id||!userId||!branchId||!name||!phone)throw fail('Customer name, phone number, branch and account IDs are required.');
  if(String(customerInput.name??'').trim().length>160||String(customerInput.phone??'').trim().length>64||String(customerInput.email??'').trim().length>254||String(customerInput.address??'').trim().length>300)throw fail('Customer details are too long.');
  if(!state.branches.some(item=>item.id===branchId&&item.active))throw fail('Choose an open branch.');
  if(!username||!password||!usernameMatchesName)throw fail('The customer username must be their first name and a last name is required.');
  if(suppliedPassword&&suppliedPassword!==derivedPassword)throw fail('The customer password must be their last name in capital letters.');
  if(String(userInput.username??'').trim().length>64||password.length>128)throw fail('Customer login details are too long.');
  if(!/^[+()0-9 .-]+$/.test(phone)||phone.replace(/\D/g,'').length<5)throw fail('Enter a valid customer phone number.');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('Enter a valid customer email address.');
  if(state.customers.some(item=>item.id===id)||state.users.some(item=>item.id===userId))throw fail('Customer or user ID already exists.',409);
  const normalized=username.toLowerCase();
  const existing=(await client.query('SELECT id,username_normalized FROM users WHERE id=$1 OR username_normalized=$2',[userId,normalized])).rows[0];
  if(existing)throw fail(existing.id===userId?'Customer user ID already exists.':'Username already exists.',409);
  const customer={id,name,phone,email,address,joinedAt:new Date(clientOccurrenceTime(customerInput.joinedAt)).toISOString(),branchId,loyaltyPoints:0};
  const measurements=normalizedMeasurements(customerInput.measurements);if(measurements)customer.measurements=measurements;
  const requestedAvatarColor=textValue(userInput.avatarColor,32),avatarColor=/^#[0-9a-f]{6}$/i.test(requestedAvatarColor)?requestedAvatarColor:'#008D4C';
  const profile={id:userId,role:'customer',name,email,phone,branchIds:[branchId],customerId:id,avatarColor,username,verified:false,active:true};
  await client.query('INSERT INTO users(id,username,username_normalized,password_hash,role,email,phone,active,profile) VALUES($1,$2,$3,$4,$5,$6,$7,true,$8)',[profile.id,profile.username,normalized,passwordHash(password),profile.role,profile.email,profile.phone,JSON.stringify(profile)]);
  state.customers.unshift(customer);state.users.unshift(profile);
  return {customer,profile};
}

async function mutate(user,action,req){
 const pendingDeliveries=[];
 const result=await transaction(async c=>{
  await c.query('DELETE FROM action_idempotency WHERE created_at < now() - make_interval(days => $1::integer)',[idempotencyRetentionDays]);
  const state=normalizeState((await c.query('SELECT payload FROM app_state WHERE singleton=true FOR UPDATE')).rows[0].payload);
  const requestedActionType=action?.type;
  const idempotencyKey=textValue(req.headers['x-idempotency-key'],128);
  if(idempotencyKey){
    if(!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey))throw fail('Idempotency key is invalid.',400);
    const requestHashes=actionRequestHashes(action),requestHash=requestHashes[0];
    const previous=(await c.query('SELECT action_type,request_hash FROM action_idempotency WHERE user_id=$1 AND idempotency_key=$2',[user.id,idempotencyKey])).rows[0];
    if(previous){if(previous.action_type!==requestedActionType||!requestHashes.includes(previous.request_hash))throw fail('Idempotency key was already used for a different request.',409);return scoped(state,user);}
    await c.query('INSERT INTO action_idempotency(user_id,idempotency_key,action_type,request_hash) VALUES($1,$2,$3,$4)',[user.id,idempotencyKey,String(requestedActionType),requestHash]);
  }
  let inlineCustomerAccount;
  let auditMetadata={};let auditEntityType='action';let auditEntityId=requestedActionType;
  if(requestedActionType==='CREATE_CUSTOMER_AND_ORDER'){
    if(user.role==='customer')throw fail('Not authorized.',403);
    const branchId=textValue(action.order?.branchId,128),customerId=textValue(action.customer?.id,128);
    if(!branchId||!canBranch(user,branchId))throw fail('Choose an active branch you can access.',403);
    if(action.customer?.branchId!==branchId||action.order?.customerId!==customerId)throw fail('The new customer and order must use the same branch and customer ID.');
    inlineCustomerAccount=await createCustomerAccount(c,state,action.customer,action.user);
    action={type:'CREATE_ORDER',order:action.order};
  }
  if(action.type==='CREATE_CUSTOMER'){
    if(user.role!=='admin'||!canBranch(user,action.customer?.branchId))throw fail('Not authorized.',403);
    const created=await createCustomerAccount(c,state,action.customer,action.user);
    inlineCustomerAccount=created;
    auditMetadata={branchId:created.customer.branchId,customerUserId:created.profile.id};auditEntityType='customer';auditEntityId=created.customer.id;
  }
  else if(action.type==='CREATE_BRANCH'){
    requireAdmin(user);
    const incoming=action.branch||{},id=textValue(incoming.id,128),name=textValue(incoming.name,160),shortName=textValue(incoming.shortName,80);
    const address=textValue(incoming.address,300),phone=textValue(incoming.phone,64),managerId=textValue(incoming.managerId,128);
    if(!id||!name||!shortName||!address||!phone||!managerId)throw fail('Complete every branch field.');
    if(incoming.active!==true)throw fail('A new branch must start open.');
    if(state.branches.some(item=>item.id===id))throw fail('Branch ID already exists.',409);
    if(state.branches.some(item=>item.name.toLowerCase()===name.toLowerCase()||item.shortName.toLowerCase()===shortName.toLowerCase()))throw fail('Branch name and short name must be unique.',409);
    const stateManager=state.users.find(item=>item.id===managerId&&item.role==='admin'&&item.active!==false&&item.verified===true);
    const manager=(await c.query("SELECT id FROM users WHERE id=$1 AND role='admin' AND active=true AND verified_at IS NOT NULL",[managerId])).rows[0];
    if(!stateManager||!manager)throw fail('Choose an active verified administrator as the initial branch manager.');
    const branch={id,name,shortName,address,phone,managerId,active:true};
    state.branches.unshift(branch);
    auditMetadata={name,shortName,managerId};auditEntityType='branch';auditEntityId=id;
  }
  else if(action.type==='CREATE_SERVICE'){
    requireAdmin(user);
    const incoming=action.service||{},id=textValue(incoming.id,128),name=textValue(incoming.name,160),description=textValue(incoming.description,1000);
    const categories=new Set(['laundry','dry_cleaning','textile','speciality']),units=new Set(['item','kg','pair','set','metre']);
    const price=incoming.price,turnaroundHours=incoming.turnaroundHours;
    if(!id||!name||!description||!categories.has(incoming.category)||!units.has(incoming.unit))throw fail('Complete every service field.');
    if(incoming.active!==true)throw fail('A new service must start active.');
    if(typeof price!=='number'||!Number.isFinite(price)||price<0||price>1000000||!hasCentPrecision(price))throw fail('Service price must be a valid amount with no more than two decimal places.');
    if(typeof turnaroundHours!=='number'||!Number.isInteger(turnaroundHours)||turnaroundHours<1||turnaroundHours>8760)throw fail('Turnaround must be between 1 and 8,760 hours.');
    if(state.services.some(item=>item.id===id))throw fail('Service ID already exists.',409);
    if(state.services.some(item=>item.name.toLowerCase()===name.toLowerCase()))throw fail('Service name already exists.',409);
    const normalizedPrice=integerCents(price)/100;
    state.services.unshift({id,name,category:incoming.category,unit:incoming.unit,price:normalizedPrice,turnaroundHours,description,active:true});
    auditMetadata={name,category:incoming.category,unit:incoming.unit,price:normalizedPrice};auditEntityType='service';auditEntityId=id;
  }
  else if(action.type==='UPDATE_BRANCH'){
    requireAdmin(user);
    const branchId=textValue(action.branchId,128),incoming=action.updates||{};
    const target=state.branches.find(item=>item.id===branchId);
    if(!target)throw fail('Branch was not found.',404);
    const name=textValue(incoming.name,160),shortName=textValue(incoming.shortName,80),address=textValue(incoming.address,300),phone=textValue(incoming.phone,64),managerId=textValue(incoming.managerId,128);
    if(!name||!shortName||!address||!phone||!managerId||typeof incoming.active!=='boolean')throw fail('Complete every branch field.');
    if(state.branches.some(item=>item.id!==branchId&&(item.name.toLowerCase()===name.toLowerCase()||item.shortName.toLowerCase()===shortName.toLowerCase())))throw fail('Branch name and short name must be unique.',409);
    const stateManager=state.users.find(item=>item.id===managerId&&item.active!==false&&(item.role==='admin'||(item.role==='staff'&&item.verified===true&&(item.branchIds||[]).includes(branchId))));
    const manager=(await c.query('SELECT id,role,active,verified_at,profile FROM users WHERE id=$1 FOR UPDATE',[managerId])).rows[0];
    const managerCanLead=manager&&manager.active&&manager.verified_at&&(manager.role==='admin'||(manager.role==='staff'&&(manager.profile?.branchIds||[]).includes(branchId)));
    if(!stateManager||!managerCanLead)throw fail('Choose an active verified administrator or branch staff member as manager.');
    if(target.active&&!incoming.active){
      if(state.branches.filter(item=>item.active).length<=1)throw fail('At least one branch must remain open.');
      if(state.orders.some(item=>item.branchId===branchId&&!['collected','cancelled'].includes(item.status)))throw fail('Complete or cancel this branch\'s active orders before closing it.',409);
      if(state.pickupRequests.some(item=>item.branchId===branchId&&['requested','scheduled'].includes(item.status)))throw fail('Complete or cancel this branch\'s pending pickups before closing it.',409);
      const assignedStaff=state.users.find(item=>item.role==='staff'&&item.active!==false&&(item.branchIds||[]).includes(branchId));
      if(assignedStaff)throw fail(`Remove ${assignedStaff.name}'s assignment to this branch before closing it.`,409);
      const assignedCustomer=state.customers.find(item=>item.branchId===branchId);
      if(assignedCustomer)throw fail(`Move ${assignedCustomer.name} to another open branch before closing this branch.`,409);
    }
    const before={name:target.name,shortName:target.shortName,address:target.address,phone:target.phone,managerId:target.managerId,active:target.active};
    const updates={name,shortName,address,phone,managerId,active:incoming.active};
    Object.assign(target,updates);
    auditMetadata={before,after:updates};auditEntityType='branch';auditEntityId=branchId;
  }
  else if(action.type==='UPDATE_SERVICE'){
    requireAdmin(user);
    const serviceId=textValue(action.serviceId,128),incoming=action.updates||{};
    const target=state.services.find(item=>item.id===serviceId);
    if(!target)throw fail('Service was not found.',404);
    const name=textValue(incoming.name,160),description=textValue(incoming.description,1000),price=incoming.price,turnaroundHours=incoming.turnaroundHours;
    const categories=new Set(['laundry','dry_cleaning','textile','speciality']),units=new Set(['item','kg','pair','set','metre']);
    if(!name||!description||!categories.has(incoming.category)||!units.has(incoming.unit)||typeof incoming.active!=='boolean')throw fail('Complete every service field.');
    if(typeof price!=='number'||!Number.isFinite(price)||price<0||price>1000000||!hasCentPrecision(price))throw fail('Service price must be a valid amount with no more than two decimal places.');
    if(typeof turnaroundHours!=='number'||!Number.isInteger(turnaroundHours)||turnaroundHours<1||turnaroundHours>8760)throw fail('Turnaround must be between 1 and 8,760 hours.');
    if(state.services.some(item=>item.id!==serviceId&&item.name.toLowerCase()===name.toLowerCase()))throw fail('Service name already exists.',409);
    const before={name:target.name,price:target.price,turnaroundHours:target.turnaroundHours,active:target.active};
    const updates={name,category:incoming.category,unit:incoming.unit,price:integerCents(price)/100,turnaroundHours,description,active:incoming.active};
    Object.assign(target,updates);
    auditMetadata={before,after:updates};auditEntityType='service';auditEntityId=serviceId;
  }
  else if(action.type==='UPDATE_CUSTOMER'){
    requireAdmin(user);
    const customerId=textValue(action.customerId,128),incoming=action.updates||{};
    const target=state.customers.find(item=>item.id===customerId);
    if(!target)throw fail('Customer was not found.',404);
    const name=textValue(incoming.name,200),phone=textValue(incoming.phone,64),email=textValue(incoming.email,254),address=textValue(incoming.address,500),branchId=textValue(incoming.branchId,128),loyaltyPoints=incoming.loyaltyPoints;
    if(!name||!phone||!address)throw fail('Customer name, phone and address are required.');
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('Email address is invalid.');
    if(!state.branches.some(item=>item.id===branchId&&item.active))throw fail('Choose an open branch.');
    if(typeof loyaltyPoints!=='number'||!Number.isInteger(loyaltyPoints)||loyaltyPoints<0||loyaltyPoints>1000000000)throw fail('Loyalty points must be a non-negative whole number.');
    let measurements;
    if(incoming.measurements!==undefined){
      if(!incoming.measurements||!['cm','in'].includes(incoming.measurements.unit))throw fail('Measurement unit must be centimetres or inches.');
      measurements={unit:incoming.measurements.unit};
      for(const key of ['height','neck','chest','waist','hips','shoulder','sleeve','inseam']){
        const value=incoming.measurements[key];
        if(value===undefined)continue;
        if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>1000)throw fail(`${key} measurement is invalid.`);
        measurements[key]=value;
      }
    }
    const before={name:target.name,email:target.email,phone:target.phone,branchId:target.branchId,loyaltyPoints:target.loyaltyPoints};
    const updates={name,phone,email,address,branchId,loyaltyPoints,...(measurements?{measurements}:{measurements:undefined})};
    Object.assign(target,updates);
    const stateAccounts=state.users.filter(item=>item.role==='customer'&&item.customerId===customerId);
    const accounts=(await c.query("SELECT id,profile FROM users WHERE role='customer' AND profile->>'customerId'=$1 FOR UPDATE",[customerId])).rows;
    if(stateAccounts.length>1||accounts.length>1)throw fail('Multiple login accounts are linked to this customer. Contact support.',409);
    const stateAccount=stateAccounts[0],account=accounts[0];
    if(stateAccount&&!account)throw fail('The linked customer login is inconsistent. Contact support.',409);
    if(account){
      const profile={...account.profile,...stateAccount,id:account.id,role:'customer',customerId,name,email,phone,branchIds:[branchId]};delete profile.password;
      await c.query('UPDATE users SET email=$2,phone=$3,profile=$4,updated_at=now() WHERE id=$1',[account.id,email,phone,JSON.stringify(profile)]);
      setStateUser(state,profile);
    }
    auditMetadata={before,after:{name,email,phone,branchId,loyaltyPoints,measurementsUpdated:incoming.measurements!==undefined}};auditEntityType='customer';auditEntityId=customerId;
  }
  else if(action.type==='UPDATE_PROFILE'){
    const incoming=action.updates||{};
    const name=textValue(incoming.name,200),email=textValue(incoming.email,254),phone=textValue(incoming.phone,64),jobTitle=textValue(incoming.jobTitle,120);
    if(!name||!phone)throw fail('Name and phone are required.');
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('Email address is invalid.');
    const target=(await c.query('SELECT id,role,username,username_normalized,profile FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
    if(!target)throw fail('Your account was not found.',404);
    const username=textValue(incoming.username??target.username,64),normalizedUsername=username.toLowerCase();
    if(target.role!=='admin'&&username!==target.username)throw fail('Only administrators can change their login username.',403);
    if(target.role==='admin'&&!staffUsername.test(username))throw fail('Username must be 3 to 64 characters and use only letters, numbers, dots, underscores or hyphens.');
    if((await c.query('SELECT 1 FROM users WHERE username_normalized=$1 AND id<>$2',[normalizedUsername,user.id])).rowCount)throw fail('Username already exists.',409);
    const before={name:target.profile?.name,email:target.profile?.email,phone:target.profile?.phone,jobTitle:target.profile?.jobTitle,username:target.username};
    const profile={...target.profile,name,email,phone,username,...(target.role==='staff'||target.role==='admin'?{jobTitle}: {})};
    await c.query('UPDATE users SET username=$2,username_normalized=$3,email=$4,phone=$5,profile=$6,updated_at=now() WHERE id=$1',[user.id,username,normalizedUsername,email,phone,JSON.stringify(profile)]);
    setStateUser(state,{...state.users.find(item=>item.id===user.id),...profile,id:user.id,role:target.role});
    if(target.role==='customer'&&profile.customerId){const customer=state.customers.find(item=>item.id===profile.customerId);if(customer){customer.name=name;customer.email=email;customer.phone=phone;}}
    auditMetadata={before,after:{name,email,phone,jobTitle,username}};auditEntityType='user';auditEntityId=user.id;
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
    const managedBranch=state.branches.find(item=>item.active&&item.managerId===userId);
    if(managedBranch)throw fail(`Assign a new manager to ${managedBranch.name} before archiving this account.`,409);
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
    const managedBranch=state.branches.find(item=>item.active&&item.managerId===userId&&!branchIds.includes(item.id));
    if(managedBranch)throw fail(`Keep this staff member assigned to ${managedBranch.name}, or choose a new branch manager first.`,409);
    const profile={...account.profile,...stateAccount,id:userId,role:'staff',active:true,branchIds};delete profile.password;
    const previousBranchIds=account.profile.branchIds||stateAccount?.branchIds||[];
    await c.query('UPDATE users SET profile=$2,updated_at=now() WHERE id=$1',[userId,JSON.stringify(profile)]);
    setStateUser(state,profile);state.activities.unshift(activity(branchIds[0],user.id,`updated ${profile.name}'s branch assignment`,'staff'));
    auditMetadata={before:{branchIds:previousBranchIds},after:{branchIds}};auditEntityType='user';auditEntityId=userId;
  }
  else if(action.type==='CREATE_ORDER'){
    if(user.role==='customer')throw fail('Not authorized.',403);
    const incoming=action.order||{},id=textValue(incoming.id,128),number=textValue(incoming.number,64),branchId=textValue(incoming.branchId,128),customerId=textValue(incoming.customerId,128);
    const branch=state.branches.find(item=>item.id===branchId&&item.active);
    if(!branch||!canBranch(user,branchId))throw fail('Choose an active branch you can access.',403);
    const customer=state.customers.find(item=>item.id===customerId&&item.branchId===branchId);
    if(!customer)throw fail('Choose a customer belonging to the processing branch.');
    if(!id||!number)throw fail('Order ID and number are required.');
    if(state.orders.some(item=>item.id===id||item.number===number))throw fail('Order ID or number already exists.',409);
    if(!Array.isArray(incoming.items)||!incoming.items.length)throw fail('Add at least one service item.');
    if(incoming.items.length>100)throw fail('An order cannot contain more than 100 service items.');
    const itemIds=new Set();
    const items=incoming.items.map((item,index)=>{
      const service=state.services.find(entry=>entry.id===textValue(item?.serviceId,128)&&entry.active);
      const quantity=item?.quantity,description=textValue(item?.description,500);
      if(!service||!description||typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||quantity>10000)throw fail(`Order item ${index+1} is invalid.`);
      const itemNotes=textValue(item?.notes,1000);
      if(String(item?.description??'').trim().length>500||String(item?.notes??'').trim().length>1000)throw fail(`Order item ${index+1} is too long.`);
      const itemId=textValue(item?.id,128)||`item-${randomUUID()}`;if(itemIds.has(itemId))throw fail(`Order item ${index+1} has a duplicate ID.`,409);itemIds.add(itemId);
      return {id:itemId,serviceId:service.id,description,quantity,unitPrice:service.price,...(itemNotes?{notes:itemNotes}:{})};
    });
    const actor=state.users.find(item=>item.id===user.id&&item.active!==false);
    if(!actor)throw fail('The signed-in account is inactive.',403);
    let assignedStaffId,assigneeName;
    if(user.role==='staff'){
      if(actor.role!=='staff'||!user.verified_at||!(actor.branchIds||[]).includes(branchId))throw fail('Staff can only intake jobs for their assigned branch.',403);
      assignedStaffId=user.id;
      assigneeName=actor.name;
    }else if(incoming.assignedStaffId){
      const requestedId=textValue(incoming.assignedStaffId,128);
      const stateAssignee=state.users.find(item=>item.id===requestedId&&item.role==='staff'&&item.active!==false&&item.verified===true&&(item.branchIds||[]).includes(branchId));
      const account=(await c.query("SELECT id,role,active,verified_at,profile FROM users WHERE id=$1 FOR UPDATE",[requestedId])).rows[0];
      const accountBranches=account?.profile?.branchIds||[];
      if(!stateAssignee||!account||account.role!=='staff'||!account.active||!account.verified_at||!accountBranches.includes(branchId))throw fail('Choose an active staff member assigned to the processing branch.');
      assignedStaffId=account.id;assigneeName=stateAssignee.name||account.profile.name;
    }
    const createdTime=clientOccurrenceTime(incoming.createdAt),dueTime=Date.parse(String(incoming.dueAt||''));
    if(!Number.isFinite(dueTime)||dueTime<=createdTime)throw fail('A valid due date after the order was created is required.');
    const subtotalCents=items.reduce((sum,item)=>sum+integerCents(item.quantity*item.unitPrice),0);
    const discount=incoming.discount??0,deliveryFee=incoming.deliveryFee??0;
    if(typeof discount!=='number'||!Number.isFinite(discount)||discount<0||!hasCentPrecision(discount)||integerCents(discount)>subtotalCents)throw fail('Discount must be a cent-precise amount between zero and the order subtotal.');
    if(typeof deliveryFee!=='number'||!Number.isFinite(deliveryFee)||deliveryFee<0||deliveryFee>10000||!hasCentPrecision(deliveryFee))throw fail('Delivery fee must be a valid amount with no more than two decimal places.');
    const normalizedDiscount=integerCents(discount)/100,normalizedDeliveryFee=integerCents(deliveryFee)/100;
    const createdAt=new Date(createdTime).toISOString(),intakeMethod=['walk_in','pickup','online'].includes(incoming.intakeMethod)?incoming.intakeMethod:'walk_in';
    const order={id,number,branchId,customerId,...(assignedStaffId?{assignedStaffId}:{}),items,status:'received',priority:incoming.priority==='urgent'?'urgent':'normal',intakeMethod,createdAt,dueAt:new Date(dueTime).toISOString(),notes:textValue(incoming.notes,2000),discount:normalizedDiscount,deliveryFee:normalizedDeliveryFee,events:[{id:`event-${randomUUID()}`,status:'received',at:createdAt,byUserId:user.id}]};
    state.orders.unshift(order);state.activities.unshift(activity(branchId,user.id,`created ${number}`,'order'));
    addNotification(state,orderNotification(state,order,user.id,assignedStaffId?'New assigned job':'New job intake',assigneeName?`${number} was assigned to ${assigneeName}.`:`${number} was received and is awaiting assignment.`));
    auditMetadata={branchId,customerId,assignedStaffId:assignedStaffId||null,orderNumber:number,itemCount:items.length,...(requestedActionType==='CREATE_CUSTOMER_AND_ORDER'?{customerCreated:true,customerUserId:inlineCustomerAccount.profile.id}:{})};auditEntityType='order';auditEntityId=id;
  }
  else if(action.type==='UPDATE_ORDER_STATUS'){
    const o=state.orders.find(x=>x.id===action.orderId);
    if(!o||user.role==='customer'||!canBranch(user,o.branchId)||!state.branches.some(item=>item.id===o.branchId&&item.active))throw fail('Not authorized.',403);
    if(user.role==='staff'&&o.assignedStaffId!==user.id)throw fail('This job is assigned to another staff member.',403);
    const statusSequence=['received','sorting','washing','drying','ironing','quality_check','ready','out_for_delivery','collected'];
    const currentStatusIndex=statusSequence.indexOf(o.status),nextStatus=currentStatusIndex>=0?statusSequence[currentStatusIndex+1]:undefined;
    const cancelling=user.role==='admin'&&action.status==='cancelled'&&!['cancelled','collected'].includes(o.status);
    if(action.status!==nextStatus&&!cancelling)throw fail('Move the order to its next workflow stage.');
    o.status=action.status;if(action.status==='collected')o.collectedAt=new Date().toISOString();
    o.events.push({id:`event-${randomUUID()}`,status:action.status,at:new Date().toISOString(),byUserId:user.id,note:textValue(action.note,1000)||undefined});
    state.activities.unshift(activity(o.branchId,user.id,`moved ${o.number} to ${action.status.replaceAll('_',' ')}`,'order'));
    addNotification(state,orderNotification(state,o,user.id,`${o.number} updated`,`Order moved to ${action.status.replaceAll('_',' ')}.`));
    auditMetadata={status:action.status};auditEntityType='order';auditEntityId=o.id;
  }
  else if(action.type==='ADD_PAYMENT'){
    const incoming=action.payment||{},paymentId=typeof incoming.id==='string'?incoming.id.trim():'',o=state.orders.find(x=>x.id===incoming.orderId);
    if(!o)throw fail('Order was not found.',404);
    if(user.role==='customer'||!canBranch(user,o.branchId))throw fail('Not authorized to record this payment.',403);
    if(!paymentId||paymentId.length>128)throw fail('Payment ID is invalid.');
    if(state.payments.some(payment=>payment.id===paymentId))throw fail('Payment ID already exists.',409);
    const amount=incoming.amount;
    if(typeof amount!=='number'||!Number.isFinite(amount)||amount<=0||amount>1000000||!hasCentPrecision(amount))throw fail('Payment amount must be a positive amount with no more than two decimal places.');
    const methods=new Set(['cash','ecocash','card','bank_transfer']);if(!methods.has(incoming.method))throw fail('Choose a valid payment method.');
    const amountCents=integerCents(amount),totalCents=orderTotalCents(o),paidCents=orderPaidCents(state,o.id),balanceCents=Math.max(0,totalCents-paidCents);
    if(amountCents>balanceCents)throw fail(`Payment cannot exceed the outstanding balance of $${(balanceCents/100).toFixed(2)}.`,409);
    const normalizedAmount=amountCents/100,reference=textValue(incoming.reference,200),paidAt=new Date(clientOccurrenceTime(incoming.paidAt)).toISOString();
    state.payments.unshift({id:paymentId,orderId:o.id,amount:normalizedAmount,method:incoming.method,paidAt,...(reference?{reference}:{}),receivedByUserId:user.id});
    state.activities.unshift(activity(o.branchId,user.id,`recorded a $${normalizedAmount.toFixed(2)} payment for ${o.number}`,'payment'));
    auditMetadata={orderId:o.id,amount:normalizedAmount,balanceBefore:balanceCents/100,balanceAfter:(balanceCents-amountCents)/100};auditEntityType='payment';auditEntityId=paymentId;
  }
  else if(action.type==='CREATE_PICKUP'){
    const incoming=action.request||{},id=textValue(incoming.id,128),customerId=textValue(incoming.customerId,128),branchId=textValue(incoming.branchId,128),address=textValue(incoming.address,300),instructions=textValue(incoming.instructions,1000);
    if((user.role==='customer'&&customerId!==user.profile.customerId)||!canBranch(user,branchId)||!state.branches.some(item=>item.id===branchId&&item.active))throw fail('Not authorized.',403);
    if(!id||!customerId||!address||!state.customers.some(item=>item.id===customerId))throw fail('Choose a customer and enter a pickup address.');
    if(state.pickupRequests.some(item=>item.id===id))throw fail('Pickup request ID already exists.',409);
    const createdTime=clientOccurrenceTime(incoming.createdAt),preferredTime=Date.parse(String(incoming.preferredAt||''));if(!Number.isFinite(preferredTime)||preferredTime<=createdTime)throw fail('Choose a pickup time after the request was created.');
    const createdAt=new Date(createdTime).toISOString(),request={id,customerId,branchId,address,preferredAt:new Date(preferredTime).toISOString(),instructions,status:'requested',createdAt};
    state.pickupRequests.unshift(request);auditMetadata={branchId,customerId,preferredAt:request.preferredAt};auditEntityType='pickup';auditEntityId=id;
  }
  else if(action.type==='UPDATE_PICKUP'){const p=state.pickupRequests.find(x=>x.id===action.requestId);if(!p||user.role==='customer'||!canBranch(user,p.branchId)||!state.branches.some(item=>item.id===p.branchId&&item.active))throw fail('Not authorized.',403);p.status=action.status;}
  else if(action.type==='ADJUST_INVENTORY'){
    const i=state.inventory.find(x=>x.id===action.itemId),delta=action.delta;
    if(!i||user.role==='customer'||!canBranch(user,i.branchId)||!state.branches.some(item=>item.id===i.branchId&&item.active))throw fail('Not authorized.',403);
    if(typeof delta!=='number'||!Number.isFinite(delta)||delta===0||Math.abs(delta)>1000000000)throw fail('Inventory adjustment must be a finite non-zero number.');
    if(i.quantity+delta<0)throw fail('Inventory cannot fall below zero.',409);
    const before=i.quantity;i.quantity+=delta;auditMetadata={before,delta,after:i.quantity};auditEntityType='inventory_item';auditEntityId=i.id;
  }
  else if(action.type==='CREATE_CLOTHING_ITEM'){
    requireAdmin(user);
    const incoming=action.item||{},id=textValue(incoming.id,128),branchId=textValue(incoming.branchId,128),name=textValue(incoming.name,180),sku=textValue(incoming.sku,64);
    const category=textValue(incoming.category,80),size=textValue(incoming.size,40),color=textValue(incoming.color,80);
    const price=incoming.price,quantity=incoming.quantity,reorderLevel=incoming.reorderLevel;
    if(!id||!name||!sku||!category)throw fail('Item ID, name, SKU and category are required.');
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(sku))throw fail('SKU must be 2 to 64 characters and use only letters, numbers, dots, underscores or hyphens.');
    if(!state.branches.some(item=>item.id===branchId&&item.active))throw fail('Choose an open branch.');
    if(typeof price!=='number'||!Number.isFinite(price)||price<0||price>1000000||!hasCentPrecision(price))throw fail('Selling price must be a valid amount with no more than two decimal places.');
    if(!Number.isInteger(quantity)||quantity<0||quantity>1000000000)throw fail('Opening quantity must be a non-negative whole number.');
    if(!Number.isInteger(reorderLevel)||reorderLevel<0||reorderLevel>1000000000)throw fail('Reorder level must be a non-negative whole number.');
    if(state.clothingItems.some(item=>item.id===id))throw fail('Clothing item ID already exists.',409);
    if(state.clothingItems.some(item=>item.sku.toLowerCase()===sku.toLowerCase()))throw fail('SKU already exists.',409);
    const normalizedPrice=integerCents(price)/100;
    state.clothingItems.unshift({id,branchId,name,sku,category,size,color,price:normalizedPrice,quantity,reorderLevel,active:true});
    auditMetadata={branchId,name,sku,quantity,price:normalizedPrice};auditEntityType='clothing_item';auditEntityId=id;
  }
  else if(action.type==='UPDATE_CLOTHING_ITEM'){
    requireAdmin(user);
    const itemId=textValue(action.itemId,128),incoming=action.updates||{},target=state.clothingItems.find(item=>item.id===itemId);
    if(!target)throw fail('Clothing item was not found.',404);
    const branchId=textValue(incoming.branchId,128),name=textValue(incoming.name,180),sku=textValue(incoming.sku,64);
    const category=textValue(incoming.category,80),size=textValue(incoming.size,40),color=textValue(incoming.color,80),price=incoming.price,reorderLevel=incoming.reorderLevel;
    if(!name||!sku||!category||typeof incoming.active!=='boolean')throw fail('Name, SKU, category and status are required.');
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(sku))throw fail('SKU must be 2 to 64 characters and use only letters, numbers, dots, underscores or hyphens.');
    if(!state.branches.some(item=>item.id===branchId&&item.active))throw fail('Choose an open branch.');
    if(typeof price!=='number'||!Number.isFinite(price)||price<0||price>1000000||!hasCentPrecision(price))throw fail('Selling price must be a valid amount with no more than two decimal places.');
    if(!Number.isInteger(reorderLevel)||reorderLevel<0||reorderLevel>1000000000)throw fail('Reorder level must be a non-negative whole number.');
    if(state.clothingItems.some(item=>item.id!==itemId&&item.sku.toLowerCase()===sku.toLowerCase()))throw fail('SKU already exists.',409);
    const before={branchId:target.branchId,name:target.name,sku:target.sku,price:target.price,reorderLevel:target.reorderLevel,active:target.active};
    const normalizedPrice=integerCents(price)/100;
    Object.assign(target,{branchId,name,sku,category,size,color,price:normalizedPrice,reorderLevel,active:incoming.active});
    auditMetadata={before,after:{branchId,name,sku,price:normalizedPrice,reorderLevel,active:incoming.active}};auditEntityType='clothing_item';auditEntityId=itemId;
  }
  else if(action.type==='ADJUST_CLOTHING_STOCK'){
    requireAdmin(user);
    const itemId=textValue(action.itemId,128),delta=action.delta,target=state.clothingItems.find(item=>item.id===itemId);
    if(!target)throw fail('Clothing item was not found.',404);
    if(!state.branches.some(item=>item.id===target.branchId&&item.active))throw fail('Stock cannot be changed for a closed branch.',409);
    if(!Number.isInteger(delta)||delta===0||Math.abs(delta)>1000000000)throw fail('Stock adjustment must be a non-zero whole number.');
    if(target.quantity+delta<0)throw fail('Stock cannot fall below zero.',409);
    const before=target.quantity;target.quantity+=delta;
    state.activities.unshift(activity(target.branchId,user.id,`adjusted ${target.name} stock by ${delta>0?'+':''}${delta}`,'inventory'));
    auditMetadata={before,delta,after:target.quantity};auditEntityType='clothing_item';auditEntityId=itemId;
  }
  else if(action.type==='RECORD_CLOTHING_SALE'){
    if(user.role==='customer')throw fail('Not authorized.',403);
    const incoming=action.sale||{},id=textValue(incoming.id,128),itemId=textValue(incoming.itemId,128),quantity=incoming.quantity,unitPrice=incoming.unitPrice;
    const target=state.clothingItems.find(item=>item.id===itemId);
    if(!id||!target)throw fail('Choose a valid clothing item.');
    if(state.clothingSales.some(sale=>sale.id===id))throw fail('Sale ID already exists.',409);
    if(!target.active||!state.branches.some(item=>item.id===target.branchId&&item.active)||!canBranch(user,target.branchId))throw fail('Not authorized for this item.',403);
    if(!Number.isInteger(quantity)||quantity<1)throw fail('Sale quantity must be a positive whole number.');
    if(quantity>target.quantity)throw fail(`Only ${target.quantity} unit${target.quantity===1?' is':'s are'} available.`,409);
    if(typeof unitPrice!=='number'||!Number.isFinite(unitPrice)||unitPrice<0||unitPrice>1000000||!hasCentPrecision(unitPrice))throw fail('Negotiated selling price must be a valid amount with no more than two decimal places.');
    const listUnitPrice=integerCents(target.price)/100,normalizedUnitPrice=integerCents(unitPrice)/100,listTotal=integerCents(listUnitPrice*quantity)/100,total=integerCents(normalizedUnitPrice*quantity)/100,soldAt=new Date(clientOccurrenceTime(incoming.soldAt)).toISOString();
    const sale={id,itemId,branchId:target.branchId,quantity,listUnitPrice,unitPrice:normalizedUnitPrice,total,soldAt,soldByUserId:user.id};
    target.quantity-=quantity;state.clothingSales.unshift(sale);
    state.activities.unshift(activity(target.branchId,user.id,`sold ${quantity} ${target.name}`,'inventory'));
    auditMetadata={itemId,quantity,listUnitPrice,negotiatedUnitPrice:normalizedUnitPrice,listTotal,total,priceDifference:(integerCents(total)-integerCents(listTotal))/100};auditEntityType='clothing_sale';auditEntityId=id;
  }
  else if(action.type==='CLOCK_TOGGLE'){
    const target=state.users.find(x=>x.id===action.userId);
    if(!target||target.active===false||(user.role!=='admin'&&user.id!==target.id))throw fail('Not authorized.',403);
    if(action.clockedIn!==undefined&&typeof action.clockedIn!=='boolean')throw fail('Clock state must be true or false.');
    const previousClockedIn=Boolean(target.clockedIn),clockedIn=typeof action.clockedIn==='boolean'?action.clockedIn:!previousClockedIn;
    target.clockedIn=clockedIn;
    if(clockedIn&&!previousClockedIn)target.lastClockIn=new Date().toISOString();
    auditMetadata={clockedIn};auditEntityType='user';auditEntityId=target.id;
  }
  else if(action.type==='MARK_ALL_NOTIFICATIONS_READ'){
    let marked=0;
    state.notifications=state.notifications.map(item=>{
      if(!notificationRelatesToUser(state,item,user)||(item.readByUserIds||[]).includes(user.id))return item;
      marked+=1;return {...item,readByUserIds:[...(item.readByUserIds||[]),user.id]};
    });
    auditMetadata={marked};auditEntityType='notification';auditEntityId='all';
  }
  else throw fail('Unsupported action.');
  if(inlineCustomerAccount)await issueOneTime(c,inlineCustomerAccount.profile.id,'account_verification',inlineCustomerAccount.profile.email,inlineCustomerAccount.profile.phone,req,pendingDeliveries);
  await c.query('UPDATE app_state SET payload=$1,updated_at=now() WHERE singleton=true',[JSON.stringify(state)]);
  await audit(c,user.id,`action.${String(requestedActionType).toLowerCase()}`,req,auditMetadata,auditEntityType,auditEntityId);
  return scoped(state,user);
 });
 await Promise.all(pendingDeliveries.map(pending=>deliver(pending.id,pending.channel,pending.destination,pending.template,pending.payload)));
 return result;
}

async function rateCheck(client,key){const hash=tokenHash(key);const row=(await client.query('SELECT * FROM login_limits WHERE key_hash=$1',[hash])).rows[0];if(row?.blocked_until&&new Date(row.blocked_until)>new Date())throw Object.assign(new Error('Too many sign-in attempts. Try again later.'),{status:429});return hash;}
async function rateFailure(client,hash){await client.query(`INSERT INTO login_limits(key_hash,attempts,window_started_at) VALUES($1,1,now()) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN login_limits.window_started_at < now()-($2||' minutes')::interval THEN 1 ELSE login_limits.attempts+1 END,window_started_at=CASE WHEN login_limits.window_started_at < now()-($2||' minutes')::interval THEN now() ELSE login_limits.window_started_at END,blocked_until=CASE WHEN login_limits.attempts+1 >= $3 THEN now()+($2||' minutes')::interval ELSE login_limits.blocked_until END`,[hash,String(rateMinutes),maxAttempts]);}
async function session(client,user,req,familyId=randomUUID()){const id=randomUUID(),accessToken=newToken(),refreshToken=newToken();await client.query(`INSERT INTO auth_sessions(id,family_id,user_id,access_token_hash,refresh_token_hash,access_expires_at,refresh_expires_at,ip_address,user_agent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,familyId,user.id,tokenHash(accessToken),tokenHash(refreshToken),nowPlus(accessMinutes,60000),nowPlus(refreshDays,86400000),ipOf(req),req.headers['user-agent']||'']);return{id,accessToken,refreshToken,accessExpiresAt:nowPlus(accessMinutes,60000).toISOString(),refreshExpiresAt:nowPlus(refreshDays,86400000).toISOString()};}
async function authUser(req){const token=req.headers.authorization?.replace(/^Bearer\s+/i,'');if(!token)return null;const hashes=tokenHashes(token);const found=await query(`SELECT u.* FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.access_token_hash=ANY($1) AND s.revoked_at IS NULL AND s.access_expires_at>now() AND u.active=true`,[hashes]);return found.rows[0]||null;}
async function issueOneTime(client,userId,purpose,email,phone,req,pendingDeliveries){const raw=newToken();await client.query('DELETE FROM one_time_tokens WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL',[userId,purpose]);await client.query('INSERT INTO one_time_tokens(id,user_id,purpose,token_hash,expires_at) VALUES($1,$2,$3,$4,$5)',[randomUUID(),userId,purpose,tokenHash(raw),nowPlus(purpose==='password_reset'?30:1440,60000)]);const channel=email?'email':'sms',destination=email||phone;if(destination){const payload={token:raw,purpose},notificationId=randomUUID();await client.query('INSERT INTO notification_outbox(id,channel,destination,template,payload) VALUES($1,$2,$3,$4,$5)',[notificationId,channel,destination,purpose,JSON.stringify(payload)]);if(Array.isArray(pendingDeliveries))pendingDeliveries.push({id:notificationId,channel,destination,template:purpose,payload});else void deliver(notificationId,channel,destination,purpose,payload);}await audit(client,userId,`${purpose}.requested`,req);return production?undefined:raw;}
async function deliver(id,channel,destination,template,payload){if(!process.env.NOTIFICATION_WEBHOOK_URL)return;const body=JSON.stringify({channel,destination,template,payload});const signature=createHmac('sha256',process.env.NOTIFICATION_WEBHOOK_SECRET_CURRENT||'development').update(body).digest('hex');try{const result=await fetch(process.env.NOTIFICATION_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json','x-gatsi-signature':signature},body});if(!result.ok)throw new Error(`Notification webhook returned ${result.status}`);await query('UPDATE notification_outbox SET delivered_at=now(),attempts=attempts+1 WHERE id=$1',[id]);}catch(error){await query('UPDATE notification_outbox SET attempts=attempts+1,last_error=$2 WHERE id=$1',[id,error.message]);await reportError(error);}}

let initialization;
const initialize = () => initialization ||= (async () => { if (!process.env.VERCEL) await migrate(); await seed(); })();
const handler=async(req,res)=>{const origin=origins.has(req.headers.origin)?req.headers.origin:'';if(req.method==='OPTIONS')return response(res,204,{},origin);try{await initialize();const url=new URL(req.url,`http://${req.headers.host}`);if(url.pathname==='/api/health'&&req.method==='GET'){await query('SELECT 1');return response(res,200,{ok:true,service:'gatsi-api',environment:process.env.APP_ENV||'development'},origin);}if(url.pathname==='/api/auth/login'&&req.method==='POST'){const b=await bodyOf(req),normalized=String(b.username||'').trim().toLowerCase();const result=await transaction(async c=>{const limit=await rateCheck(c,`${ipOf(req)}:${normalized}`);const user=(await c.query('SELECT * FROM users WHERE username_normalized=$1',[normalized])).rows[0];if(!user||!passwordValid(String(b.password||''),user.password_hash)){await rateFailure(c,limit);await audit(c,user?.id||null,'auth.login_failed',req,{username:normalized});return{failed:true};}if(!user.active||!user.verified_at)return{forbidden:true};await c.query('DELETE FROM login_limits WHERE key_hash=$1',[limit]);const tokens=await session(c,user,req);await audit(c,user.id,'auth.login_succeeded',req);return{user,tokens};});if(result.failed)throw Object.assign(new Error('Username or password is incorrect.'),{status:401});if(result.forbidden)throw Object.assign(new Error('Account is inactive or unverified.'),{status:403});const state=scoped(await loadState(),result.user);return response(res,200,{...result.tokens,user:safeUser(result.user),state},origin);}
if(url.pathname==='/api/auth/refresh'&&req.method==='POST'){const {refreshToken}=await bodyOf(req);const hashes=tokenHashes(String(refreshToken||''));const result=await transaction(async c=>{const old=(await c.query('SELECT * FROM auth_sessions WHERE refresh_token_hash=ANY($1)',[hashes])).rows[0];if(!old||old.refresh_expires_at<new Date())return{invalid:true};if(old.revoked_at){await c.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE family_id=$1',[old.family_id]);return{reused:true};}const user=(await c.query('SELECT * FROM users WHERE id=$1 AND active=true',[old.user_id])).rows[0];if(!user)return{invalid:true};const fresh=await session(c,user,req,old.family_id);await c.query('UPDATE auth_sessions SET revoked_at=now(),replaced_by=$1,last_used_at=now() WHERE id=$2',[fresh.id,old.id]);await audit(c,user.id,'auth.token_refreshed',req);return{fresh,user};});if(result.invalid)throw Object.assign(new Error('Refresh token is invalid or expired.'),{status:401});if(result.reused)throw Object.assign(new Error('Refresh token reuse detected. Sign in again.'),{status:401});return response(res,200,{...result.fresh,user:safeUser(result.user),state:scoped(await loadState(),result.user)},origin);}
if(url.pathname==='/api/auth/password-reset/request'&&req.method==='POST'){const b=await bodyOf(req);const debug=await transaction(async c=>{const value=String(b.identifier||'').toLowerCase();const user=(await c.query('SELECT * FROM users WHERE username_normalized=$1 OR lower(email)=$1 OR phone=$2',[value,String(b.identifier||'')])).rows[0];return user?issueOneTime(c,user.id,'password_reset',user.email,user.phone,req):undefined;});return response(res,202,{ok:true,...(debug?{debugToken:debug}:{})},origin);}
if(url.pathname==='/api/auth/password-reset/confirm'&&req.method==='POST'){const b=await bodyOf(req);if(!passwordAcceptable(b.newPassword))throw new Error('Password must be at least 10 characters and include upper, lower and numeric characters.');await transaction(async c=>{const token=(await c.query("SELECT * FROM one_time_tokens WHERE token_hash=ANY($1) AND purpose='password_reset' AND used_at IS NULL AND expires_at>now() FOR UPDATE",[tokenHashes(String(b.token||''))])).rows[0];if(!token)throw Object.assign(new Error('Reset token is invalid or expired.'),{status:400});await c.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[passwordHash(b.newPassword),token.user_id]);await c.query('UPDATE one_time_tokens SET used_at=now() WHERE id=$1',[token.id]);await c.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',[token.user_id]);await audit(c,token.user_id,'password_reset.completed',req);});return response(res,200,{ok:true},origin);}
if(url.pathname==='/api/auth/verification/confirm'&&req.method==='POST'){const b=await bodyOf(req);await transaction(async c=>{const token=(await c.query("SELECT * FROM one_time_tokens WHERE token_hash=ANY($1) AND purpose='account_verification' AND used_at IS NULL AND expires_at>now() FOR UPDATE",[tokenHashes(String(b.token||''))])).rows[0];if(!token)throw Object.assign(new Error('Verification token is invalid or expired.'),{status:400});const account=(await c.query('SELECT profile FROM users WHERE id=$1 FOR UPDATE',[token.user_id])).rows[0];account.profile={...account.profile,verified:true};await c.query('UPDATE users SET verified_at=now(),profile=$2,updated_at=now() WHERE id=$1',[token.user_id,JSON.stringify(account.profile)]);const state=(await c.query('SELECT payload FROM app_state WHERE singleton=true FOR UPDATE')).rows[0].payload;const stateUser=state.users.find(item=>item.id===token.user_id);if(stateUser)stateUser.verified=true;await c.query('UPDATE app_state SET payload=$1,updated_at=now() WHERE singleton=true',[JSON.stringify(state)]);await c.query('UPDATE one_time_tokens SET used_at=now() WHERE id=$1',[token.id]);await audit(c,token.user_id,'account_verification.completed',req);});return response(res,200,{ok:true},origin);}
const user=await authUser(req);if(!user)throw Object.assign(new Error('Authentication required.'),{status:401});if(url.pathname==='/api/admin/customers/verify'&&req.method==='POST'){if(user.role!=='admin')throw Object.assign(new Error('Administrator access required.'),{status:403});if(process.env.NOTIFICATION_WEBHOOK_URL)throw Object.assign(new Error('This account must use the delivered verification code.'),{status:409});const b=await bodyOf(req);const verified=await transaction(async c=>{const target=(await c.query("SELECT id,profile FROM users WHERE id=$1 AND role='customer' AND active=true FOR UPDATE",[String(b.userId||'')])).rows[0];if(!target)throw Object.assign(new Error('Customer account was not found.'),{status:404});target.profile={...target.profile,verified:true};await c.query('UPDATE users SET verified_at=COALESCE(verified_at,now()),profile=$2,updated_at=now() WHERE id=$1',[target.id,JSON.stringify(target.profile)]);await c.query("UPDATE one_time_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1 AND purpose='account_verification'",[target.id]);const state=(await c.query('SELECT payload FROM app_state WHERE singleton=true FOR UPDATE')).rows[0].payload;const stateUser=state.users.find(item=>item.id===target.id);if(stateUser)stateUser.verified=true;await c.query('UPDATE app_state SET payload=$1,updated_at=now() WHERE singleton=true',[JSON.stringify(state)]);await audit(c,user.id,'account_verification.admin_completed',req,{},'user',target.id);return state;});return response(res,200,scoped(verified,user),origin);}if(url.pathname==='/api/auth/logout'&&req.method==='POST'){await transaction(async c=>{const hashes=tokenHashes(req.headers.authorization.replace(/^Bearer\s+/i,''));await c.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE access_token_hash=ANY($1)',[hashes]);await audit(c,user.id,'auth.logout',req);});return response(res,200,{ok:true},origin);}if(url.pathname==='/api/state'&&req.method==='GET')return response(res,200,scoped(await loadState(),user),origin);if(url.pathname==='/api/audit'&&req.method==='GET'){if(user.role!=='admin')throw Object.assign(new Error('Administrator access required.'),{status:403});const rows=(await query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500')).rows;return response(res,200,{items:rows},origin);}if(url.pathname==='/api/actions'&&req.method==='POST')return response(res,200,await mutate(user,await bodyOf(req),req),origin);throw Object.assign(new Error('Route not found.'),{status:404});}catch(error){const status=error.status||422;if(status>=500)await reportError(error,req);else console.warn(JSON.stringify({level:'warning',message:error.message,path:req.url,status,time:new Date().toISOString()}));return response(res,status,{error:error.message||'Request failed.'},origin);}};

const routedHandler=async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host}`);
  const intercepted=url.pathname==='/api/cron/daily-operations'
    || url.pathname==='/api/account/password'
    || url.pathname==='/api/admin/operations-summaries'
    || url.pathname==='/api/admin/operations-summaries/generate';
  if(!intercepted||req.method==='OPTIONS')return handler(req,res);
  const origin=origins.has(req.headers.origin)?req.headers.origin:'';
  try{
    await initialize();
    if(url.pathname==='/api/cron/daily-operations'&&req.method==='GET'){
      if(!process.env.CRON_SECRET)throw Object.assign(new Error('Daily summary scheduler is not configured.'),{status:503});
      if(!secureEqual(req.headers.authorization,`Bearer ${process.env.CRON_SECRET}`))throw Object.assign(new Error('Scheduler authorization failed.'),{status:401});
      const generated=await transaction(async c=>{
        const result=await generateAndStoreDailyOperationsSummary(c,previousHarareDateKey());
        await audit(c,null,'operations_summary.scheduled',req,{date:result.summary.date,created:result.created},'operations_summary',result.summary.id);
        return result;
      });
      return response(res,200,{ok:true,...generated},origin);
    }

    const user=await authUser(req);
    if(!user)throw Object.assign(new Error('Authentication required.'),{status:401});

    if(url.pathname==='/api/account/password'&&req.method==='POST'){
      const body=await bodyOf(req),currentPassword=String(body.currentPassword??''),newPassword=String(body.newPassword??'');
      if(!passwordAcceptable(newPassword))throw fail('Password must be at least 10 characters and include upper, lower and numeric characters.');
      await transaction(async c=>{
        const target=(await c.query('SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
        if(!target||!passwordValid(currentPassword,target.password_hash))throw Object.assign(new Error('Current password is incorrect.'),{status:400});
        if(passwordValid(newPassword,target.password_hash))throw fail('Choose a password you have not already been using.');
        await c.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',[user.id,passwordHash(newPassword)]);
        const currentHashes=tokenHashes(req.headers.authorization.replace(/^Bearer\s+/i,''));
        await c.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1 AND NOT (access_token_hash=ANY($2))',[user.id,currentHashes]);
        await audit(c,user.id,'account.password_changed',req,{},'user',user.id);
      });
      return response(res,200,{ok:true},origin);
    }

    requireAdmin(user);
    if(url.pathname==='/api/admin/operations-summaries'&&req.method==='GET'){
      const items=await listDailyOperationsSummaries(pool,url.searchParams.get('limit')??31);
      return response(res,200,{items},origin);
    }
    if(url.pathname==='/api/admin/operations-summaries/generate'&&req.method==='POST'){
      const body=await bodyOf(req),date=body.date??previousHarareDateKey();
      if(!validSummaryDate(date))throw fail('Summary date must use YYYY-MM-DD.');
      if(date>previousHarareDateKey())throw fail('Only completed Africa/Harare business days can be summarized.');
      const generated=await transaction(async c=>{
        const result=await generateAndStoreDailyOperationsSummary(c,date,{replace:true});
        await audit(c,user.id,'operations_summary.generated',req,{date,created:result.created,replaced:result.replaced},'operations_summary',result.summary.id);
        return result;
      });
      return response(res,200,generated,origin);
    }
    throw Object.assign(new Error('Route not found.'),{status:404});
  }catch(error){
    const status=error.status||422;
    if(status>=500)await reportError(error,req);else console.warn(JSON.stringify({level:'warning',message:error.message,path:req.url,status,time:new Date().toISOString()}));
    return response(res,status,{error:error.message||'Request failed.'},origin);
  }
};

export default routedHandler;

if (!process.env.VERCEL) {
  await initialize();
  const server=createServer(routedHandler);
  server.listen(port,host,()=>console.log(JSON.stringify({level:'info',message:`Gatsi API listening on ${host}:${port}`,environment:process.env.APP_ENV||'development'})));
  const shutdown=async()=>{server.close();await pool.end();process.exit(0);};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);process.on('unhandledRejection',(error)=>void reportError(error));process.on('uncaughtException',(error)=>void reportError(error).finally(()=>process.exit(1)));
}
