import assert from "node:assert/strict";
import {registerHooks} from "node:module";
import {writeFile} from "node:fs/promises";
import {instagramUsername} from "../assets/js/instagram.js";
Object.assign(process.env,{SUPABASE_URL:"https://test.invalid",SUPABASE_SECRET_KEY:"test-only"});
registerHooks({resolve(s,c,next){return s==="@supabase/supabase-js"?{url:"data:text/javascript,export const createClient=()=>globalThis.mock",shortCircuit:true}:next(s,c);}});
const roles=["student","class_officer","teacher","developer"];let writes=[],fail=false;
globalThis.mock={auth:{getUser:async token=>({data:{user:{id:token}},error:null})},from(){let filters=[],patch,single=false;const q={select(){return q},update(v){patch=v;return q},eq(k,v){filters.push([k,v]);return q},maybeSingle(){single=true;return q},then(resolve){const id=filters.find(([k])=>k==="id")?.[1];if(patch){if(fail)return Promise.resolve({error:{message:"DB failure"}}).then(resolve);writes.push({id,patch});}
const member=roles.includes(id)?{id,role:id,name:id,username:id}:null;return Promise.resolve({data:single?member:member?[member]:[],error:null}).then(resolve)}};return q;}};
const self=(await import("../api/profile/instagram.js")).default,admin=(await import("../api/admin/update-user.js")).default;
async function call(handler,role,body){let status=200,data;await handler({method:"POST",headers:role?{authorization:"Bearer "+role}:{},body},{status(v){status=v;return this},json(v){data=v;return this}});return {status,data};}
const results=[];async function check(name,fn){writes=[];await fn();results.push({name,status:"PASS"});}
for(const role of roles)await check(role+": own Instagram only",async()=>{assert.equal((await call(self,role,{instagram:"@my.account"})).status,200);assert.equal(writes[0].id,role);assert.equal(writes[0].patch.instagram,"my.account");});
await check("Guest rejected",async()=>{assert.equal((await call(self,null,{instagram:"test"})).status,401);assert.equal(writes.length,0);});
await check("Orphan rejected",async()=>assert.equal((await call(self,"orphan",{instagram:"test"})).status,403));
for(const field of ["uid","role","name"])await check("Extra "+field+" rejected",async()=>{assert.equal((await call(self,"student",{instagram:"test",[field]:"developer"})).status,400);assert.equal(writes.length,0);});
await check("Developer edits another member",async()=>{assert.equal((await call(admin,"developer",{uid:"student",instagram:"https://www.instagram.com/alya.class/"})).status,200);assert.equal(writes[0].id,"student");assert.equal(writes[0].patch.instagram,"alya.class");});
await check("Student cannot edit another member",async()=>assert.equal((await call(admin,"student",{uid:"teacher",instagram:"test"})).status,403));
await check("Clear Instagram allowed",async()=>assert.equal((await call(self,"student",{instagram:""})).status,200));
await check("Unsafe handles rejected",async()=>{for(const value of ["javascript:alert(1)","https://evil.invalid/test","<img>","a..b","a".repeat(31),null])assert.equal((await call(self,"teacher",{instagram:value})).status,400);assert.equal(writes.length,0);});
await check("Failed DB write stays an error",async()=>{fail=true;assert.equal((await call(self,"student",{instagram:"test"})).status,500);fail=false;});
assert.equal(instagramUsername("https://instagram.com/Clouven.two/?igsh=abc"),"clouven.two");
await writeFile(new URL("../verification/instagram-api-results.json",import.meta.url),JSON.stringify({scope:"Local handlers with isolated database/auth fixtures",results},null,2));
console.log(results.length+" Instagram API checks passed.");
