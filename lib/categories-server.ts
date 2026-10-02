import {categories,type Kind,type Category} from './finance';
import {db,HttpError} from './server';
export const normalizedKind="CASE WHEN kind='recurring' THEN 'personal' WHEN kind='investment' AND category='Emergency fund' AND NOT EXISTS (SELECT 1 FROM category_years WHERE category_years.account_id=transactions.account_id) THEN 'emergency' ELSE kind END";
export function validYear(value:unknown):number{const n=Number(value);if(value===null||value===undefined||!Number.isInteger(n)||n<1900||n>9999)throw new HttpError(400,'Choose a valid year.');return n;}
export async function accountCategories(accountId:string,year:number):Promise<Category[]>{
 const initialized=await db().prepare('SELECT year FROM category_years WHERE account_id=? AND year=?').bind(accountId,year).first();
 if(!initialized){
  const previous=await db().prepare('SELECT MAX(year) AS year FROM category_years WHERE account_id=? AND year<?').bind(accountId,year).first<{year:number|null}>();
  let template:{kind:Kind;name:string;position:number}[];
  if(previous?.year)template=(await db().prepare('SELECT kind,name,position FROM year_categories WHERE account_id=? AND year=? ORDER BY position,rowid').bind(accountId,previous.year).all<{kind:Kind;name:string;position:number}>()).results;
  else{
   const legacy=(await db().prepare("SELECT CASE WHEN kind='investment' AND name='Emergency fund' THEN 'emergency' ELSE kind END AS kind,name,rowid AS position FROM budget_categories WHERE account_id=? AND archived=0 ORDER BY rowid").bind(accountId).all<{kind:Kind;name:string;position:number}>()).results;
   const account=await db().prepare('SELECT categories_initialized FROM accounts WHERE id=?').bind(accountId).first<{categories_initialized:number}>();
   template=account?.categories_initialized?legacy:Object.entries(categories).flatMap(([kind,names])=>names.map((name,position)=>({kind:kind as Kind,name,position})));
   if(!template.some(c=>c.kind==='emergency'))template.push({kind:'emergency',name:'Contributions',position:999});
  }
  // Keep categories used by existing transactions when upgrading.
  const used=(await db().prepare(`SELECT DISTINCT ${normalizedKind} AS kind,category AS name FROM transactions WHERE account_id=? AND date>=? AND date<=?`).bind(accountId,year+'-01-01',year+'-12-31').all<{kind:Kind;name:string}>()).results;
  template=[...template,...used.filter(c=>!template.some(t=>t.kind===c.kind&&t.name===c.name)).map((c,i)=>({...c,position:1000+i}))];
  // Guard each insert and the year marker in one atomic batch.
  await db().batch([db().prepare("UPDATE transactions SET kind='emergency' WHERE account_id=? AND kind='investment' AND category='Emergency fund' AND NOT EXISTS (SELECT 1 FROM category_years WHERE account_id=?)").bind(accountId,accountId),...template.map(c=>db().prepare('INSERT OR IGNORE INTO year_categories (id,account_id,year,kind,name,position) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM category_years WHERE account_id=? AND year=?)').bind(crypto.randomUUID(),accountId,year,c.kind,c.name,c.position,accountId,year)),db().prepare('INSERT OR IGNORE INTO category_years (account_id,year) VALUES (?,?)').bind(accountId,year)]);
 }
 return (await db().prepare('SELECT id,year,kind,name,position FROM year_categories WHERE account_id=? AND year=? ORDER BY position,rowid').bind(accountId,year).all<Category>()).results;
}
