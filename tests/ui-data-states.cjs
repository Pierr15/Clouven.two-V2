const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'ui-test-results', 'data-states-' + Date.now());
fs.mkdirSync(out, {recursive:true});
const server = http.createServer((req,res) => {
  let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file,'index.html');
  if (!file.startsWith(root+path.sep) || !fs.existsSync(file)) {res.writeHead(404); return res.end();}
  res.setHeader('Content-Type', {'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
function mock() {
  const user = {id:'member-0',user_metadata:{name:'Pengelola Kelas'}};
  const member = {id:user.id,name:'Pengelola Kelas',username:'pengelola',role:'developer',class_role:'Ketua',number:1};
  const tables = {
    members:[member], class_profile:[{data:{className:'XI TKJ 2',headline:'Semangat belajar',emphasis:'bersama.'}}],
    schedules:[{lessons:[{subject:'Jaringan komputer',time:'07.00–08.30'}],piket:['Pengelola Kelas']}],
    apel_queue:[{id:'queue-1',name:'Pengelola Kelas',position:0}],
    tasks:[{id:'task-1',title:'Praktik jaringan',subject:'ASJ',due:'2026-10-20',description:'Dokumentasikan jaringan.'}],
    task_summaries:[{id:'task-1',title:'Praktik jaringan',subject:'ASJ',due:'2026-10-20'}],
    task_progress:[{task_id:'task-1',done:true}],
    resources:[{id:'resource-1',name:'Materi jaringan.pdf',drive_file_id:'file-test-123',size:1024,kind:'materi'}],
  };
  window.__readCount = {}; window.__channels = []; window.__writes = [];
  window.supabase = {createClient:() => ({
    auth:{getSession:async()=>({data:{session:{user,access_token:'isolated-test'}}}),signOut:async()=>({})},
    from(table) {
      let single=false, filters={}, columns='*';
      const q = {
        select(value){columns=value;return q;},eq(key,value){filters[key]=value;return q;},order(){return q;},maybeSingle(){single=true;return q;},
        upsert(value){window.__writes.push({table,value});return Promise.resolve({data:null,error:null});},
        then(resolve,reject){return (async()=>{
          const account = table==='members' && single && columns==='*';
          const key = account ? 'account' : table;
          const count = window.__readCount[key] = (window.__readCount[key]||0)+1;
          const spec = {...(window.__scenario[key] || {})};
          if(table==='schedules' && window.__scenario.days?.[filters.day]) Object.assign(spec,window.__scenario.days[filters.day]);
          if (spec.delay) await new Promise(r=>setTimeout(r,spec.delay));
          if (spec.hang) await new Promise(()=>{});
          if(spec.error || (spec.failFirst && count<=spec.failFirst)) return {data:null,error:{message:'Simulated offline failure'}};
          let data = spec.empty ? [] : tables[table] || [];
          if(spec.subject) data=[{lessons:[{subject:spec.subject,time:'07.00–08.30'}],piket:[]}];
          return {data:single ? data[0]||null : data,error:null};
        })().then(resolve,reject);}
      };return q;
    },
    channel(){const c={table:null,callback:null,on(event,filter,callback){c.table=filter.table;c.callback=callback;return c;},subscribe(){return c;}};window.__channels.push(c);return c;},
    removeChannel(c){window.__channels=window.__channels.filter(x=>x!==c);},
  })};
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const results=[];
 async function pageFor(route,scenario={},options={}) {
  const page=await browser.newPage({viewport:options.viewport||{width:1440,height:900}});
  page.setDefaultTimeout(8000);
  await page.addInitScript(({scenario,options})=>{window.__scenario=scenario;if(options.dark)localStorage.setItem('clouven-theme','dark');}, {scenario,options});
  let sdkAttempts=0;
  await page.route('**/*',r=>{
   const url=r.request().url();if(new URL(url).pathname==="/api/config")return r.fulfill({contentType:"application/json",body:JSON.stringify({url:"https://classroom.invalid",publishableKey:"sb_publishable_local_test_configuration"})});
   if(url.includes('/@supabase/supabase-js')) {sdkAttempts++;return options.blockSDK && sdkAttempts<=2 ? r.abort() : r.fulfill({contentType:'text/javascript',body:`(${mock.toString()})();`});}
   if(url.startsWith(base))return r.continue();
   if(options.fonts && /fonts\.(googleapis|gstatic)\.com|cdn.jsdelivr.net\/npm\/@tabler/.test(url))return r.fetch({timeout:7000}).then(response=>r.fulfill({response})).catch(()=>r.abort());
   return r.abort();
  });
  page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
  await page.goto(base+route);return page;
 }
 async function check(name,fn){if(process.env.UI_TEST_FILTER && !new RegExp(process.env.UI_TEST_FILTER).test(name))return;await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}
 const cases=[
  {route:'/jadwal/',table:'schedules',host:'#scheduleContent',success:'Jaringan komputer',empty:'Belum ada pelajaran.'},
  {route:'/tugas/',table:'tasks',host:'#tasksGrid',success:'Praktik jaringan',empty:'Belum ada tugas.'},
  {route:'/anggota/',table:'members',host:'#memberGrid',success:'Pengelola Kelas',empty:'Belum ada anggota.'},
  {route:'/penyimpanan/',table:'resources',host:'#resourceList',success:'Materi jaringan.pdf',empty:'Belum ada file.'},
  {route:'/profile/',table:'task_progress',host:'#profileCard',success:'Tugas selesai',empty:null},
  {route:'/admin/',table:'class_profile',host:'#adminPanel',success:'Info dasar kelas',empty:null},
 ];
 for(const c of cases) {
  await check(`${c.route} loading -> failure -> retry -> content`,async()=>{
   const p=await pageFor(c.route,{[c.table]:{delay:900,error:true}});
   await p.locator(c.host+' .is-loading').waitFor();
   assert.equal(await p.locator(c.host+' .empty-state').count(),0);
   await p.locator(c.host+' .is-error').waitFor();
   await p.evaluate(table=>{window.__scenario[table]={delay:500};},c.table);
   await p.locator(c.host+' [data-load-retry]').click();
   await p.locator(c.host+' .is-loading').waitFor();
   await p.waitForFunction(({host,text})=>document.querySelector(host).textContent.includes(text)&&!document.querySelector(host+' .data-state'),{host:c.host,text:c.success});
   assert.equal(await p.locator(c.host).getAttribute('aria-busy'),'false');
   assert.deepEqual(p.errors,[]);await p.close();
  });
  if(c.empty) await check(`${c.route} empty only after successful response`,async()=>{
   const p=await pageFor(c.route,{[c.table]:{empty:true,delay:500}});
   await p.locator(c.host+' .is-loading').waitFor();
   await p.getByText(c.empty,{exact:true}).waitFor();
   assert.equal(await p.locator(c.host+' .is-error').count(),0);await p.close();
  });
 }
 await check('Home independently recovers failed summary without false empty data',async()=>{
  const p=await pageFor('/',{task_summaries:{error:true,delay:700},apel_queue:{delay:1400}});
  await p.locator('[data-load-retry="home-tasks"]').waitFor();
  assert.equal(await p.getByText('Tidak ada tugas',{exact:true}).count(),0);
  await p.evaluate(()=>window.__scenario.task_summaries={});
  await p.locator('[data-load-retry="home-tasks"]').click();
  await p.getByText('Praktik jaringan',{exact:true}).waitFor();
  assert.deepEqual(p.errors,[]);await p.close();
 });
 await check('Task progress failure never marks completed tasks as open',async()=>{
  const p=await pageFor('/tugas/',{task_progress:{error:true}});
  await p.locator('[data-load-retry="progress"]').waitFor();
  assert.equal(await p.locator('[data-toggle]').count(),0);
  await p.locator('[data-filter="done"]').click();
  assert.equal(await p.locator('#tasksGrid .empty-state').count(),0);
  await p.evaluate(()=>window.__scenario.task_progress={});
  await p.locator('[data-load-retry="progress"]').click();
  await p.getByRole('button',{name:'Buka lagi',exact:true}).waitFor();await p.close();
 });
 await check('Switching days ignores delayed response from unsubscribed day',async()=>{
  const p=await pageFor('/jadwal/',{days:{monday:{delay:1400,subject:'OLD MONDAY'},tuesday:{delay:100,subject:'NEW TUESDAY'}}});
  await p.locator('[data-day="monday"]').click();
  await p.locator('[data-day="tuesday"]').click();
  await p.getByText('NEW TUESDAY',{exact:true}).waitFor();
  await p.waitForTimeout(1600);
  assert.equal(await p.getByText('OLD MONDAY',{exact:true}).count(),0);
  assert.equal(await p.getByText('NEW TUESDAY',{exact:true}).count(),1);await p.close();
 });
 await check('Slow response times out and a later retry recovers',async()=>{
  const p=await pageFor('/anggota/',{members:{hang:true}});
  await p.locator('[data-load-retry="members"]').waitFor({timeout:18000});
  await p.evaluate(()=>window.__scenario.members={});
  await p.locator('[data-load-retry="members"]').click();
  await p.locator('.member-card').waitFor();await p.close();
 });
 await check('Account read failure has recoverable startup message',async()=>{
  const p=await pageFor('/tugas/',{account:{error:true}});
  await p.locator('[data-load-retry="account"]').waitFor();
  await p.evaluate(()=>window.__scenario.account={});
  await p.locator('[data-load-retry="account"]').click();
  await p.locator('.task-card').waitFor();assert.deepEqual(p.errors,[]);await p.close();
 });
 await check('SDK download failure can be retried without page reload',async()=>{
  const p=await pageFor('/',{},{blockSDK:true});
  await p.locator('[data-load-retry="account"]').waitFor();
  await p.locator('[data-load-retry="account"]').click();
  await p.getByText('Praktik jaringan',{exact:true}).waitFor();assert.deepEqual(p.errors,[]);await p.close();
 });
 await check('Background refresh failure offers retry and prevents double request',async()=>{
  const p=await pageFor('/penyimpanan/');await p.locator('.resource-row').waitFor();
  await p.evaluate(()=>{window.__scenario.resources={error:true};window.__channels.find(c=>c.table==='resources').callback();});
  await p.locator('[data-load-retry="resources"]').waitFor();
  await p.evaluate(()=>{window.__scenario.resources={delay:700};document.querySelector('[data-load-retry="resources"]').click();document.querySelector('[data-load-retry="resources"]')?.click();});
  await p.locator('#resourceList .is-loading').waitFor();await p.locator('.resource-row').waitFor();
  assert.equal(await p.evaluate(()=>window.__readCount.resources),3);await p.close();
 });
 await check('Admin changing days shows no editable stale schedule after failure',async()=>{
  const p=await pageFor('/admin/',{days:{tuesday:{error:true}}});await p.locator('#profileForm').waitFor();
  await p.locator('[data-admin-tab="schedule"]').click();await p.locator('#scheduleForm').waitFor();
  await p.locator('#adminDay').selectOption('tuesday');await p.locator('[data-load-retry="admin-schedule"]').waitFor();
  assert.equal(await p.locator('#scheduleForm').count(),0);
  await p.evaluate(()=>window.__scenario.days.tuesday={empty:true});await p.locator('[data-load-retry="admin-schedule"]').click();
  await p.locator('#scheduleForm').waitFor();assert.equal(await p.locator('#adminDay').inputValue(),'tuesday');
  assert.equal(await p.locator('#scheduleForm textarea[name="lessons"]').inputValue(),'');await p.close();
 });
 for(const dark of [false,true]) await check(`Mobile ${dark?'dark':'light'} failure states fit viewport with real fonts`,async()=>{
  const p=await pageFor('/',{class_profile:{error:true},task_summaries:{error:true},apel_queue:{error:true}},{dark,fonts:true,viewport:{width:390,height:844}});
  await p.locator('[data-load-retry="home-tasks"]').waitFor();await p.evaluate(()=>document.fonts.ready);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.screenshot({path:path.join(out,`mobile-${dark?'dark':'light'}-errors.png`),fullPage:true});
  assert.deepEqual(p.errors,[]);await p.close();
 });
 for (const c of [
  {tab:'apel',table:'apel_queue',form:'#apelAdd',empty:'Urutan masih kosong.'},
  {tab:'tasks',table:'tasks',form:'#taskForm',empty:'Belum ada tugas.'},
  {tab:'users',table:'members',form:'#userForm',empty:'Belum ada akun terdaftar.'},
 ]) await check(`Admin tab ${c.tab} recovers to an editable empty state`,async()=>{
  const p=await pageFor('/admin/',{[c.table]:{error:true}});await p.locator('#profileForm').waitFor();
  await p.locator(`[data-admin-tab="${c.tab}"]`).click();await p.locator('#adminPanel .is-error').waitFor();
  assert.equal(await p.locator(c.form).count(),0);
  await p.evaluate(table=>window.__scenario[table]={empty:true},c.table);
  await p.locator('#adminPanel [data-load-retry]').click();await p.locator(c.form).waitFor();
  await p.getByText(c.empty,{exact:true}).waitFor();assert.deepEqual(p.errors,[]);await p.close();
 });
 await check('A missing member profile cannot enter the account page',async()=>{
  const p=await pageFor('/profile/',{account:{empty:true}});
  await p.waitForURL(base+'/');
  await p.getByText('Login untuk melihat tugas kelas.',{exact:true}).waitFor();
  assert.equal(await p.locator('#sidebar a[href="/admin/"]').count(),0);await p.close();
 });
 await check('Login startup error stays inside the form card and can recover',async()=>{
  const p=await pageFor('/login/',{account:{error:true}},{viewport:{width:390,height:844}});
  await p.locator('.login-card [data-load-retry="account"]').waitFor();
  assert.equal(await p.locator('#loginForm').evaluate(el=>el.inert),true);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.evaluate(()=>window.__scenario.account={});await p.locator('[data-load-retry="account"]').click();
  await p.waitForURL(base+'/');
  assert.deepEqual(p.errors,[]);await p.close();
 });
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
 console.log(`All ${results.length} checks passed. Results: ${out}`);
 await browser.close();server.close();
})().catch(error=>{console.error(error);server.close();process.exit(1);});
