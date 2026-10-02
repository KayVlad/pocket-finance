import {accountCategories,normalizedKind,validYear} from '@/lib/categories-server';
import {groups} from '@/lib/finance';
import {accountReceipts,deleteReceiptObjects} from '@/lib/receipts-server';
import {body,boundary,db,HttpError,json,requireAccount,sameOrigin} from '@/lib/server';

export const dynamic='force-dynamic';
export async function POST(request:Request){return boundary(async()=>{
 sameOrigin(request);
 const account=await requireAccount(request),input=await body(request);
 if(!input||typeof input!=='object')throw new HttpError(400,'Choose a category and month.');
 const year=validYear(input.year),{month,kind,category}=input;
 if(typeof month!=='number'||!Number.isInteger(month)||month<0||month>10)throw new HttpError(400,'Choose a month before December.');
 if(typeof kind!=='string'||!Object.hasOwn(groups,kind)||typeof category!=='string')throw new HttpError(400,'Choose a category.');
 const categories=await accountCategories(account.id,year);
 if(!categories.some(c=>c.kind===kind&&c.name===category))throw new HttpError(400,'Choose a category in this year.');
 const prefix=`${year}-${String(month+1).padStart(2,'0')}`,start=prefix+'-01',end=prefix+'-31';
 const source=await db().prepare(`SELECT COUNT(*) AS count FROM transactions WHERE account_id=? AND date>=? AND date<=? AND ${normalizedKind}=? AND category=?`).bind(account.id,start,end,kind,category).first<{count:number}>();
 if(!source?.count)throw new HttpError(400,'There are no transactions in this cell.');
 const laterStart=`${year}-${String(month+2).padStart(2,'0')}-01`,laterEnd=year+'-12-31';
 const receipts=(await accountReceipts(account.id));
 const replaced=(await db().prepare(`SELECT id FROM transactions WHERE account_id=? AND date>=? AND date<=? AND ${normalizedKind}=? AND category=?`).bind(account.id,laterStart,laterEnd,kind,category).all<{id:string}>()).results;
 // Delete later cells and fill them from the source in a single atomic batch.
 const statements=[db().prepare(`DELETE FROM transactions WHERE account_id=? AND date>=? AND date<=? AND ${normalizedKind}=? AND category=?`).bind(account.id,laterStart,laterEnd,kind,category),...Array.from({length:11-month},(_,i)=>{
  const target=month+i+2,targetPrefix=`${year}-${String(target).padStart(2,'0')}`;
  const days=new Date(Date.UTC(year,target,0)).getUTCDate();
  return db().prepare(`INSERT INTO transactions (id,account_id,date,kind,category,description,amount,note,sample,refunded,from_emergency)
   SELECT lower(hex(randomblob(16))),account_id,? || printf('%02d',MIN(CAST(substr(date,9,2) AS INTEGER),?)),?,category,description,amount,note,0,refunded,from_emergency
   FROM transactions WHERE account_id=? AND date>=? AND date<=? AND ${normalizedKind}=? AND category=?`)
   .bind(targetPrefix+'-',days,kind,account.id,start,end,kind,category);
 })];
 const result=await db().batch(statements);
 await deleteReceiptObjects(receipts.filter(r=>replaced.some(t=>t.id===r.transactionId)));
 return json({propagation:{entries:result.slice(1).reduce((sum,r)=>sum+r.meta.changes,0),months:result.slice(1).filter(r=>r.meta.changes>0).length}});
});}
