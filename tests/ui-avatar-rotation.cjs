const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'ui-test-results', new Date().toISOString().replace(/[:.]/g, '-')); fs.mkdirSync(out, {recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
function mock(){
 const long='Muhammad Abdurrahman Pratama';
 const members=Array.from({length:8},(_,i)=>({id:`member-${i}`,name:i?long+' '+(i+1):'Pengelola Kelas',username:'1234567890123456789012345678901234567890',number:i+1,role:i?'student':(window.__UI_ROLE||'developer'),class_role:'Anggota',quote:'Bersama belajar dan berkembang. '.repeat(12)}));
 const tasks=[{id:'task-1',title:'Konfigurasi jaringan dan dokumentasi topologi laboratorium',subject:'Administrasi Infrastruktur Jaringan',due:'2026-09-07',description:'Dokumentasi_jaringan_laboratorium_'.repeat(5),teacher:long}];
 const tables={members,tasks,task_summaries:tasks,task_progress:[],class_profile:[],schedules:[{day:'monday',lessons:[{time:'07.00–08.30',subject:'Administrasi Infrastruktur Jaringan',teacher:long,room:'Laboratorium TKJ'}],piket:members.map(m=>m.name)}],apel_queue:members.map((m,i)=>({id:m.id,name:m.name,position:i})),resources:[{id:'resource-1',name:'Dokumentasi_Konfigurasi_Jaringan_Laboratorium_'.repeat(4)+'.pdf',subject:'Administrasi Infrastruktur Jaringan',kind:'materi',size:100000,drive_file_id:'test-file'}]};
 const user={id:'member-0',user_metadata:{name:'Pengelola Kelas'}};
 window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:(window.__UI_ROLE==='guest'||location.pathname.includes('/login'))?null:{user,access_token:'local-test'}}}),signOut:async()=>({}),signInWithPassword:async()=>({error:{message:'Simulasi lokal: kredensial tidak dikirim.'}})},from(table){let single=false;const q={select(){return q},eq(){return q},order(){return q},maybeSingle(){single=true;return q},then(resolve,reject){return Promise.resolve({data:single?(tables[table]?.[0]||null):(tables[table]||[]),error:null}).then(resolve,reject)}};return q},channel(){return{on(){return this},subscribe(){return this}}},removeChannel(){}})};
}
async function setup(page){await page.route('**/*',route=>{const url=route.request().url();if(new URL(url).pathname==="/api/config")return route.fulfill({contentType:"application/json",body:JSON.stringify({url:"https://classroom.invalid",publishableKey:"sb_publishable_local_test_configuration"})});if(url.includes('/@supabase/supabase-js'))return route.fulfill({contentType:'text/javascript',body:`(${mock.toString()})();`});if(url.startsWith('http://127.0.0.1:'))return route.continue();if(/fonts\.(googleapis|gstatic)\.com|cdn.jsdelivr.net\/npm\/@tabler/.test(url))return route.abort();return route.abort();});}
async function overflow(page){return page.evaluate(()=>[...document.querySelectorAll('main *,.login-page *')].filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();if(!r.width||s.visibility==='hidden'||el.closest('.schedule-panel,.admin-nav'))return false;return r.right>innerWidth+2||r.left< -2||((el.matches('h1,h2,h3,strong,p,.result-cell,.task-card,.resource-row'))&&el.scrollWidth>el.clientWidth+3)}).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,70),width:el.clientWidth,scroll:el.scrollWidth,right:Math.round(el.getBoundingClientRect().right)})));}



