import {accountFor,body,boundary,cookieValue,db,hash,HttpError,json,randomSecret,sameOrigin,sessionCookie,requireAccount} from '@/lib/server';
import {verifyPassword,validPassword,hashPassword} from '@/lib/password';
import type {Account} from '@/lib/finance';
export const dynamic='force-dynamic';
export async function GET(request:Request){return boundary(async()=>json({account:await accountFor(request)}));}
export async function POST(request:Request){return boundary(async()=>{
 sameOrigin(request);const input=await body(request);
 if(!input||typeof input.username!=='string'||typeof input.password!=='string'||(input.action&&input.action!=='login'))throw new HttpError(400,'Enter your username and password.');
 const username=input.username.trim().toLowerCase();
 if(username.length>40||new TextEncoder().encode(input.password).length>72)throw new HttpError(401,'Incorrect username or password.');
 const key=await hash(username+'|'+(request.headers.get('cf-connecting-ip')||'local'));
 const now=Date.now(),windowStart=now-900000;
 const attempt=await db().prepare('SELECT attempts,window_start FROM login_attempts WHERE key=?').bind(key).first<{attempts:number;window_start:number}>();
 if(attempt&&attempt.window_start>windowStart&&attempt.attempts>=10)throw new HttpError(429,'Too many attempts. Try again in 15 minutes.');
 await db().prepare('INSERT INTO login_attempts (key,attempts,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN ? ELSE window_start END').bind(key,now,windowStart,windowStart,now).run();
 const found=await db().prepare('SELECT id,name,username,role,accent,disabled,password_hash FROM accounts WHERE username=?').bind(username).first<Account&{password_hash:string|null}>();
 // Use the same password-check path for unknown usernames.
 const encoded=found?.password_hash||'$2b$12$n9AmZsl0jO4iNddMelxFYuMTP9sK/yDi/QPQxBEADGNx4FuLEaK7a';
 const matches=await verifyPassword(input.password,encoded);
 if(!found?.password_hash||!matches||found.disabled)throw new HttpError(401,'Incorrect username or password.');
 const {password_hash:_,...account}=found;const session=randomSecret(),old=cookieValue(request);
 const statements=[db().prepare('INSERT INTO sessions (hash,account_id,expires_at) VALUES (?,?,?)').bind(await hash(session),account.id,now+2592000000),db().prepare('DELETE FROM login_attempts WHERE key=?').bind(key)];
 if(/^[a-f0-9]{64}$/.test(old))statements.push(db().prepare('DELETE FROM sessions WHERE hash=?').bind(await hash(old)));
 await db().batch(statements);return json({account},200,{'Set-Cookie':sessionCookie(request,session)});
});}
export async function PATCH(request:Request){return boundary(async()=>{
 sameOrigin(request);const account=await requireAccount(request),input=await body(request);
 if(typeof input?.accent!=='string'||!/^#[a-fA-F0-9]{6}$/.test(input.accent))throw new HttpError(400,'Choose an accent colour.');
 await db().prepare('UPDATE accounts SET accent=? WHERE id=?').bind(input.accent,account.id).run();return json({account:{...account,accent:input.accent}});
});}
export async function PUT(request:Request){return boundary(async()=>{
 sameOrigin(request);const account=await requireAccount(request),input=await body(request);
 if(typeof input?.currentPassword!=='string'||!validPassword(input.password))throw new HttpError(400,'Use a password of at least 12 characters, up to 72 UTF-8 bytes.');
 const found=await db().prepare('SELECT password_hash FROM accounts WHERE id=?').bind(account.id).first<{password_hash:string}>();
 if(!found||!await verifyPassword(input.currentPassword,found.password_hash))throw new HttpError(401,'Current password is incorrect.');
 const session=randomSecret();await db().batch([db().prepare('UPDATE accounts SET password_hash=? WHERE id=?').bind(await hashPassword(input.password),account.id),db().prepare('DELETE FROM sessions WHERE account_id=?').bind(account.id),db().prepare('INSERT INTO sessions (hash,account_id,expires_at) VALUES (?,?,?)').bind(await hash(session),account.id,Date.now()+2592000000)]);
 return json({ok:true},200,{'Set-Cookie':sessionCookie(request,session)});
});}
export async function DELETE(request:Request){return boundary(async()=>{sameOrigin(request);const cookie=cookieValue(request);if(cookie)await db().prepare('DELETE FROM sessions WHERE hash=?').bind(await hash(cookie)).run();return json({ok:true},200,{'Set-Cookie':sessionCookie(request,'',0)});});}
