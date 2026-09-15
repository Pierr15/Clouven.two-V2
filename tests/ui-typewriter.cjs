const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright");
const root=path.resolve(__dirname,".."),out=path.join(root,"verification");
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
 for(const width of [320,390,1440]){
  const p=await browser.newPage({viewport:{width,height:900}}),errors=[];p.on("pageerror",e=>errors.push(e.message));
  await p.clock.install({time:new Date("2026-09-06T00:00:00Z")});await p.clock.pauseAt(new Date("2026-09-06T00:00:01Z"));
  await p.route("**/*",r=>{
   const url=r.request().url();if(new URL(url).pathname==="/api/config")return r.fulfill({contentType:"application/json",body:JSON.stringify({url:"https://classroom.invalid",publishableKey:"sb_publishable_local_test_configuration"})});
   if(url.includes("/@supabase/supabase-js"))return r.fulfill({contentType:"text/javascript",body:'window.__options={role:"guest"};'+mock+"mock();"});
   if(url.startsWith(base))return r.continue();
   if(/fonts\.(googleapis|gstatic)\.com|cdn.jsdelivr.net\/npm\/@tabler/.test(url))return r.fetch({timeout:6000}).then(response=>r.fulfill({response})).catch(()=>r.abort());
   return r.abort();
  });
  await p.goto(base+"/");await p.locator('#heroTitle[aria-label="Semangat, berjuang, sukses."]').waitFor();await p.evaluate(()=>document.fonts.ready);
  const read=()=>p.locator("#heroTitle").evaluate(el=>({phase:el.dataset.typewriterPhase,visible:[...el.querySelectorAll(".typewriter-char")].filter(x=>x.style.visibility==="visible").length,total:el.querySelectorAll(".typewriter-char").length,height:el.getBoundingClientRect().height,descriptionY:document.querySelector("#heroDescription").getBoundingClientRect().top}));
  const first=await read();assert.equal(first.visible,0);
  await p.clock.runFor(75*5);assert.equal((await read()).visible,5);
  // Unrelated realtime events and identical profile data must not restart the loop.
  await p.evaluate(()=>window.__channels.forEach(c=>c.callback()));assert.equal((await read()).visible,5);
  await p.clock.runFor(75*(first.total-5));
  assert.equal((await read()).phase,"idle");assert.equal((await read()).visible,first.total);
  await p.clock.runFor(4999);assert.equal((await read()).visible,first.total);
  await p.clock.runFor(1);assert.equal((await read()).phase,"deleting");assert.equal((await read()).visible,first.total-1);
  await p.clock.runFor(40*(first.total-1));assert.equal((await read()).visible,0);assert.equal((await read()).phase,"empty");
  assert.equal((await read()).height,first.height);assert.equal((await read()).descriptionY,first.descriptionY);
  await p.clock.runFor(350+75*4);assert.equal((await read()).visible,5);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.clock.runFor(75*(first.total-5));await p.screenshot({path:path.join(out,"rev10-heading-"+width+".png"),animations:"disabled"});
  await p.emulateMedia({reducedMotion:"reduce"});await p.waitForFunction(()=>document.querySelector("#heroTitle").dataset.typewriterPhase==="static");
  assert.equal((await read()).visible,first.total);await p.clock.runFor(10000);assert.equal((await read()).visible,first.total);
  // The whole headline remains the accessible heading, without letter announcements.
  assert.equal(await p.getByRole("heading",{name:"Semangat, berjuang, sukses.",exact:true}).count(),1);
  await p.emulateMedia({reducedMotion:"no-preference"});await p.waitForFunction(()=>document.querySelector("#heroTitle").dataset.typewriterPhase==="typing");
  await p.evaluate(()=>{window.__data.class_profile[0].data.headline="Belajar 👩‍💻";window.__data.class_profile[0].data.emphasis="<bersama>";window.__channels.filter(c=>c.table==="class_profile").forEach(c=>c.callback());});
  await p.locator('#heroTitle[aria-label="Belajar 👩‍💻 <bersama>"]').waitFor();
  assert.equal(await p.locator("#heroTitle bersama").count(),0);
  assert.equal(await p.locator(".typewriter-char").evaluateAll(items=>items.filter(x=>x.textContent==="👩‍💻").length),1);
  await p.clock.runFor(75*3);
  await p.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));});
  const paused=await read();await p.clock.runFor(10000);assert.equal((await read()).visible,paused.visible);
  await p.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>false});document.dispatchEvent(new Event("visibilitychange"));});
  await p.clock.runFor(75);assert.equal((await read()).visible,paused.visible+1);
  assert.deepEqual(errors,[]);results.push({width,status:"PASS",checks:["typing","5000ms hold","deletion","repeat","stable layout","no horizontal overflow","realtime deduplication","updated heading","safe markup","grapheme","reduced motion","accessible heading","pause hidden tab"]});await p.close();console.log("PASS "+width+"px");
 }
 fs.writeFileSync(path.join(out,"typewriter-results.json"),JSON.stringify({scope:"Edge headless, local data, controlled browser clock",results},null,2));
 await browser.close();server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1);});
