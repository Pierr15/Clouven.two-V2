const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification','display-name-ui');fs.mkdirSync(out,{recursive:true});
const fixture=fs.readFileSync(path.join(__dirname,'ui-access.cjs'),'utf8');
const mock=fixture.slice(fixture.indexOf('function mock(){'),fixture.indexOf('\n(async()=>'));
function customMock(){
  const defaults={name_style:'default',name_color_1:'#7DD3FC',name_color_2:'#A78BFA',name_color_3:null};
  window.__data.members.forEach(m=>Object.assign(m,defaults,window.__options.customization||{}));
  window.__data.apel_queue[0].member_id='developer';window.__data.apel_queue[0].name='Pierr';
  window.__data.schedules[0].piket=['Pierr'];
  if(window.__options.legacyQueue)delete window.__data.apel_queue[0].member_id;
  window.__emitMember=patch=>{
    Object.assign(window.__data.members.find(m=>m.id===patch.id),patch);
    window.__channels.filter(c=>c.table==='members').forEach(c=>c.callback({eventType:'UPDATE',new:window.__data.members.find(m=>m.id===patch.id)}));
  };
  if(window.__options.many){for(let i=0;i<96;i++)window.__data.members.push({id:'extra-'+i,name:i%3?'Nama Sangat Panjang '.repeat(7):'A',number:String(i+5),role:i%4?'student':'developer',class_role:'Anggota',...defaults,name_style:['flow','prism','shimmer'][i%3]});}
  if(window.__options.numericSort){
    Object.assign(window.__data.members.find(m=>m.id==='developer'),{number:'1'});
    Object.assign(window.__data.members.find(m=>m.id==='class_officer'),{number:'2'});
    Object.assign(window.__data.members.find(m=>m.id==='student'),{number:'10'});
    window.__data.members.push(
      {id:'eleven',name:'Nomor Sebelas',number:'11',role:'student',class_role:'Anggota',...defaults},
      {id:'twenty',name:'Nomor Dua Puluh',number:'20A',role:'student',class_role:'Anggota',...defaults},
      {id:'invalid',name:'Nomor Tidak Valid',number:null,role:'student',class_role:'Anggota',...defaults});
    window.__originalMemberOrder=window.__data.members.map(m=>m.id);
  }
  const create=window.supabase.createClient;
  window.supabase.createClient=(...args)=>{
    const client=create(...args);
    client.rpc=async(name,{settings})=>{
      window.__rpcCalls=(window.__rpcCalls||0)+1;
      if(window.__rpcFail)return {error:{code:window.__rpcFail,message:'Simpan gagal'}};
      const actor=window.__data.members.find(m=>m.id===window.__options.role);
      if(!actor||actor.role!=='developer')return {error:{code:'42501',message:'Hanya Developer'}};
      Object.assign(actor,settings);window.__saved=JSON.parse(JSON.stringify(settings));window.__emitMember(actor);
      return {data:actor,error:null};
    };
    return client;
  };
}
const server=http.createServer((req,res)=>{
 let file=path.join(root,decodeURIComponent(req.url.split('?')[0]));
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
 async function pageFor(role,route,options={}){
   const p=await browser.newPage({viewport:{width:options.width||1440,height:1000},reducedMotion:options.reduced?'reduce':'no-preference'});
   p.setDefaultTimeout(10000);p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
   await p.addInitScript(options=>{window.__options=options;if(options.dark)localStorage.setItem('clouven-theme','dark');},{role,...options});
   await p.route('**/*',r=>{
     const url=r.request().url();
     if(new URL(url).pathname==='/api/config')return r.fulfill({contentType:'application/json',body:JSON.stringify({url:'https://test.invalid',publishableKey:'sb_publishable_local_test_configuration'})});
     if(url.includes('/@supabase/supabase-js'))return r.fulfill({contentType:'text/javascript',body:mock+'mock();('+customMock.toString()+')();'});
     if(url.startsWith(base))return r.continue();
     return r.abort();
   });
   await p.goto(base+route,{waitUntil:'networkidle'});return p;
 }
 async function check(name,fn){if(process.env.UI_TEST_FILTER&&!new RegExp(process.env.UI_TEST_FILTER).test(name))return;await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}
 async function close(p){assert.deepEqual(p.errors,[]);await p.close();}
 async function choose(p,value){await p.locator('#displayNameStyle').selectOption(value,{force:true});}
 try{
  for(const style of ['default','solid','gradient','flow','neon','prism','shimmer'])await check('Developer '+style+': preview, explicit Save, profile and sidebar match',async()=>{
   const p=await pageFor('developer','/profile/');await p.locator('#nameSettings').waitFor();
   await choose(p,style);
   await p.locator('#nameColor1').evaluate(el=>{el.value='#FF0000';el.dispatchEvent(new Event('input',{bubbles:true}));});
   assert.equal(await p.locator('[data-name-preview] .styled-name').getAttribute('data-name-style'),style);
   assert.equal(await p.locator('#profileCard .styled-name').getAttribute('data-name-style'),'default');
   assert.equal(await p.evaluate(()=>window.__rpcCalls||0),0);
   await p.locator('#nameSettings [type="submit"]').click();
   await p.getByText('Tampilan nama berhasil disimpan.',{exact:true}).waitFor();
   assert.equal(await p.locator('#profileCard .styled-name').getAttribute('data-name-style'),style);
   assert.equal(await p.locator('.profile-copy .styled-name').getAttribute('data-name-style'),style);
   const sizes=await p.locator('.profile-copy .styled-name').evaluate(el=>({name:getComputedStyle(el).fontSize,parent:getComputedStyle(el.parentElement).fontSize,transform:getComputedStyle(el).textTransform}));
   assert.equal(sizes.name,sizes.parent);assert.equal(sizes.transform,'none');
   if(style==='flow')await p.screenshot({path:path.join(out,'profile-desktop.png'),fullPage:true});
   await close(p);
  });
  for(const dark of [false,true])await check('Animated effects visibly change without clipping in '+(dark?'dark':'light')+' mode',async()=>{
   const p=await pageFor('developer','/profile/',{dark});await p.locator('#nameSettings').waitFor();
   const expected={flow:'4.8s',neon:'2.6s',prism:'5.8s',shimmer:'4.6s'};
   for(const [style,duration] of Object.entries(expected)){
    await choose(p,style);
    const visual=await p.locator('[data-name-preview] .styled-name').evaluate(e=>({
      animation:getComputedStyle(e).animationName,duration:getComputedStyle(e).animationDuration,
      shadow:getComputedStyle(e).textShadow,size:parseFloat(getComputedStyle(e).fontSize),
      background:getComputedStyle(e).backgroundImage,
    }));
    assert.notEqual(visual.animation,'none');assert.equal(visual.duration,duration);assert.ok(visual.size>=24);
    if(style==='neon')assert.notEqual(visual.shadow,'none');else assert.notEqual(visual.background,'none');
    const preview=p.locator('[data-name-preview]');
    await preview.scrollIntoViewIfNeeded();
    const frames=[];
    for(const fraction of [.12,.5,.86]){
     await preview.locator('.styled-name').evaluate((el,f)=>{
      const animation=el.getAnimations()[0];animation.pause();animation.currentTime=Number(animation.effect.getTiming().duration)*f;
     },fraction);
     const geometry=await preview.boundingBox();
     frames.push({geometry,pixels:await preview.screenshot({animations:'allow',path:path.join(out,`effect-${style}-${dark?'dark':'light'}-${fraction}.png`)})});
     const position=await preview.locator('.styled-name').evaluate(el=>parseFloat(getComputedStyle(el).backgroundPositionX));
     assert.ok(position>=0&&position<=100,'Gradient remains over the complete name');
    }
    assert.deepEqual(frames[0].geometry,frames[2].geometry);
    assert.equal(frames[0].pixels.equals(frames[1].pixels),false,'Effect visibly changes between animation frames');
   }
   await close(p);
  });
  for(const role of ['student','class_officer','teacher'])await check(role+' stored customization renders Default and no settings',async()=>{
   const p=await pageFor(role,'/profile/',{customization:{name_style:'prism'}});
   await p.locator('#profileCard h2').waitFor();
   assert.equal(await p.locator('#nameSettings').isVisible(),false);
   assert.equal(await p.locator('#profileCard .styled-name').getAttribute('data-name-style'),'default');
   await close(p);
  });
  await check('Guest auth redirect and default identity',async()=>{
   const p=await pageFor('guest','/profile/');await p.waitForURL(/\/login\//);assert.equal(await p.locator('#nameSettings').count(),0);p.errors=p.errors.filter(e=>e!=='redirect');await close(p);
  });
  await check('Role demotion updates open settings, profile, sidebar and open modal immediately',async()=>{
   const p=await pageFor('developer','/profile/',{customization:{name_style:'flow'}});
   await p.locator('#nameSettings').waitFor();await choose(p,'prism');
   await p.evaluate(()=>window.__emitMember({id:'developer',role:'student'}));
   assert.equal(await p.locator('#nameSettings').isVisible(),false);
   for(const node of await p.locator('[data-name-user="developer"]').all())assert.equal(await node.getAttribute('data-name-style'),'default');
   await close(p);
   const members=await pageFor('developer','/anggota/',{customization:{name_style:'flow'}});
   await members.locator('[data-member="developer"]').click();await members.locator('.modal h2 .styled-name').waitFor();
   await members.evaluate(()=>window.__emitMember({id:'developer',role:'student'}));
   for(const node of await members.locator('[data-name-user="developer"]').all())assert.equal(await node.getAttribute('data-name-style'),'default');
   await close(members);
  });
  for(const custom of [{name_style:null},{name_style:'arbitrary'},{name_style:'flow',name_color_1:'url(x)'}])await check('Missing/invalid stored customization keeps name visible',async()=>{
   const p=await pageFor('developer','/anggota/',{customization:custom});const name=p.locator('[data-member="developer"] .styled-name');await name.waitFor();assert.equal(await name.getAttribute('data-name-style'),'default');assert.equal(await name.innerText(),'Pierr');await close(p);
  });
  await check('Unsafe name remains text, never creates HTML nodes',async()=>{
   const p=await pageFor('developer','/anggota/');await p.locator('[data-member="developer"]').waitFor();
   await p.evaluate(()=>window.__emitMember({id:'developer',name:'<img src=x onerror="window.__xss=1">'}));
   const name=p.locator('[data-member="developer"] .styled-name');assert.match(await name.innerText(),/^<img/);assert.equal(await name.locator('img').count(),0);assert.equal(await p.evaluate(()=>window.__xss),undefined);await close(p);
  });
  await check('Member attendance numbers sort numerically without mutating fetched data',async()=>{
   const p=await pageFor('developer','/anggota/',{numericSort:true});await p.locator('[data-member="invalid"]').waitFor();
   assert.deepEqual(await p.locator('#memberGrid .member-card').evaluateAll(cards=>cards.map(card=>card.dataset.member)),
     ['developer','class_officer','student','eleven','twenty','invalid']);
   assert.deepEqual(await p.evaluate(()=>window.__data.members.map(m=>m.id)),await p.evaluate(()=>window.__originalMemberOrder));
   assert.equal(await p.locator('#homeroomCard [data-member="teacher"]').count(),1);
   await close(p);
  });
  for(const width of [1440,820,390])for(const dark of [false,true])await check(`100 members at ${width}px, ${dark?'dark':'light'}: layout and card alignment`,async()=>{
   const p=await pageFor('developer','/anggota/',{width,dark,many:true,customization:{name_style:'flow'}});
   await p.waitForFunction(()=>document.querySelectorAll('.member-card').length===100);
   assert.equal(await p.locator('#homeroomCard .member-card').count(),1);
   const geometry=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,
    gaps:[...document.querySelectorAll('#memberGrid .member-card')].map(c=>Math.abs(c.querySelector('.member-photo').getBoundingClientRect().top-c.getBoundingClientRect().top-parseFloat(getComputedStyle(c).borderTopWidth)))}));
   assert.equal(geometry.overflow,false);assert.ok(geometry.gaps.every(g=>g<1));
   const typography=await p.locator('[data-member="developer"] h3').evaluate(title=>{
    const name=title.querySelector('.styled-name'),style=getComputedStyle(name);
    return {weight:style.fontWeight,parentWeight:getComputedStyle(title).fontWeight,numberWeight:getComputedStyle(title.querySelector('.member-number')).fontWeight,
      shadow:style.textShadow,filter:style.filter,stroke:style.webkitTextStrokeWidth,whiteSpace:style.whiteSpace,
      display:style.display,children:name.children.length,gradient:style.backgroundImage};
   });
   assert.equal(typography.weight,'600');assert.equal(typography.parentWeight,typography.weight);assert.equal(typography.numberWeight,'700');
   assert.equal(typography.shadow,'none');assert.equal(typography.filter,'none');assert.equal(typography.stroke,'0px');
   assert.equal(typography.whiteSpace,'normal');assert.equal(typography.display,'block');assert.equal(typography.children,0);
   assert.equal((typography.gradient.match(/linear-gradient/g)||[]).length,1);
   assert.match(typography.gradient,dark?/165, 180, 252/:/67, 56, 202/);
   const wrapped=await p.locator('[data-member="extra-4"] .styled-name').evaluate(name=>{
    const r=name.getBoundingClientRect(),card=name.closest('.member-card').getBoundingClientRect();
    return {height:r.height,lineHeight:parseFloat(getComputedStyle(name).lineHeight),inside:r.right<=card.right,boxes:name.getClientRects().length};
   });
   assert.ok(wrapped.height>wrapped.lineHeight);assert.equal(wrapped.inside,true);assert.equal(wrapped.boxes,1);
   // Names do not change geometry while CSS background animations progress.
   const names=p.locator('#memberGrid .styled-name'),before=await names.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return [r.width,r.height,r.x,r.y]}));
   await p.waitForTimeout(250);assert.deepEqual(await names.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return [r.width,r.height,r.x,r.y]})),before);
   if(width===390||width===1440)await p.screenshot({path:path.join(out,`members-${width}-${dark?'dark':'light'}.png`)});
   await close(p);
  });
  for(const style of ['flow','prism','neon','shimmer'])await check('Reduced motion '+style+' stays readable and static',async()=>{
   const p=await pageFor('developer','/anggota/',{reduced:true,customization:{name_style:style}});
   const name=p.locator('[data-member="developer"] .styled-name');await name.waitFor();assert.equal(await name.innerText(),'Pierr');
   assert.equal(await name.evaluate(e=>getComputedStyle(e).animationName),'none');await close(p);
  });
  await check('Live preview mobile, optional third color and failed Save preserves draft',async()=>{
   const p=await pageFor('developer','/profile/',{width:390});await p.locator('#nameSettings').waitFor();await choose(p,'prism');await p.locator('#useNameColor3').check();
   await p.locator('#nameColor3').evaluate(el=>{el.value='#abcdef';el.dispatchEvent(new Event('input',{bubbles:true}));});
   await p.evaluate(()=>window.__rpcFail='PGRST202');await p.locator('#nameSettings [type="submit"]').click();await p.getByText(/Minta pengelola menerapkan migrasi/).waitFor();
   assert.equal(await p.locator('[data-name-preview] .styled-name').getAttribute('data-name-style'),'prism');
   assert.equal(await p.locator('#profileCard .styled-name').getAttribute('data-name-style'),'default');
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await p.keyboard.press('Tab');await p.locator('#nameSettings [type="submit"]').focus();assert.equal(await p.locator('#nameSettings [type="submit"]').evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
   await p.screenshot({path:path.join(out,'profile-mobile.png'),fullPage:true});
   await p.evaluate(()=>window.__rpcFail=false);await p.locator('#nameSettings [type="submit"]').click();await p.getByText('Tampilan nama berhasil disimpan.',{exact:true}).waitFor();
   assert.equal((await p.evaluate(()=>window.__saved)).name_color_3,'#ABCDEF');await close(p);
  });
  for(const route of ['/','/jadwal/?tab=apel','/tugas/','/admin/','/penyimpanan/','/tools/'])await check('Shared identity on '+route,async()=>{
   const p=await pageFor('developer',route,{customization:{name_style:'neon'}});
   await p.locator('.profile-copy .styled-name').waitFor();assert.equal(await p.locator('.profile-copy .styled-name').getAttribute('data-name-style'),'neon');
   if(route==='/admin/'){await p.locator('[data-admin-tab="users"]').click();assert.equal(await p.locator('#adminPanel [data-name-user="developer"]').getAttribute('data-name-style'),'neon');}
   if(route.includes('tab=apel'))assert.equal(await p.locator('.queue-item .styled-name').getAttribute('data-name-style'),'neon');
   await close(p);
  });
  for(const route of ['/jadwal/?tab=piket','/jadwal/?tab=apel'])await check('Legacy name identity and role updates on '+route,async()=>{
   const p=await pageFor('developer',route,{legacyQueue:true,customization:{name_style:'flow'}});
   if(route.includes('piket'))await p.locator('[data-day="monday"]').click();
   const name=p.locator('[data-name-lookup="Pierr"]').first();await name.waitFor();
   assert.equal(await name.getAttribute('data-name-style'),'flow');
   await p.evaluate(()=>window.__emitMember({id:'developer',role:'student'}));
   assert.equal(await name.getAttribute('data-name-style'),'default');await close(p);
  });
  await check('Legacy lookup never guesses between duplicate or unknown names',async()=>{
   const p=await pageFor('developer','/anggota/',{customization:{name_style:'flow'}});
   const result=await p.evaluate(async()=>{
    const {legacyMemberName,publishNameProfiles}=await import('/assets/js/styled-name.js');
    const node=document.createElement('div');node.innerHTML=legacyMemberName('Pierr');document.body.append(node);
    const before=node.firstElementChild.dataset.nameStyle;
    publishNameProfiles([{id:'duplicate',name:'Pierr',role:'student'}]);
    const duplicate=node.firstElementChild.dataset.nameStyle;
    const unknown=document.createElement('div');unknown.innerHTML=legacyMemberName('<script>unknown</script>');
    return {before,duplicate,unknown:unknown.firstElementChild.dataset.nameStyle,text:unknown.textContent,script:unknown.querySelectorAll('script').length};
   });
   assert.deepEqual(result,{before:'flow',duplicate:'default',unknown:'default',text:'<script>unknown</script>',script:0});await close(p);
  });
 }finally{await browser.close();server.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'Headless Edge, mocked Supabase data/RPC; external fonts/icons blocked; not a production login test',checks:results.length,results},null,2));}
 console.log(results.length+' browser checks passed.');
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