const assert=require('assert/strict');
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true, ...(process.env.UI_BROWSER_PATH ? {executablePath:process.env.UI_BROWSER_PATH} : process.platform === 'win32' ? {channel:'msedge'} : {})});const results=[];
 for(const scenario of [{name:'expanded',width:1440,height:900},{name:'collapsed',width:1440,height:900,collapsed:true},{name:'scrolled-expanded',width:1440,height:700,scroll:true},{name:'scrolled-collapsed-hidpi',width:1440,height:700,scroll:true,collapsed:true,dpr:2},{name:'mobile',width:390,height:844,mobile:true}]){
  const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height},deviceScaleFactor:scenario.dpr||1});await setup(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const native=document.startViewTransition.bind(document);document.startViewTransition=update=>{const t=native(update);t.ready.then(()=>{window.__themeAnimations=document.getAnimations().filter(a=>a.animationName?.startsWith('theme-'));for(const a of window.__themeAnimations){a.pause();a.currentTime=45;}window.__themeReady=true;});return t;};});
  await page.goto(base,{waitUntil:'networkidle'});
  if(scenario.collapsed){await page.locator('.sidebar-collapse').click();await page.waitForTimeout(250);}
  if(scenario.scroll){await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(200);}
  if(scenario.mobile){await page.locator('.mobile-menu').click();await page.waitForTimeout(250);}
  const selector=scenario.collapsed?'.drawer-theme':'.profile-theme';
  for(const next of ['dark','light']){
   if(scenario.collapsed){await page.mouse.move(600,300);await page.locator('.profile-main').hover();await page.locator('.drawer-theme').waitFor({state:'visible'});await page.waitForTimeout(250);}
   const avatar=await page.locator('.profile-avatar').boundingBox();const iconBox=await page.locator(selector+' [data-theme-icon]').boundingBox();await page.evaluate(()=>window.__themeReady=false);await page.locator(selector).click();await page.waitForFunction(()=>window.__themeReady);
   const state=await page.evaluate(()=>{const r=document.documentElement;return{clip:getComputedStyle(r,'::view-transition-new(root)').clipPath,group:{width:getComputedStyle(r,'::view-transition-group(root)').width,height:getComputedStyle(r,'::view-transition-group(root)').height,transform:getComputedStyle(r,'::view-transition-group(root)').transform},animations:window.__themeAnimations.map(a=>({name:a.animationName,start:a.startTime,duration:a.effect.getTiming().duration,delay:a.effect.getTiming().delay,keyframes:a.effect.getKeyframes()})),iconLeft:getComputedStyle(r,'::view-transition-group(theme-icon)').left,iconTop:getComputedStyle(r,'::view-transition-group(theme-icon)').top,iconTransform:getComputedStyle(r,'::view-transition-old(theme-icon)').transform,theme:r.dataset.theme};});
   const numbers=state.clip.match(/circle\(([\d.]+)% at ([\d.]+)% ([\d.]+)%\)/);assert.ok(numbers,state.clip);numbers[2]=Number(numbers[2])*scenario.width/100;numbers[3]=Number(numbers[3])*scenario.height/100;
   assert.ok(Math.abs(Number(numbers[2])-(avatar.x+avatar.width/2))<1);assert.ok(Math.abs(Number(numbers[3])-(avatar.y+avatar.height/2))<1);assert.ok(Number(numbers[1])>0);
   assert.equal(parseFloat(state.group.width),scenario.width);assert.equal(parseFloat(state.group.height),scenario.height);
   assert.ok(Math.abs(parseFloat(state.iconLeft)-iconBox.x)<1,'Icon x must stay at button');assert.ok(Math.abs(parseFloat(state.iconTop)-iconBox.y)<1,'Icon y must stay at button');
   const outgoing=state.animations.find(a=>a.name==='theme-icon-out');assert.ok(outgoing,JSON.stringify(state));assert.equal(outgoing.keyframes.at(-1).transform,'rotate(180deg)');assert.notEqual(state.iconTransform,'matrix(1, 0, 0, 1, 0, 0)');
   const reveal=state.animations.find(a=>a.name==='theme-reveal');assert.equal(reveal.delay,0);assert.equal(reveal.duration,450);assert.equal(outgoing.delay,0);
   const avatarCue=state.animations.find(a=>a.name==='theme-avatar-pulse');assert.ok(avatarCue);assert.equal(avatarCue.duration,450);assert.equal(avatarCue.delay,0);
   if(!scenario.collapsed){const incoming=state.animations.find(a=>a.name==='theme-icon-in');assert.ok(incoming);assert.equal(incoming.keyframes[0].transform,'rotate(-180deg)');}
   assert.equal(state.theme,next);
   if(next==='dark')await page.screenshot({path:path.join(out,'avatar-rotation-'+scenario.name+'.png')});
   await page.evaluate(()=>window.__themeAnimations.forEach(a=>a.play()));await page.waitForFunction(()=>!document.documentElement.classList.contains('theme-transitioning'));
   assert.equal(await page.locator('[data-theme-rotating]').count(),0);assert.equal(await page.locator('[data-theme-origin-avatar]').count(),0);if(scenario.collapsed)assert.equal(await page.locator('.account-drawer').isVisible(),false);
   results.push({scenario:scenario.name,to:next,origin:[Number(numbers[2]),Number(numbers[3])],rotation:'180 degrees',status:'PASS'});console.log('PASS '+scenario.name+' to '+next+': rendered circle matches avatar and icon rotates 180 degrees');
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 const page=await browser.newPage();await setup(page);await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base,{waitUntil:'networkidle'});await page.locator('.profile-theme').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('theme-transitioning')),false);console.log('PASS reduced motion');await page.close();
 fs.writeFileSync(path.join(out,'avatar-rotation-results.json'),JSON.stringify(results,null,2));await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
