import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
const {PGlite}=await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const {pgcrypto}=await import(process.env.PGLITE_PGCRYPTO || "@electric-sql/pglite/contrib/pgcrypto");
const db=new PGlite({extensions:{pgcrypto}});
await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$; grant usage on schema auth,public to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated; create publication supabase_realtime;");
await db.exec(await readFile(new URL("../supabase/migrations/202609040001_initial_schema.sql",import.meta.url),"utf8"));
const migration=await readFile(new URL("../supabase/migrations/202609060001_role_access_rev9.sql",import.meta.url),"utf8");
await db.exec(migration);
await db.exec(migration); // repeat deployment must be safe
const roles=["guest","student","class_officer","teacher","developer","orphan"];
const ids=Object.fromEntries(roles.map((r,i)=>[r,"00000000-0000-4000-8000-"+String(i+1).padStart(12,"0")]));
for(const r of roles.slice(1)){
 await db.query("insert into auth.users values($1)",[ids[r]]);
 if(r!=="orphan")await db.query("insert into public.members(id,name,username,role) values($1,$2,$2,$2)",[ids[r],r]);
}
await db.exec("insert into public.tasks(id,title,subject) values('task-1','Praktik jaringan','ASJ'); insert into public.schedules(day) values('monday'); insert into public.apel_queue(id,name) values('queue-1','Student'); insert into public.resources(drive_file_id,name) values('file-123','Materi.pdf');");
for(const r of ["student","class_officer","teacher","developer"])await db.query("insert into public.task_progress(user_id,task_id,done)values($1,'task-1',true)",[ids[r]]);
async function as(role,sql,params=[]){
 await db.exec("begin; set local role "+(role==="guest"?"anon":"authenticated")+";");
 try{
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[role==="guest"?"":ids[role]]);
  const value=await db.query(sql,params);
  await db.exec("rollback");
  return {ok:true,value};
 }catch(e){await db.exec("rollback");return {ok:false,error:e.message,code:e.code};}
}
await db.exec("insert into public.tasks(id,title) values('task-2','Second task');");
const results=[];
async function test(name,fn){await fn();results.push({name,status:"PASS"});console.log("PASS "+name);}
for(const role of roles){
 const member=!["guest","orphan"].includes(role),manager=["class_officer","teacher","developer"].includes(role),teacher=["teacher","developer"].includes(role);
 await test(role+": public class information readable",async()=>{for(const table of ["class_profile","schedules","apel_queue"])assert.ok((await as(role,"select * from public."+table)).ok);});
 await test(role+": task and member/file read boundary",async()=>{
  for(const table of ["tasks","task_summaries","members","resources"]){
   const r=await as(role,"select * from public."+table);
   if(role==="guest")assert.equal(r.ok,false);else {assert.equal(r.ok,true);assert.equal(r.value.rows.length>0,member);}
  }
 });
 await test(role+": own and other progress visibility",async()=>{
  const r=await as(role,"select * from public.task_progress");
  if(role==="guest")assert.equal(r.ok,false);
  else assert.equal(r.value.rows.length,manager?4:role==="student"?1:0);
 });
 for(const target of ["self","other"])for(const op of ["insert","update","delete"]){
  const uid=target==="self"?ids[role]:ids[role==="student"?"teacher":"student"];
  await test(role+": "+op+" "+target+" progress",async()=>{
   // Use a fresh task for INSERT so the result proves RLS rather than unique-key rejection.
   const sql=op==="insert"?"insert into public.task_progress(user_id,task_id,done) values($1,'task-2',true) returning *":op==="update"?"update public.task_progress set done=false where user_id=$1 and task_id='task-1' returning *":"delete from public.task_progress where user_id=$1 and task_id='task-1' returning *";
   const r=await as(role,sql,[uid]);
   const allowed=member&&(target==="self"||teacher);
   assert.equal(r.ok&&r.value.rows.length===1,allowed,r.error);
  });
 }
 for(const [table,insert,update,del]of [
  ["class_profile","insert into public.class_profile(id)values('other') returning *","update public.class_profile set data='{}' where id='main' returning *","delete from public.class_profile where id='main' returning *"],
  ["schedules","insert into public.schedules(day)values('tuesday') returning *","update public.schedules set lessons='[]' where day='monday' returning *","delete from public.schedules where day='monday' returning *"],
  ["apel_queue","insert into public.apel_queue(id,name)values('queue-2','Member') returning *","update public.apel_queue set name='New' where id='queue-1' returning *","delete from public.apel_queue where id='queue-1' returning *"],
  ["tasks","insert into public.tasks(id,title)values('task-3','New') returning *","update public.tasks set title='Changed' where id='task-1' returning *","delete from public.tasks where id='task-1' returning *"]
 ])await test(role+": "+table+" CRUD boundary",async()=>{for(const sql of [insert,update,del]){const r=await as(role,sql);assert.equal(r.ok&&r.value.rows.length===1,manager,r.error);}});
 await test(role+": profile and resource management require server",async()=>{
  for(const sql of ["update public.members set role='developer' returning *","delete from public.members returning *","update public.resources set name='Hack' returning *","delete from public.resources returning *"])assert.equal((await as(role,sql)).ok,false);
 });
 await test(role+": upload metadata insert boundary",async()=>{
  const r=await as(role,"insert into public.resources(drive_file_id,name,uploaded_by)values('new-file','New',$1)returning *",[ids[role]]);
  assert.equal(r.ok,manager);
  if(manager)assert.equal((await as(role,"insert into public.resources(drive_file_id,name,uploaded_by)values('forged','New',$1)returning *",[ids.student])).ok,false);
 });
}
await test("Last developer cannot be demoted or deleted via service operations",async()=>{
 for(const sql of ["update public.members set role='student' where role='developer'","delete from auth.users where id='"+ids.developer+"'"]){
  await db.exec("begin");
  try{await assert.rejects(()=>db.exec(sql),/Developer terakhir/);}finally{await db.exec("rollback");}
 }
});
await test("Deleting another account cascades progress and preserves task",async()=>{
 await db.exec("begin");
 await db.query("delete from auth.users where id=$1",[ids.student]);
 assert.equal((await db.query("select * from public.members where id=$1",[ids.student])).rows.length,0);
 assert.equal((await db.query("select * from public.task_progress where user_id=$1",[ids.student])).rows.length,0);
 assert.equal((await db.query("select * from public.tasks where id='task-1'")).rows.length,1);
 await db.exec("rollback");
});
await writeFile(new URL("../verification/rls-access-results.json",import.meta.url),JSON.stringify({scope:"PGlite PostgreSQL in memory, real SQL/RLS; isolated auth.uid fixture; no live Supabase or concurrent sessions",checks:results.length,results},null,2));
await db.close();
console.log("All "+results.length+" PostgreSQL checks passed.");
