const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright");
const root=path.resolve(__dirname,".."),out=path.join(root,"ui-test-results","access-"+Date.now());
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 let file=path.join(root,decodeURIComponent(req.url.split("?")[0]));
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,"index.html");
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader("Content-Type",{".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"}[path.extname(file)]||"application/octet-stream");res.end(fs.readFileSync(file));
});
function mock(){
 const role=window.__options.role,user=role==="guest"?null:{id:role,user_metadata:{name:"Akun "+role}};
 const roles=["student","class_officer","teacher","developer"];
 window.__data={
  members:roles.map((r,i)=>({id:r,role:r,username:r,name:r==="student"?"Alya Putri":r==="class_officer"?"Bagas Pratama":r==="teacher"?"Bu Rani":"Pierr",number:String(i+1),class_role:r==="teacher"?"Wali Kelas":"Anggota",photo:"",quote:"Belajar bersama"})),
  class_profile:[{id:"main",data:{className:"XI TKJ 2",headline:"Semangat, berjuang,",emphasis:"sukses."}}],
  subject_teachers:[{subject:"ASJ",teachers:["Bu Rani"]},{subject:"Bahasa Indonesia",teachers:["Bu Liza"]},{subject:"TJKN",teachers:["Pak Budi","Bu Rani"]}],
  schedules:[{day:"monday",lessons:[],piket:["Alya Putri"]}],
  apel_queue:[{id:"queue-1",name:"Alya Putri",position:0}],
  tasks:[{id:"task-1",title:"Praktik jaringan komputer",subject:"ASJ",due:"2026-10-20",teacher:"Bu Rani",description:"Dokumentasikan konfigurasi jaringan."},{id:"task-2",title:"Laporan proyek",subject:"TJKN",due:"2026-10-25",description:"Buat laporan singkat."}],
  task_summaries:[{id:"task-1",title:"Praktik jaringan komputer",subject:"ASJ",due:"2026-10-20"}],
  task_progress:[{user_id:"student",task_id:"task-1",done:true}],
  resources:[{id:"resource-1",drive_file_id:"class-file-123",name:"Panduan praktik jaringan komputer.pdf",subject:"ASJ",kind:"materi",size:12000}],
 };
 window.__reads=[];window.__writes=[];window.__api=[];window.__fail={};window.__channels=[];
 const emit=table=>setTimeout(()=>window.__channels.filter(c=>c.table===table).forEach(c=>c.callback()),20);
 window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:user?{user,access_token:"isolated-"+role}:null},error:null}),signOut:async()=>({error:null}),updateUser:async()=>({error:null})},
  rpc:async(name,{entries})=>{if(window.__writeFail)return {error:{message:"Gagal menyimpan daftar"}};window.__writes.push({table:"subject_teachers",mode:"replace",payload:entries});window.__data.subject_teachers=entries;return {data:null,error:null};},
  from(table){let single=false,filters=[],mode="select",payload;
   const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},order(){return q;},maybeSingle(){single=true;return q;},upsert(v){mode="upsert";payload=v;return q;},update(v){mode="update";payload=v;return q;},delete(){mode="delete";return q;},insert(v){mode="insert";payload=v;return q;},
    then(resolve,reject){return(async()=>{
     if(mode!=="select"){
      window.__writes.push({table,mode,payload});
      if(window.__writeDelay)await new Promise(r=>setTimeout(r,window.__writeDelay));
      if(window.__writeFail)return {data:null,error:{message:"Perubahan belum tersimpan. Coba lagi."}};
      if(mode==="delete"&&window.__deleteDenied)return {data:[],error:null};
      const deleted=mode==="delete"?window.__data[table].filter(row=>filters.every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v)):[];
      const rows=Array.isArray(payload)?payload:[payload];
      if(mode==="upsert")for(const row of rows){const found=window.__data[table].find(x=>table==="task_progress"?x.task_id===row.task_id&&x.user_id===row.user_id:table==="schedules"?x.day===row.day:x.id===row.id);if(found)Object.assign(found,row);else window.__data[table].push(row);}
      if(mode==="delete")window.__data[table]=window.__data[table].filter(row=>!filters.every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v));
      emit(table);return {data:deleted,error:null};
     }
     window.__reads.push(table);
     if(window.__fail[table])return {data:null,error:{message:"Simulated connection failure"}};
     let rows=window.__data[table]||[];
     rows=rows.filter(row=>filters.every(([k,v])=>row[k]===v));
     return {data:single?rows[0]||null:rows,error:null};
    })().then(resolve,reject);}
   };return q;
  },channel(){const c={on(event,config,callback){c.table=config.table;c.callback=callback;return c;},subscribe(){return c;}};window.__channels.push(c);return c;},removeChannel(c){window.__channels=window.__channels.filter(x=>x!==c);}
 })};
}
(async()=>{
 await new Promise(r=>server.listen(0,"127.0.0.1",r));const base="http://127.0.0.1:"+server.address().port;
 const browser=await chromium.launch({channel:"msedge",headless:true}),results=[];
 async function create(role,route,options={}){
  const p=await browser.newPage({viewport:options.viewport||{width:1440,height:900}});p.setDefaultTimeout(9000);p.errors=[];
  await p.addInitScript(options=>{window.__options=options;if(options.dark)localStorage.setItem("clouven-theme","dark");}, {...options,role});
  await p.route("**/*",async r=>{
   const url=r.request().url();if(new URL(url).pathname==="/api/config")return r.fulfill({contentType:"application/json",body:JSON.stringify({url:"https://classroom.invalid",publishableKey:"sb_publishable_local_test_configuration"})});
   if(url.includes("/@supabase/supabase-js"))return r.fulfill({contentType:"text/javascript",body:"("+mock.toString()+")();"});
   if(url.startsWith(base+"/api/")){
     const payload=r.request().postDataJSON()||{},apiPath=new URL(url).pathname;
     const delay=await p.evaluate(()=>window.__apiDelay||0);if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    const fail=await p.evaluate(({apiPath,payload})=>{
     window.__api.push({path:apiPath,payload});
     if(window.__apiFail)return true;
     if(apiPath==="/api/profile/update")Object.assign(window.__data.members.find(m=>m.id===window.__options.role),payload,{class_role:payload.classRole});
     if(apiPath==="/api/profile/instagram")Object.assign(window.__data.members.find(m=>m.id===window.__options.role),payload);
     if(apiPath==="/api/admin/update-user")Object.assign(window.__data.members.find(m=>m.id===payload.uid),payload,payload.classRole?{class_role:payload.classRole}:{});
     if(apiPath==="/api/admin/delete-user")window.__data.members=window.__data.members.filter(m=>m.id!==payload.uid);
     if(apiPath==="/api/drive/manage"){
      if(payload.action==="trash")window.__data.resources=[];
      else Object.assign(window.__data.resources[0],payload);
     }
     return false;
    },{apiPath,payload});
    return r.fulfill({status:fail?503:200,contentType:"application/json",body:JSON.stringify(fail?{error:"Belum tersimpan. Coba lagi."}:{ok:true})});
   }
   if(url.startsWith(base))return r.continue();
   if(options.fonts&&/fonts\.(googleapis|gstatic)\.com|cdn.jsdelivr.net\/npm\/@tabler/.test(url))return r.fetch({timeout:7000}).then(response=>r.fulfill({response})).catch(()=>r.abort());
   return r.abort();
  });
  p.on("pageerror",e=>{if(e.message!=="redirect")p.errors.push(e.message);});
  await p.goto(base+route);return p;
 }
 async function check(name,fn){if(process.env.UI_TEST_FILTER&&!new RegExp(process.env.UI_TEST_FILTER).test(name))return;await fn();results.push({name,status:"PASS"});console.log("PASS "+name);}
 async function finish(p){assert.deepEqual(p.errors,[]);await p.close();}
 const managers=["class_officer","teacher","developer"];
 for(const role of ["guest","student",...managers]){
  await check(role+": home tasks and navigation",async()=>{
   const p=await create(role,"/");await p.locator(".sidebar-profile").waitFor();
   await p.waitForFunction(()=>document.querySelector("#summaryGrid").textContent.includes("Login untuk melihat")||document.querySelector("#summaryGrid").textContent.includes("Praktik jaringan"));
   assert.equal(await p.locator('#sidebar a[href="/admin/"]').count(),role==="developer"?1:0);
   assert.equal(await p.locator('#sidebar a[href="/kelola/"]').count(),["class_officer","teacher"].includes(role)?1:0);
   assert.equal(await p.evaluate(()=>window.__reads.includes("task_summaries")),role!=="guest");
   await finish(p);
  });
  await check(role+": admin and Kelola Kelas route boundary",async()=>{
   for(const route of ["/admin/","/kelola/"]){
    const p=await create(role,route);
    if(role==="guest")await p.waitForURL("**/login/?next=*");
    else if(role==="student")await p.waitForURL(base+"/");
    else {
     await p.locator("#profileForm").waitFor();
     assert.equal(new URL(p.url()).pathname,route==="/admin/"&&role!=="developer"?"/kelola/":route);
     assert.equal(await p.locator('[data-admin-tab="users"]').count(),new URL(p.url()).pathname==="/admin/"?1:0);
    }
    await finish(p);
   }
  });
  if(role==="guest")continue;
  await check(role+": own profile editing visibility",async()=>{
   const p=await create(role,"/profile/");await p.locator("#profileCard h2").waitFor();
   assert.equal(await p.locator("#editMyProfile").count(),["teacher","developer"].includes(role)?1:0);
   if(["teacher","developer"].includes(role)){
    await p.locator("#editMyProfile").click();await p.locator('.modal input[name="name"]').fill("Nama diperbarui");
    await p.getByRole("button",{name:"Simpan perubahan",exact:true}).click();await p.locator(".modal").waitFor({state:"detached"});
    assert.equal(await p.locator("#profileCard h2").innerText(),"Nama diperbarui");
    assert.equal(await p.evaluate(()=>window.__api[0].path),"/api/profile/update");
   }
   await finish(p);
  });
  await check(role+": file management visibility and edit",async()=>{
   const p=await create(role,"/penyimpanan/");await p.locator(".resource-row").waitFor();
   assert.equal(await p.locator("[data-edit-file]").count(),managers.includes(role)?1:0);
   assert.equal(await p.locator("#uploadCard").isVisible(),managers.includes(role));
   if(managers.includes(role)){
    await p.locator("[data-edit-file]").click();await p.locator('.modal input[name="name"]').fill("Panduan baru.pdf");
    await p.locator('.modal select[name="kind"]').selectOption("tugas");await p.getByRole("button",{name:"Simpan perubahan",exact:true}).click();
    await p.getByText("Panduan baru.pdf",{exact:true}).waitFor();assert.equal(await p.evaluate(()=>window.__api[0].payload.action),"edit");
   }
   await finish(p);
  });
  await check(role+": other task progress permissions",async()=>{
   const p=await create(role,"/tugas/");await p.locator(".task-card").first().waitFor();
   if(managers.includes(role)){
    await p.locator("#progressTask").waitFor();assert.equal(await p.locator("#classProgress .admin-list-item").count(),3);
    assert.equal(await p.locator("[data-progress-user]").count(),role==="class_officer"?0:3);
    if(role!=="class_officer"){
     await p.locator('[data-progress-user="student"]').click();
     await p.waitForFunction(()=>window.__writes.some(w=>w.table==="task_progress"));
     assert.equal(await p.evaluate(()=>window.__writes.at(-1).payload.done),false);
    }
    await p.locator("#progressTask").selectOption("task-2");assert.equal(await p.locator("#classProgress .is-done").count(),0);
   }else assert.equal(await p.locator("#classProgress").isVisible(),false);
   await p.locator('[data-toggle="task-2"]').click();
   await p.waitForFunction(()=>window.__writes.some(w=>w.payload?.task_id==="task-2"));
   assert.equal(await p.evaluate(()=>window.__writes.at(-1).payload.user_id),role);
   await finish(p);
  });
 }
 for(const role of ["class_officer","teacher"])await check(role+": operational forms save class data",async()=>{
  const p=await create(role,"/kelola/");await p.locator("#profileForm").waitFor();await p.locator('[name="className"]').fill("XI TKJ 2 Baru");await p.locator("#profileForm [type=submit]").click();
  await p.waitForFunction(()=>window.__writes.some(w=>w.table==="class_profile"));
  await p.locator('[data-admin-tab="schedule"]').click();await p.locator("#scheduleForm").waitFor();await p.locator('#scheduleForm [data-piket][value="Alya Putri"]').check();await p.locator("#scheduleForm [type=submit]").click();
  await p.waitForFunction(()=>window.__writes.some(w=>w.table==="schedules"));
  await p.locator('[data-admin-tab="tasks"]').click();await p.locator('#taskForm [name="title"]').fill("Tugas baru");await p.locator('#taskForm [name="subject"]').selectOption("ASJ");await p.locator('#taskForm [name="due"]').fill("2026-10-25");await p.locator("#taskForm [type=submit]").click();
  await p.waitForFunction(()=>window.__writes.some(w=>w.table==="tasks"));
  await p.locator('[data-edit-task="task-1"]').click();await p.locator('#taskForm [name="title"]').fill("Tugas diedit");await p.locator("#taskForm [type=submit]").click();
  await p.waitForFunction(()=>window.__writes.some(w=>w.table==="tasks"&&w.payload.title==="Tugas diedit"));
  await p.locator('[data-delete-task="task-1"]').click();await p.locator('.modal button[type="submit"]').click();await p.locator(".modal").waitFor({state:"detached"});
  await p.waitForFunction(()=>window.__writes.some(w=>w.table==="tasks"&&w.mode==="delete"));
  await p.locator('[data-admin-tab="apel"]').click();await p.locator("#saveQueue").click();await p.waitForFunction(()=>window.__writes.some(w=>w.table==="apel_queue"));await finish(p);
 });
 await check("Developer biodata, reset password and delete confirmation",async()=>{
  const p=await create("developer","/admin/");await p.locator("#profileForm").waitFor();await p.locator('[data-admin-tab="users"]').click();await p.locator("#userForm").waitFor();
  assert.equal(await p.locator('[data-delete-account="developer"]').count(),0);
  await p.locator('[data-biodata="student"]').click();await p.locator('.modal input[name="name"]').fill("Alya Revisi");await p.getByRole("button",{name:"Simpan perubahan",exact:true}).click();await p.locator(".modal").waitFor({state:"detached"});await p.getByText("Alya Revisi",{exact:true}).waitFor();
  await p.locator('[data-reset-password="student"]').click();await p.locator('.modal input[name="password"]').fill("test-only-password");await p.locator('.modal input[name="confirmPassword"]').fill("different-password");await p.locator('.modal button[type="submit"]').click();await p.locator(".modal [data-error]").waitFor();
  assert.equal(await p.evaluate(()=>window.__api.filter(a=>a.path.includes("reset-password")).length),0);
  await p.locator('.modal input[name="confirmPassword"]').fill("test-only-password");await p.locator('.modal button[type="submit"]').click();await p.locator(".modal").waitFor({state:"detached"});
  await p.locator('[data-delete-account="student"]').click();await p.locator('.modal input[name="confirmation"]').fill("wrong");await p.locator('.modal button[type="submit"]').click();await p.locator(".modal [data-error]").waitFor();
  assert.equal(await p.evaluate(()=>window.__api.filter(a=>a.path.includes("delete-user")).length),0);
  await p.locator('.modal input[name="confirmation"]').fill("student");await p.locator('.modal button[type="submit"]').click();await p.locator('[data-delete-account="student"]').waitFor({state:"detached"});await finish(p);
 });
 await check("Failed save preserves biodata and allows retry, dialog traps focus",async()=>{
  const p=await create("teacher","/profile/");await p.locator("#editMyProfile").click();await p.locator('.modal input[name="name"]').fill("Nama tetap tersimpan");
  await p.evaluate(()=>window.__apiFail=true);await p.getByRole("button",{name:"Simpan perubahan",exact:true}).click();await p.locator(".modal [data-error]").waitFor();
  assert.equal(await p.locator('.modal input[name="name"]').inputValue(),"Nama tetap tersimpan");
  await p.locator('.modal button[type=submit]').focus();await p.keyboard.press("Tab");assert.equal(await p.locator(".modal [data-close]").first().evaluate(el=>el===document.activeElement),true);
  await p.evaluate(()=>window.__apiFail=false);await p.getByRole("button",{name:"Simpan perubahan",exact:true}).click();await p.locator(".modal").waitFor({state:"detached"});await finish(p);
 });
 await check("Class progress error recovers and empty roster is explicit",async()=>{
  const p=await create("class_officer","/tugas/");await p.locator("#progressTask").waitFor();
  await p.evaluate(()=>{window.__fail.task_progress=true;window.__channels.filter(c=>c.table==="task_progress").forEach(c=>c.callback());});await p.locator('[data-load-retry="class-progress"]').waitFor();
  assert.equal(await p.locator("#classProgress .admin-list-item").count(),0);
  await p.evaluate(()=>{window.__fail.task_progress=false;window.__data.members=window.__data.members.filter(m=>m.id==="class_officer");});await p.locator('[data-load-retry="class-progress"]').click();
  await p.evaluate(()=>window.__channels.filter(c=>c.table==="members").forEach(c=>c.callback()));await p.getByText("Belum ada anggota lain.",{exact:true}).waitFor();await finish(p);
 });
 await check("Trash confirmation waits for success and handles failure",async()=>{
  const p=await create("class_officer","/penyimpanan/");await p.locator("[data-trash-file]").click();await p.getByRole("button",{name:"Batal",exact:true}).click();assert.equal(await p.evaluate(()=>window.__api.length),0);
  await p.locator("[data-trash-file]").click();await p.evaluate(()=>{window.__apiFail=true;window.__apiDelay=500;});await p.getByRole("button",{name:"Pindahkan ke Sampah",exact:true}).click();await p.getByRole("button",{name:"Menghapus…",exact:true}).waitFor();assert.equal(await p.locator('.modal [type="submit"] .button-loading-spinner').count(),1);await p.locator(".modal [data-error]").waitFor();
  assert.equal(await p.locator(".resource-row").count(),1);
  await p.evaluate(()=>{window.__apiFail=false;window.__apiDelay=0;});await p.getByRole("button",{name:"Pindahkan ke Sampah",exact:true}).click();await p.getByText("Belum ada file.",{exact:true}).waitFor();await finish(p);
 });

 await check("Edited biodata and schedule text cannot inject markup",async()=>{
  const p=await create("developer","/anggota/");await p.locator(".member-card").first().waitFor();
  await p.evaluate(()=>{window.__data.members[0].photo='https://example.invalid/x" onerror="window.__injected=true';window.__data.members[0].name='<b>Nama</b>';window.__channels.filter(c=>c.table==="members").forEach(c=>c.callback());});
  await p.getByText("1 · <b>Nama</b>",{exact:true}).waitFor();
  assert.equal(await p.locator(".member-card [onerror]").count(),0);assert.equal(await p.locator(".member-card b").count(),0);
  await p.goto(base+"/kelola/");await p.locator("#profileForm").waitFor();
  await p.evaluate(()=>{window.__data.schedules[0].piket=['</textarea><img src=x onerror="window.__injected=true">'];});
  await p.locator('[data-admin-tab="schedule"]').click();await p.locator("#scheduleForm").waitFor();
  await p.evaluate(()=>window.__channels.filter(c=>c.table==="schedules").forEach(c=>c.callback()));
  await p.waitForFunction(()=>[...document.querySelectorAll('#scheduleForm [data-piket]')].some(el=>el.value.includes("</textarea>")));
  assert.equal(await p.locator("#scheduleForm img").count(),0);assert.equal(await p.evaluate(()=>Boolean(window.__injected)),false);
  await finish(p);
 });
 for(const dark of [false,true])for(const width of [320,390,1440])await check("Responsive new UI "+width+" "+(dark?"dark":"light"),async()=>{
  const p=await create("developer","/admin/",{dark,fonts:true,viewport:{width,height:900}});
  await p.locator("#profileForm").waitFor();await p.locator('[data-admin-tab="users"]').click();await p.locator("#userForm").waitFor();await p.evaluate(()=>document.fonts.ready);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(width===1440)assert.equal(await p.locator("#sidebar").evaluate(el=>el.getBoundingClientRect().width),248);
  await p.screenshot({path:path.join(out,"accounts-"+width+"-"+(dark?"dark":"light")+".png"),fullPage:true,animations:"disabled"});
  if(width===1440)await p.screenshot({path:path.join(out,"accounts-viewport-"+(dark?"dark":"light")+".png"),animations:"disabled"});
  await p.locator('[data-biodata="student"]').click();assert.equal(await p.locator(".modal").evaluate(el=>el.scrollWidth>el.clientWidth),false);
  await p.screenshot({path:path.join(out,"biodata-"+width+"-"+(dark?"dark":"light")+".png")});await p.keyboard.press("Escape");
  await p.goto(base+"/tugas/");await p.locator("#progressTask").waitFor();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.screenshot({path:path.join(out,"progress-"+width+"-"+(dark?"dark":"light")+".png"),fullPage:true});
  await p.goto(base+"/penyimpanan/");await p.locator("[data-edit-file]").click();assert.equal(await p.locator(".modal").evaluate(el=>el.scrollWidth>el.clientWidth),false);
  await finish(p);
 });
 fs.writeFileSync(path.join(out,"results.json"),JSON.stringify(results,null,2));
 fs.writeFileSync(path.join(root,"verification",process.env.UI_TEST_FILTER?"ui-access-targeted-results.json":"ui-access-results.json"),JSON.stringify({scope:"Headless Edge, simulated accounts/data/API; no production writes",checks:results.length,results},null,2));
 console.log("All "+results.length+" UI checks passed. "+out);await browser.close();server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1);});
