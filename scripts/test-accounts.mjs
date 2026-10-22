// Runs against a disposable checkout/database; never changes real accounts.
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,openSync,closeSync,readFileSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';

const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=mkdtempSync(path.join(tmpdir(),'pocket-account-tests-'));
const cacheDir=path.join(root,'node_modules','.vite-'+path.basename(fixture));
const env={...process.env,NEXT_TELEMETRY_DISABLED:'1',WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false',CLOUDFLARE_CF_FETCH_ENABLED:'false'};
let server;
const password='Account_test-only!2026',newPassword='Changed_test-only!2026';
let base;
function client(){
 let cookie='';
 return {async request(route,method='GET',body,origin=base){
  const response=await fetch(base+route,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={error:text};}
  return {status:response.status,data,headers:response.headers};
 }};
}
const login=(account,username,secret=password)=>account.request('/api/account','POST',{username,password:secret});
const credentials=(username,role='user')=>({name:username,username,password,role});
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzS8AAAAASUVORK5CYII=';
try{
 for(const name of ['app','build','components','db','drizzle','hooks','lib','public','scripts','vendor','.openai','package.json','tsconfig.json','vite.config.ts','postcss.config.mjs','cloudflare-env.d.ts'])cpSync(path.join(root,name),path.join(fixture,name),{recursive:true});
 symlinkSync(path.join(root,'node_modules'),path.join(fixture,'node_modules'),'dir');
 const config=path.join(fixture,'vite.config.ts');
 writeFileSync(config,readFileSync(config,'utf8').replace('return {','return {cacheDir: '+JSON.stringify(cacheDir)+','));
 const migrated=spawnSync(process.execPath,[path.join(fixture,'scripts/setup-local.mjs')],{cwd:fixture,env,encoding:'utf8',timeout:120000});
 assert.equal(migrated.status,0,migrated.stderr||migrated.stdout);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));base='http://127.0.0.1:'+port;
 const log=openSync(path.join(fixture,'server.log'),'a');
 server=spawn(process.execPath,[path.join(fixture,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:fixture,env,detached:true,stdio:['ignore',log,log]});closeSync(log);
 let ready=false;
 for(let attempt=0;attempt<80;attempt++){
  if(server.exitCode!==null)throw new Error('Test server exited.');
  try{const response=await fetch(base+'/api/account',{signal:AbortSignal.timeout(2000)});if(response.ok){ready=true;break;}}catch{}
  await delay(500);
 }
 assert.ok(ready,'Test server did not start.');
 const anon=client(),first=client(),second=client(),user=client();
 assert.deepEqual((await anon.request('/api/account')).data,{account:null,setupRequired:true});
 assert.equal((await anon.request('/api/setup','POST',credentials('first_admin'),'https://other.example')).status,403);
 for(const invalid of [{username:'!'},{password:'short'},{name:''},{password:'🙂'.repeat(20)}])assert.equal((await anon.request('/api/setup','POST',{...credentials('first_admin'),...invalid})).status,400);
 // Competing setup requests may both observe an empty database; only one can commit.
 const setup=await Promise.all([first.request('/api/setup','POST',credentials('first_admin')),second.request('/api/setup','POST',credentials('second_admin'))]);
 assert.deepEqual(setup.map(result=>result.status).sort(),[201,409]);
 const winnerIndex=setup.findIndex(result=>result.status===201);
 const admin=winnerIndex===0?first:second,loser=winnerIndex===0?second:first;
 const adminId=setup[winnerIndex].data.account.id;
 const adminName=setup[winnerIndex].data.account.username;
 assert.equal(setup[winnerIndex].data.account.role,'admin');
 assert.equal(setup[winnerIndex].data.account.disabled,0);
 assert.match(setup[winnerIndex].headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
 assert.equal((await admin.request('/api/users')).data.users.length,1);
 assert.equal((await loser.request('/api/account')).data.account,null);
 assert.equal((await anon.request('/api/account')).data.setupRequired,false);
 assert.equal((await anon.request('/api/setup','POST',credentials('intruder'))).status,409);
 for(const method of ['GET','POST','PATCH','DELETE'])assert.equal((await anon.request('/api/users',method,method==='GET'?undefined:credentials('unauthorized'))).status,401);
 for(const mutation of [{disabled:true},{role:'user'},{password:newPassword}])assert.equal((await admin.request('/api/users','PATCH',{id:adminId,...mutation})).status,400);
 assert.equal((await admin.request('/api/users','DELETE',{id:adminId})).status,400);
 console.log('PASS: isolated first-run setup, validation, origin checks, concurrent setup and self/last-admin protection.');

 const regular=await admin.request('/api/users','POST',credentials('regular_user'));
 assert.equal(regular.status,201);assert.equal(regular.data.user.role,'user');const userId=regular.data.user.id;
 assert.equal((await login(user,' REGULAR_USER ')).status,200);
 for(const method of ['GET','POST','PATCH','DELETE'])assert.equal((await user.request('/api/users',method,method==='GET'?undefined:{...credentials('forbidden','admin'),id:userId})).status,403);
 assert.equal((await admin.request('/api/users','POST',credentials('invalid_role','owner'))).status,400);
 assert.equal((await admin.request('/api/users','POST',credentials('REGULAR_USER'))).status,409);
 assert.equal((await admin.request('/api/users','PATCH',{id:userId,role:'owner'})).status,400);
 for(const method of ['POST','PATCH','DELETE'])assert.equal((await admin.request('/api/users',method,{...credentials('bad_origin'),id:userId},'https://other.example')).status,403);
 const other=await admin.request('/api/users','POST',credentials('other_admin','admin'));
 assert.equal(other.status,201);assert.equal(other.data.user.role,'admin');const otherId=other.data.user.id;
 const otherAdmin=client();assert.equal((await login(otherAdmin,'other_admin')).status,200);
 assert.equal((await otherAdmin.request('/api/users')).status,200);
 assert.equal((await otherAdmin.request('/api/transactions?year=2026')).data.transactions.length,0);
 assert.equal((await admin.request('/api/users','PATCH',{id:otherId,password:newPassword})).status,200);
 assert.equal((await otherAdmin.request('/api/users')).status,401);
 assert.equal((await login(otherAdmin,'other_admin')).status,401);
 assert.equal((await login(otherAdmin,'other_admin',newPassword)).status,200);
 assert.equal((await admin.request('/api/users','PATCH',{id:otherId,disabled:true})).status,200);
 assert.equal((await otherAdmin.request('/api/users')).status,401);
 assert.equal((await login(otherAdmin,'other_admin',newPassword)).status,401);
 assert.equal((await admin.request('/api/users','PATCH',{id:otherId,disabled:false,role:'user'})).status,200);
 assert.equal((await login(otherAdmin,'other_admin',newPassword)).status,200);
 assert.equal((await otherAdmin.request('/api/users')).status,403);
 assert.equal((await admin.request('/api/users','PATCH',{id:otherId,role:'admin'})).status,200);
 assert.equal((await otherAdmin.request('/api/account')).data.account,null);
 assert.equal((await login(otherAdmin,'other_admin',newPassword)).status,200);
 console.log('PASS: admin/user creation, permissions, role validation, promotion/demotion, disabled admins and admin password reset/revocation.');

 const userOtherDevice=client();assert.equal((await login(userOtherDevice,'regular_user')).status,200);
 assert.equal((await user.request('/api/account','PUT',{currentPassword:'wrong-password',password:newPassword})).status,401);
 assert.equal((await user.request('/api/account','PUT',{currentPassword:password,password:'short'})).status,400);
 assert.equal((await user.request('/api/account','PUT',{currentPassword:password,password:newPassword},'https://other.example')).status,403);
 assert.equal((await user.request('/api/account','PUT',{currentPassword:password,password:newPassword})).status,200);
 assert.equal((await user.request('/api/account')).data.account.id,userId);
 assert.equal((await userOtherDevice.request('/api/account')).data.account,null);
 assert.equal((await login(userOtherDevice,'regular_user')).status,401);
 assert.equal((await login(userOtherDevice,'regular_user',newPassword)).status,200);
 // A malicious account id in the password payload cannot change another account.
 assert.equal((await user.request('/api/account','PUT',{id:adminId,currentPassword:newPassword,password})).status,200);
 assert.equal((await login(client(),adminName)).status,200);
 const longPassword='a'.repeat(72);
 assert.equal((await admin.request('/api/users','PATCH',{id:userId,password:longPassword})).status,200);
 assert.equal((await user.request('/api/account')).data.account,null);
 assert.equal((await login(user,'regular_user',longPassword)).status,200);
 assert.equal((await user.request('/api/account','PUT',{currentPassword:longPassword+'suffix',password:newPassword})).status,401);
 assert.equal((await user.request('/api/account','PUT',{currentPassword:longPassword,password:newPassword})).status,200);
 const raceClient=client();assert.equal((await login(raceClient,'regular_user',newPassword)).status,200);
 const concurrentPassword='Concurrent_test!2026';
 const passwordChanges=await Promise.all([user.request('/api/account','PUT',{currentPassword:newPassword,password:concurrentPassword}),raceClient.request('/api/account','PUT',{currentPassword:newPassword,password:concurrentPassword})]);
 assert.equal(passwordChanges.filter(result=>result.status===200).length,1);
 assert.ok(passwordChanges.some(result=>[401,409].includes(result.status)));
 assert.equal((await login(user,'regular_user',concurrentPassword)).status,200);
 assert.equal((await user.request('/api/account','PUT',{currentPassword:concurrentPassword,password:newPassword})).status,200);
 console.log('PASS: own-password validation, account scoping, bcrypt byte limit, session revocation and concurrent password changes.');

 // Delete a real finance record with a receipt, and verify cascading cleanup.
 const backup={app:'pocket',version:2,accent:'#2dd4bf',years:[2026],categories:[{year:2026,kind:'personal',name:'Test',position:0}],transactions:[{date:'2026-01-01',kind:'personal',category:'Test',description:'Private',amount:1234,note:'',refunded:false,fromEmergency:false,receipts:[{name:'receipt.png',type:'image/png',data:png}]}]};
 assert.equal((await user.request('/api/backup','POST',backup)).status,200);
 const transactions=(await user.request('/api/transactions?year=2026')).data.transactions;
 assert.equal(transactions.length,1);assert.equal(transactions[0].receipts.length,1);
 const deletedReceipt=transactions[0].receipts[0].id;
 assert.equal((await admin.request('/api/users','DELETE',{id:userId})).status,200);
 assert.equal((await user.request('/api/account')).data.account,null);
 assert.equal((await user.request('/api/transactions?year=2026')).status,401);
 assert.equal((await login(user,'regular_user',newPassword)).status,401);
 assert.equal((await admin.request('/api/receipts/'+deletedReceipt)).status,404);
 assert.equal((await admin.request('/api/users','DELETE',{id:userId})).status,404);
 assert.equal((await admin.request('/api/users')).data.users.some(account=>account.id===userId),false);
 const query=spawnSync(process.execPath,[path.join(fixture,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','DB','--config',path.join(fixture,'.sites-runtime/local-db.json'),'--local','--persist-to',path.join(fixture,'.wrangler/state'),'--json','--command',`SELECT (SELECT count(*) FROM transactions WHERE account_id='${userId}')+(SELECT count(*) FROM receipts WHERE account_id='${userId}')+(SELECT count(*) FROM sessions WHERE account_id='${userId}')+(SELECT count(*) FROM category_years WHERE account_id='${userId}')+(SELECT count(*) FROM year_categories WHERE account_id='${userId}') AS remaining`],{cwd:fixture,env,encoding:'utf8',timeout:30000});
 assert.equal(query.status,0,query.stderr);assert.equal(JSON.parse(query.stdout)[0].results[0].remaining,0);
 assert.equal((await admin.request('/api/transactions?year=2026')).data.transactions.length,0);
 console.log('PASS: user deletion, cascading finance/receipt/session cleanup, denial after deletion and account isolation.');

 // Simultaneous role and access changes must preserve an active administrator.
 const demotions=await Promise.all([admin.request('/api/users','PATCH',{id:otherId,role:'user'}),otherAdmin.request('/api/users','PATCH',{id:adminId,role:'user'})]);
 assert.equal(demotions.filter(result=>result.status===200).length,1);
 assert.ok(demotions.some(result=>[401,403,409].includes(result.status)));
 let active=demotions[0].status===200?admin:otherAdmin;
 assert.equal((await active.request('/api/users')).data.users.filter(account=>account.role==='admin'&&!account.disabled).length,1);
 assert.equal((await active.request('/api/users','PATCH',{id:demotions[0].status===200?otherId:adminId,role:'admin'})).status,200);
 assert.equal((await login(admin,adminName)).status,200);
 assert.equal((await login(otherAdmin,'other_admin',newPassword)).status,200);
 const disables=await Promise.all([admin.request('/api/users','PATCH',{id:otherId,disabled:true}),otherAdmin.request('/api/users','PATCH',{id:adminId,disabled:true})]);
 assert.equal(disables.filter(result=>result.status===200).length,1);
 assert.ok(disables.some(result=>[401,403,409].includes(result.status)));
 active=disables[0].status===200?admin:otherAdmin;
 assert.equal((await active.request('/api/users')).data.users.filter(account=>account.role==='admin'&&!account.disabled).length,1);
 assert.equal((await active.request('/api/users','PATCH',{id:disables[0].status===200?otherId:adminId,disabled:false})).status,200);
 assert.equal((await login(admin,adminName)).status,200);
 assert.equal((await login(otherAdmin,'other_admin',newPassword)).status,200);
 console.log('PASS: concurrent admin demotion and disabling preserve an active administrator.');
 // Two administrators deleting each other must leave one active administrator.
 const deletions=await Promise.all([admin.request('/api/users','DELETE',{id:otherId}),otherAdmin.request('/api/users','DELETE',{id:adminId})]);
 assert.equal(deletions.filter(result=>result.status===200).length,1);
 assert.ok(deletions.some(result=>[401,409].includes(result.status)));
 const survivor=deletions[0].status===200?admin:otherAdmin;
 const remaining=(await survivor.request('/api/users')).data.users;
 assert.equal(remaining.length,1);assert.equal(remaining[0].role,'admin');assert.equal(remaining[0].disabled,0);
 assert.equal((await survivor.request('/api/users','PATCH',{id:remaining[0].id,role:'user'})).status,400);
 assert.equal((await survivor.request('/api/users','DELETE',{id:remaining[0].id})).status,400);
 assert.equal((await anon.request('/api/account')).data.setupRequired,false);
 console.log('PASS: concurrent admin deletion preserves the final active admin and setup remains closed.');
 console.log('All account checks passed. Your existing database and admin were untouched.');
}catch(error){
 try{console.error(readFileSync(path.join(fixture,'server.log'),'utf8').slice(-6000));}catch{}
 throw error;
}finally{
 if(server){try{process.kill(-server.pid,'SIGTERM');}catch{}await delay(1000);try{process.kill(-server.pid,'SIGKILL');}catch{}}
 rmSync(fixture,{recursive:true,force:true});
 rmSync(cacheDir,{recursive:true,force:true});
}
