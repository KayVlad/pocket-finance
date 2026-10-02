'use client';
import {useCallback,useEffect,useRef,useState,type CSSProperties,type FormEvent} from 'react';
import {Wallet,Plus,ChevronLeft,ChevronRight,LogOut,Settings2,Tags,Users} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import TransactionHistory from './transaction-history';
import ReceiptFields from './receipt-fields';
import ConfirmationContent from './confirmation-content';
import {AlertDialog,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {Toaster,toast} from 'sonner';
import BudgetGrid,{months} from './budget-grid';
import {Checkbox} from '@/components/ui/checkbox';
import {CategoryManager,UserManager,BackupControls} from './manage-finance';
import {groups,money,today,totals,parseAmount,type Receipt,type Kind,type Transaction,type Category,type Account} from '@/lib/finance';
import {selectionAmount,type BudgetSelection} from '@/lib/budget';
type Data={account:Account|null;transactions:Transaction[];categories:Category[];users:Account[];fundOpening:number;propagation?:{entries:number;months:number}};
async function api(url:string,method='GET',data?:unknown):Promise<Data>{
 const r=await fetch(url,{method,headers:data&&!(data instanceof FormData)?{'Content-Type':'application/json'}:undefined,body:data instanceof FormData?data:data?JSON.stringify(data):undefined});
 const result=await r.json() as Data&{error?:string};if(!r.ok)throw new Error(result.error||'Could not save. Try again.');return result;
}
const blank=()=>({id:'',date:today(),kind:'essential' as Kind,category:'Groceries',description:'',amount:'',note:'',refunded:false,fromEmergency:false,receipts:[] as Receipt[]});
function accentStyle(color:string):CSSProperties{
 const values=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));
 const luminance=values[0]*.2126+values[1]*.7152+values[2]*.0722;
 return {'--user-accent':color,'--accent-ink':luminance>.18?'#121212':'#ffffff','--accent-text':luminance<.18?'#e0e0e0':color} as CSSProperties;
}
export default function Finance(){
 const [account,setAccount]=useState<Account|null>(null),[ready,setReady]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [rows,setRows]=useState<Transaction[]>([]),[catalog,setCatalog]=useState<Category[]>([]),[year,setYear]=useState(Number(today().slice(0,4)));
 const [month,setMonth]=useState<number|undefined>(undefined),[fundOpening,setFundOpening]=useState(0),[entryCatalog,setEntryCatalog]=useState<Category[]>([]),[catalogLoading,setCatalogLoading]=useState(false);
 const [selection,setSelection]=useState<BudgetSelection|null>(null),[draft,setDraft]=useState(blank()),[editor,setEditor]=useState(false);
 const [receiptFiles,setReceiptFiles]=useState<File[]>([]),[removedReceipts,setRemovedReceipts]=useState<string[]>([]);
 useEffect(()=>{setReceiptFiles([]);setRemovedReceipts([]);},[editor,draft.id]);
 const [busy,setBusy]=useState(false),[formError,setFormError]=useState(''),[removing,setRemoving]=useState<Transaction|null>(null);
 const [username,setUsername]=useState(''),[password,setPassword]=useState('');
 const [categoryDialog,setCategoryDialog]=useState(false),[categoryKind,setCategoryKind]=useState<Kind>('essential');
 const [preferences,setPreferences]=useState(false),[accent,setAccent]=useState('#2dd4bf'),[currentPassword,setCurrentPassword]=useState(''),[newPassword,setNewPassword]=useState('');
 const [userDialog,setUserDialog]=useState(false);
 const focusedCell=useRef<BudgetSelection|null>(null),amountInput=useRef<HTMLInputElement>(null),entryForm=useRef<HTMLFormElement>(null);
 const propagationLock=useRef(false);
 const currentYear=useRef(year);currentYear.current=year;
 useEffect(()=>{const style=accentStyle(preferences?accent:account?.accent||'#2dd4bf');Object.entries(style).forEach(([key,value])=>document.documentElement.style.setProperty(key,String(value)));},[account?.accent,preferences,accent]);
 useEffect(()=>{if(window.matchMedia('(max-width:760px)').matches)setMonth(new Date().getMonth());},[]);
 useEffect(()=>{api('/api/account').then(d=>{setAccount(d.account);if(d.account)setAccent(d.account.accent);}).catch(e=>setError(e.message)).finally(()=>setReady(true));},[]);
 useEffect(()=>{
  if(!account){setRows([]);setCatalog([]);return;}
  let live=true;setLoading(true);setError('');setRows([]);
  Promise.all([api('/api/transactions?year='+year),api('/api/categories?year='+year)]).then(([t,c])=>{if(live){setRows(t.transactions);setFundOpening(t.fundOpening);setCatalog(c.categories);}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[account?.id,year]);
 async function refresh(){const [d,c]=await Promise.all([api('/api/transactions?year='+year),api('/api/categories?year='+year)]);if(currentYear.current!==year)return;setRows(d.transactions);setFundOpening(d.fundOpening);setCatalog(c.categories);setError('');}
 async function propagate(cell:BudgetSelection){
  if(busy||loading||propagationLock.current)return;
  propagationLock.current=true;setBusy(true);
  try{
   const d=await api('/api/transactions/propagate','POST',{year,month:cell.month,kind:cell.kind,category:cell.category});
   const count=d.propagation?.months||0;
   toast.success(`Replaced ${count} later month${count===1?'':'s'}`);
   try{await refresh();}catch{setError('Copied. Reload to refresh totals.');}
  }catch(e){toast.error((e as Error).message);}finally{propagationLock.current=false;setBusy(false);}
 }
 useEffect(()=>{
  if(!editor)return;const target=Number(draft.date.slice(0,4));if(!Number.isInteger(target)||target<1900||target>9999)return;
  let live=true;setCatalogLoading(true);setEntryCatalog([]);
  const load=target===year?Promise.resolve({categories:catalog}):api('/api/categories?year='+target);
  load.then(d=>{if(!live)return;setEntryCatalog(d.categories);setDraft(current=>{if(d.categories.some(c=>c.kind===current.kind&&c.name===current.category))return current;const first=d.categories.find(c=>c.kind===current.kind)||d.categories[0];return {...current,kind:first?.kind||current.kind,category:first?.name||'',...(['income','emergency'].includes(first?.kind||'')?{refunded:false,fromEmergency:false}:{})};});}).catch(e=>{if(live)setFormError(e.message);}).finally(()=>{if(live)setCatalogLoading(false);});
  return()=>{live=false;};
 },[editor,draft.date.slice(0,4),year,catalog]);
 async function toggle(r:Transaction,flags:Partial<Pick<Transaction,'refunded'|'fromEmergency'>>){if(busy)return;setBusy(true);try{await api('/api/transactions','PUT',{...r,...flags});await refresh();}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
 const add=useCallback((cell?:BudgetSelection)=>{
  if(!account||loading)return;
  const active=catalog,chosen=active.find(c=>c.kind===cell?.kind&&c.name===cell?.category)||(!cell?.kind?active.find(c=>c.kind==='essential'&&c.name==='Groceries'):undefined)||active.find(c=>c.kind===(cell?.kind||'essential'))||active[0];
  if(!chosen){setCategoryDialog(true);setFormError('Add a category first.');return;}
  const m=cell?.month===undefined?(month===undefined?Number(today().slice(5,7)):month+1):cell.month+1,target=String(year)+'-'+String(m).padStart(2,'0');
  setDraft({...blank(),kind:chosen.kind,category:chosen.name,fromEmergency:cell?.summary==='fundTaken',date:target===today().slice(0,7)?today():target+'-01'});setFormError('');setEditor(true);
 },[account,catalog,year,month,loading]);
 useEffect(()=>{
  function shortcut(e:KeyboardEvent){
   const typing=(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]');
   if((e.key==='+'||e.code==='NumpadAdd')&&!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!editor&&!preferences&&!categoryDialog&&!userDialog&&!removing){e.preventDefault();add(focusedCell.current||selection||undefined);}
  }
  window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut);
 },[add,selection,editor,preferences,categoryDialog,userDialog,removing]);
 useEffect(()=>{
  const context=(document as Document&{modelContext?:{registerTool:(t:unknown,o:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
  if(!context?.registerTool)return;const lifecycle=new AbortController();
  Promise.resolve(context.registerTool({name:'start_transaction_creation',title:'Add a transaction',description:'Open the entry form for the focused budget cell. Does not save.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input:unknown){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Provide an empty object.');if(!account||loading)throw new Error('Sign in and wait for the budget.');add(focusedCell.current||undefined);return {status:'form_open'};}},{signal:lifecycle.signal})).catch(()=>{});return()=>lifecycle.abort();
 },[add,account,loading]);
 async function login(e:FormEvent){e.preventDefault();setBusy(true);setFormError('');try{const d=await api('/api/account','POST',{username,password});setAccount(d.account);setAccent(d.account!.accent);setPassword('');setError('');}catch(e){setFormError((e as Error).message);}finally{setBusy(false);}}
 async function save(e:FormEvent){
  e.preventDefault();if(busy||catalogLoading)return;setBusy(true);setFormError('');
  try{const input={...draft,amount:parseAmount(draft.amount),removeReceiptIds:removedReceipts};let payload:unknown=input;if(receiptFiles.length){const form=new FormData();form.set('transaction',JSON.stringify(input));receiptFiles.forEach(file=>form.append('receipts',file));payload=form;}await api('/api/transactions',draft.id?'PUT':'POST',payload);setEditor(false);const targetYear=Number(draft.date.slice(0,4));
   if(targetYear!==year){setYear(targetYear);setSelection(null);}else try{await refresh();}catch{setError('Saved. Reload to refresh totals.');}
   toast.success(draft.id?'Updated':'Added');
  }catch(e){setFormError((e as Error).message);}finally{setBusy(false);}
 }
 async function remove(){if(!removing||busy)return;setBusy(true);try{await api('/api/transactions','DELETE',{id:removing.id});setRemoving(null);await refresh();toast.success('Deleted');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
 function showCategory(kind?:Kind){setCategoryKind(kind||'essential');setFormError('');setCategoryDialog(true);}
 
 async function saveAccent(e:FormEvent){e.preventDefault();setBusy(true);setFormError('');try{const d=await api('/api/account','PATCH',{accent});setAccount(d.account);toast.success('Colour saved');}catch(e){setFormError((e as Error).message);}finally{setBusy(false);}}
 async function changePassword(e:FormEvent){e.preventDefault();setBusy(true);setFormError('');try{await api('/api/account','PUT',{currentPassword,password:newPassword});setCurrentPassword('');setNewPassword('');toast.success('Password changed');}catch(e){setFormError((e as Error).message);}finally{setBusy(false);}}
 function showUsers(){setFormError('');setUserDialog(true);}
 const periodRows=month===undefined?rows:rows.filter(r=>Number(r.date.slice(5,7))===month+1),sum=totals(periodRows),fundBalance=selectionAmount(rows,{label:'Fund',summary:'fund',month},fundOpening);
 const chosenKey=draft.category?JSON.stringify([draft.kind,draft.category]):'';
 return <div className="app-shell" style={accentStyle(preferences?accent:account?.accent||'#2dd4bf')}><Toaster theme="dark" position="bottom-right"/>
 <header className="topbar"><a className="brand" href="/"><Wallet size={22}/>pocket</a>{account&&<div className="account-nav"><span>{account.name}</span>{account.role==='admin'&&<button className="icon-btn" aria-label="Users" title="Users" onClick={()=>void showUsers()}><Users size={18}/></button>}<button className="icon-btn" aria-label="Settings" title="Settings" onClick={()=>{setAccent(account.accent);setFormError('');setPreferences(true);}}><Settings2 size={18}/></button><button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={async()=>{try{await api('/api/account','DELETE');setAccount(null);setSelection(null);focusedCell.current=null;}catch(e){toast.error((e as Error).message);}}}><LogOut size={18}/></button></div>}</header>
 {!ready?<main className="login-main"><p className="muted">Loading…</p></main>:!account?<main className="login-main"><section className="login-card"><h1>Sign in</h1><form className="entry-form" onSubmit={login}><label>Username<input required autoFocus autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{(formError||error)&&<p className="error" role="alert">{formError||error}</p>}<button className="primary" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form></section></main>:<main className="sheet-main">
 <div className="sheet-toolbar"><div className="period-controls"><div className="year-picker"><button aria-label="Previous year" disabled={year<=1900||loading} onClick={()=>{setYear(year-1);focusedCell.current=null;setSelection(null);}}><ChevronLeft size={17}/></button><input aria-label="Year" type="number" min="1900" max="9999" value={year} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=1900&&n<=9999){setYear(n);focusedCell.current=null;setSelection(null);}}}/><button aria-label="Next year" disabled={year>=9999||loading} onClick={()=>{setYear(year+1);focusedCell.current=null;setSelection(null);}}><ChevronRight size={17}/></button></div><div className="view-switch"><button aria-pressed={month===undefined} onClick={()=>{setMonth(undefined);setSelection(null);focusedCell.current=null;}}>Year</button><button aria-pressed={month!==undefined} onClick={()=>{setMonth(new Date().getMonth());setSelection(null);focusedCell.current=null;}}>Month</button></div>{month!==undefined&&<select aria-label="Month" className="month-picker" value={month} onChange={e=>{setMonth(Number(e.target.value));setSelection(null);focusedCell.current=null;}}>{months.map((m,i)=><option key={m} value={i}>{m}</option>)}</select>}</div><div className="sheet-actions"><button className="secondary" onClick={()=>{setSelection({label:'Transactions',month});}}>History</button><button className="secondary" onClick={()=>showCategory()}><Tags size={16}/>Categories</button><button className="primary" disabled={loading||!!error} onClick={()=>add()} title="Add transaction (+)"><Plus size={17}/>Add <kbd>+</kbd></button></div></div>
 {error&&<div className="error" role="alert">{error}<button onClick={()=>window.location.reload()}>Reload</button></div>}
 <section className="year-overview" aria-label={month===undefined?"Annual totals":"Monthly totals"}><div><span>Income</span><strong>{loading?'—':money(sum.income)}</strong></div><div><span>Expenses</span><strong>{loading?'—':money(sum.expenses)}</strong></div><div><span>Investments</span><strong>{loading?'—':money(sum.investments)}</strong></div><div><span>Left over</span><strong className={sum.left<0?'negative':'accent-text'}>{loading?'—':money(sum.left)}</strong></div><div><span>Emergency fund</span><strong className={fundBalance<0?'negative':'accent-text'}>{loading?'—':money(fundBalance)}</strong></div></section>
 <BudgetGrid rows={rows} categories={catalog} year={year} month={month} fundOpening={fundOpening} loading={loading} error={!!error} busy={busy} onSelect={s=>{focusedCell.current=s;setSelection(s);}} onAdd={add} onPropagate={s=>void propagate(s)} onFocus={s=>{focusedCell.current=s;}} onCategory={showCategory}/>
 </main>}
 <TransactionHistory accountId={account?.id||''} selection={selection} year={year} rows={rows} fundOpening={fundOpening} busy={busy} onClose={()=>setSelection(null)} onAdd={()=>add(selection||undefined)} onEdit={r=>{setDraft({...r,receipts:r.receipts||[],amount:(r.amount/100).toFixed(2)});setFormError('');setEditor(true);}} onDelete={setRemoving} onToggle={(r,flags)=>void toggle(r,flags)}/>
 <Dialog open={editor} onOpenChange={v=>{if(!busy)setEditor(v);}}><DialogContent className="form-dialog quick-entry" onOpenAutoFocus={e=>{e.preventDefault();amountInput.current?.focus();}}><DialogTitle>{draft.id?'Edit entry':'New entry'}</DialogTitle><DialogDescription className="sr-only">Enter an amount, category and date, with an optional description and note. Ctrl+Enter saves.</DialogDescription><form ref={entryForm} onSubmit={save} className="entry-form" onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();if(!busy)entryForm.current?.requestSubmit();}}}>
 <div className="amount-input"><label htmlFor="amount">Amount</label><span>€</span><input id="amount" ref={amountInput} required inputMode="decimal" placeholder="0.00" value={draft.amount} onChange={e=>setDraft({...draft,amount:e.target.value})}/></div><label>Description<input maxLength={120} placeholder="Transaction" value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
 <div className="form-grid"><label>Category<select required aria-label="Category" value={chosenKey} onChange={e=>{if(!e.target.value){setDraft({...draft,category:''});return;}const [kind,category]=JSON.parse(e.target.value) as [Kind,string];setDraft({...draft,kind,category,...(['income','emergency'].includes(kind)?{refunded:false,fromEmergency:false}:{})});}}><option value="">Choose category</option>{Object.entries(groups).map(([kind,label])=><optgroup key={kind} label={label}>{entryCatalog.filter(c=>c.kind===kind).map(c=><option key={c.id} value={JSON.stringify([c.kind,c.name])}>{c.name}</option>)}</optgroup>)}</select></label><label>Date<input required type="date" min="1900-01-01" max="9999-12-31" value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label></div>{['essential','personal','investment'].includes(draft.kind)&&<div className="transaction-flags"><label><Checkbox checked={draft.refunded} onCheckedChange={v=>setDraft({...draft,refunded:v===true})}/>Refunded</label><label><Checkbox checked={draft.fromEmergency} onCheckedChange={v=>setDraft({...draft,fromEmergency:v===true})}/>Taken from emergency fund</label></div>}<label>Note<textarea rows={2} maxLength={1000} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label><ReceiptFields existing={draft.receipts} files={receiptFiles} removed={removedReceipts} busy={busy} onFiles={setReceiptFiles} onRemoved={setRemovedReceipts} onError={setFormError}/>{formError&&<p className="error" role="alert">{formError}</p>}<button className="primary full" disabled={busy||catalogLoading||!draft.category}>{busy?'Saving…':'Save'}<kbd>Ctrl ↵</kbd></button></form></DialogContent></Dialog>
 <Dialog open={categoryDialog} onOpenChange={v=>setCategoryDialog(v)}><DialogContent className="form-dialog"><DialogTitle>Categories · {year}</DialogTitle><DialogDescription className="sr-only">Manage categories for this year. Deletion removes this year's transactions only.</DialogDescription><CategoryManager categories={catalog} rows={rows} year={year} initialKind={categoryKind} onChanged={refresh}/></DialogContent></Dialog>
 <Dialog open={preferences} onOpenChange={v=>{if(!busy)setPreferences(v);}}><DialogContent className="form-dialog"><DialogTitle>Settings</DialogTitle><DialogDescription className="sr-only">Choose your accent colour or change your password.</DialogDescription><form onSubmit={saveAccent} className="entry-form"><label>Accent<div className="accent-swatches">{['#2dd4bf','#60a5fa','#a78bfa','#fbbf24','#fb7185','#a3e635'].map(c=><button key={c} type="button" aria-label={'Accent '+c} aria-pressed={accent===c} style={{background:c}} onClick={()=>setAccent(c)}/>)}<input aria-label="Custom accent colour" type="color" value={accent} onChange={e=>setAccent(e.target.value)}/></div></label><button className="primary" disabled={busy}>Save colour</button></form><form onSubmit={changePassword} className="entry-form password-form"><h3>Password</h3><label>Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label><label>New password<input required type="password" minLength={12} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><button className="secondary" disabled={busy}>Change password</button></form>{formError&&<p className="error" role="alert">{formError}</p>}<BackupControls/></DialogContent></Dialog>
 <Dialog open={userDialog} onOpenChange={v=>setUserDialog(v)}><DialogContent className="form-dialog"><DialogTitle>Users</DialogTitle><DialogDescription className="sr-only">Create, disable or reset passwords for users.</DialogDescription><UserManager/></DialogContent></Dialog>
 <AlertDialog open={!!removing} onOpenChange={v=>{if(!v&&!busy)setRemoving(null);}}><ConfirmationContent><AlertDialogTitle>Delete entry?</AlertDialogTitle><AlertDialogDescription>{removing?.description} · {money(removing?.amount||0)}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e=>{e.preventDefault();void remove();}}>Delete</AlertDialogAction></AlertDialogFooter></ConfirmationContent></AlertDialog>
 </div>;
}
