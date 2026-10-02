import {env} from 'cloudflare:workers';
import {body,db,HttpError} from './server';
import type {Receipt} from './finance';
export type StoredReceipt=Receipt&{accountId:string;transactionId:string;objectKey:string};
export type Photo={name:string;type:string;data:Uint8Array};
export const photoLimit=5_000_000,backupLimit=20_000_000;
export function receiptBucket(){if(!env.RECEIPTS)throw new Error('Receipt storage unavailable');return env.RECEIPTS;}
export function validatePhoto(name:unknown,type:unknown,data:Uint8Array):Photo{
 if(typeof name!=='string'||!name.trim()||name.length>200||typeof type!=='string'||!data.length||data.length>photoLimit)throw new HttpError(400,'Use receipt photos up to 5 MB each.');
 const jpeg=data[0]===255&&data[1]===216&&data[2]===255;
 const png=[137,80,78,71,13,10,26,10].every((v,i)=>data[i]===v);
 const header=new TextDecoder('ascii').decode(data.slice(0,12));
 const gif=header.startsWith('GIF87a')||header.startsWith('GIF89a'),webp=header.startsWith('RIFF')&&header.slice(8)==='WEBP';
 if(!((type==='image/jpeg'&&jpeg)||(type==='image/png'&&png)||(type==='image/gif'&&gif)||(type==='image/webp'&&webp)))throw new HttpError(400,'Choose a JPG, PNG, WebP or GIF photo.');
 return {name:name.replace(/[\r\n\x00-\x1f\/\\]/g,'_').trim(),type,data};
}
export async function transactionInput(request:Request){
 if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))return {input:await body(request),photos:[] as Photo[]};
 if(Number(request.headers.get('content-length'))>21_000_000)throw new HttpError(413,'Receipt uploads can total up to 20 MB.');
 const form=await request.formData(),raw=form.get('transaction');
 if(typeof raw!=='string'||raw.length>8192)throw new HttpError(400,'Invalid transaction.');
 let input;try{input=JSON.parse(raw);}catch{throw new HttpError(400,'Invalid transaction.');}
 const files=form.getAll('receipts');if(files.length>8)throw new HttpError(400,'Attach up to 8 receipt photos per entry.');
 const photos:Photo[]=[];let size=0;
 for(const file of files){if(typeof file==='string')throw new HttpError(400,'Choose a receipt photo.');size+=file.size;if(size>20_000_000||file.size>photoLimit)throw new HttpError(413,'Use photos up to 5 MB each and 20 MB total.');photos.push(validatePhoto(file.name,file.type,new Uint8Array(await file.arrayBuffer())));}
 return {input,photos};
}
export async function accountReceipts(accountId:string){return (await db().prepare('SELECT id,account_id AS accountId,transaction_id AS transactionId,object_key AS objectKey,name,type,size FROM receipts WHERE account_id=? ORDER BY rowid').bind(accountId).all<StoredReceipt>()).results;}
export async function withReceipts<T extends {id:string}>(rows:T[],accountId:string){
 const receipts=await accountReceipts(accountId),byTransaction=new Map<string,Receipt[]>();
 for(const {id,transactionId,name,type,size} of receipts){const list=byTransaction.get(transactionId)||[];list.push({id,name,type,size});byTransaction.set(transactionId,list);}
 return rows.map(t=>({...t,receipts:byTransaction.get(t.id)||[]}));
}
export async function deleteReceiptObjects(items:Pick<StoredReceipt,'objectKey'>[]){
 if(!items.length)return;
 try{await receiptBucket().delete(items.map(r=>r.objectKey));}catch(e){console.error('Receipt cleanup failed',e instanceof Error?e.message:'Unknown error');}
}
export async function stageReceipts(photos:Photo[],accountId:string,transactionId:string){
 const uploaded:StoredReceipt[]=[];
 try{for(const photo of photos){const id=crypto.randomUUID(),objectKey=`${accountId}/${id}`;await receiptBucket().put(objectKey,photo.data,{httpMetadata:{contentType:photo.type}});uploaded.push({id,accountId,transactionId,objectKey,name:photo.name,type:photo.type,size:photo.data.length});}return uploaded;}
 catch(e){await deleteReceiptObjects(uploaded);throw e;}
}
export function receiptInsert(r:StoredReceipt){return db().prepare('INSERT INTO receipts (id,account_id,transaction_id,object_key,name,type,size) VALUES (?,?,?,?,?,?,?)').bind(r.id,r.accountId,r.transactionId,r.objectKey,r.name,r.type,r.size);}
export function toBase64(bytes:Uint8Array){let text='';for(let i=0;i<bytes.length;i+=4096)text+=String.fromCharCode(...bytes.slice(i,i+4096));return btoa(text);}
export function fromBase64(value:unknown){if(typeof value!=='string'||value.length>6_666_672||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw new HttpError(400,'Invalid receipt in backup.');try{return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{throw new HttpError(400,'Invalid receipt in backup.');}}
