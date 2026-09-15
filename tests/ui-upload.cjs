const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'ui-test-results','upload-'+Date.now());
fs.mkdirSync(out,{recursive:true});
const nativeUploads=[];
const server=http.createServer(async(req,res)=>{
 if(req.url==='/api/drive/upload'){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  nativeUploads.push({bytes:Buffer.concat(chunks).length,headers:req.headers});
  await new Promise(r=>setTimeout(r,450));res.setHeader('Content-Type','application/json');res.writeHead(201);return res.end(JSON.stringify({id:'native-file-123'}));
 }
 let file=path.join(root,decodeURIComponent(req.url.split('?')[0]));
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
function backend(){
 const user={id:'u1',user_metadata:{name:'Pengurus Kelas'}};
 window.__records=[];window.__inserts=0;window.__metadataMode='success';window.__requests=[];
 window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user,access_token:'local-test'}}})},
  from(table){let single=false,filter={};const q={
   select(){return q;},eq(key,value){filter[key]=value;return q;},order(){return q;},maybeSingle(){single=true;return q;},
   async insert(payload){
    window.__inserts++;
    if(window.__metadataMode==='held')await new Promise(r=>window.__releaseMetadata=r);
    if(window.__metadataMode==='error')return {error:{message:'Connection interrupted'}};
    if(window.__records.some(r=>r.drive_file_id===payload.drive_file_id))return {error:{code:'23505',message:'duplicate'}};
    window.__records.push({...payload,id:'row-'+window.__inserts});
    return window.__metadataMode==='committed-error'?{error:{message:'Response interrupted'}}:{error:null};
   },
   then(resolve,reject){let data=table==='members'?[{id:'u1',name:'Pengurus Kelas',role:window.__options.role||'developer'}]:table==='resources'?window.__records:[];
    if(filter.drive_file_id)data=data.filter(r=>r.drive_file_id===filter.drive_file_id);
    return Promise.resolve({data:single?data[0]||null:data,error:null}).then(resolve,reject);
   }
  };return q;},channel(){return {on(){return this;},subscribe(){return this;}};},removeChannel(){}
 })};
 if(!window.__options.native){
  window.XMLHttpRequest=class extends EventTarget{
   constructor(){super();this.upload=new EventTarget();this.headers={};this.status=0;this.response=null;}
   open(method,url){this.method=method;this.url=url;}
   setRequestHeader(name,value){this.headers[name]=value;}
   send(body){this.body=body;window.__requests.push(this);}
  };
 }
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
 async function create(options={}){
  const p=await browser.newPage({viewport:options.viewport||{width:1440,height:900}});p.setDefaultTimeout(8000);
  await p.addInitScript(options=>{window.__options=options;if(options.dark)localStorage.setItem('clouven-theme','dark');},options);
  await p.route('**/*',r=>{const url=r.request().url();if(new URL(url).pathname==="/api/config")return r.fulfill({contentType:"application/json",body:JSON.stringify({url:"https://classroom.invalid",publishableKey:"sb_publishable_local_test_configuration"})});if(url.includes('/@supabase/supabase-js'))return r.fulfill({contentType:'text/javascript',body:`(${backend.toString()})();`});if(url.startsWith(base))return r.continue();if(options.fonts&&/fonts\.(googleapis|gstatic)\.com|cdn.jsdelivr.net\/npm\/@tabler/.test(url))return r.fetch({timeout:7000}).then(response=>r.fulfill({response})).catch(()=>r.abort());return r.abort();});
  p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));await p.goto(base+'/penyimpanan/');await p.locator('#resourceList .empty-state').waitFor();return p;
 }
 const file=(size=4096,name='Materi jaringan.pdf')=>({name,mimeType:'application/pdf',buffer:Buffer.alloc(size,65)});
 async function pick(p,payload=file()){await p.locator('input[type=file]').setInputFiles(payload);}
 async function begin(p){await p.locator('#uploadSubmit').click();await p.waitForFunction(()=>window.__requests.length>0);}
 async function signal(p,type,values={}){await p.evaluate(({type,values})=>{const r=window.__requests.at(-1);if(type==='progress')r.upload.dispatchEvent(new ProgressEvent('progress',{lengthComputable:true,loaded:values.loaded,total:values.total}));else if(type==='unknown')r.upload.dispatchEvent(new ProgressEvent('progress',{lengthComputable:false,loaded:10}));else if(type==='sent')r.upload.dispatchEvent(new ProgressEvent('load'));else if(type==='response'){r.status=values.status||201;r.response=values.body||{id:'drive-file-123'};r.dispatchEvent(new Event('load'));}else r.dispatchEvent(new Event(type));},{type,values});}
 async function check(name,fn){if(process.env.UI_TEST_FILTER&&!new RegExp(process.env.UI_TEST_FILTER).test(name))return;await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}
 await check('Visible limit and disabled submit before selection',async()=>{const p=await create();assert.match(await p.locator('#uploadHelp').innerText(),/3 MB per file/);assert.equal(await p.locator('#uploadSubmit').isDisabled(),true);assert.equal(await p.locator('#uploadSelection').isVisible(),false);assert.equal(await p.locator('#uploadStatus').isVisible(),false);await p.close();});
 for(const [size,valid] of [[0,false],[3*1024*1024,true],[3*1024*1024+1,false]])await check(`File size boundary ${size}`,async()=>{const p=await create();await pick(p,file(size));assert.equal(await p.locator('#uploadSubmit').isEnabled(),valid);assert.equal(await p.locator('#uploadFileError').isVisible(),!valid);assert.equal(await p.evaluate(()=>window.__requests.length),0);await p.close();});
 await check('Selected name is escaped and oversized selection can be replaced',async()=>{const p=await create();await pick(p,file(3*1024*1024+1));await pick(p,file(1024,'<img onerror=alert(1)>.pdf'));assert.equal(await p.locator('#uploadFileName').innerText(),'<img onerror=alert(1)>.pdf');assert.equal(await p.locator('#uploadFileName img').count(),0);assert.equal(await p.locator('#uploadFileError').isVisible(),false);assert.equal(await p.locator('#uploadSubmit').isEnabled(),true);await p.locator('input[type=file]').setInputFiles([]);assert.equal(await p.locator('#uploadSubmit').isDisabled(),true);await p.close();});
 await check('Measured progress, unknown totals, Drive wait, metadata wait and success',async()=>{
  const p=await create();await pick(p);await p.locator('[name=subject]').fill('ASJ & TJKN');await p.locator('[name=kind]').selectOption('tugas');await begin(p);
  await p.evaluate(()=>{document.querySelector('#uploadForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));window.__metadataMode='held';});
  assert.equal(await p.evaluate(()=>window.__requests.length),1);assert.equal(await p.locator('[name=subject]').isDisabled(),true);
  assert.equal(await p.evaluate(()=>window.__requests[0].headers['X-Subject']),encodeURIComponent('ASJ & TJKN'));
  assert.equal(await p.locator('#uploadSubmit').getAttribute('aria-busy'),'true');assert.equal(await p.locator('#uploadSubmit .button-loading-spinner').count(),0);
  assert.equal(await p.locator('#uploadProgress').getAttribute('aria-valuenow'),'0');assert.equal(await p.locator('#uploadPercent').innerText(),'0%');
  await signal(p,'progress',{loaded:1024,total:4096});assert.equal(await p.locator('#uploadProgress').getAttribute('aria-valuenow'),'25');assert.equal(await p.locator('#uploadSubmit').getAttribute('aria-label'),'Mengunggah 25%');
  await signal(p,'unknown');assert.equal(await p.locator('#uploadProgress').getAttribute('aria-valuenow'),'25');
  await signal(p,'sent');assert.equal(await p.locator('#uploadStatus').getAttribute('data-phase'),'drive');assert.equal(await p.locator('#uploadPercent').innerText(),'100%');
  await signal(p,'response');await p.waitForFunction(()=>window.__releaseMetadata);assert.equal(await p.locator('#uploadStatus').getAttribute('data-phase'),'listing');
  assert.equal(await p.locator('#uploadSubmit').isDisabled(),true);await p.evaluate(()=>{window.__metadataMode='success';window.__releaseMetadata();});
  await p.locator('#uploadStatus[data-phase=success]').waitFor();await p.locator('.resource-row').waitFor();
  assert.equal(await p.locator('#uploadSubmit').getAttribute('aria-busy'),null);assert.equal(await p.locator('#uploadSubmit .button-loading-spinner').count(),0);
  assert.equal(await p.locator('input[type=file]').inputValue(),'');assert.equal(await p.locator('#uploadProgress').isVisible(),false);assert.deepEqual(p.errors,[]);await p.close();
 });
 for(const type of ['error','timeout','abort'])await check(`Transfer ${type} retains file and permits manual retry`,async()=>{const p=await create();await pick(p);await p.locator('[name=subject]').fill('ASJ');await begin(p);await signal(p,type);await p.locator('#uploadStatus[data-phase=error]').waitFor();assert.equal(await p.locator('#uploadSubmit').innerText(),'Coba unggah lagi');assert.equal(await p.locator('input[type=file]').evaluate(el=>el.files.length),1);assert.equal(await p.locator('[name=subject]').inputValue(),'ASJ');assert.equal(await p.locator('#uploadSubmit').isEnabled(),true);await p.close();});
 for(const status of [401,403,413,500])await check(`HTTP ${status} never reports success`,async()=>{const p=await create();await pick(p);await begin(p);await signal(p,'response',{status,body:{error:'internal implementation detail'}});await p.locator('#uploadStatus[data-phase=error]').waitFor();assert.equal(await p.evaluate(()=>window.__inserts),0);assert.doesNotMatch(await p.locator('#uploadStatus').innerText(),/internal implementation detail/);await p.close();});
 await check('Expired Google refresh token shows actionable reauthorization message',async()=>{const p=await create();await pick(p);await begin(p);await signal(p,'response',{status:503,body:{error:'Token detail',code:'GOOGLE_REAUTHORIZE'}});await p.locator('#uploadStatus[data-phase=error]').waitFor();assert.match(await p.locator('#uploadStatus').innerText(),/ATUR-ULANG-GOOGLE-DRIVE\.bat/);assert.doesNotMatch(await p.locator('#uploadStatus').innerText(),/Token detail/);assert.equal(await p.evaluate(()=>window.__inserts),0);await p.close();});
 await check('Invalid success response cannot create a list entry',async()=>{const p=await create();await pick(p);await begin(p);await signal(p,'response',{body:{}});await p.locator('#uploadStatus[data-phase=error]').waitFor();assert.equal(await p.evaluate(()=>window.__inserts),0);await p.close();});
 await check('Static preview response explains that the Drive API is unavailable',async()=>{const p=await create();await pick(p);await begin(p);await signal(p,'response',{status:200,body:{}});await p.locator('#uploadStatus[data-phase=error]').waitFor();assert.match(await p.locator('#uploadStatus').innerText(),/tidak menjalankan API upload/);assert.equal(await p.evaluate(()=>window.__inserts),0);await p.close();});
 for(const mode of ['error','committed-error'])await check(`List save ${mode} retries without another Drive upload`,async()=>{
  const p=await create();await pick(p);await begin(p);await p.evaluate(mode=>window.__metadataMode=mode,mode);await signal(p,'response');
  await p.getByRole('button',{name:'Coba simpan lagi'}).waitFor();assert.equal(await p.locator('input[type=file]').isDisabled(),true);
  await p.evaluate(()=>window.__metadataMode='success');await p.locator('#uploadSubmit').click();await p.locator('#uploadStatus[data-phase=success]').waitFor();
  assert.equal(await p.evaluate(()=>window.__requests.length),1);assert.equal(await p.evaluate(()=>window.__records.length),1);assert.equal(await p.evaluate(()=>window.__inserts),2);await p.close();
 });
 await check('Native XHR transfers exact file bytes to a local endpoint',async()=>{
  const p=await create({native:true});await pick(p,file(128*1024));await p.locator('#uploadSubmit').click();await p.locator('#uploadStatus[data-phase=success]').waitFor();
  assert.equal(nativeUploads.at(-1).bytes,128*1024);assert.equal(nativeUploads.at(-1).headers.authorization,'Bearer local-test');await p.locator('.resource-row').waitFor();assert.deepEqual(p.errors,[]);await p.close();
 });
 await check('Student cannot see or submit upload controls',async()=>{const p=await create({role:'student'});assert.equal(await p.locator('#uploadCard').isVisible(),false);await p.evaluate(()=>document.querySelector('#uploadForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(await p.evaluate(()=>window.__requests.length),0);await p.close();});
 for(const dark of [false,true])await check(`Mobile ${dark?'dark':'light'} selected and uploading layouts`,async()=>{
  const p=await create({dark,fonts:true,viewport:{width:320,height:800}});await pick(p,file(2048,'Dokumentasi_jaringan_dan_lampiran_tugas_'.repeat(4)+'.pdf'));await p.evaluate(()=>document.fonts.ready);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:path.join(out,`mobile-${dark?'dark':'light'}-selected.png`),fullPage:true});
  await begin(p);await signal(p,'sent');await p.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await p.locator('#uploadProgress span').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:path.join(out,`mobile-${dark?'dark':'light'}-uploading.png`),fullPage:true});await p.close();
 });
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(`All ${results.length} checks passed. Results: ${out}`);await browser.close();server.close();
})().catch(error=>{console.error(error);server.close();process.exit(1);});
