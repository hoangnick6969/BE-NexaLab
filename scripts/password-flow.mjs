import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { readdir,readFile,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
const db=new PrismaClient();const base=process.env.TEST_API??'http://127.0.0.1:4100/api';const email='reset-'+Date.now()+'@example.test';let id;const before=new Set(await readdir('.local/mailbox'));let files=[];
const call=async(path,body,token)=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
try{
 const admin=await call('/auth/admin/login',{email:'admin@nexalab.local',password:process.env.SEED_PASSWORD});assert.equal(admin.status,201);
 const made=await call('/admin/users',{email,password:'OriginalPassword2026!',fullName:'Password Test',role:'PARENT',grade:8,consent:true},admin.data.accessToken);id=made.data.id;assert.ok(id);
 const login=await call('/auth/login',{email,password:'OriginalPassword2026!'});assert.equal(login.status,201);
 const forgot=await call('/auth/forgot',{email});assert.equal(forgot.status,201);console.log('PASS forgot password accepted by local SMTP');
 for(let i=0;i<50&&!files.length;i++){await new Promise(r=>setTimeout(r,200));files=(await readdir('.local/mailbox')).filter(f=>!before.has(f));}const raw=(await readFile(resolve('.local/mailbox',files[0]),'utf8')).replace(/=\r?\n/g,'').replace(/=3D/g,'=');const token=raw.match(/reset=([a-f0-9]{64})/)?.[1];assert.ok(token);console.log('PASS reset link delivered to local mailbox');
 const reset=await call('/auth/reset',{token,password:'UpdatedPassword2026!'});assert.equal(reset.status,201);console.log('PASS password reset');
 assert.equal((await call('/auth/reset',{token,password:'BadSecondPassword2026!'})).status,400);console.log('PASS reset token cannot be reused');
 assert.equal((await call('/auth/login',{email,password:'OriginalPassword2026!'})).status,401);assert.equal((await call('/auth/login',{email,password:'UpdatedPassword2026!'})).status,201);console.log('PASS old password rejected, new password accepted');
 const oldAccess=await fetch(base+'/auth/me',{headers:{authorization:'Bearer '+login.data.accessToken}});assert.equal(oldAccess.status,401);console.log('PASS password reset revokes prior access sessions');
}finally{if(id)await db.user.deleteMany({where:{id}});for(const f of files)await unlink(resolve('.local/mailbox',f));await db.$disconnect();}
