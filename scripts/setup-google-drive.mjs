import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {loadEnvFile} from 'node:process';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const filename of ['.env.local','.env']){
  const supplied={...process.env};
  try{loadEnvFile(path.join(root,filename));}catch(error){if(error.code!=='ENOENT')throw error;}
  Object.assign(process.env,supplied);
}
const clientId=process.env.GOOGLE_CLIENT_ID?.trim(),clientSecret=process.env.GOOGLE_CLIENT_SECRET?.trim();
const folderId=process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
if(!clientId||!clientSecret||!folderId)throw new Error('Isi GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, dan GOOGLE_DRIVE_ROOT_FOLDER_ID terlebih dahulu.');

const port=53682,redirectUri=`http://127.0.0.1:${port}/oauth/callback`,state=randomBytes(24).toString('hex');
const authorize=new URL('https://accounts.google.com/o/oauth2/v2/auth');
for(const [key,value] of Object.entries({client_id:clientId,redirect_uri:redirectUri,response_type:'code',
  scope:'https://www.googleapis.com/auth/drive',access_type:'offline',prompt:'consent',include_granted_scopes:'true',state}))authorize.searchParams.set(key,value);

async function saveRefreshToken(token){
  const destination=path.join(root,'.env.local');
  let text='';try{text=await readFile(destination,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  const line=`GOOGLE_DRIVE_REFRESH_TOKEN=${token}`;
  text=/^GOOGLE_DRIVE_REFRESH_TOKEN=.*$/m.test(text)?text.replace(/^GOOGLE_DRIVE_REFRESH_TOKEN=.*$/m,line):text.replace(/\s*$/,'\n')+line+'\n';
  await writeFile(destination,text,{encoding:'utf8',mode:0o600});
}

let finish;
const completed=new Promise((resolve,reject)=>{finish={resolve,reject};});
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,redirectUri);
  if(url.pathname!=='/oauth/callback'){res.writeHead(404);return res.end('Not found');}
  try{
    if(url.searchParams.get('state')!==state)throw new Error('State OAuth tidak cocok. Ulangi proses.');
    if(url.searchParams.get('error'))throw new Error('Izin Google dibatalkan: '+url.searchParams.get('error'));
    const code=url.searchParams.get('code');if(!code)throw new Error('Google tidak mengirim authorization code.');
    const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code'})});
    const tokens=await tokenResponse.json();
    if(!tokenResponse.ok||!tokens.refresh_token)throw new Error(tokens.error_description||'Google tidak mengirim refresh token baru.');
    const folderResponse=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,mimeType,trashed,capabilities(canAddChildren)`,{headers:{Authorization:`Bearer ${tokens.access_token}`}});
    const folder=await folderResponse.json();
    if(!folderResponse.ok)throw new Error(folder.error?.message||'Folder root Google Drive tidak dapat dibaca.');
    if(folder.mimeType!=='application/vnd.google-apps.folder'||folder.trashed||folder.capabilities?.canAddChildren===false)throw new Error('Folder root tidak dapat menerima file dari akun Google ini.');
    await saveRefreshToken(tokens.refresh_token);
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<h1>Google Drive berhasil dihubungkan</h1><p>Refresh token baru sudah disimpan ke .env.local. Tutup tab ini lalu jalankan ulang preview ClouvenTwo.</p>');
    finish.resolve();
  }catch(error){res.writeHead(400,{'Content-Type':'text/html; charset=utf-8'});res.end(`<h1>Google Drive belum terhubung</h1><p>${String(error.message).replace(/[<&]/g,c=>c==='<'?'&lt;':'&amp;')}</p>`);finish.reject(error);}
});

server.listen(port,'127.0.0.1',()=>{
  console.log('Browser Google akan dibuka. Login dengan akun pemilik folder kelas lalu izinkan akses Drive.');
  console.log('Jika Google menampilkan redirect_uri_mismatch, tambahkan URI berikut pada OAuth Client lalu jalankan ulang:');
  console.log(redirectUri);
  spawn('rundll32.exe',['url.dll,FileProtocolHandler',authorize.toString()],{detached:true,stdio:'ignore'}).unref();
});
const timeout=setTimeout(()=>finish.reject(new Error('Waktu login habis. Jalankan file setup kembali.')),5*60*1000);
try{await completed;console.log('Selesai. GOOGLE_DRIVE_REFRESH_TOKEN baru tersimpan aman di .env.local.');}
finally{clearTimeout(timeout);server.close();}
