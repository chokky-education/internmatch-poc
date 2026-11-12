import {executeD1} from './d1-query.mjs';
// Reviewed production verification: private D1 inputs, no OTP/LINE/AI calls.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,createHash,randomInt} from 'node:crypto';
const [mode,approvedSha]=process.argv.slice(2),root=resolve(import.meta.dirname,'../..');
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(approvedSha||'')||head!==approvedSha)throw Error('Run from the exact reviewed merged checkout');
const privateDir=resolve(root,'.superpowers/profile-release');mkdirSync(privateDir,{recursive:true,mode:0o700});
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
let sequence=0;
function query(sql){
 const file=resolve(privateDir,`query-${Date.now()}-${++sequence}.sql`);writeFileSync(file,sql,{mode:0o600});
 try{return executeD1(sql,file,{cwd:resolve(root,'worker')});}
 catch(e){writeFileSync(resolve(privateDir,'last-query-error.log'),String(e.stderr||e.message),{mode:0o600});throw Error('D1 operation failed; diagnostic saved privately');}
}
const tables=['users','sessions','otps','applications','tasks','documents','reminders','messages','extractions','audit_log','line_events'];
const snapshotFile=resolve(privateDir,'legacy-fingerprint.json');
function fingerprint(table,columns){
 const schema=query(`PRAGMA table_info(${table})`)[0].results;
 columns ||= schema.map(c=>c.name);
 const order=schema.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>`"${c.name}"`).join(',')||'rowid';
 const rows=query(`SELECT ${columns.map(c=>'"'+c+'"').join(',')} FROM ${table} ORDER BY ${order}`)[0].results;
 return {columns,count:rows.length,digest:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
}
if(mode==='snapshot'){
 const data=Object.fromEntries(tables.map(t=>[t,fingerprint(t)]));writeFileSync(snapshotFile,JSON.stringify(data),{mode:0o600});
 console.log(JSON.stringify({ok:true,counts:Object.fromEntries(tables.map(t=>[t,data[t].count]))}));
}else if(mode==='verify'){
 const before=JSON.parse(readFileSync(snapshotFile,'utf8'));
 for(const t of tables){const after=fingerprint(t,before[t].columns);if(after.count!==before[t].count||after.digest!==before[t].digest)throw Error('Legacy preservation mismatch: '+t);}
 for(const t of ['applications','tasks','documents','reminders','messages','extractions','audit_log']){
  const bad=query(`SELECT COUNT(*) n FROM ${t} t LEFT JOIN seasons s ON t.season_id=s.id AND t.user_id=s.user_id WHERE s.id IS NULL`)[0].results[0].n;
  if(bad)throw Error('Unscoped migrated records: '+t);
 }
 const bad=query('SELECT COUNT(*) n FROM users u LEFT JOIN seasons s ON u.selected_season_id=s.id AND u.id=s.user_id WHERE s.id IS NULL')[0].results[0].n;
 if(bad)throw Error('Invalid selected season after migration');
 console.log(JSON.stringify({ok:true,legacy_tables_preserved:tables.length,season_ownership:'verified'}));
}else if(mode==='smoke'){
 const id='release-smoke-'+randomBytes(8).toString('hex'),email=id+'@example.invalid',steps=[],code=String(randomInt(1000000)).padStart(6,'0');
 const url='https://internmatch-api.entrace-space.workers.dev';
 let cookie;
 const request=async(path,method='GET',body,selection)=>{
  const r=await fetch(url+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json',Origin:url,...(selection?{'X-Season-Id':selection.selected_season.id,'X-Selection-Version':String(selection.selection_version)}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  const data=await r.json();if(!r.ok||data.ok===false)throw Error(`Production smoke failed at ${path}: ${r.status}`);return data;
 };
 let created=false;
 try{
  created=true;query(`INSERT INTO users(id,email,created_at) VALUES (${literal(id)},${literal(email)},${literal(new Date().toISOString())}); INSERT INTO otps(email,code_hash,expires_at,attempts,last_sent_at,purpose) VALUES (${literal(email)},${literal(createHash('sha256').update(code).digest('hex'))},${literal(new Date(Date.now()+600000).toISOString())},0,${literal(new Date().toISOString())},'web');`);
  const login=await fetch(url+'/api/auth/verify',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({email,code})});
  if(!login.ok)throw Error('Fixture cookie login failed');
  if('token' in await login.json())throw Error('Session leaked in JSON');
  cookie=login.headers.get('Set-Cookie').split(';')[0];
  let s=await request('/api/state');if(Object.keys(s.profile).length)throw Error('New profile not blank');steps.push('authenticated blank profile');
  await request('/api/applications','POST',{company:'Release smoke fixture',status:'Saved',role:'Intern'},s);
  await request('/api/profile','PATCH',{profile:{study_year:'3'},version:s.profile_version});
  const a=await request('/api/seasons','POST',{name:'Release smoke A'});
  await request('/api/profile','PATCH',{profile:{study_year:'4'},version:s.profile_version+1});
  const b=await request('/api/seasons','POST',{name:'Release smoke B'});
  if(a.season.education.study_year!=='3'||b.season.education.study_year!=='4')throw Error('Education snapshot mismatch');steps.push('profile edit and season snapshots');
  await request('/api/seasons/'+a.season.id+'/select','POST',{selection_version:s.selection_version});s=await request('/api/state');
  if(s.applications.length)throw Error('Cross-season data leak');
  await request('/api/applications','POST',{company:'Release smoke fixture',status:'Saved',role:'Intern'},s);steps.push('same-company isolation and shared selection');
  const m=await request('/api/milestones','POST',{title:'Release smoke milestone',date:'2099-03-20'},s);
  if((await request('/api/state')).reminders.length)throw Error('Premature reminder creation');
  await request('/api/actions','POST',{data:'proposal_confirm:'+m.proposal.id});
  await request('/api/actions','POST',{data:'proposal_confirm:'+m.proposal.id});s=await request('/api/state');
  if(s.reminders.length!==2)throw Error('Reminder replay mismatch');steps.push('milestone proposal, confirmation and replay');
  const edit=await request('/api/milestones/'+m.id,'PATCH',{title:'Release smoke milestone',date:'2099-03-27',version:s.milestones[0].version},s);
  await request('/api/actions','POST',{data:'proposal_confirm:'+edit.proposal.id});s=await request('/api/state');
  if(s.milestones[0].date!=='2099-03-27'||!s.reminders.some(r=>r.due_at==='2099-03-26T02:00:00.000Z'))throw Error('Reschedule mismatch');steps.push('atomic milestone/reminder reschedule');
 }finally{
  if(created){query([...['pending_actions','milestones','applications','tasks','documents','reminders','messages','extractions','audit_log','seasons','sessions'].map(t=>`DELETE FROM ${t} WHERE user_id=${literal(id)}`),`DELETE FROM otps WHERE email=${literal(email)}`,`DELETE FROM users WHERE id=${literal(id)}`].join(';')+';');
   for(const t of ['users','seasons','sessions','applications','milestones','reminders','pending_actions']){const key=t==='users'?'id':'user_id';if(query(`SELECT COUNT(*) n FROM ${t} WHERE ${key}=${literal(id)}`)[0].results[0].n)throw Error('Smoke fixture cleanup incomplete');}}
 }
 console.log(JSON.stringify({ok:true,steps,fixture_removed:true,external_messages_sent:0}));
}else throw Error('Expected snapshot, verify or smoke');
