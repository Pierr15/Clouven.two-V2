const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright");
const root=path.resolve(__dirname,".."),out=path.join(root,"ui-test-results","settings-"+Date.now());
fs.mkdirSync(out,{recursive:true});
const fixture=fs.readFileSync(path.join(__dirname,"ui-access.cjs"),"utf8");
const mock=fixture.slice(fixture.indexOf("function mock(){"),fixture.indexOf("\n(async()=>"));
const server=http.createServer((req,res)=>{
 let file=path.join(root,decodeURIComponent(req.url.split("?")[0]));
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,"index.html");
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader("Content-Type",{".js":"text/javascript",".html":"text/html",".css":"text/css",".svg":"image/svg+xml"}[path.extname(file)]||"application/octet-stream");res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,"127.0.0.1",r));const base="http://127.0.0.1:"+server.address().port;
 const browser=await chromium.launch({channel:"msedge",headless:true}),results=[];
 async function create(role,route,options={}){
  const p=await browser.newPage({viewport:{width:options.width||1440,height:900}});p.setDefaultTimeout(8000);p.errors=[];
  await p.addInitScript(options=>{window.__options=options;if(options.dark)localStorage.setItem("clouven-theme","dark");},{...options,role});
  if(options.clock){await p.clock.install({time:new Date("2026-09-07T00:00:00Z")});await p.clock.pauseAt(new Date("2026-09-07T00:00:01Z"));}
  let configCalls=0;
  await p.route("**/*",async r=>{
   const url=r.request().url();
   if(new URL(url).pathname==="/api/config"){
    configCalls++;const failed=options.configFail&&configCalls===1;
    return r.fulfill({status:failed?503:200,contentType:"application/json",body:JSON.stringify(failed?{error:"Not configured"}:{url:"https://classroom.invalid",publishableKey:options.badKey?"sb_secret_bad_configuration":"sb_publishable_local_test_configuration"})});
   }
   if(url.includes("/@supabase/supabase-js"))return r.fulfill({contentType:"text/javascript",body:mock+"mock();if(window.__options.profile)Object.assign(window.__data.class_profile[0].data,window.__options.profile);const client=window.supabase.createClient;window.supabase.createClient=(...args)=>{window.__clientArgs=args;return client(...args);};"});
   if(url.startsWith(base))return r.continue();
   if(options.fonts&&/fonts\.(googleapis|gstatic)\.com|cdn.jsdelivr.net\/npm\/@tabler/.test(url))return r.fetch({timeout:6000}).then(response=>r.fulfill({response})).catch(()=>r.abort());
   return r.abort();
  });
  p.on("pageerror",e=>p.errors.push(e.message));
  p.on("dialog",async dialog=>{p.errors.push("Unexpected native dialog");await dialog.dismiss();});
  await p.goto(base+route);return p;
 }
 async function check(name,fn){if(process.env.UI_TEST_FILTER&&!new RegExp(process.env.UI_TEST_FILTER).test(name))return;await fn();results.push({name,status:"PASS"});console.log("PASS "+name);}
 async function finish(p){assert.deepEqual(p.errors,[]);await p.close();}
 async function tasks(p){await p.locator("#profileForm").waitFor();await p.locator('[data-admin-tab="tasks"]').click();await p.locator('[data-delete-task="task-1"]').waitFor();}
 for(const role of ["developer","class_officer","teacher"])await check(role+": title settings save and reload within panel",async()=>{
  const p=await create(role,role==="developer"?"/admin/":"/kelola/");
  await p.locator("#titleAnimationEnabled").waitFor();assert.equal(await p.locator("#titleAnimationEnabled").isChecked(),true);
  await p.locator("#addTitleVariation").click();
  await p.locator("[data-title-headline]").fill("Belajar bersama,");await p.locator("[data-title-emphasis]").fill("tumbuh bersama.");
  await p.locator("#titleAnimationEnabled").uncheck();await p.locator('#titlePreview[data-typewriter-phase="static"]').waitFor();
  await p.locator("#profileForm [type=submit]").click();
  await p.waitForFunction(()=>window.__writes.some(w=>w.table==="class_profile"));
  const saved=await p.evaluate(()=>window.__data.class_profile[0].data.titleAnimation);
  assert.deepEqual(saved,{enabled:false,phrases:[{headline:"Belajar bersama,",emphasis:"tumbuh bersama."}]});
  await p.locator('[data-admin-tab="tasks"]').click();await p.locator('[data-admin-tab="profile"]').click();
  assert.equal(await p.locator("#titleAnimationEnabled").isChecked(),false);
  assert.equal(await p.locator("[data-title-headline]").inputValue(),"Belajar bersama,");await finish(p);
 });
 await check("Title save failure retains draft, retries once, limits variations",async()=>{
  const p=await create("developer","/admin/");await p.locator("#titleAnimationEnabled").waitFor();
  for(let i=0;i<5;i++){await p.locator("#addTitleVariation").click();await p.locator("[data-title-headline]").last().fill("Variasi "+i);}
  assert.equal(await p.locator("#addTitleVariation").isDisabled(),true);
  await p.getByRole("button",{name:"Hapus variasi 2",exact:true}).click();assert.equal(await p.locator("#addTitleVariation").isEnabled(),true);
  assert.equal(await p.locator(".title-variation legend").last().innerText(),"Variasi 4");
  await p.evaluate(()=>window.__writeFail=true);await p.locator("#profileForm [type=submit]").click();await p.locator("#profileSaveStatus").waitFor();
  assert.equal(await p.locator("[data-title-headline]").first().inputValue(),"Variasi 0");
  assert.equal(await p.locator("#profileForm [type=submit]").isEnabled(),true);
  await p.evaluate(()=>{window.__writeFail=false;window.__writeDelay=350;});
  await p.locator("#profileForm [type=submit]").click();
  await p.locator("#profileForm").evaluate(el=>el.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  await p.waitForFunction(()=>window.__data.class_profile[0].data.titleAnimation?.phrases.length===4);
  assert.equal(await p.evaluate(()=>window.__writes.filter(w=>w.table==="class_profile").length),2);await finish(p);
 });
 await check("Task delete cancel, Escape and return focus",async()=>{
  const p=await create("class_officer","/kelola/");await tasks(p);
  const trigger=p.locator('[data-delete-task="task-1"]');await trigger.click();
  assert.match(await p.locator(".dialog-description").innerText(),/Praktik jaringan komputer.*ASJ.*progres/);
  await p.getByRole("button",{name:"Batal",exact:true}).click();
  assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  await trigger.click();await p.keyboard.press("Escape");
  assert.equal(await p.evaluate(()=>window.__writes.length),0);await finish(p);
 });
 await check("Task delete busy guard, success and focus after row removed",async()=>{
  const p=await create("developer","/admin/");await tasks(p);await p.locator('[data-delete-task="task-1"]').click();
  await p.evaluate(()=>window.__writeDelay=500);await p.locator(".modal [type=submit]").click();
  assert.equal(await p.locator(".modal [type=submit]").innerText(),"Menghapus…");
  await p.locator(".modal form").evaluate(el=>el.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  await p.keyboard.press("Tab");await p.keyboard.press("Escape");assert.equal(await p.locator(".modal").count(),1);
  await p.locator(".modal").waitFor({state:"detached"});
  await p.locator('[data-delete-task="task-1"]').waitFor({state:"detached"});
  assert.equal(await p.locator('[data-delete-task="task-2"]').count(),1);
  assert.equal(await p.evaluate(()=>window.__writes.filter(w=>w.mode==="delete").length),1);
  assert.equal(await p.locator('#taskForm [name="title"]').evaluate(el=>el===document.activeElement),true);await finish(p);
 });
 await check("Task delete failure and zero-row denial never show success",async()=>{
  const p=await create("teacher","/kelola/");await tasks(p);await p.locator('[data-delete-task="task-1"]').click();
  await p.evaluate(()=>window.__writeFail=true);await p.locator(".modal [type=submit]").click();await p.locator(".modal [data-error]").waitFor();
  assert.equal(await p.locator('[data-delete-task="task-1"]').count(),1);
  await p.evaluate(()=>{window.__writeFail=false;window.__deleteDenied=true;});
  await p.locator(".modal [type=submit]").click();await p.getByText(/Tugas tidak dapat dihapus/).waitFor();
  assert.equal(await p.locator(".modal").count(),1);
  await p.evaluate(()=>window.__deleteDenied=false);await p.locator(".modal [type=submit]").click();
  await p.locator(".modal").waitFor({state:"detached"});await finish(p);
 });
 for(const width of [320,390,1440])await check("Title phrases cycle, stable layout and reduced motion "+width,async()=>{
  const p=await create("guest","/",{width,clock:true,profile:{headline:"A",emphasis:"B",titleAnimation:{enabled:true,phrases:[{headline:"Belajar bersama teman sekelas,",emphasis:"tumbuh bersama."}]}}});
  await p.locator('#heroTitle[aria-label="A B"]').waitFor();
  const height=await p.locator("#heroTitle").evaluate(el=>el.getBoundingClientRect().height);
  await p.clock.runFor(225);assert.equal(await p.locator("#heroTitle").getAttribute("data-typewriter-phase"),"idle");
  await p.clock.runFor(4999);assert.equal(await p.locator("#heroTitle").getAttribute("data-typewriter-phase"),"idle");
  await p.clock.runFor(1+80+350);assert.equal(await p.locator("#heroTitle").getAttribute("data-typewriter-index"),"1");
  assert.equal(await p.locator("#heroTitle").evaluate(el=>el.getBoundingClientRect().height),height);
  const count=await p.locator("#heroTitle .typewriter-line").nth(1).locator(".typewriter-char").count();
  await p.clock.runFor(75*(count-1)+5000+40*(count-1)+350);
  assert.equal(await p.locator("#heroTitle").getAttribute("data-typewriter-index"),"0");
  await p.emulateMedia({reducedMotion:"reduce"});await p.locator('#heroTitle[data-typewriter-phase="static"]').waitFor();
  assert.equal(await p.locator("#heroTitle").innerText(),"A B");
  await p.emulateMedia({reducedMotion:"no-preference"});
  await p.evaluate(()=>{window.__data.class_profile[0].data.titleAnimation.enabled=false;window.__channels.filter(c=>c.table==="class_profile").forEach(c=>c.callback());});
  await p.locator('#heroTitle[data-typewriter-phase="static"]').waitFor();await p.clock.runFor(20000);
  assert.equal(await p.locator("#heroTitle").innerText(),"A B");
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await finish(p);
 });
 await check("Missing configuration retries before creating client",async()=>{
  const p=await create("guest","/",{configFail:true});
  await p.getByRole("button",{name:"Coba lagi",exact:true}).waitFor();
  assert.equal(await p.evaluate(()=>Boolean(window.__clientArgs)),false);
  await p.getByRole("button",{name:"Coba lagi",exact:true}).click();await p.locator(".sidebar-profile").waitFor();
  assert.deepEqual(await p.evaluate(()=>window.__clientArgs.slice(0,2)),["https://classroom.invalid","sb_publishable_local_test_configuration"]);await finish(p);
 });
 await check("Frontend rejects secret-key configuration",async()=>{
  const p=await create("guest","/",{badKey:true});await p.getByRole("button",{name:"Coba lagi",exact:true}).waitFor();
  assert.equal(await p.evaluate(()=>Boolean(window.__clientArgs)),false);await finish(p);
 });
 for(const dark of [false,true])for(const width of [320,390,1440])await check("Responsive editor and deletion dialog "+width+" "+(dark?"dark":"light"),async()=>{
  const p=await create("developer","/admin/",{width,dark,fonts:true});
  await p.locator("#titleAnimationEnabled").waitFor();await p.locator("#addTitleVariation").click();
  await p.locator("[data-title-headline]").fill("Belajar bersama,");await p.locator("[data-title-emphasis]").fill("tumbuh bersama.");
  await p.evaluate(()=>document.fonts.ready);await p.locator(".title-settings").scrollIntoViewIfNeeded();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.screenshot({path:path.join(out,"settings-"+width+"-"+(dark?"dark":"light")+".png"),fullPage:true,animations:"disabled"});
  await tasks(p);await p.locator('[data-delete-task="task-1"]').click();
  assert.equal(await p.locator(".modal").evaluate(el=>el.scrollWidth>el.clientWidth),false);
  await p.screenshot({path:path.join(out,"delete-"+width+"-"+(dark?"dark":"light")+".png"),animations:"disabled"});await finish(p);
 });
 fs.writeFileSync(path.join(root,"verification","settings-results.json"),JSON.stringify({scope:"Headless Edge; isolated Supabase fixture; no production writes",results,screenshots:out},null,2));
 console.log("All "+results.length+" checks passed. "+out);await browser.close();server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1);});

