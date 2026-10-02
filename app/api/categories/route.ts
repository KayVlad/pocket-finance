import {body,boundary,db,HttpError,json,requireAccount,sameOrigin} from '@/lib/server';
import {accountReceipts,deleteReceiptObjects} from '@/lib/receipts-server';
import {groups,type Category} from '@/lib/finance';
import {accountCategories,normalizedKind,validYear} from '@/lib/categories-server';
export const dynamic='force-dynamic';
function nameAndKind(input:Record<string,unknown>){if(!input||typeof input.kind!=='string'||!Object.hasOwn(groups,input.kind)||typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>60)throw new HttpError(400,'Enter a category name and group.');return {kind:input.kind,name:input.name.trim()};}
export async function GET(request:Request){return boundary(async()=>{const account=await requireAccount(request),year=validYear(new URL(request.url).searchParams.get('year'));return json({categories:await accountCategories(account.id,year)});});}
export async function POST(request:Request){return boundary(async()=>{
 sameOrigin(request);const account=await requireAccount(request),input=await body(request),year=validYear(input?.year),c=nameAndKind(input);
 const list=await accountCategories(account.id,year);if(list.some(t=>t.kind===c.kind&&t.name.toLowerCase()===c.name.toLowerCase()))throw new HttpError(409,'That category already exists.');
 await db().prepare('INSERT INTO year_categories (id,account_id,year,kind,name,position) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),account.id,year,c.kind,c.name,Math.max(-1,...list.map(t=>t.position))+1).run();return json({categories:await accountCategories(account.id,year)},201);
});}
export async function PATCH(request:Request){return boundary(async()=>{
 sameOrigin(request);const account=await requireAccount(request),input=await body(request),year=validYear(input?.year),list=await accountCategories(account.id,year),old=list.find(t=>t.id===input.id);
 if(!old)throw new HttpError(404,'Category not found.');
 if(input.direction!==undefined){
  if(![-1,1].includes(input.direction))throw new HttpError(400,'Choose an order.');
  const peers=list.filter(t=>t.kind===old.kind),index=peers.findIndex(t=>t.id===old.id),target=index+input.direction;
  if(target>=0&&target<peers.length){[peers[index],peers[target]]=[peers[target],peers[index]];await db().batch(peers.map((c,i)=>db().prepare('UPDATE year_categories SET position=? WHERE id=? AND account_id=? AND year=?').bind(i,c.id,account.id,year)));}
 }else{
  const c=nameAndKind(input);if(list.some(t=>t.id!==old.id&&t.kind===c.kind&&t.name.toLowerCase()===c.name.toLowerCase()))throw new HttpError(409,'That category already exists.');
  const statements=[db().prepare('UPDATE year_categories SET name=?,kind=? WHERE id=? AND account_id=? AND year=?').bind(c.name,c.kind,old.id,account.id,year),db().prepare(`UPDATE transactions SET category=?,kind=?,refunded=CASE WHEN ? IN ('income','emergency') THEN 0 ELSE refunded END,from_emergency=CASE WHEN ? IN ('income','emergency') THEN 0 ELSE from_emergency END WHERE account_id=? AND date>=? AND date<=? AND ${normalizedKind}=? AND category=?`).bind(c.name,c.kind,c.kind,c.kind,account.id,year+'-01-01',year+'-12-31',old.kind,old.name)];
  await db().batch(statements);
 }
 return json({categories:await accountCategories(account.id,year)});
});}
export async function DELETE(request:Request){return boundary(async()=>{
 sameOrigin(request);const account=await requireAccount(request),input=await body(request),year=validYear(input?.year);
 if(typeof input?.id!=='string')throw new HttpError(400,'Choose a category.');
 const c=await db().prepare('SELECT kind,name FROM year_categories WHERE id=? AND account_id=? AND year=?').bind(input.id,account.id,year).first<Category>();if(!c)throw new HttpError(404,'Category not found.');
 const affected=(await db().prepare(`SELECT id FROM transactions WHERE account_id=? AND date>=? AND date<=? AND ${normalizedKind}=? AND category=?`).bind(account.id,year+'-01-01',year+'-12-31',c.kind,c.name).all<{id:string}>()).results;
 const receipts=(await accountReceipts(account.id)).filter(r=>affected.some(t=>t.id===r.transactionId));
 await db().batch([db().prepare(`DELETE FROM transactions WHERE account_id=? AND date>=? AND date<=? AND ${normalizedKind}=? AND category=?`).bind(account.id,year+'-01-01',year+'-12-31',c.kind,c.name),db().prepare('DELETE FROM year_categories WHERE id=? AND account_id=? AND year=?').bind(input.id,account.id,year)]);
 await deleteReceiptObjects(receipts);
 return json({categories:await accountCategories(account.id,year)});
});}
