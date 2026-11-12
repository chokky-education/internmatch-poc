import {context,listSeasons,educationOf} from './seasons.js';
import {newProposal,dateOK} from './milestones.js';
import {SEED_TASKS} from './seed.js';
const bad=error=>({ok:false,error});
export async function proposeProfile(env,u,patch) {
 const c=await context(env,u),after={...c.profile};
 for(const [k,v] of Object.entries(patch)) {
  if(k==='career_interests'){if(!Array.isArray(v)||v.length>30||v.some(x=>typeof x!=='string'||x.length>100))return bad('bad_request');after[k]=v;}
  else if(['preferred_name','university','faculty','major','study_year'].includes(k)){if(v!==null&&(typeof v!=='string'||v.length>200))return bad('bad_request');after[k]=v?.trim()||null;}
  else return bad('bad_request');
 }
 return {ok:true,proposal:await newProposal(env,u,'profile_edit',{before:c.profile,after},c.user.profile_version)};
}
export async function proposeSeason(env,u,args) {
 const c=await context(env,u);
 if(args.create_name){if(typeof args.create_name!=='string'||args.create_name.length>160)return bad('bad_request');return {ok:true,proposal:await newProposal(env,u,'season_create',{id:crypto.randomUUID(),name:args.create_name.trim(),education:educationOf(c.profile)})};}
 if(args.select_name){const found=(await listSeasons(env,u)).filter(x=>x.name===args.select_name);if(found.length!==1)return bad('ambiguous_season');return {ok:true,proposal:await newProposal(env,u,'season_select',{id:found[0].id,name:found[0].name},c.selection_version)};}
 const after={name:c.season.name,education:{...c.season.education},details:{...c.season.details}};
 if(args.name!==undefined){if(typeof args.name!=='string'||!args.name.trim()||args.name.length>160)return bad('bad_request');after.name=args.name.trim();}
 if(args.education)for(const [k,v] of Object.entries(args.education)){if(!['university','faculty','major','study_year'].includes(k)||(v!==null&&(typeof v!=='string'||v.length>200)))return bad('bad_request');after.education[k]=v;}
 if(args.details)for(const [k,v] of Object.entries(args.details)){
  if(['hours','weeks'].includes(k)){if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<=0))return bad('bad_request');}
  else if(!['type','other_type','source','start_date','end_date','hours_status','weeks_status'].includes(k)||(v!==null&&(typeof v!=='string'||v.length>2000)))return bad('bad_request');
  after.details[k]=v;
 }
 const d=after.details;
 if(!dateOK(d.start_date||null)||!dateOK(d.end_date||null)||(d.start_date&&d.end_date&&d.end_date<d.start_date))return bad('bad_request');
 if(d.type&&!['mandatory','cooperative','voluntary','other'].includes(d.type))return bad('bad_request');
 return {ok:true,proposal:await newProposal(env,u,'season_edit',{before:c.season,after},c.season.version)};
}
export async function confirmProfileProposal(env,u,p,ch) {
 const payload=JSON.parse(p.payload_json),token=crypto.randomUUID(),at=new Date().toISOString();
 const guard="EXISTS(SELECT 1 FROM pending_actions WHERE id=? AND claim_token=? AND status='applying')";
 let versionCondition,versionArgs=[],mutations=[];
 if(p.kind==='profile_edit'){
  versionCondition='EXISTS(SELECT 1 FROM users WHERE id=? AND profile_version=?)';versionArgs=[u,p.expected_version];
  mutations=[env.DB.prepare(`UPDATE users SET profile_json=?,profile_version=profile_version+1 WHERE id=? AND ${guard}`).bind(JSON.stringify(payload.after),u,p.id,token)];
 }else if(p.kind==='season_edit'){
  versionCondition='EXISTS(SELECT 1 FROM seasons WHERE id=? AND user_id=? AND version=?)';versionArgs=[p.season_id,u,p.expected_version];const a=payload.after;
  mutations=[env.DB.prepare(`UPDATE seasons SET name=?,education_json=?,details_json=?,version=version+1 WHERE id=? AND user_id=? AND ${guard}`).bind(a.name,JSON.stringify(a.education),JSON.stringify(a.details),p.season_id,u,p.id,token)];
 }else if(p.kind==='season_select'){
  versionCondition='EXISTS(SELECT 1 FROM users WHERE id=? AND selection_version=?) AND EXISTS(SELECT 1 FROM seasons WHERE id=? AND user_id=?)';versionArgs=[u,p.expected_version,payload.id,u];
  mutations=[env.DB.prepare(`UPDATE users SET selected_season_id=?,selection_version=selection_version+1 WHERE id=? AND ${guard}`).bind(payload.id,u,p.id,token)];
 }else if(p.kind==='season_create'){
  versionCondition='1=1';
  mutations=[env.DB.prepare(`INSERT INTO seasons(id,user_id,name,education_json,created_at) SELECT ?,?,?,?,? WHERE ${guard}`).bind(payload.id,u,payload.name,JSON.stringify(payload.education),at,p.id,token),
   ...SEED_TASKS.map((t,i)=>env.DB.prepare(`INSERT INTO tasks(id,user_id,season_id,title,detail,sort,truth_level) SELECT ?,?,?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),u,payload.id,t.title,t.detail,i,'USER_REPORTED',p.id,token))];
 }else return bad('bad_request');
 const season=await env.DB.prepare('SELECT name FROM seasons WHERE id=? AND user_id=?').bind(p.season_id,u).first();
 const result={ok:true,season_id:p.season_id,season_name:season.name};
 const results=await env.DB.batch([
 env.DB.prepare(`UPDATE pending_actions SET status='applying',claim_token=? WHERE id=? AND user_id=? AND status='pending' AND expires_at>? AND ${versionCondition}`).bind(token,p.id,u,at,...versionArgs),...mutations,
 env.DB.prepare(`INSERT INTO audit_log(id,user_id,season_id,entity,entity_id,change_json,channel,truth_level,at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),u,p.season_id,p.kind,payload.id||p.season_id,JSON.stringify(payload),ch,'USER_REPORTED',at,p.id,token),
 env.DB.prepare("UPDATE pending_actions SET status='confirmed',result_json=? WHERE id=? AND claim_token=? AND status='applying'").bind(JSON.stringify(result),p.id,token)]);
 if(results[0].meta.changes)return result;
 const latest=await env.DB.prepare('SELECT * FROM pending_actions WHERE id=? AND user_id=?').bind(p.id,u).first();
 return latest.status==='confirmed'?{...JSON.parse(latest.result_json),replayed:true}:bad('conflict');
}
