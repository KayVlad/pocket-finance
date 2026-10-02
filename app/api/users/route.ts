import {body,boundary,db,HttpError,json,randomSecret,requireAdmin,sameOrigin} from '@/lib/server';
import {hashPassword,validPassword,validUsername} from '@/lib/password';
export const dynamic='force-dynamic';
export async function GET(request:Request){return boundary(async()=>{await requireAdmin(request);const users=await db().prepare('SELECT id,name,username,role,accent,disabled FROM accounts WHERE username IS NOT NULL ORDER BY created_at').all();return json({users:users.results});});}
export async function POST(request:Request){return boundary(async()=>{
 sameOrigin(request);await requireAdmin(request);const input=await body(request),username=typeof input?.username==='string'?input.username.trim().toLowerCase():'';
 if(!input||!validUsername(username))throw new HttpError(400,'Use 3–40 characters: letters, numbers, dots, underscores or hyphens.');
 if(!validPassword(input.password))throw new HttpError(400,'Use a password of at least 12 characters, up to 72 UTF-8 bytes.');
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>60)throw new HttpError(400,'Enter a name up to 60 characters.');
 const exists=await db().prepare('SELECT id FROM accounts WHERE username=?').bind(username).first();if(exists)throw new HttpError(409,'That username is already used.');
 const user={id:crypto.randomUUID(),name:input.name.trim(),username,role:'user'};
 try{await db().prepare('INSERT INTO accounts (id,name,username,password_hash,role,token_hash,created_at) VALUES (?,?,?,?,?,?,?)').bind(user.id,user.name,username,await hashPassword(input.password),'user',randomSecret(),Date.now()).run();}catch(e){if(e instanceof Error&&e.message.includes('UNIQUE'))throw new HttpError(409,'That username is already used.');throw e;}
 return json({user},201);
});}
export async function PATCH(request:Request){return boundary(async()=>{
 sameOrigin(request);const admin=await requireAdmin(request),input=await body(request);
 if(typeof input?.id!=='string')throw new HttpError(400,'Choose a user.');
 const user=await db().prepare('SELECT id,role FROM accounts WHERE id=?').bind(input.id).first<{id:string;role:string}>();
 if(!user)throw new HttpError(404,'User not found.');
 if(user.role==='admin'||user.id===admin.id)throw new HttpError(400,'Manage your own password in Settings. Admin accounts cannot be disabled here.');
 const changes=[];
 if(input.password!==undefined){if(!validPassword(input.password))throw new HttpError(400,'Use 12 or more characters, up to 72 UTF-8 bytes.');changes.push(db().prepare('UPDATE accounts SET password_hash=? WHERE id=?').bind(await hashPassword(input.password),user.id));}
 if(input.disabled!==undefined){if(typeof input.disabled!=='boolean')throw new HttpError(400,'Choose enabled or disabled.');changes.push(db().prepare('UPDATE accounts SET disabled=? WHERE id=?').bind(Number(input.disabled),user.id));}
 if(!changes.length)throw new HttpError(400,'Choose an action.');
 changes.push(db().prepare('DELETE FROM sessions WHERE account_id=?').bind(user.id));await db().batch(changes);return json({ok:true});
});}

