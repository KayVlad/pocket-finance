'use client';
import {useState,type FormEvent} from 'react';
import type {Account} from '@/lib/finance';

export default function AccountAccess({setupRequired,initialError,onAuthenticated}:{setupRequired:boolean;initialError:string;onAuthenticated:(account:Account)=>void}){
 const [setup,setSetup]=useState(setupRequired),[name,setName]=useState(''),[username,setUsername]=useState('');
 const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent){
  event.preventDefault();if(busy)return;setError('');
  if(setup&&password!==confirmation){setError('Passwords do not match.');return;}
  setBusy(true);
  try{
   const response=await fetch(setup?'/api/setup':'/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,username,password})});
   const data=await response.json() as {account:Account;error?:string};
   if(!response.ok){
    if(setup&&response.status===409){setSetup(false);setPassword('');setConfirmation('');}
    throw new Error(data.error||'Could not sign in. Try again.');
   }
   setPassword('');setConfirmation('');onAuthenticated(data.account);
  }catch(error){setError((error as Error).message);}finally{setBusy(false);}
 }
 return <main className="login-main"><section className="login-card">
  <h1>{setup?'Set up Pocket':'Sign in'}</h1>
  {setup&&<p className="muted setup-description">Create your first administrator account to get started.</p>}
  <form className="entry-form" onSubmit={submit}>
   {setup&&<label>Name<input required autoFocus maxLength={60} autoComplete="name" value={name} disabled={busy} onChange={event=>setName(event.target.value)}/></label>}
   <label>Username<input required autoFocus={!setup} minLength={setup?3:undefined} maxLength={40} autoCapitalize="none" spellCheck={false} autoComplete="username" value={username} disabled={busy} onChange={event=>setUsername(event.target.value)}/></label>
   <label>Password<input required type="password" minLength={setup?12:undefined} autoComplete={setup?'new-password':'current-password'} value={password} disabled={busy} onChange={event=>setPassword(event.target.value)}/></label>
   {setup&&<><p className="muted">Use at least 12 characters, up to 72 UTF-8 bytes.</p><label>Confirm password<input required type="password" autoComplete="new-password" value={confirmation} disabled={busy} onChange={event=>setConfirmation(event.target.value)}/></label></>}
   {(error||initialError)&&<p className="error" role="alert">{error||initialError}</p>}
   <button className="primary" disabled={busy}>{busy?(setup?'Creating account…':'Signing in…'):(setup?'Create admin account':'Sign in')}</button>
  </form>
 </section></main>;
}
