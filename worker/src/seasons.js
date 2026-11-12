// Account-owned context. Capture once at request entry; never mutate the shared env.
import { SEED_TASKS } from './seed.js';
const iso = () => new Date().toISOString();
const educationKeys = ['university', 'faculty', 'major', 'study_year'];
export const educationOf = p => Object.fromEntries(educationKeys.map(k => [k, p[k] || null]));
export class ContextError extends Error { constructor(code) { super(code); this.code = code; } }
export function auditStatement(env, userId, seasonId, entity, entityId, change, channel, conditional = false) {
  return env.DB.prepare(`INSERT INTO audit_log(id,user_id,season_id,entity,entity_id,change_json,channel,truth_level,at) SELECT ?,?,?,?,?,?,?,?,?${conditional ? ' WHERE changes()>0' : ''}`)
    .bind(crypto.randomUUID(),userId,seasonId,entity,entityId,JSON.stringify(change),channel,'USER_REPORTED',iso());
}
export async function context(env, userId) {
  let u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(userId).first();
  if (!u) throw new ContextError('not_found');
  if (!u.selected_season_id) {
    const id = 'initial-' + userId;
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO seasons(id,user_id,name,education_json,created_at) VALUES (?,?,?,?,?)").bind(id,userId,'ฤดูฝึกงานของฉัน',JSON.stringify(educationOf(JSON.parse(u.profile_json))),iso()),
      env.DB.prepare('UPDATE users SET selected_season_id=? WHERE id=? AND selected_season_id IS NULL').bind(id,userId),
    ]);
    u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(userId).first();
  }
  const id = env.SEASON_ID || u.selected_season_id;
  const season = await env.DB.prepare('SELECT * FROM seasons WHERE id=? AND user_id=?').bind(id,userId).first();
  if (!season) throw new ContextError('not_found');
  return { user:u, season: decode(season), profile: JSON.parse(u.profile_json), selection_version:u.selection_version };
}
export const scoped = (env,id) => ({ ...env, SEASON_ID:id });
function decode(s) { const {education_json,details_json,...r}=s; return {...r,education:JSON.parse(education_json),details:JSON.parse(details_json)}; }
export async function listSeasons(env,userId) {
  await context(env,userId);
  return (await env.DB.prepare('SELECT * FROM seasons WHERE user_id=? ORDER BY created_at,id').bind(userId).all()).results.map(decode);
}
export async function createSeason(env,userId,{name},channel) {
  if (typeof name !== 'string' || !name.trim() || name.length>160) return {ok:false,error:'bad_request'};
  const c=await context(env,userId),id=crypto.randomUUID(),now=iso();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO seasons(id,user_id,name,education_json,created_at) VALUES (?,?,?,?,?)').bind(id,userId,name.trim(),JSON.stringify(educationOf(c.profile)),now),
    ...SEED_TASKS.map((t,i)=>env.DB.prepare('INSERT INTO tasks(id,user_id,season_id,title,detail,sort,truth_level) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),userId,id,t.title,t.detail,i,'USER_REPORTED')),
    auditStatement(env,userId,id,'season',id,{op:'create',name:name.trim()},channel),
  ]);
  return {ok:true,season:decode(await env.DB.prepare('SELECT * FROM seasons WHERE id=?').bind(id).first())};
}
export async function selectSeason(env,userId,id,expected,channel) {
  await context(env,userId);
  if (!(await env.DB.prepare('SELECT id FROM seasons WHERE id=? AND user_id=?').bind(id,userId).first())) return {ok:false,error:'not_found'};
  const r=await env.DB.batch([
    env.DB.prepare('UPDATE users SET selected_season_id=?,selection_version=selection_version+1 WHERE id=? AND selection_version=?').bind(id,userId,expected),
    auditStatement(env,userId,id,'selection',id,{op:'select'},channel,true),
  ]);
  return r[0].meta.changes ? {ok:true} : {ok:false,error:'conflict'};
}
export async function saveProfile(env,userId,patch,expected,channel) {
  const c=await context(env,userId),next={...c.profile};
  for (const k of ['preferred_name',...educationKeys]) if (k in patch) {
    if (patch[k]!==null && (typeof patch[k]!=='string' || patch[k].length>200)) return {ok:false,error:'bad_request'};
    next[k]=patch[k]?.trim() || null;
  }
  if ('career_interests' in patch) {
    if (!Array.isArray(patch.career_interests) || patch.career_interests.length>30 || patch.career_interests.some(x=>typeof x!=='string'||x.length>100)) return {ok:false,error:'bad_request'};
    next.career_interests=[...new Set(patch.career_interests.map(x=>x.trim()).filter(Boolean))];
  }
  const r=await env.DB.batch([
    env.DB.prepare('UPDATE users SET profile_json=?,profile_version=profile_version+1 WHERE id=? AND profile_version=?').bind(JSON.stringify(next),userId,expected),
    auditStatement(env,userId,null,'profile',userId,{before:c.profile,after:next},channel,true),
  ]);
  return r[0].meta.changes ? {ok:true,profile:next,version:expected+1} : {ok:false,error:'conflict'};
}

export async function saveSeason(env,userId,id,patch,expected,channel) {
  const c=await context(scoped(env,id),userId),s=c.season;
  const name='name' in patch ? patch.name : s.name;
  if (typeof name!=='string'||!name.trim()||name.length>160) return {ok:false,error:'bad_request'};
  const education={...s.education},details={...s.details};
  if (patch.education) for(const k of educationKeys) if(k in patch.education) {
    const v=patch.education[k];
    if(v!==null&&(typeof v!=='string'||v.length>200)) return {ok:false,error:'bad_request'};
    education[k]=v?.trim()||null;
  }
  if(patch.details) {
    const p=patch.details;
    for(const k of ['type','other_type','source','start_date','end_date','hours_status','weeks_status']) if(k in p) {
      if(p[k]!==null&&(typeof p[k]!=='string'||p[k].length>2000)) return {ok:false,error:'bad_request'};
      details[k]=p[k]||null;
    }
    if(details.type&&!['mandatory','cooperative','voluntary','other'].includes(details.type)) return {ok:false,error:'bad_request'};
    for(const k of ['hours_status','weeks_status']) if(details[k]&&!['unknown','known','not_applicable'].includes(details[k])) return {ok:false,error:'bad_request'};
    for(const k of ['hours','weeks']) if(k in p) {
      if(p[k]!==null&&(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<=0)) return {ok:false,error:'bad_request'};
      details[k]=p[k];
    }
    for(const k of ['hours','weeks'])if(details[k+'_status']==='known'&&!details[k])return {ok:false,error:'bad_request'};
    if(details.type==='other'&&!details.other_type?.trim())return {ok:false,error:'bad_request'};
    for(const k of ['start_date','end_date']) if(details[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(details[k])||!Number.isFinite(Date.parse(details[k]))||new Date(details[k]).toISOString().slice(0,10)!==details[k])) return {ok:false,error:'bad_request'};
    if(details.start_date&&details.end_date&&details.end_date<details.start_date) return {ok:false,error:'bad_request'};
  }
  const r=await env.DB.batch([
    env.DB.prepare('UPDATE seasons SET name=?,education_json=?,details_json=?,version=version+1 WHERE id=? AND user_id=? AND version=?').bind(name.trim(),JSON.stringify(education),JSON.stringify(details),id,userId,expected),
    auditStatement(env,userId,id,'season',id,{before:s,after:{name:name.trim(),education,details}},channel,true),
  ]);
  return r[0].meta.changes ? {ok:true,season:(await context(scoped(env,id),userId)).season} : {ok:false,error:'conflict'};
}
