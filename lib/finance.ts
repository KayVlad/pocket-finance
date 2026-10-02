export const groups={income:'Income',investment:'Investments',essential:'Essential',personal:'Personal',emergency:'Emergency fund'} as const;
export type Kind=keyof typeof groups;
export const categories:Record<Kind,string[]>={income:['Salary','Meal allowance','Apartment income','Holiday / Christmas bonus','Other income'],essential:['Rent','Groceries','Transport','Phone','Pharmacy','Healthcare','Tuition','Laundry'],personal:['Restaurants & cafés','Clothes & shoes','Hair & beauty','Manicure','Supplements','Books, gadgets & courses','Outings','Other expenses','Gym','Spotify','Holidays'],investment:['ETF','Other investments'],emergency:['Contributions']};
export type Category={id:string;year:number;kind:Kind;name:string;position:number};
export type Account={id:string;name:string;username:string;role:'admin'|'user';accent:string;disabled:number};
export type Receipt={id:string;name:string;type:string;size:number};
export type Transaction={id:string;date:string;kind:Kind;category:string;description:string;amount:number;note:string;sample:number;refunded:boolean;fromEmergency:boolean;receipts?:Receipt[]};
export function transactionDirection(t:Transaction){return t.kind==='income'||t.kind==='emergency'?'positive':'negative';}
export function money(cents:number){return new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(cents/100);}
export function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function budgetValue(t:Transaction){return t.refunded||t.fromEmergency||t.kind==='emergency'?0:t.amount;}
export function fundValue(t:Transaction){return t.refunded?0:t.kind==='emergency'?t.amount:t.fromEmergency?-t.amount:0;}
export function totals(rows:Transaction[]){let income=0,expenses=0,investments=0,emergency=0,contributions=0;for(const r of rows){emergency+=fundValue(r);if(r.kind==='emergency'&&!r.refunded)contributions+=r.amount;const amount=budgetValue(r);if(r.kind==='income')income+=amount;else if(r.kind==='investment')investments+=amount;else expenses+=amount;}return {income,expenses,investments,emergency,left:income-expenses-investments-contributions};}
export function parseAmount(value:string){if(!/^\d{1,8}([.,]\d{1,2})?$/.test(value.trim()))throw new Error('Enter a positive amount with up to two decimal places.');const [whole,fraction='']=value.trim().replace(',','.').split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(cents<=0)throw new Error('Amount must be greater than zero.');return cents;}
