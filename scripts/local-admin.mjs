// Offline, local-only bootstrap. No public endpoint can create the first admin.
import bcrypt from 'bcryptjs';
import {randomBytes,randomUUID} from 'node:crypto';
import {writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {ensureLocalConfig, localEnvironment, localState, projectRoot, wranglerPath} from './local-config.mjs';
process.chdir(projectRoot);
const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
if(!args.includes('--local'))throw new Error('Pass --local. This script never targets a hosted database.');
const username=args.includes('--username')?value('--username'):'admin';
if(!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(username))throw new Error('Invalid username.');
const name=args.includes('--name')?value('--name'):'Admin';
if(typeof name!=='string'||!name.trim()||name.length>80)throw new Error('Name must be 1–80 characters.');
const accountId=args.includes('--account-id')?value('--account-id'):null;
if(accountId&&!/^[a-f0-9-]{36}$/.test(accountId))throw new Error('Invalid account id.');
const password=randomBytes(15).toString('base64url')+'!A',encoded=await bcrypt.hash(password,12);
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const config=ensureLocalConfig();
const cli=[wranglerPath,'d1','execute','DB','--config',config,'--local','--persist-to',localState];
function query(sql){const r=spawnSync(process.execPath,[...cli,'--command',sql,'--json'],{encoding:'utf8',env:localEnvironment});if(r.status!==0)throw new Error(r.stderr||r.stdout);return JSON.parse(r.stdout)[0].results;}
if(query("SELECT id FROM accounts WHERE role='admin' AND username IS NOT NULL").length)throw new Error('An admin already exists. Sign in to create users.');
if(accountId){const found=query(`SELECT id,username FROM accounts WHERE id=${quote(accountId)}`);if(found.length!==1||found[0].username!==null)throw new Error('Choose an existing account that has not been converted.');}
const sqlFile=path.resolve('.sites-runtime/local-admin.sql');
const sql=accountId?`UPDATE accounts SET username=${quote(username)},password_hash=${quote(encoded)},role='admin' WHERE id=${quote(accountId)} AND username IS NULL; DELETE FROM sessions WHERE account_id=${quote(accountId)};`: `INSERT INTO accounts (id,name,username,password_hash,role,token_hash,created_at) VALUES (${quote(randomUUID())},${quote(name.trim())},${quote(username)},${quote(encoded)},'admin',${quote(randomBytes(32).toString('hex'))},${Date.now()});`;
writeFileSync(sqlFile,sql);
try{
 const result=spawnSync(process.execPath,[...cli,'--file',sqlFile],{encoding:'utf8',env:localEnvironment});
 if(result.status!==0)throw new Error(result.stderr||result.stdout||'Could not create local admin.');
 console.log(JSON.stringify({username,password}));
}finally{if(existsSync(sqlFile))unlinkSync(sqlFile);}
