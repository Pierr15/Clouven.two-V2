import {spawn} from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
const root=new URL("../",import.meta.url),results=[];
async function port(){
 const s=net.createServer();await new Promise(r=>s.listen(0,"127.0.0.1",r));
 const p=s.address().port;await new Promise(r=>s.close(r));return p;
}
async function check(configured){
 const p=await port(),child=spawn(process.execPath,["scripts/serve.mjs"],{cwd:root,windowsHide:true,env:{...process.env,PORT:String(p),SUPABASE_URL:configured?"https://preview-test.invalid":"",SUPABASE_PUBLISHABLE_KEY:configured?"sb_publishable_local_test_configuration":"",SUPABASE_ANON_KEY:""}});
 try{
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error("Preview startup timed out")),5000);
   child.stdout.on("data",data=>{if(data.toString().includes("Preview:")){clearTimeout(timeout);resolve();}});
   child.once("error",reject);child.once("exit",code=>{if(code)reject(new Error("Preview failed"));});
  });
  const base="http://127.0.0.1:"+p,response=await fetch(base+"/api/config");
  assert.equal(response.status,configured?200:503);assert.equal(response.headers.get("cache-control"),"no-store");
  const data=await response.json();
  if(configured){assert.deepEqual(data,{url:"https://preview-test.invalid",publishableKey:"sb_publishable_local_test_configuration"});}
  else assert.deepEqual(Object.keys(data),["error"]);
  for(const route of ["/.env","/.env.local","/.env.example","/README.md","/scripts/serve.mjs"])assert.equal((await fetch(base+route)).status,404);
  for(const route of ["/","/admin/","/kelola/"])assert.equal((await fetch(base+route)).status,200);
  assert.equal((await fetch(base+"/api/config",{method:"POST"})).status,405);
  results.push({name:configured?"Process environment overrides local files; public config only":"Empty environment reports missing configuration",status:"PASS",checks:["config endpoint","private files blocked","page routes","POST rejected"]});
 }finally{child.kill();await new Promise(r=>child.exitCode===null?child.once("exit",r):r());}
}
await check(true);await check(false);
fs.writeFileSync(new URL("../verification/preview-config-results.json",import.meta.url),JSON.stringify({scope:"Actual local Node preview server, isolated environment values",results},null,2));
console.log("Preview environment precedence, missing config and private-file checks passed.");
