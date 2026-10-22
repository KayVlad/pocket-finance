import bcrypt from 'bcryptjs';
export function validPassword(value:unknown):value is string {return typeof value==='string'&&value.length>=12&&!bcrypt.truncates(value);}
export function hashPassword(password:string){return bcrypt.hash(password,12);}
export function verifyPassword(password:string,encoded:string){return bcrypt.truncates(password)?Promise.resolve(false):bcrypt.compare(password,encoded);}
export function validUsername(value:unknown):value is string {return typeof value==='string'&&/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(value);}
