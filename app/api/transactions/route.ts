import {accountCategories,normalizedKind} from '@/lib/categories-server';
import {body,boundary,db,HttpError,json,requireAccount,sameOrigin} from '@/lib/server';
import {validateTransaction} from '@/lib/transaction-validation';
import type {Transaction} from '@/lib/finance';
import {accountReceipts,deleteReceiptObjects,receiptInsert,stageReceipts,transactionInput,withReceipts} from '@/lib/receipts-server';
export const dynamic='force-dynamic';
export const columns=`id,date,${normalizedKind} AS kind,category,description,amount,note,sample,refunded,from_emergency AS fromEmergency`;
export async function GET(request:Request){return boundary(async()=>{
 const account=await requireAccount(request),params=new URL(request.url).searchParams,year=params.get('year'),month=params.get('month');let start:string,end:string;
 if(params.get('all')==='1'){if(year!==null||month!==null)throw new HttpError(400,'Choose one history period.');start='1900-01-01';end='9999-12-31';}
 else if(year!==null){if(month!==null||!/^(19|[2-9]\d)\d{2}$/.test(year))throw new HttpError(400,'Choose a valid year.');start=year+'-01-01';end=year+'-12-31';}
 else{if(!month||!/^(19|[2-9]\d)\d{2}-(0[1-9]|1[0-2])$/.test(month))throw new HttpError(400,'Choose a valid month.');start=month+'-01';end=month+'-31';}
 const result=await db().prepare(`SELECT ${columns} FROM transactions WHERE account_id=? AND date>=? AND date<=? ORDER BY date DESC,id DESC`).bind(account.id,start,end).all<Transaction>();
 const opening=await db().prepare(`SELECT COALESCE(SUM(CASE WHEN refunded=1 THEN 0 WHEN ${normalizedKind}='emergency' THEN amount WHEN from_emergency=1 THEN -amount ELSE 0 END),0) AS amount FROM transactions WHERE account_id=? AND date<?`).bind(account.id,start.slice(0,4)+'-01-01').first<{amount:number}>();
 return json({transactions:await withReceipts(result.results.map(t=>({...t,refunded:!!t.refunded,fromEmergency:!!t.fromEmergency})),account.id),fundOpening:opening?.amount||0});
});}
async function allowed(accountId:string,t:ReturnType<typeof validateTransaction>){const list=await accountCategories(accountId,Number(t.date.slice(0,4)));if(!list.some(c=>c.kind===t.kind&&c.name===t.category))throw new HttpError(400,'Choose a category in the transaction year.');}
async function saveTransaction(request:Request,editing:boolean){return boundary(async()=>{
 sameOrigin(request);const account=await requireAccount(request),{input,photos}=await transactionInput(request),t=validateTransaction(input);
 const id=editing?input.id:crypto.randomUUID();if(typeof id!=='string')throw new HttpError(400,'Missing transaction.');
 if(editing&&!await db().prepare('SELECT id FROM transactions WHERE id=? AND account_id=?').bind(id,account.id).first())throw new HttpError(404,'Transaction not found.');
 await allowed(account.id,t);
 const old=(await accountReceipts(account.id)).filter(r=>r.transactionId===id),remove=input.removeReceiptIds??[];
 if(!Array.isArray(remove)||remove.some((r:unknown)=>typeof r!=='string'||!old.some(o=>o.id===r)))throw new HttpError(400,'Choose receipts on this entry.');
 if(old.length-new Set(remove).size+photos.length>8)throw new HttpError(400,'Attach up to 8 receipt photos per entry.');
 const uploaded=await stageReceipts(photos,account.id,id);
 try{await db().batch([
  editing?db().prepare('UPDATE transactions SET date=?,kind=?,category=?,description=?,amount=?,note=?,refunded=?,from_emergency=? WHERE id=? AND account_id=?').bind(t.date,t.kind,t.category,t.description,t.amount,t.note,Number(t.refunded),Number(t.fromEmergency),id,account.id):db().prepare('INSERT INTO transactions (id,account_id,date,kind,category,description,amount,note,sample,refunded,from_emergency) VALUES (?,?,?,?,?,?,?,?,0,?,?)').bind(id,account.id,t.date,t.kind,t.category,t.description,t.amount,t.note,Number(t.refunded),Number(t.fromEmergency)),
  ...remove.map((receiptId:string)=>db().prepare('DELETE FROM receipts WHERE id=? AND account_id=? AND transaction_id=?').bind(receiptId,account.id,id)),...uploaded.map(receiptInsert)
 ]);}catch(e){await deleteReceiptObjects(uploaded);throw e;}
 await deleteReceiptObjects(old.filter(r=>remove.includes(r.id)));
 return json({id,ok:true},editing?200:201);
});}
export async function POST(request:Request){return saveTransaction(request,false);}
export async function PUT(request:Request){return saveTransaction(request,true);}
export async function DELETE(request:Request){return boundary(async()=>{
 sameOrigin(request);const account=await requireAccount(request),input=await body(request);if(typeof input?.id!=='string')throw new HttpError(400,'Missing transaction.');
 const receipts=(await accountReceipts(account.id)).filter(r=>r.transactionId===input.id);
 const result=await db().prepare('DELETE FROM transactions WHERE id=? AND account_id=?').bind(input.id,account.id).run();if(!result.meta.changes)throw new HttpError(404,'Transaction not found.');
 await deleteReceiptObjects(receipts);return json({ok:true});
});}
