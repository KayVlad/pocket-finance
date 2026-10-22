'use client';
import {useEffect,useState} from 'react';
import type {Account} from '@/lib/finance';
import {toast} from 'sonner';
import {requestData} from './manage-finance';
import ConfirmationContent from './confirmation-content';
import {AlertDialog,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';

type Role=Account['role'];
const emptyDraft=()=>({name:'',username:'',password:'',confirmation:'',role:'user' as Role});

export default function UserManager({accountId}:{accountId:string}){
 const [users,setUsers]=useState<Account[]>([]),[ready,setReady]=useState(false),[draft,setDraft]=useState(emptyDraft);
 const [resetId,setResetId]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
 const [deleting,setDeleting]=useState<Account|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let live=true;
  void requestData('/api/users').then(data=>{if(live)setUsers(data.users);}).catch(error=>{if(live)setError(error.message);}).finally(()=>{if(live)setReady(true);});
  return()=>{live=false;};
 },[]);
 async function action(method:string,data:unknown,message:string){
  if(busy)return;setBusy(true);setError('');
  try{
   await requestData('/api/users',method,data);
   // Clear completed actions even if refreshing the list fails.
   if(method==='POST')setDraft(emptyDraft());
   setResetId('');setPassword('');setConfirmation('');setDeleting(null);toast.success(message);
   setUsers((await requestData('/api/users')).users);
  }catch(error){setError((error as Error).message);}finally{setBusy(false);}
 }
 return <>
  <p className="muted">Admins manage accounts. Each account has its own private finance data.</p>
  <form className="entry-form" onSubmit={event=>{
   event.preventDefault();if(draft.password!==draft.confirmation){setError('Passwords do not match.');return;}
   void action('POST',draft,draft.role==='admin'?'Admin created':'User created');
  }}>
   <label>Name<input required maxLength={60} disabled={busy} value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
   <label>Username<input required minLength={3} maxLength={40} autoCapitalize="none" spellCheck={false} autoComplete="off" disabled={busy} value={draft.username} onChange={event=>setDraft({...draft,username:event.target.value})}/></label>
   <label>Role<select aria-label="Role" value={draft.role} disabled={busy} onChange={event=>setDraft({...draft,role:event.target.value as Role})}><option value="user">User</option><option value="admin">Admin</option></select></label>
   <label>Password<input required type="password" minLength={12} autoComplete="new-password" disabled={busy} value={draft.password} onChange={event=>setDraft({...draft,password:event.target.value})}/></label>
   <label>Confirm password<input required type="password" autoComplete="new-password" disabled={busy} value={draft.confirmation} onChange={event=>setDraft({...draft,confirmation:event.target.value})}/></label>
   <p className="muted">Passwords need at least 12 characters, up to 72 UTF-8 bytes.</p>
   <button className="primary" disabled={busy||!ready}>{draft.role==='admin'?'Create admin':'Create user'}</button>
  </form>
  {error&&<p className="error" role="alert">{error}</p>}
  <div className="user-list">
   {!ready&&<p className="muted">Loading accounts…</p>}
   {users.map(user=><div key={user.id} className="managed-user">
    <div className="user-heading"><span>{user.name}<small>@{user.username} · {user.role==='admin'?'Admin':'User'}{user.disabled?' · Disabled':''}{user.id===accountId?' · You':''}</small></span>
     {user.id===accountId?<span className="muted">Password in Settings</span>:<div className="category-actions">
      <button className="text-btn" disabled={busy} onClick={()=>{setError('');setResetId(user.id);setPassword('');setConfirmation('');}}>Reset password</button>
      <button className="text-btn" disabled={busy} onClick={()=>void action('PATCH',{id:user.id,role:user.role==='admin'?'user':'admin'},'Role updated')}>{user.role==='admin'?'Make user':'Make admin'}</button>
      <button className="text-btn" disabled={busy} onClick={()=>void action('PATCH',{id:user.id,disabled:!user.disabled},user.disabled?'Account enabled':'Account disabled')}>{user.disabled?'Enable':'Disable'}</button>
      <button className="text-btn negative" disabled={busy} aria-label={'Delete '+user.username} onClick={()=>{setError('');setDeleting(user);}}>Delete</button>
     </div>}
    </div>
    {resetId===user.id&&<form className="entry-form reset-form" onSubmit={event=>{
     event.preventDefault();if(password!==confirmation){setError('Passwords do not match.');return;}
     void action('PATCH',{id:user.id,password},'Password reset');
    }}>
     <label>New password for {user.name}<input autoFocus required minLength={12} type="password" autoComplete="new-password" disabled={busy} value={password} onChange={event=>setPassword(event.target.value)}/></label>
     <label>Confirm new password<input required type="password" autoComplete="new-password" disabled={busy} value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label>
     <p className="muted">This signs the account out on all devices.</p>
     <div className="sheet-actions"><button className="primary" disabled={busy}>Reset password</button><button className="secondary" type="button" disabled={busy} onClick={()=>{setResetId('');setPassword('');setConfirmation('');}}>Cancel</button></div>
    </form>}
   </div>)}
  </div>
  <AlertDialog open={!!deleting} onOpenChange={open=>{if(!open&&!busy)setDeleting(null);}}><ConfirmationContent>
   <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
   <AlertDialogDescription>This permanently deletes @{deleting?.username}, all their transactions, categories and receipt photos. This cannot be undone.</AlertDialogDescription>
   {error&&<p className="error" role="alert">{error}</p>}
   <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event=>{event.preventDefault();void action('DELETE',{id:deleting?.id},'Account deleted');}}>Delete account</AlertDialogAction></AlertDialogFooter>
  </ConfirmationContent></AlertDialog>
 </>;
}
