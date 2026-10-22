import {body,boundary,db,HttpError,json,randomSecret,requireAdmin,sameOrigin} from '@/lib/server';
import {activeAdmin,newAccountInput} from '@/lib/accounts-server';
import {hashPassword,validPassword} from '@/lib/password';
import {accountReceipts,deleteReceiptObjects} from '@/lib/receipts-server';
export const dynamic='force-dynamic';

export async function GET(request:Request){return boundary(async()=>{
 await requireAdmin(request);
 const users=await db().prepare('SELECT id,name,username,role,accent,disabled FROM accounts WHERE username IS NOT NULL ORDER BY created_at,id').all();
 return json({users:users.results});
});}

export async function POST(request:Request){return boundary(async()=>{
 sameOrigin(request);const admin=await requireAdmin(request),input=await body(request);
 const {name,username,password}=newAccountInput(input),role=input.role===undefined?'user':input.role;
 if(role!=='user'&&role!=='admin')throw new HttpError(400,'Choose User or Admin.');
 const user={id:crypto.randomUUID(),name,username,role};
 try{
  const result=await db().prepare(`INSERT INTO accounts (id,name,username,password_hash,role,token_hash,created_at) SELECT ?,?,?,?,?,?,? WHERE ${activeAdmin}`).bind(user.id,name,username,await hashPassword(password),role,randomSecret(),Date.now(),admin.id).run();
  if(!result.meta.changes)throw new HttpError(403,'Admin access is no longer available. Refresh and sign in again.');
 }catch(e){if(e instanceof Error&&e.message.includes('UNIQUE'))throw new HttpError(409,'That username is already used.');throw e;}
 return json({user},201);
});}

export async function PATCH(request:Request){return boundary(async()=>{
 sameOrigin(request);const admin=await requireAdmin(request),input=await body(request);
 if(typeof input?.id!=='string')throw new HttpError(400,'Choose an account.');
 if(input.id===admin.id)throw new HttpError(400,'Use Settings to change your own password. You cannot change your own role or disable your account.');
 const user=await db().prepare('SELECT id FROM accounts WHERE id=? AND username IS NOT NULL').bind(input.id).first<{id:string}>();
 if(!user)throw new HttpError(404,'Account not found.');
 const fields:string[]=[],values:(string|number)[]=[];
 if(input.password!==undefined){
  if(!validPassword(input.password))throw new HttpError(400,'Use 12 or more characters, up to 72 UTF-8 bytes.');
  fields.push('password_hash=?');values.push(await hashPassword(input.password));
 }
 if(input.disabled!==undefined){
  if(typeof input.disabled!=='boolean')throw new HttpError(400,'Choose enabled or disabled.');
  fields.push('disabled=?');values.push(Number(input.disabled));
 }
 if(input.role!==undefined){
  if(input.role!=='user'&&input.role!=='admin')throw new HttpError(400,'Choose User or Admin.');
  fields.push('role=?');values.push(input.role);
 }
 if(!fields.length)throw new HttpError(400,'Choose an action.');
 const results=await db().batch([
  db().prepare(`UPDATE accounts SET ${fields.join(',')} WHERE id=? AND ${activeAdmin}`).bind(...values,user.id,admin.id),
  db().prepare(`DELETE FROM sessions WHERE account_id=? AND ${activeAdmin}`).bind(user.id,admin.id),
 ]);
 if(!results[0].meta.changes)throw new HttpError(409,'Account access changed. Refresh and try again.');
 return json({ok:true});
});}

export async function DELETE(request:Request){return boundary(async()=>{
 sameOrigin(request);const admin=await requireAdmin(request),input=await body(request);
 if(typeof input?.id!=='string')throw new HttpError(400,'Choose an account.');
 if(input.id===admin.id)throw new HttpError(400,'You cannot delete your own account.');
 const user=await db().prepare('SELECT id FROM accounts WHERE id=? AND username IS NOT NULL').bind(input.id).first<{id:string}>();
 if(!user)throw new HttpError(404,'Account not found.');
 const receipts=await accountReceipts(user.id);
 // Foreign keys remove all finance records, receipt metadata and sessions together.
 const result=await db().prepare(`DELETE FROM accounts WHERE id=? AND ${activeAdmin}`).bind(user.id,admin.id).run();
 if(!result.meta.changes)throw new HttpError(409,'Account access changed. Refresh and try again.');
 await deleteReceiptObjects(receipts);
 return json({ok:true});
});}
