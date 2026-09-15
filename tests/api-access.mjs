import assert from "node:assert/strict";
import {registerHooks} from "node:module";
import {writeFile,mkdir} from "node:fs/promises";
import {can} from "../assets/js/permissions.js";
Object.assign(process.env,{SUPABASE_URL:"https://local.invalid",SUPABASE_SECRET_KEY:"local-test-only",GOOGLE_CLIENT_ID:"test",GOOGLE_CLIENT_SECRET:"test",GOOGLE_DRIVE_REFRESH_TOKEN:"test",GOOGLE_DRIVE_ROOT_FOLDER_ID:"class-root"});
registerHooks({resolve(s,c,next){return s==="@supabase/supabase-js"?{url:"data:text/javascript,export const createClient=()=>globalThis.__apiMock",shortCircuit:true}:next(s,c);}});
const roles=["guest","student","class_officer","teacher","developer"];
let members,resources,calls,driveCalls,dbFail,outside,trashed;
function reset(){members=roles.slice(1).map(role=>({id:role,role,name:role,username:role,class_role:"Anggota"}));resources=[{id:"resource-1",drive_file_id:"class-file-123",name:"Materi.pdf",subject:"ASJ",kind:"materi"}];calls=[];driveCalls=[];dbFail=false;outside=false;trashed=false;}
reset();
globalThis.__apiMock={
 auth:{getUser:async token=>({data:{user:token==="guest"?null:{id:token}},error:null}),admin:{
  updateUserById:async(uid,patch)=>{calls.push({action:"password",uid,keys:Object.keys(patch)});return {error:null};},
  deleteUser:async uid=>{calls.push({action:"delete",uid});members=members.filter(m=>m.id!==uid);return {error:null};},
  createUser:async()=>({data:{user:{id:"new-user"}},error:null})
 }},
 from(table){let filters=[],mode="select",payload,single=false;
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},maybeSingle(){single=true;return q;},update(v){mode="update";payload=v;return q;},delete(){mode="delete";return q;},insert(v){mode="insert";payload=v;return q;},
   then(resolve,reject){const data=table==="members"?members:resources,found=data.filter(row=>filters.every(([k,v])=>row[k]===v));
    if(mode!=="select"){
     if(dbFail)return Promise.resolve({error:{message:"temporary DB error"}}).then(resolve,reject);
     calls.push({table,mode,keys:Object.keys(payload||{}),filters});
     if(mode==="update")found.forEach(row=>Object.assign(row,payload));
     if(mode==="delete"){if(table==="resources")resources=resources.filter(r=>!found.includes(r));else members=members.filter(r=>!found.includes(r));}
     if(mode==="insert")data.push(payload);
    }
    return Promise.resolve({data:single?found[0]||null:found,error:null}).then(resolve,reject);
   }};return q;}
};
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url);driveCalls.push({url:String(url),method:options.method||"GET",body:options.body?String(options.body):""});
 if(u.hostname==="oauth2.googleapis.com")return Response.json({access_token:"drive-test"});
 if(u.hostname!=="www.googleapis.com")throw Error("Unexpected external request");
 if(options.method==="PATCH"){if(JSON.parse(options.body).trashed)trashed=true;return Response.json({id:"class-file-123"});}
 if(u.searchParams.has("q"))return Response.json({files:[{id:"subject-folder"}]});
 if(u.searchParams.get("alt")==="media")return new Response("fixture bytes");
 const id=u.pathname.split("/").pop();
 return Response.json(id==="class-file-123"?{id,name:"Materi.pdf",mimeType:"application/pdf",parents:[outside?"outside-root":"subject-folder"],trashed}:{id,mimeType:"application/vnd.google-apps.folder",parents:outside?[]:["class-root"]});
};
const endpoints=Object.fromEntries(await Promise.all([["self","profile/update"],["edit","admin/update-user"],["delete","admin/delete-user"],["reset","admin/reset-password"],["file","drive/manage"],["download","drive/download"],["create","admin/create-user"]].map(async([key,p])=>[key,(await import("../api/"+p+".js")).default])));
async function request(key,role,body={},method="POST"){
 let status=200,result;const res={status(code){status=code;return this;},json(v){result=v;return this;},setHeader(){},send(v){result=v;return this;}};
 await endpoints[key]({method,headers:role==="guest"?{}:{authorization:"Bearer "+role},body,query:{id:"class-file-123"}},res);return {status,result};
}
const results=[];
async function test(name,fn){reset();await fn();results.push({name,status:"PASS"});console.log("PASS "+name);}
const keys=["home","schedule","apel","task_summary","tools","theme","tasks","own_progress","view_progress","edit_progress","members","files","upload","own_account","admin","edit_class","edit_schedule","edit_apel","edit_tasks","create_user","change_role","edit_user","edit_self","delete_user","reset_password","manage_files"];
const expected=["11111","11111","11111","01111","11111","11111","01111","01111","00111","00011","01111","01111","00111","01111","00001","00111","00111","00111","00111","00001","00001","00001","00011","00001","00001","00111"];
await test("130 permission decisions match edited workbook",()=>keys.forEach((p,i)=>roles.forEach((r,j)=>assert.equal(can(r,p),expected[i][j]==="1",r+":"+p))));
for(const role of roles)for(const [key,permission,payload]of [
 ["self","edit_self",{name:"Updated name"}],["edit","edit_user",{uid:"student",name:"Updated name"}],
 ["delete","delete_user",{uid:"student",confirmation:"student"}],["reset","reset_password",{uid:"student",password:"test-only-strong"}],
 ["file","manage_files",{resourceId:"resource-1",action:"edit",name:"Revisi.pdf",subject:"ASJ",kind:"materi"}],
 ["file","manage_files",{resourceId:"resource-1",action:"trash"}],["download","files",{}],
 ["create","create_user",{name:"New user",username:"new-user",password:"test-only-strong"}]
])await test(role+": "+key+" "+(payload.action||""),async()=>{
 const response=await request(key,role,payload,key==="download"?"GET":"POST");
 assert.equal(response.status,can(role,permission)?(key==="create"?201:200):role==="guest"?401:403);
 if(!can(role,permission)){assert.equal(calls.length,0);assert.equal(driveCalls.length,0);}
});
await test("User without member profile rejected",async()=>assert.equal((await request("self","orphan",{name:"No"})).status,403));
for(const field of ["uid","role","created_by"])await test("Self profile rejects "+field,async()=>{assert.equal((await request("self","teacher",{name:"New",[field]:"developer"})).status,400);assert.equal(calls.length,0);});
await test("Own profile always bound to authenticated user",async()=>{await request("self","teacher",{name:"My name"});assert.equal(members.find(m=>m.id==="teacher").name,"My name");assert.equal(members.find(m=>m.id==="student").name,"student");});
await test("Unsafe photo URL rejected",async()=>assert.equal((await request("self","teacher",{photo:"javascript:alert(1)"})).status,400));
await test("Current developer cannot delete or demote itself",async()=>{assert.equal((await request("edit","developer",{uid:"developer",role:"student"})).status,400);assert.equal((await request("delete","developer",{uid:"developer",confirmation:"developer"})).status,400);});
await test("Delete requires matching username",async()=>{assert.equal((await request("delete","developer",{uid:"student",confirmation:"wrong"})).status,400);assert.equal(calls.length,0);});
await test("Reset rejects short password and current account",async()=>{assert.equal((await request("reset","developer",{uid:"student",password:"123"})).status,400);assert.equal((await request("reset","developer",{uid:"developer",password:"test-only-password"})).status,400);});
await test("Missing account returns 404",async()=>{for(const key of ["edit","reset","delete"])assert.equal((await request(key,"developer",key==="edit"?{uid:"missing",name:"Name"}:{uid:"missing",password:"test-only-password",confirmation:"missing"})).status,404);});
await test("Unregistered Drive file rejected",async()=>{assert.equal((await request("file","teacher",{resourceId:"missing",action:"trash"})).status,404);assert.equal(driveCalls.length,0);});
await test("Outside-class Drive rejected even with metadata",async()=>{outside=true;assert.equal((await request("file","teacher",{resourceId:"resource-1",action:"trash"})).status,403);assert.equal((await request("download","student",{},"GET")).status,403);assert.equal(driveCalls.some(c=>c.method==="PATCH"),false);});
await test("Rename and category metadata updated",async()=>{await request("file","teacher",{resourceId:"resource-1",action:"edit",name:"Edited.pdf",subject:"TJKN",kind:"tugas"});assert.equal(resources[0].name,"Edited.pdf");assert.equal(resources[0].kind,"tugas");});
await test("Removal uses Trash only",async()=>{await request("file","teacher",{resourceId:"resource-1",action:"trash"});assert.equal(resources.length,0);assert.ok(driveCalls.some(c=>c.method==="PATCH"&&JSON.parse(c.body).trashed));assert.ok(driveCalls.every(c=>c.method!=="DELETE"));});
await test("Partial trash retries without another Drive mutation",async()=>{dbFail=true;assert.equal((await request("file","teacher",{resourceId:"resource-1",action:"trash"})).status,503);dbFail=false;assert.equal((await request("file","teacher",{resourceId:"resource-1",action:"trash"})).status,200);assert.equal(driveCalls.filter(c=>c.method==="PATCH").length,1);});
await test("Unsupported methods rejected",async()=>{for(const key of Object.keys(endpoints))assert.equal((await request(key,"developer",{},"PUT")).status,405);assert.equal(calls.length,0);});
await mkdir(new URL("../verification/",import.meta.url),{recursive:true});
await writeFile(new URL("../verification/api-access-results.json",import.meta.url),JSON.stringify({scope:"Isolated handler mocks; no production writes",checks:results.length,results},null,2));
console.log("All "+results.length+" API/access checks passed.");
