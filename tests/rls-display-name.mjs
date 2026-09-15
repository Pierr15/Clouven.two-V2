import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE),{pgcrypto}=await import(process.env.PGLITE_PGCRYPTO);
const db=new PGlite({extensions:{pgcrypto}}),results=[];
await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;create publication supabase_realtime;");
const migration='202609130001_developer_display_names.sql';
for(const file of ['202609040001_initial_schema.sql','202609060001_role_access_rev9.sql','202609070001_forms_instagram_rev12.sql',migration,migration])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
const roles=['student','class_officer','teacher','developer','developer2','orphan'],ids={};
for(const [i,role]of roles.entries()){
 ids[role]='00000000-0000-4000-8000-'+String(i+1).padStart(12,'0');
 await db.query('insert into auth.users values($1)',[ids[role]]);
 if(role!=='orphan')await db.query('insert into public.members(id,name,username,role)values($1,$2,$2,$3)',[ids[role],role,role==='developer2'?'developer':role]);
}
const good={name_style:'flow',name_color_1:'#7DD3FC',name_color_2:'#A78BFA',name_color_3:null};
async function as(role,sql,params=[]){
 await db.exec('begin;set local role '+(role==='guest'?'anon':role==='service'?'service_role':'authenticated'));
 try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[role]||'']);const value=await db.query(sql,params);await db.exec('rollback');return {ok:true,value};}
 catch(error){await db.exec('rollback');return {ok:false,code:error.code,error:error.message};}
}
const save=(role,payload)=>as(role,'select public.set_my_name_customization($1::jsonb) as saved',[JSON.stringify(payload)]);
async function check(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}
for(const role of ['guest',...roles,'service']){
 await check(role+' RPC permission',async()=>assert.equal((await save(role,good)).ok,['developer','developer2'].includes(role)));
 await check(role+' direct write blocked',async()=>assert.equal((await as(role,'update public.members set name_style=$1 where id=$2',['neon',ids.developer])).ok,false));
}
for(const style of ['default','solid','gradient','flow','neon','prism','shimmer'])await check('Save '+style,async()=>{
 const r=await save('developer',{...good,name_style:style,name_color_3:'#f9a8d4'});assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.value.rows[0].saved.name_style,style);assert.equal(r.value.rows[0].saved.name_color_3,'#F9A8D4');assert.equal(r.value.rows[0].saved.id,ids.developer);
});
const bad=[null,[],{}, {...good,role:'developer'},{...good,uid:ids.developer2},{...good,user_id:ids.student},
 {...good,name_style:'anything'}, {...good,name_style:null},{...good,name_color_1:null},
 ...['url(x)','var(--x)','#abc','expression(x)','#112233\n','#000000; color:red'].map(c=>({...good,name_color_1:c})),
 {...good,name_color_2:7},{...good,name_color_3:false},{...good,name_color_3:''}];
for(const payload of bad)await check('Invalid/malicious payload rejected',async()=>assert.equal((await save('developer',payload)).ok,false));
await check('Owner only; other Developer unchanged',async()=>{
 await db.exec('begin;set local role authenticated');
 try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ids.developer]);await db.query('select public.set_my_name_customization($1::jsonb)',[JSON.stringify(good)]);
  assert.equal((await db.query('select name_style from public.members where id=$1',[ids.developer2])).rows[0].name_style,'default');
 }finally{await db.exec('rollback');}
});
await check('Demotion retains preference, denies new saves, preserves other account APIs',async()=>{
 await db.exec('begin');
 try{
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ids.developer]);
  await db.query('select public.set_my_name_customization($1::jsonb)',[JSON.stringify(good)]);
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  await db.query("update public.members set role='student',name='Renamed' where id=$1",[ids.developer]);
  assert.equal((await db.query('select name_style from public.members where id=$1',[ids.developer])).rows[0].name_style,'flow');
  await db.exec('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ids.developer]);
  await assert.rejects(()=>db.query('select public.set_my_name_customization($1::jsonb)',[JSON.stringify(good)]),/Developer/);
 }finally{await db.exec('rollback');}
});
await check('Service cannot insert pre-customized profile',async()=>assert.equal((await as('service','insert into public.members(id,name,username,role,name_style)values($1,$2,$2,$3,$4)',[ids.orphan,'extra','developer','flow'])).ok,false));
await check('Table check protects privileged writes',async()=>{
 await db.exec('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ids.developer]);await assert.rejects(()=>db.query("update public.members set name_color_1='url(x)' where id=$1",[ids.developer]),/constraint/);}finally{await db.exec('rollback');}
});
await check('Members read permissions remain intact',async()=>{
 assert.equal((await as('guest','select * from public.members')).ok,false);
 for(const role of ['student','class_officer','teacher','developer'])assert.equal((await as(role,'select * from public.members')).value.rows.length,5);
 assert.equal((await as('orphan','select * from public.members')).value.rows.length,0);
});
await mkdir(new URL('../verification/',import.meta.url),{recursive:true});
await writeFile(new URL('../verification/display-name-database.json',import.meta.url),JSON.stringify({scope:'Local PostgreSQL/PGlite with real grants, RLS, triggers and RPC; no production writes. Migration applied twice.',checks:results.length,results},null,2));
await db.close();console.log(results.length+' database checks passed.');
