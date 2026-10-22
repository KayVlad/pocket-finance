import {body,boundary,db,hash,HttpError,json,randomSecret,sameOrigin,sessionCookie} from '@/lib/server';
import {configuredAccounts,newAccountInput,setupRequired} from '@/lib/accounts-server';
import {hashPassword} from '@/lib/password';
import type {Account} from '@/lib/finance';

export const dynamic='force-dynamic';

export async function POST(request:Request){return boundary(async()=>{
 sameOrigin(request);
 if(!await setupRequired())throw new HttpError(409,'Setup is already complete. Sign in with your account.');
 const input=newAccountInput(await body(request));
 const id=crypto.randomUUID(),passwordHash=await hashPassword(input.password),session=randomSecret();
 const results=await db().batch([
  db().prepare(`INSERT INTO accounts (id,name,username,password_hash,role,token_hash,created_at) SELECT ?,?,?,?,'admin',?,? WHERE NOT EXISTS (${configuredAccounts})`).bind(id,input.name,input.username,passwordHash,randomSecret(),Date.now()),
  db().prepare('INSERT INTO sessions (hash,account_id,expires_at) SELECT ?,id,? FROM accounts WHERE id=?').bind(await hash(session),Date.now()+2592000000,id),
 ]);
 if(!results[0].meta.changes)throw new HttpError(409,'Setup is already complete. Sign in with your account.');
 const account=await db().prepare('SELECT id,name,username,role,accent,disabled FROM accounts WHERE id=?').bind(id).first<Account>();
 return json({account,setupRequired:false},201,{'Set-Cookie':sessionCookie(request,session)});
});}
