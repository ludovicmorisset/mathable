import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
export const hashPassword=p=>bcrypt.hash(p,12); export const verifyPassword=(p,h)=>bcrypt.compare(p,h);
export const code=()=>String(crypto.randomInt(0,1000000)).padStart(6,'0');
export function validPassword(p){return typeof p==='string'&&p.length>=10&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/\d/.test(p)}
export function digest(v){return crypto.createHash('sha256').update(v).digest('hex')}
