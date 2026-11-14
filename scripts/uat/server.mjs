import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(resolve('worker/package.json'));
const {Miniflare,convertV4MiniflareOptions,Response:MFResponse}=createRequire(resolve('worker/node_modules/wrangler/package.json'))('miniflare');
const {build}=require('esbuild');
const output=resolve(tmpdir(),'internmatch-uat-worker.mjs');
await build({entryPoints:['scripts/uat/worker-entry.js'],bundle:true,format:'esm',outfile:output,platform:'browser',target:'es2022'});
const messages=[],emails=[];
let failLine=false;
const json=v=>new MFResponse(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
const mf=new Miniflare((convertV4MiniflareOptions||((v)=>v))({name:'internmatch-uat',script:await readFile(output,'utf8'),modules:true,compatibilityDate:'2026-01-01',host:'localhost',port:8787,d1Databases:{DB:'internmatch-uat'},
 bindings:{WEB_ORIGIN:'http://localhost:8787',LOCAL_DEV_LOGIN:'false',ALLOWED_EMAILS:'alpha@example.test,beta@example.test',BREVO_API_KEY:'uat',BREVO_SENDER_EMAIL:'sender@example.test',LINE_CHANNEL_SECRET:'uat-line-secret',LINE_CHANNEL_ACCESS_TOKEN:'uat-line-token',GEMINI_API_KEY:'uat',GEMINI_MODEL:'uat-model',PAXA_API_KEY:'uat',PAXA_MODEL:'uat-model'},
 serviceBindings:{ASSETS:async req=>{
  const path=new URL(req.url).pathname;
  const file=path==='/open.html'?'scripts/uat/open.html':['/index.html','/config.js','/profile-ui.js','/profile-ui.css','/document-ui.js','/document-ui.css','/release.json'].includes(path)?'.app'+path:null;
  if(!file)return new MFResponse('Not found',{status:404});
  return new MFResponse(await readFile(file),{headers:{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.json')?'application/json':'text/html'}});
 }},
 outboundService:async req=>{
 const url=new URL(req.url),body=await req.json().catch(()=>({}));
 if(url.hostname==='api.brevo.com'){emails.push(body);return json({messageId:'uat'});}
 if(url.hostname==='api.line.me'){messages.push(body);return new MFResponse('{}',{status:failLine?500:200});}
 if(url.hostname==='api.paxalabs.com')return json({fields:{company:'OCR company',role:'Intern',deadline:'2099-04-01'}});
 if(url.hostname==='generativelanguage.googleapis.com'){
  const last=body.contents.at(-1),parts=last.parts;
  if(parts.some(p=>p.functionResponse))return json({candidates:[{content:{role:'model',parts:[{text:'ตรวจรายการในการ์ด หรือดูข้อมูลที่บันทึกได้เลย'}]}}]});
  const text=parts.map(p=>p.text||'').join(''),args=text.startsWith('profile:')?{preferred_name:text.slice(8)}:text.startsWith('season:')?{select_name:text.slice(7)}:text.startsWith('newseason:')?{create_name:text.slice(10)}:text.startsWith('milestone:')?{title:text.slice(10),date:'2099-04-01'}:null;
  const name=text.startsWith('profile:')?'propose_profile':text.startsWith('season:')||text.startsWith('newseason:')?'propose_season':text.startsWith('milestone:')?'add_milestone':'get_overview';
  return json({candidates:[{content:{role:'model',parts:[{functionCall:{name,args:args||{}}}]}}]});
 }
 // No request is allowed to escape to a real provider.
 return new MFResponse('Outbound service not mocked',{status:502});
 }}));
await mf.ready;
const db=await mf.getD1Database('DB');
for(const name of ['0001_init.sql','0002_message_cards.sql','0003_student_seasons.sql']){
 if(name==='0003_student_seasons.sql'){
  await db.prepare("INSERT INTO users(id,email,line_user_id,profile_json,created_at) VALUES ('beta','beta@example.test','line-beta','{}','2026-01-01')").run();
  await db.prepare("INSERT INTO applications(id,user_id,company,role,status,truth_level,history_json,updated_at) VALUES ('legacy-app','beta','Legacy Co','Intern','Applied','USER_REPORTED','[[\"2026-01-01\",\"existing\"]]','2026-01-01')").run();
  await db.prepare("INSERT INTO reminders(id,user_id,text,due_at,sent_at,delivery) VALUES ('legacy-sent','beta','already sent','2026-01-02','2026-01-02','line')").run();
 }
 const sql=(await readFile('worker/migrations/'+name,'utf8')).replace(/--[^\n]*/g,'');
 for(const statement of sql.split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();
}
for(const [id,email,token,line] of [['alpha','alpha@example.test','a'.repeat(64),null],['beta','beta@example.test','b'.repeat(64),'line-beta']]){
 await db.prepare('INSERT OR IGNORE INTO users(id,email,line_user_id,created_at) VALUES (?,?,?,?)').bind(id,email,line,new Date().toISOString()).run();
 await db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES (?,?,?)').bind('v2:'+createHash('sha256').update(token).digest('hex'),id,'2099-01-01T00:00:00.000Z').run();
}
// A separate control server is bound only to loopback for deterministic failure tests.
const {createServer}=await import('node:http');
const control=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost:8788');res.setHeader('Content-Type','application/json');
 if(url.pathname==='/evidence')return res.end(JSON.stringify({line_messages:messages,email_count:emails.length}));
 if(url.pathname==='/line-failure'){failLine=url.searchParams.get('enabled')==='true';return res.end('{}');}
 if(url.pathname==='/otp'){const mail=emails.at(-1),text=mail?.htmlContent||mail?.textContent||'';return res.end(JSON.stringify({code:text.match(/\b\d{6}\b/)?.[0]}));}
 if(url.pathname==='/restore-session'){await db.prepare("UPDATE sessions SET expires_at='2099-01-01' WHERE user_id='beta'").run();return res.end('{}');}
 if(url.pathname==='/expire'){await db.prepare("UPDATE sessions SET expires_at='2000-01-01' WHERE user_id='beta'").run();return res.end('{}');}
 if(url.pathname==='/rows'){
  const data={};for(const table of ['users','seasons','applications','milestones','reminders','audit_log','pending_actions','extractions'])data[table]=(await db.prepare(`SELECT * FROM ${table}`).all()).results;
  // Omit authentication fields and payloads containing possible personal values from logs.
  data.users=data.users.map(({id,profile_json,selected_season_id})=>({id,profile_json,selected_season_id}));
  return res.end(JSON.stringify(data));
 }
 res.statusCode=404;res.end('{}');
});control.listen(8788,'localhost');
await mf.dispatchFetch('http://localhost:8787/__uat/seed');
console.log('Local UAT Worker ready at http://localhost:8787 (isolated ephemeral D1; all providers simulated)');
process.on('SIGINT',async()=>{control.close();await mf.dispose();process.exit(0);});
