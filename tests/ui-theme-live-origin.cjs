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



// Fit the visible arc in compositor frames; pausing animations hides the zoom bug.
function circleThrough(a, b, c) {
 const bx=b.x-a.x, by=b.y-a.y, cx=c.x-a.x, cy=c.y-a.y;
 const det=2*(bx*cy-by*cx);
 if(Math.abs(det)<20)return null;
 const bs=bx*bx+by*by, cs=cx*cx+cy*cy;
 const x=a.x+(bs*cy-by*cs)/det, y=a.y+(bx*cs-bs*cx)/det;
 return {x,y,radius:Math.hypot(x-a.x,y-a.y)};
}
function refineCircle(points) {
 const mx=points.reduce((s,p)=>s+p.x,0)/points.length;
 const my=points.reduce((s,p)=>s+p.y,0)/points.length;
 let xx=0,xy=0,yy=0,xz=0,yz=0;
 for(const p of points){const x=p.x-mx,y=p.y-my,z=x*x+y*y;xx+=x*x;xy+=x*y;yy+=y*y;xz+=x*z;yz+=y*z;}
 const det=xx*yy-xy*xy;
 if(Math.abs(det)<1)return null;
 const x=mx+(yy*xz-xy*yz)/det/2,y=my+(xx*yz-xy*xz)/det/2;
 return {x,y,radius:points.reduce((s,p)=>s+Math.hypot(p.x-x,p.y-y),0)/points.length};
}
function origin(buf,baseline,start,end,target) {
 const im=PNG.sync.read(buf),old=PNG.sync.read(baseline),points=[];
 const match=i=>(target[0]>200
  ? Math.min(im.data[i],im.data[i+1],im.data[i+2])>180
  : Math.max(im.data[i],im.data[i+1],im.data[i+2])<95)
  && Math.abs(old.data[i]-im.data[i])>80;
 // Sample the whole upper edge. A narrow sidebar arc gives unstable circle fits.
 for(let x=2;x<im.width-2;x+=2){
  for(let y=2;y<im.height-3;y++){
   const i=(y*im.width+x)*4;
   if(match(i)&&match(i+im.width*4)&&match(i+im.width*8)){
    if(y>3)points.push({x,y});
    break;
   }
  }
 }
 if(points.length<18)return null;
 // Deterministic robust fitting ignores text, photographs, the avatar and drawer.
 let seed=1879,best=[];
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%points.length;};
 for(let trial=0;trial<700;trial++){
  const a=points[random()],b=points[random()],c=points[random()];
  const circle=circleThrough(a,b,c);
  if(!circle||circle.radius<20||circle.radius>Math.hypot(im.width,im.height)*1.2)continue;
  const inliers=points.filter(p=>Math.abs(Math.hypot(p.x-circle.x,p.y-circle.y)-circle.radius)<1.5);
  if(inliers.length>best.length)best=inliers;
 }
 if(best.length<18)return null;
 const circle=refineCircle(best);
 if(!circle)return null;
 const span=Math.max(...best.map(p=>p.x))-Math.min(...best.map(p=>p.x));
 if(span<circle.radius*.3)return null;
 return {...circle,count:best.length,residual:Math.max(...best.map(p=>Math.abs(Math.hypot(p.x-circle.x,p.y-circle.y)-circle.radius)))};
}
const assert=require('node:assert/strict');
const {PNG}=require(process.env.PNG_MODULE || 'pngjs');
(async()=>{
 // This extension changes zoom only inside this disposable test browser profile.
 const extension=path.join(out,'zoom-test-extension');fs.mkdirSync(extension,{recursive:true});fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Local theme zoom test',version:'1.0',permissions:['tabs'],background:{service_worker:'background.js'}}));fs.writeFileSync(path.join(extension,'background.js'),'chrome.runtime.onInstalled.addListener(()=>{});');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const context=await chromium.launchPersistentContext(path.join(out,'browser-profile'),{channel:'msedge',headless:true,viewport:{width:2560,height:1440},args:['--disable-extensions-except='+extension,'--load-extension='+extension]});const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const results=[];
 const scenarios=[...([1,1.25,1.5,2].flatMap(zoom=>[{name:'zoom-'+Math.round(zoom*100)+'-expanded',zoom,role:zoom===1.5?'student':'developer'},{name:'zoom-'+Math.round(zoom*100)+'-collapsed',zoom,collapsed:true,role:zoom===1.25?'guest':'developer'}])),{name:'scrolled-200-expanded',zoom:2,scroll:true},{name:'scrolled-200-collapsed',zoom:2,scroll:true,collapsed:true},{name:'mobile',zoom:1,mobile:true}];
 try{for(const scenario of scenarios){
  const page=await context.newPage();await setup(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(scenario=>{localStorage.setItem('clouven-theme','light');localStorage.setItem('clouven-sidebar-collapsed',scenario.collapsed?'1':'0');window.__UI_ROLE=scenario.role||'developer';},scenario);
  await page.addInitScript(()=>{
   const start=document.startViewTransition.bind(document);
   document.startViewTransition=update=>{
    window.__themeRecording={started:true,finished:false,start:performance.now()};
    const transition=start(update);
    transition.ready.then(()=>window.__themeRecording.ready=performance.now()).catch(e=>window.__themeRecording.error=e.message);
    transition.finished.finally(()=>{window.__themeRecording.finished=true;window.__themeRecording.end=performance.now();});
    return transition;
   };
  });
  if(scenario.mobile)await page.setViewportSize({width:390,height:844});
  await page.goto(base,{waitUntil:'networkidle'});const tabId=await worker.evaluate(async base=>(await chrome.tabs.query({})).filter(t=>t.url===base+'/').at(-1).id,base);await worker.evaluate(({tabId,zoom})=>chrome.tabs.setZoom(tabId,zoom),{tabId,zoom:scenario.zoom});await page.waitForTimeout(300);
  if(scenario.scroll){await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(250);}
  if(scenario.mobile){await page.locator('.mobile-menu').click();await page.waitForTimeout(250);}
  // Slow only this isolated capture run to resolve the edge on slower test hosts.
  // Production timing is checked separately by ui-avatar-rotation.cjs.
  await page.addStyleTag({content:'.theme-transitioning::view-transition-new(root) { animation-duration: 1800ms; }'});
  const selector=scenario.collapsed?'.drawer-theme':'.profile-theme';
  for(const next of ['dark','light']){
   if(scenario.collapsed){await page.mouse.move(300,200);await page.locator('.profile-main').hover();await page.waitForTimeout(250);}
   const avatar=await page.locator('.profile-avatar').boundingBox();const sidebar=await page.locator('.sidebar').boundingBox();const drawer=scenario.collapsed?await page.locator('.account-drawer').boundingBox():null;const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));
   await page.bringToFront();const frames=[];const cdp=await context.newCDPSession(page);
   cdp.on('Page.screencastFrame',event=>{frames.push(Buffer.from(event.data,'base64'));cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});});
   await cdp.send('Page.enable');await cdp.send('Page.startScreencast',{format:'png',everyNthFrame:1,maxWidth:1280,maxHeight:900});
   for(let wait=0;!frames.length&&wait<80;wait++)await page.waitForTimeout(50);
   const baseline=frames.at(-1);assert.ok(baseline,'Initial frame missing');
   await page.evaluate(()=>window.__themeRecording=null);
   await page.locator(selector).click();
   await page.waitForFunction(()=>window.__themeRecording?.finished,null,{polling:20});
   await page.waitForTimeout(150);await cdp.send('Page.stopScreencast');await cdp.detach();
   const image=PNG.sync.read(baseline);const scale=image.width/viewport.width;const expected={x:(avatar.x+avatar.width/2)*scale,y:(avatar.y+avatar.height/2)*scale};const sampleStart=scenario.collapsed?Math.floor((drawer.x+drawer.width+12)*scale):2;const sampleEnd=scenario.collapsed?Math.min(image.width-4,sampleStart+Math.max(180,Math.floor(image.width*.18))):Math.floor(sidebar.width*.94*scale);
   let evidence;
   for(let i=0;i<frames.length;i++){
    const circle=origin(frames[i],baseline,sampleStart,sampleEnd,next==='dark'?[18,28,23]:[251,250,246]);
    // Measure the expanding edge after it clears the avatar snapshot and drawer.
    const minimumRadius=25;
    if(circle&&circle.residual<2.5&&circle.radius>minimumRadius){evidence={...circle,index:i};break;}
   }
   if(!evidence){for(let i=0;i<frames.length;i++)fs.writeFileSync(path.join(out,scenario.name+'-'+next+'-debug-'+i+'.png'),frames[i]);console.log(await page.evaluate(()=>window.__themeRecording));throw Error(scenario.name+' '+next+': No measurable live circle from '+frames.length+' frames');}
   fs.writeFileSync(path.join(out,scenario.name+'-'+next+'.png'),frames[evidence.index]);const error=Math.hypot(evidence.x-expected.x,evidence.y-expected.y)/scale;
   // Allow rasterization and drawer-shadow error; the previous zoom bug displaced it by hundreds of pixels.
   assert.ok(error<6,scenario.name+' '+next+': rendered origin differs by '+error+' CSS pixels; '+JSON.stringify({evidence,expected,viewport}));
   assert.equal(await page.locator('html').getAttribute('data-theme'),next);if(scenario.collapsed)assert.equal(await page.locator('.account-drawer').isVisible(),false);
   const entry={scenario:scenario.name,to:next,zoom:scenario.zoom,avatarCenter:expected,renderedCenter:{x:evidence.x,y:evidence.y},errorCssPixels:Number(error.toFixed(2)),frames:frames.length,status:'PASS'};results.push(entry);fs.writeFileSync(path.join(out,'live-theme-origin-results.json'),JSON.stringify(results,null,2));fs.writeFileSync(path.join(out,scenario.name+'-'+next+'.png'),frames[evidence.index]);console.log('PASS '+scenario.name+' '+next+' — measured live origin error '+error.toFixed(2)+' CSS px');
  }
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await context.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
