const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright");
const root=path.resolve(__dirname,".."),out=path.join(root,"ui-test-results","forms-"+Date.now());fs.mkdirSync(out,{recursive:true});
const fixture=fs.readFileSync(path.join(__dirname,"ui-access.cjs"),"utf8"),mock=fixture.slice(fixture.indexOf("function mock(){"),fixture.indexOf("\n(async()=>"));
const server=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(req.url.split("?")[0]));if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,"index.html");if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader("Content-Type",{".js":"text/javascript",".html":"text/html",".css":"text/css",".json":"application/json",".svg":"image/svg+xml"}[path.extname(file)]||"application/octet-stream");res.end(fs.readFileSync(file));});
(async()=>{
 await new Promise(r=>server.listen(0,"127.0.0.1",r));const base="http://127.0.0.1:"+server.address().port,browser=await chromium.launch({channel:"msedge",headless:true}),results=[];
 async function create(role,route,options={}){
  const p=await browser.newPage({viewport:{width:options.width||1440,height:900},isMobile:!!options.mobile,hasTouch:!!options.mobile});p.setDefaultTimeout(8000);p.errors=[];
  await p.addInitScript(options=>{window.__options=options;if(options.dark)localStorage.setItem("clouven-theme","dark");if(options.collapsed)localStorage.setItem("clouven-sidebar-collapsed","1");},{...options,role});
  await p.route("**/*",async r=>{
   const url=r.request().url();if(new URL(url).pathname==="/api/config")return r.fulfill({contentType:"application/json",body:JSON.stringify({url:"https://test.invalid",publishableKey:"sb_publishable_local_test_configuration"})});
   if(url.includes("/@supabase/supabase-js"))return r.fulfill({contentType:"text/javascript",body:mock+"mock();window.__data.members.forEach(m=>m.instagram=m.id+'.class');"});
   if(url.startsWith(base+"/api/")){const body=r.request().postDataJSON(),fail=await p.evaluate(body=>{if(window.__writeFail)return true;window.__api.push(body);Object.assign(window.__data.members.find(m=>m.id===(body.uid||window.__options.role)),body);return false;},body);return r.fulfill({status:fail?503:200,contentType:"application/json",body:JSON.stringify(fail?{error:"Gagal menyimpan"}:{ok:true})});}
   if(url.startsWith(base))return r.continue();
   if(options.fonts&&/fonts\.(googleapis|gstatic)\.com|cdn.jsdelivr.net\/npm\/@tabler/.test(url))return r.fetch({timeout:6000}).then(response=>r.fulfill({response})).catch(()=>r.abort());
   return r.abort();
  });
  p.on("pageerror",e=>p.errors.push(e.message));await p.goto(base+route);return p;
 }
 async function check(name,fn){if(process.env.UI_TEST_FILTER&&!new RegExp(process.env.UI_TEST_FILTER).test(name))return;await fn();results.push({name,status:"PASS"});console.log("PASS "+name);}
 async function finish(p){assert.deepEqual(p.errors,[]);await p.close();}
 async function tab(p,name){await p.locator("#profileForm").waitFor();await p.locator('[data-admin-tab="'+name+'"]').click();}
 async function choose(p,selector,value){const control=p.locator(selector);await control.locator("xpath=following-sibling::button[1]").click();await p.locator('.field-popover [role="option"]').filter({hasText:value}).first().click();}
 for(const role of ["developer","class_officer","teacher"])await check(role+": linked task subject and teacher",async()=>{
  const p=await create(role,role==="developer"?"/admin/":"/kelola/");await tab(p,"tasks");
  await choose(p,'#taskForm [name="subject"]',"Bahasa Indonesia");assert.equal(await p.locator('#taskForm [name="teacher"]').inputValue(),"Bu Liza");
  await choose(p,'#taskForm [name="subject"]',"TJKN");assert.equal(await p.locator('#taskForm [name="teacher"]').inputValue(),"");
  await choose(p,'#taskForm [name="teacher"]',"Pak Budi");
  await p.locator('#taskForm [name="title"]').fill("Tugas baru");await p.locator('#taskForm [name="due"]').fill("2026-10-01");await p.locator('#taskForm [type="submit"]').click();
  await p.waitForFunction(()=>window.__writes.some(w=>w.table==="tasks"));const saved=await p.evaluate(()=>window.__writes.find(w=>w.table==="tasks").payload);assert.equal(saved.teacher,"Pak Budi");assert.equal(saved.subject,"TJKN");
  await finish(p);
 });
 await check("Catalog JSON preview, validation and save",async()=>{
  const p=await create("developer","/admin/");await tab(p,"catalog");
  await p.locator("#catalogFile").setInputFiles({name:"invalid.json",mimeType:"application/json",buffer:Buffer.from("{invalid")});await p.locator("#catalogError").waitFor();assert.equal(await p.locator("#saveCatalog").isDisabled(),true);
  const catalog={schemaVersion:1,subjects:[{subject:"Bahasa Indonesia",teachers:["Bu Liza"]},{subject:"Matematika",teachers:["Pak Guru"]}]};
  await p.locator("#catalogFile").setInputFiles({name:"mapel.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(catalog))});await p.getByText("2 mapel siap disimpan. Daftar belum diterapkan.").waitFor();
  assert.equal(await p.evaluate(()=>window.__writes.length),0);
  await p.evaluate(()=>window.__writeFail=true);await p.locator("#saveCatalog").click();await p.locator("#catalogError").waitFor();assert.equal(await p.locator("#catalogPreview .admin-list-item").count(),2);
  await p.evaluate(()=>window.__writeFail=false);await p.locator("#saveCatalog").click();await p.getByText("Daftar mapel dan guru berhasil disimpan.",{exact:true}).first().waitFor();
  assert.deepEqual(await p.evaluate(()=>window.__data.subject_teachers),catalog.subjects);await finish(p);
 });
 for(const role of ["developer","class_officer","teacher"])await check(role+": structured schedule, copy, conflicts and save",async()=>{
  const p=await create(role,role==="developer"?"/admin/":"/kelola/");await tab(p,"schedule");
  await p.locator("#addLesson").click();await p.locator("[data-start]").fill("07:00");await p.locator("[data-end]").fill("08:30");
  await choose(p,"[data-subject]","Bahasa Indonesia");assert.equal(await p.locator("[data-teacher]").inputValue(),"Bu Liza");await p.locator("[data-room]").fill("Ruang 2");
  await p.locator('[data-piket][value="Alya Putri"]').check();await p.locator('#scheduleForm [type="submit"]').click();await p.getByText("Jadwal berhasil disimpan.",{exact:true}).waitFor();
  const saved=await p.evaluate(()=>window.__data.schedules.find(s=>s.day==="monday"));assert.equal(saved.lessons[0].time,"07.00–08.30");assert.equal(saved.lessons[0].teacher,"Bu Liza");
  await p.evaluate(()=>window.__data.schedules.push({day:"tuesday",lessons:[{time:"07.30–09.00",subject:"ASJ",teacher:"Bu Rani",room:"Lab"}],piket:[]}));
  await choose(p,"#copyDay","Selasa");await p.locator("#copySchedule").click();await p.locator(".lesson-row").nth(1).waitFor();await p.locator('#scheduleForm [type="submit"]').click();await p.locator("#scheduleError").filter({hasText:"bertabrakan"}).waitFor();
  await p.locator("[data-remove-lesson]").last().click();assert.equal(await p.locator(".lesson-row").count(),1);await finish(p);
 });
 for(const role of ["student","class_officer","teacher","developer"])await check(role+": own Instagram editing",async()=>{
  const p=await create(role,"/profile/");await p.locator("#editMyInstagram").click();await p.locator('.modal [name="instagram"]').fill("https://instagram.com/new.account/");
  await p.locator('.modal [type="submit"]').click();await p.locator(".modal").waitFor({state:"detached"});await p.locator('#profileCard a[href="https://www.instagram.com/new.account/"]').waitFor();
  assert.equal(await p.evaluate(()=>window.__api[0].instagram),"new.account");assert.equal(await p.locator("#editMyProfile").count(),["teacher","developer"].includes(role)?1:0);await finish(p);
 });
 await check("Member card Instagram link and owner edit",async()=>{
  const p=await create("student","/anggota/");await p.locator('[data-member="student"]').click();assert.equal(await p.locator('.modal a[href="https://www.instagram.com/student.class/"]').count(),1);
  await p.locator("[data-edit-instagram]").click();await p.locator('.modal [name="instagram"]').fill("");await p.locator('.modal [type="submit"]').click();await p.locator(".modal").waitFor({state:"detached"});
  await p.locator('[data-member="teacher"]').click();assert.equal(await p.locator("[data-edit-instagram]").count(),0);await finish(p);
 });
 await check("Custom dropdown keyboard and date picker",async()=>{
  const p=await create("developer","/admin/");await tab(p,"tasks");
  const trigger=p.locator('#taskForm [name="subject"] + .field-trigger');await trigger.focus();await p.keyboard.press("ArrowDown");await p.keyboard.press("End");await p.keyboard.press("Enter");
  assert.equal(await p.locator('#taskForm [name="subject"]').inputValue(),"TJKN");
  await p.locator('#taskForm [name="due"] + .field-trigger').click();await p.locator(".field-calendar").waitFor();await p.locator(".calendar-day").first().click();assert.match(await p.locator('#taskForm [name="due"]').inputValue(),/^\d{4}-\d{2}-01$/);
  await trigger.click();await p.keyboard.press("Escape");assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);assert.equal(await p.locator(".field-popover").count(),0);await finish(p);
 });
 for(const collapsed of [false,true])await check("Instagram brand hover "+(collapsed?"collapsed":"expanded"),async()=>{
  const p=await create("guest","/",{collapsed});const trigger=p.locator(".brand-symbol");await trigger.hover();await p.locator(".brand-preview.is-open").waitFor();
  await p.locator(".brand-preview a").hover();await p.waitForTimeout(250);assert.equal(await p.locator(".brand-preview").isVisible(),true);
  assert.equal(await p.locator(".brand-preview a").getAttribute("href"),"https://www.instagram.com/clouven.two/");
  assert.equal(await p.locator(".brand-preview a").getAttribute("target"),"_blank");
  await p.keyboard.press("Escape");await p.locator(".brand-preview").waitFor({state:"hidden"});await finish(p);
 });
 await check("Mobile brand tap preview and close",async()=>{
  const p=await create("guest","/",{width:390,mobile:true});await p.locator(".mobile-menu").click();await p.locator(".brand-symbol").tap();await p.locator(".brand-preview.is-open").waitFor();
  const box=await p.locator(".brand-preview").boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);
  await p.keyboard.press("Escape");await p.locator(".brand-preview").waitFor({state:"hidden"});await finish(p);
 });
 await check("Themed suggestions and modal dropdown remain interactive",async()=>{
  const p=await create("developer","/admin/");await tab(p,"apel");
  await p.locator('#apelAdd [name="name"]').fill("Alya");
  await p.locator('.field-popover [role="option"]').filter({hasText:"Alya Putri"}).click();
  assert.equal(await p.locator('#apelAdd [name="name"]').inputValue(),"Alya Putri");
  assert.equal(await p.locator('#apelAdd [name="name"]').getAttribute("list"),null);
  await p.goto(base+"/penyimpanan/");await p.locator("[data-edit-file]").click();
  await choose(p,'.modal select[name="kind"]',"Tugas");
  assert.equal(await p.locator('.modal select[name="kind"]').inputValue(),"tugas");
  await p.locator('.modal select[name="kind"] + .field-trigger').click();
  const box=await p.locator(".field-popover").boundingBox();assert.ok(box.y>=0&&box.y+box.height<=900);
  await p.keyboard.press("Escape");assert.equal(await p.locator(".modal").count(),1);
  await p.keyboard.press("Escape");await p.locator(".modal").waitFor({state:"detached"});await finish(p);
 });
 await check("Instagram error preserves input for retry",async()=>{
  const p=await create("student","/profile/");await p.locator("#editMyInstagram").click();await p.locator('.modal [name="instagram"]').fill("@retry.account");
  await p.evaluate(()=>window.__writeFail=true);await p.locator('.modal [type="submit"]').click();await p.locator(".modal [data-error]").waitFor();
  assert.equal(await p.locator('.modal [name="instagram"]').inputValue(),"@retry.account");
  await p.evaluate(()=>window.__writeFail=false);await p.locator('.modal [type="submit"]').click();await p.locator(".modal").waitFor({state:"detached"});
  await p.locator('#profileCard a[href="https://www.instagram.com/retry.account/"]').waitFor();await finish(p);
 });
 for(const dark of [false,true])for(const width of [320,390,1440])await check("Responsive forms "+width+" "+(dark?"dark":"light"),async()=>{
  const p=await create("developer","/admin/",{width,dark,fonts:true});await tab(p,"schedule");await p.locator("#addLesson").click();
  await p.locator("[data-start]").fill("07:00");await p.locator("[data-end]").fill("08:30");await choose(p,"[data-subject]","Bahasa Indonesia");await p.evaluate(()=>document.fonts.ready);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.screenshot({path:path.join(out,"schedule-"+width+"-"+(dark?"dark":"light")+".png"),fullPage:true,animations:"disabled"});
  await p.locator('[data-subject] + .field-trigger').click();const box=await p.locator(".field-popover").boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);await p.screenshot({path:path.join(out,"dropdown-"+width+"-"+(dark?"dark":"light")+".png"),animations:"disabled"});await p.keyboard.press("Escape");
  if(width===1440){await p.locator(".brand-symbol").hover();await p.locator(".brand-preview.is-open").waitFor();await p.screenshot({path:path.join(out,"brand-"+(dark?"dark":"light")+".png"),animations:"disabled"});}
  await finish(p);
 });
 fs.writeFileSync(path.join(root,"verification",process.env.UI_TEST_FILTER?"forms-supplementary-results.json":"forms-results.json"),JSON.stringify({scope:"Local Edge; simulated Supabase/accounts; no production writes",results,screenshots:out},null,2));console.log(results.length+" checks passed. "+out);await browser.close();server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1);});
