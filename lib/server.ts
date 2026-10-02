import {env} from 'cloudflare:workers';
import type {Account} from './finance';
export class HttpError extends Error { constructor(public status:number,message:string){super(message);} }
export function db(){if(!env.DB)throw new Error('Database binding unavailable');return env.DB;}
export function randomSecret(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');}
export async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');}
export function sessionCookie(request:Request,value:string,age=2592000){return `pocket_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export function cookieValue(request:Request){return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('pocket_session='))?.slice(15)||'';}
export async function accountFor(request:Request){const cookie=cookieValue(request);if(!/^[a-f0-9]{64}$/.test(cookie))return null;return db().prepare('SELECT a.id,a.name,a.username,a.role,a.accent,a.disabled FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.hash=? AND s.expires_at>? AND a.password_hash IS NOT NULL AND a.disabled=0').bind(await hash(cookie),Date.now()).first<Account>();}
export async function requireAccount(request:Request){const account=await accountFor(request);if(!account)throw new HttpError(401,'Please sign in.');return account;}
export async function requireAdmin(request:Request){const account=await requireAccount(request);if(account.role!=='admin')throw new HttpError(403,'Admin access required.');return account;}
export function sameOrigin(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)throw new HttpError(403,'This request could not be verified. Refresh and try again.');}
export async function body(request:Request,maxLength=8192){const text=await request.text();if(text.length>maxLength)throw new HttpError(413,'This entry is too long.');try{return JSON.parse(text);}catch{throw new HttpError(400,'Invalid request.');}}
export function json(data:unknown,status=200,headers:Record<string,string>={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});}
export async function boundary(fn:()=>Promise<Response>){try{return await fn();}catch(e){if(e instanceof HttpError)return json({error:e.message},e.status);console.error('Finance storage request failed',e instanceof Error?e.message:'Unknown error');return json({error:'Your finances are temporarily unavailable. Please try again; your input has been kept.'},503);}}
