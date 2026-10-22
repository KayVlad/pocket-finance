import {db,HttpError} from './server';
import {validPassword,validUsername} from './password';

export function newAccountInput(input:unknown){
 if(!input||typeof input!=='object')throw new HttpError(400,'Enter a name, username and password.');
 const values=input as Record<string,unknown>;
 const username=typeof values.username==='string'?values.username.trim().toLowerCase():'';
 if(!validUsername(username))throw new HttpError(400,'Use 3–40 characters: letters, numbers, dots, underscores or hyphens.');
 if(!validPassword(values.password))throw new HttpError(400,'Use a password of at least 12 characters, up to 72 UTF-8 bytes.');
 if(typeof values.name!=='string'||!values.name.trim()||values.name.length>60)throw new HttpError(400,'Enter a name up to 60 characters.');
 return {name:values.name.trim(),username,password:values.password};
}

// Keep the same condition in the setup status and the atomic first-admin insert.
export const configuredAccounts="SELECT 1 FROM accounts WHERE username IS NOT NULL AND password_hash IS NOT NULL";
export async function setupRequired(){return !await db().prepare(configuredAccounts+' LIMIT 1').first();}

// Recheck the acting admin inside each write, including after password hashing.
// Cross-deletion or cross-demotion cannot remove the final active administrator.
export const activeAdmin="EXISTS (SELECT 1 FROM accounts AS actor WHERE actor.id=? AND actor.role='admin' AND actor.disabled=0 AND actor.password_hash IS NOT NULL)";
