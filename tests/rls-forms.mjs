import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
const {PGlite}=await import(process.env.PGLITE_MODULE),{pgcrypto}=await import(process.env.PGLITE_PGCRYPTO);
const db=new PGlite({extensions:{pgcrypto}}),results=[];
await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;create publication supabase_realtime;");
for(const file of ["202609040001_initial_schema.sql","202609060001_role_access_rev9.sql","202609070001_forms_instagram_rev12.sql","202609070001_forms_instagram_rev12.sql"])await db.exec(await readFile(new URL("../supabase/migrations/"+file,import.meta.url),"utf8"));
const roles=["student","class_officer","teacher","developer","orphan"],ids={};
for(const [i,role]of roles.entries()){ids[role]="00000000-0000-4000-8000-"+String(i+1).padStart(12,"0");await db.query("insert into auth.users values($1)",[ids[role]]);if(role!=="orphan")await db.query("insert into public.members(id,name,username,role)values($1,$2,$2,$2)",[ids[role],role]);}
await db.exec("insert into public.subject_teachers values('Existing',array['Teacher'],now())");
async function as(role,sql,params=[]){
 await db.exec("begin;set local role "+(role==="guest"?"anon":"authenticated"));
 try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[role]||""]);const value=await db.query(sql,params);await db.exec("rollback");return {ok:true,value};}
 catch(error){await db.exec("rollback");return {ok:false,error:error.message};}
}
async function check(name,fn){await fn();results.push({name,status:"PASS"});}
for(const role of ["guest",...roles]){
 const manager=["class_officer","teacher","developer"].includes(role);
 await check(role+": catalog replacement boundary",async()=>assert.equal((await as(role,"select public.replace_subject_teachers($1::jsonb)",[JSON.stringify([{subject:"Bahasa Indonesia",teachers:["Bu Liza"]}])])).ok,manager));
 await check(role+": catalog read boundary",async()=>{const r=await as(role,"select * from public.subject_teachers");assert.equal(r.ok&&r.value.rows.length>0,manager);});
 await check(role+": member direct writes prohibited",async()=>assert.equal((await as(role,"update public.members set instagram='other'")).ok,false));
}
for(const entries of [[{subject:"",teachers:["A"]}],[{subject:"X",teachers:[]}],[{subject:"X",teachers:[""]}],[{subject:"X",teachers:["A","a"]}],[{subject:"X",teachers:["A"]},{subject:"x",teachers:["B"]}],[{subject:"X",teachers:[null]}]]){
 await check("Invalid catalog rejected atomically",async()=>{assert.equal((await as("developer","select public.replace_subject_teachers($1::jsonb)",[JSON.stringify(entries)])).ok,false);assert.equal((await db.query("select subject from public.subject_teachers")).rows[0].subject,"Existing");});
}
await check("Instagram database constraint",async()=>{await assert.rejects(db.query("update public.members set instagram='bad..handle'"));await db.query("update public.members set instagram='valid.handle' where role='student'");});
await writeFile(new URL("../verification/rls-forms-results.json",import.meta.url),JSON.stringify({scope:"Local PostgreSQL/PGlite; migration applied twice",results},null,2));await db.close();console.log(results.length+" database checks passed.");
