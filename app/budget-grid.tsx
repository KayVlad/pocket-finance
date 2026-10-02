'use client';
import {Fragment,useEffect,useRef} from 'react';
import {Plus} from 'lucide-react';
import {Table,TableHeader,TableBody,TableHead,TableRow,TableCell} from '@/components/ui/table';
import {groups,money,type Kind,type Transaction,type Category} from '@/lib/finance';
import {selectTransactions,selectionAmount,type BudgetSelection} from '@/lib/budget';
export const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const order:Kind[]=['income','emergency','investment','essential','personal'];
const number=new Intl.NumberFormat('en-IE',{minimumFractionDigits:2,maximumFractionDigits:2});
type Props={rows:Transaction[];categories:Category[];year:number;month?:number;fundOpening:number;loading:boolean;error:boolean;busy:boolean;onSelect:(s:BudgetSelection)=>void;onAdd:(s:BudgetSelection)=>void;onPropagate:(s:BudgetSelection)=>void;onFocus:(s:BudgetSelection)=>void;onCategory:(kind:Kind)=>void};
export default function BudgetGrid({rows,categories,year,month,fundOpening,loading,error,busy,onSelect,onAdd,onPropagate,onFocus,onCategory}:Props){
 const pendingClick=useRef<ReturnType<typeof setTimeout>|null>(null);
 function cancelClick(){if(pendingClick.current!==null){clearTimeout(pendingClick.current);pendingClick.current=null;}}
 useEffect(()=>{cancelClick();return cancelClick;},[year,month,rows,loading,error,busy]);
 function cell(selection:BudgetSelection,total=false,archived=false){
  const items=selectTransactions(rows,selection),amount=selectionAmount(rows,selection,fundOpening);
  const period=selection.month===undefined?String(year):`${months[selection.month]} ${year}`;
  const label=`${selection.label}, ${period}: ${money(amount)}. ${items.length} transactions`;
  const quick=!!selection.category&&!archived;
  const forward=quick&&items.length>0&&selection.month!==undefined&&selection.month<11;
  return <TableCell key={selection.month??'year'} className={`${total?'year-total ':''}${selection.month===new Date().getMonth()&&year===new Date().getFullYear()?'current-month ':''}${amount<0?'negative':''}`}><div className="cell-wrap"><button className={`budget-cell ${items.length?'has-entries':'is-empty'}`} disabled={loading||error||busy} aria-label={label} onFocus={()=>onFocus(selection)} title={quick&&!items.length?'Add transaction':forward?'View transactions · Double-click to replace later months':'View transactions'} onClick={e=>{cancelClick();const open=()=>quick&&!items.length?onAdd(selection):onSelect(selection);if(!forward||e.detail===0){open();return;}if(e.detail===1)pendingClick.current=setTimeout(()=>{pendingClick.current=null;open();},500);}} onDoubleClick={forward?()=>{cancelClick();onPropagate(selection);}:undefined}>{loading||error?'—':items.length||total||!selection.category?number.format(amount/100):<span className="empty-cell-mark">—</span>}</button>{quick&&items.length>0&&<button className="cell-add" aria-label={`Add to ${selection.label}, ${period}`} disabled={loading||error||busy} onClick={()=>{cancelClick();onAdd(selection);}}><Plus size={13}/></button>}</div></TableCell>;
 }
 function cells(selection:BudgetSelection,archived=false){return <>{(month===undefined?months.map((_,i)=>i):[month]).map(month=>cell({...selection,month},false,archived))}{month===undefined&&cell({...selection,month:undefined},true,archived)}</>;}
 return <section className="budget-panel" aria-label={`Budget for ${year}`}><div className="budget-scroll"><Table className={`budget-table ${month===undefined?'annual-grid':'monthly-grid'}`}><caption className="sr-only">Budget in euros. Empty cells add a transaction. Filled cells show history. Press plus to add and Ctrl+Enter to save.</caption><TableHeader><TableRow><TableHead scope="col" className="category-cell">EUR</TableHead>{(month===undefined?months.map((_,i)=>i):[month]).map(i=><TableHead key={i} scope="col" className={i===new Date().getMonth()&&year===new Date().getFullYear()?'current-month':''}>{months[i]}</TableHead>)}{month===undefined&&<TableHead scope="col" className="year-total">Total</TableHead>}</TableRow></TableHeader><TableBody>
 {order.map(kind=><Fragment key={kind}><TableRow className={`budget-group group-${kind}`}><TableHead scope="row" className="category-cell"><span>{groups[kind]}</span><button className="group-add" aria-label={`Add ${groups[kind].toLowerCase()} category`} title="Add category" onClick={()=>onCategory(kind)}><Plus size={15}/></button></TableHead><TableCell colSpan={month===undefined?13:1}/></TableRow>{categories.filter(c=>c.kind===kind).map(c=><TableRow key={c.id} className="category-row"><TableHead scope="row" className="category-cell">{c.name}</TableHead>{cells({kind,category:c.name,label:c.name},false)}</TableRow>)}{kind!=='emergency'&&<TableRow className="budget-subtotal"><TableHead scope="row" className="category-cell">{'Total '+groups[kind].toLowerCase()}</TableHead>{cells({kind,label:groups[kind]})}</TableRow>}{kind==='emergency'&&<><TableRow className="budget-remainder"><TableHead scope="row" className="category-cell">Fund balance</TableHead>{cells({summary:'fund',label:'Emergency fund balance'})}</TableRow></>}</Fragment>)}
 <TableRow className="budget-grandtotal"><TableHead scope="row" className="category-cell">Expenses</TableHead>{cells({summary:'expenses',label:'Expenses'})}</TableRow>
 <TableRow className="budget-subtotal"><TableHead scope="row" className="category-cell">Taken from fund</TableHead>{cells({summary:'fundTaken',label:'Taken from fund'})}</TableRow>
 <TableRow className="budget-remainder"><TableHead scope="row" className="category-cell">Left over</TableHead>{cells({summary:'left',label:'Left over'})}</TableRow>
 </TableBody></Table></div></section>;
}
