import assert from "node:assert/strict";
import fs from "node:fs";
import handler from "../api/config.js";
import {validatePublicConfig} from "../assets/js/public-config.js";

const names=["SUPABASE_URL","SUPABASE_PUBLISHABLE_KEY","SUPABASE_ANON_KEY","SUPABASE_SECRET_KEY","SUPABASE_SERVICE_ROLE_KEY"];
const previous=Object.fromEntries(names.map(key=>[key,process.env[key]])),results=[];
const key="sb_publishable_local_test_configuration",url="https://classroom.invalid";
const jwt=role=>Buffer.from('{"alg":"HS256"}').toString("base64url")+"."+Buffer.from(JSON.stringify({role})).toString("base64url")+".signature";
function run(name,env,expected,method="GET"){
 for(const name of names)delete process.env[name];
 Object.assign(process.env,env,{SUPABASE_SECRET_KEY:"sb_secret_server_only",SUPABASE_SERVICE_ROLE_KEY:jwt("service_role")});
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 handler({method},res);
 assert.equal(res.code,expected,name);assert.equal(res.headers["Cache-Control"],"no-store");
 assert.equal(JSON.stringify(res.data).includes("sb_secret_"),false);
 assert.equal(JSON.stringify(res.data).includes(jwt("service_role")),false);
 if(expected===200){assert.deepEqual(Object.keys(res.data).sort(),["publishableKey","url"]);assert.equal(res.data.url,url);}
 results.push({name,status:"PASS"});
}
try{
 run("Public environment config",{SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:key},200);
 run("Legacy anon fallback",{SUPABASE_URL:url,SUPABASE_ANON_KEY:jwt("anon")},200);
 run("Missing URL",{SUPABASE_PUBLISHABLE_KEY:key},503);
 run("Missing public key",{SUPABASE_URL:url},503);
 run("Secret in publishable variable rejected",{SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:"sb_secret_misconfigured"},503);
 run("Service role in legacy variable rejected",{SUPABASE_URL:url,SUPABASE_ANON_KEY:jwt("service_role")},503);
 run("Invalid primary cannot fall back",{SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:"sb_secret_misconfigured",SUPABASE_ANON_KEY:jwt("anon")},503);
 for(const badUrl of ["http://remote.invalid","javascript:alert(1)","https://user:password@classroom.invalid","https://classroom.invalid/path","https://classroom.invalid?token=x"])
  run("Invalid URL rejected: "+badUrl.split(":")[0],{SUPABASE_URL:badUrl,SUPABASE_PUBLISHABLE_KEY:key},503);
 run("POST rejected",{SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:key},405,"POST");
 assert.deepEqual(validatePublicConfig({url:"http://127.0.0.1:54321",publishableKey:key,secret:"discard"}),{url:"http://127.0.0.1:54321",publishableKey:key});
 results.push({name:"Local Supabase support and output allowlist",status:"PASS"});
 fs.writeFileSync(new URL("../verification/config-results.json",import.meta.url),JSON.stringify({scope:"Local endpoint unit checks, no external calls",results},null,2));
 console.log(results.length+" config checks passed.");
}finally{for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}

