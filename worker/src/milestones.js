import { confirmProfileProposal } from './profile-proposals.js';
import { context, scoped, auditStatement } from './seasons.js';
export const dateOK = v => v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v);
const bad = error => ({ok:false,error});
const now = () => new Date().toISOString();
function fields(b) {
 if (!b || typeof b.title!=='string'||!b.title.trim()||b.title.length>200) return null;
 const date=b.date||null,end_date=b.end_date||null;
 if (!dateOK(date)||!dateOK(end_date)||(end_date&&(!date||end_date<date))|| (b.source!=null && (typeof b.source!=='string'||b.source.length>2000))) return null;
 return {title:b.title.trim(),date,end_date,source:b.source||null};
}
export async function listMilestones(env,u) {
 const c=await context(env,u);
 return (await env.DB.prepare('SELECT * FROM milestones WHERE user_id=? AND season_id=? ORDER BY date IS NULL,date,created_at').bind(u,c.season.id).all()).results;
}
export async function newProposal(env,u,kind,payload,expected=null) {
 const c=await context(env,u),id=crypto.randomUUID(),at=now();
 await env.DB.prepare('INSERT INTO pending_actions(id,user_id,season_id,kind,payload_json,expected_version,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)')
 .bind(id,u,c.season.id,kind,JSON.stringify(payload),expected,at,new Date(Date.now()+86400e3).toISOString()).run();
 return {id,kind,season_id:c.season.id,season_name:c.season.name,payload,expires_at:new Date(Date.parse(at)+86400e3).toISOString()};
}
export function proposedTimes(m,clock=Date.now()) {
 const anchor=m.end_date||m.date;
 if(!anchor)return [];
 return [7,1].map(days=>({due_at:new Date(Date.parse(anchor+'T09:00:00+07:00')-days*86400e3).toISOString()})).filter(r=>Date.parse(r.due_at)>clock);
}
export async function saveMilestone(env,u,b,ch,id=null) {
 const c=await context(env,u),f=fields(b);
 if(!f)return bad('bad_request');
 if(id) {
  const old=await env.DB.prepare('SELECT * FROM milestones WHERE id=? AND user_id=? AND season_id=?').bind(id,u,c.season.id).first();
  if(!old)return bad('not_found');
  if(b.version!==old.version)return bad('conflict');
  const reminders=(await env.DB.prepare('SELECT * FROM reminders WHERE milestone_id=? AND user_id=? AND season_id=? AND sent_at IS NULL').bind(id,u,c.season.id).all()).results;
  const oldAnchor=old.end_date||old.date,newAnchor=f.end_date||f.date;
  const delta=oldAnchor&&newAnchor ? Date.parse(newAnchor)-Date.parse(oldAnchor):null;
  const shifted=reminders.map(r=>({id:r.id,version:r.version,due_at:delta===null?null:new Date(Date.parse(r.due_at)+delta).toISOString()}));
  const proposal=await newProposal(env,u,'milestone_edit',{id,before:old,after:f,reminders:shifted.length?shifted:proposedTimes(f)},old.version);
  return {ok:true,proposal};
 }
 id=crypto.randomUUID();
 const proposalId=crypto.randomUUID(),created=now(),expires=new Date(Date.parse(created)+86400e3).toISOString();
 const payload={id,title:f.title,anchor:f.end_date||f.date,reminders:proposedTimes(f)};
 const proposal={id:proposalId,kind:'milestone_reminders',season_id:c.season.id,season_name:c.season.name,payload,expires_at:expires};
 await env.DB.batch([
  env.DB.prepare('INSERT INTO milestones(id,user_id,season_id,title,date,end_date,source,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,u,c.season.id,f.title,f.date,f.end_date,f.source,created),
  auditStatement(env,u,c.season.id,'milestone',id,{op:'create',...f},ch),
  env.DB.prepare('INSERT INTO pending_actions(id,user_id,season_id,kind,payload_json,expected_version,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)').bind(proposalId,u,c.season.id,'milestone_reminders',JSON.stringify(payload),0,created,expires),
 ]);
 return {ok:true,id,proposal};
}
export async function confirmProposal(env,u,id,ch,override) {
 const p=await env.DB.prepare('SELECT * FROM pending_actions WHERE id=? AND user_id=?').bind(id,u).first();
 if(!p)return bad('not_found');
 if(p.status==='confirmed')return {...JSON.parse(p.result_json),replayed:true};
 if(p.status!=='pending')return bad('not_pending');
 if(Date.parse(p.expires_at)<=Date.now())return bad('expired');
 if(['profile_edit','season_edit','season_select','season_create'].includes(p.kind))return confirmProfileProposal(env,u,p,ch);
 const payload=JSON.parse(p.payload_json),e=scoped(env,p.season_id),c=await context(e,u);
 let rows=override===undefined ? payload.reminders : override;
 if(!Array.isArray(rows)||rows.length>20)return bad('bad_request');
 const edit=p.kind==='milestone_edit';
 if(!edit && p.kind!=='milestone_reminders')return bad('bad_request');
 const original=payload.reminders;
 if(edit && (original.filter(o=>o.id).some(o=>!rows.some(r=>r.id===o.id))||new Set(rows.filter(r=>r.id).map(r=>r.id)).size!==rows.filter(r=>r.id).length||rows.some(r=>r.id&&!original.some(o=>o.id===r.id))))return bad('bad_request');
 if(rows.some(r=>r.due_at!==null && (typeof r.due_at!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(r.due_at)||!Number.isFinite(Date.parse(r.due_at))||Date.parse(r.due_at)<=Date.now())))return bad('invalid_datetime');
 const old=await env.DB.prepare('SELECT * FROM milestones WHERE id=? AND user_id=? AND season_id=?').bind(payload.id,u,p.season_id).first();
 if(!old)return bad('not_found');
 if(old.version!==p.expected_version)return bad('conflict');
 // The claim and every guarded mutation execute in one serial D1 transaction.
 const token=crypto.randomUUID(),guard="EXISTS (SELECT 1 FROM pending_actions WHERE id=? AND claim_token=? AND status='applying')";
 const sql=[];
 const reminderGuards=edit?original.filter(r=>r.id).map(()=>" AND NOT EXISTS(SELECT 1 FROM reminders WHERE id=? AND user_id=? AND sent_at IS NULL AND version<>?)").join(''):'';
 sql.push(env.DB.prepare("UPDATE pending_actions SET status='applying',claim_token=? WHERE id=? AND user_id=? AND status='pending' AND expires_at>? AND EXISTS(SELECT 1 FROM milestones WHERE id=? AND user_id=? AND season_id=? AND version=?)"+reminderGuards)
 .bind(token,id,u,now(),payload.id,u,p.season_id,p.expected_version,...(edit?original.filter(r=>r.id).flatMap(r=>[r.id,u,r.version]):[])));
 if(edit) {
  const f=payload.after;
  sql.push(env.DB.prepare(`UPDATE milestones SET title=?,date=?,end_date=?,source=?,version=version+1 WHERE id=? AND user_id=? AND ${guard}`).bind(f.title,f.date,f.end_date,f.source,payload.id,u,id,token));
  for(const r of rows) {
   if(!r.id){if(r.due_at)sql.push(env.DB.prepare(`INSERT INTO reminders(id,user_id,season_id,milestone_id,text,due_at) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),u,p.season_id,payload.id,f.title,new Date(r.due_at).toISOString(),id,token));continue;}
   const prior=original.find(o=>o.id===r.id);
   sql.push(r.due_at===null ? env.DB.prepare(`DELETE FROM reminders WHERE id=? AND user_id=? AND sent_at IS NULL AND version=? AND ${guard}`).bind(r.id,u,prior.version,id,token)
   : env.DB.prepare(`UPDATE reminders SET due_at=?,text=?,version=version+1 WHERE id=? AND user_id=? AND sent_at IS NULL AND version=? AND ${guard}`).bind(new Date(r.due_at).toISOString(),f.title,r.id,u,prior.version,id,token));
  }
 } else {
  sql.push(env.DB.prepare(`UPDATE milestones SET version=version+1 WHERE id=? AND user_id=? AND ${guard}`).bind(payload.id,u,id,token));
  for(const r of rows.filter(r=>r.due_at))sql.push(env.DB.prepare(`INSERT INTO reminders(id,user_id,season_id,milestone_id,text,due_at) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),u,p.season_id,payload.id,payload.title,new Date(r.due_at).toISOString(),id,token));
 }
 const result={ok:true,season_id:p.season_id,season_name:c.season.name};
 sql.push(env.DB.prepare(`INSERT INTO audit_log(id,user_id,season_id,entity,entity_id,change_json,channel,truth_level,at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),u,p.season_id,'milestone',payload.id,JSON.stringify({op:p.kind,payload,reminders:rows}),ch,'USER_REPORTED',now(),id,token));

 sql.push(env.DB.prepare("UPDATE pending_actions SET status='confirmed',result_json=? WHERE id=? AND claim_token=? AND status='applying'").bind(JSON.stringify(result),id,token));
 const applied=await env.DB.batch(sql);
 if(!applied[0].meta.changes) {
  const latest=await env.DB.prepare('SELECT status,result_json FROM pending_actions WHERE id=? AND user_id=?').bind(id,u).first();
  return latest?.status==='confirmed'?{...JSON.parse(latest.result_json),replayed:true}:bad('conflict');
 }
 const sent=edit ? (await env.DB.prepare('SELECT id FROM reminders WHERE milestone_id=? AND user_id=? AND sent_at IS NOT NULL').bind(payload.id,u).all()).results.length:0;
 return {...result,sent_preserved:sent};
}
