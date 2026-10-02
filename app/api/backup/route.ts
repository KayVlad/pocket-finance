import {body,boundary,db,HttpError,json,requireAccount,sameOrigin} from '@/lib/server';
import {groups,type Category,type Transaction} from '@/lib/finance';
import {accountCategories,normalizedKind,validYear} from '@/lib/categories-server';
import {validateTransaction} from '@/lib/transaction-validation';
import {accountReceipts,backupLimit,deleteReceiptObjects,fromBase64,receiptBucket,receiptInsert,stageReceipts,toBase64,validatePhoto,withReceipts,type StoredReceipt} from '@/lib/receipts-server';
export const dynamic='force-dynamic';
function csvCell(value:unknown){let text=String(value??'');if(/^(?:\s*[=+\-@]|[\t\r])/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
export async function GET(request:Request){return boundary(async()=>{
 const account=await requireAccount(request);
 const rows=await withReceipts((await db().prepare(`SELECT id,date,${normalizedKind} AS kind,category,description,amount,note,sample,refunded,from_emergency AS fromEmergency FROM transactions WHERE account_id=? ORDER BY date,id`).bind(account.id).all<Transaction>()).results.map(t=>({...t,refunded:!!t.refunded,fromEmergency:!!t.fromEmergency})),account.id);
 if(new URL(request.url).searchParams.get('format')==='csv'){
  const fields=['Date','Group','Category','Description','Amount (EUR)','Note','Refunded','Taken from emergency fund','Receipts'];
  const csv=[fields,...rows.map(t=>[t.date,groups[t.kind],t.category,t.description,(t.amount/100).toFixed(2),t.note,t.refunded?'yes':'no',t.fromEmergency?'yes':'no',(t.receipts||[]).map(r=>r.name).join('; ')])].map(row=>row.map(csvCell).join(',')).join('\r\n');
  return new Response('\uFEFF'+csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="pocket-transactions.csv"','Cache-Control':'no-store'}});
 }
 for(const year of new Set(rows.map(t=>Number(t.date.slice(0,4)))))await accountCategories(account.id,year);
 const years=(await db().prepare('SELECT year FROM category_years WHERE account_id=? ORDER BY year').bind(account.id).all<{year:number}>()).results.map(y=>y.year);
 const categories=(await db().prepare('SELECT year,kind,name,position FROM year_categories WHERE account_id=? ORDER BY year,position,rowid').bind(account.id).all<Category>()).results;
 const stored=await accountReceipts(account.id);
 if(stored.reduce((n,r)=>n+r.size,0)>10_000_000)throw new HttpError(413,'Receipt photos exceed the backup limit. Download receipts separately.');
 const photos=new Map<string,{name:string;type:string;data:string}[]>();
 for(const r of stored){const object=await receiptBucket().get(r.objectKey);if(!object)throw new HttpError(503,'A receipt could not be backed up. Please try again.');const list=photos.get(r.transactionId)||[];list.push({name:r.name,type:r.type,data:toBase64(new Uint8Array(await object.arrayBuffer()))});photos.set(r.transactionId,list);}
 const output=JSON.stringify({app:'pocket',version:2,exportedAt:new Date().toISOString(),accent:account.accent,years,categories,transactions:rows.map(t=>({...t,receipts:photos.get(t.id)||[]}))},null,2);
 if(output.length>backupLimit)throw new HttpError(413,'Backup exceeds 20 MB. Download receipts separately.');
 return new Response(output,{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="pocket-backup.json"','Cache-Control':'no-store'}});
});}
export async function POST(request:Request){return boundary(async()=>{
 sameOrigin(request);const account=await requireAccount(request),input=await body(request,backupLimit);
 if(input?.app!=='pocket'||![1,2].includes(input.version)||!Array.isArray(input.years)||!Array.isArray(input.categories)||!Array.isArray(input.transactions)||input.transactions.length>10000||input.categories.length>5000||input.years.length>200)throw new HttpError(400,'Choose a valid Pocket backup (up to 10,000 entries).');
 const years=input.years.map(validYear);if(new Set(years).size!==years.length)throw new HttpError(400,'Duplicate years in backup.');
 const keys=new Set<string>(),exactKeys=new Set<string>();
 const categories=input.categories.map((c:Record<string,unknown>)=>{
  if(!c||typeof c!=='object')throw new HttpError(400,'Invalid category in backup.');
  const year=validYear(c.year);if(!years.includes(year)||typeof c.kind!=='string'||!Object.hasOwn(groups,c.kind)||typeof c.name!=='string'||!c.name.trim()||c.name.length>60||!Number.isSafeInteger(c.position)||Number(c.position)<0)throw new HttpError(400,'Invalid category in backup.');
  const key=JSON.stringify([year,c.kind,c.name.trim().toLowerCase()]);if(keys.has(key))throw new HttpError(400,'Duplicate category in backup.');keys.add(key);exactKeys.add(JSON.stringify([year,c.kind,c.name.trim()]));return {year,kind:c.kind,name:c.name.trim(),position:Number(c.position)};
 });
 let photoSize=0;
 const transactions=input.transactions.map((item:Record<string,unknown>)=>{
  const t=validateTransaction(item);if(!exactKeys.has(JSON.stringify([Number(t.date.slice(0,4)),t.kind,t.category])))throw new HttpError(400,'A transaction has no category in its year.');
  const raw=item.receipts??[];if(!Array.isArray(raw)||raw.length>8)throw new HttpError(400,'Invalid receipts in backup.');
  const photos=raw.map((r:Record<string,unknown>)=>{if(!r||typeof r!=='object')throw new HttpError(400,'Invalid receipt in backup.');const photo=validatePhoto(r.name,r.type,fromBase64(r.data));photoSize+=photo.data.length;if(photoSize>10_000_000)throw new HttpError(413,'Receipt photos exceed the backup limit.');return photo;});
  return {id:crypto.randomUUID(),t,photos};
 });
 if(typeof input.accent!=='string'||!/^#[a-fA-F0-9]{6}$/.test(input.accent))throw new HttpError(400,'Invalid accent in backup.');
 const oldReceipts=await accountReceipts(account.id),uploaded:StoredReceipt[]=[];
 try{for(const record of transactions)uploaded.push(...await stageReceipts(record.photos,account.id,record.id));}catch(e){await deleteReceiptObjects(uploaded);throw e;}
 // All validation completes before this account-only atomic replacement.
 try{await db().batch([
  db().prepare('DELETE FROM transactions WHERE account_id=?').bind(account.id),
  db().prepare('DELETE FROM year_categories WHERE account_id=?').bind(account.id),
  db().prepare('DELETE FROM category_years WHERE account_id=?').bind(account.id),
  db().prepare('DELETE FROM budget_categories WHERE account_id=?').bind(account.id),
  db().prepare('UPDATE accounts SET accent=?,categories_initialized=1 WHERE id=?').bind(input.accent,account.id),
  ...years.map((year:number)=>db().prepare('INSERT INTO category_years (account_id,year) VALUES (?,?)').bind(account.id,year)),
  ...categories.map((c:{year:number;kind:string;name:string;position:number})=>db().prepare('INSERT INTO year_categories (id,account_id,year,kind,name,position) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),account.id,c.year,c.kind,c.name,c.position)),
  ...transactions.map(({id,t}:{id:string;t:ReturnType<typeof validateTransaction>})=>db().prepare('INSERT INTO transactions (id,account_id,date,kind,category,description,amount,note,refunded,from_emergency,sample) VALUES (?,?,?,?,?,?,?,?,?,?,0)').bind(id,account.id,t.date,t.kind,t.category,t.description,t.amount,t.note,Number(t.refunded),Number(t.fromEmergency))),...uploaded.map(receiptInsert)
 ]);}catch(e){await deleteReceiptObjects(uploaded);throw e;}
 await deleteReceiptObjects(oldReceipts);return json({account:{...account,accent:input.accent}});
});}
