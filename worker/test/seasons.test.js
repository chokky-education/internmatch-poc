import { env } from 'cloudflare:test';
import { beforeEach,it,expect } from 'vitest';
import { context,createSeason,listSeasons,saveProfile,selectSeason,scoped,saveSeason } from '../src/seasons.js';
beforeEach(async()=>{
 await env.DB.exec('DELETE FROM users; DELETE FROM seasons; DELETE FROM tasks; DELETE FROM audit_log;');
 await env.DB.prepare('INSERT INTO users(id,email,created_at) VALUES (?,?,?)').bind('s-user','season@example.com',new Date().toISOString()).run();
});
it('starts with blank optional profile and stable account context',async()=>{
 const a=await context(env,'s-user'),b=await context(env,'s-user');
 expect(a.season.id).toBe(b.season.id); expect(a.profile).toEqual({});
 expect((await listSeasons(env,'s-user')).length).toBe(1);
});
it('snapshots education without rewriting past seasons',async()=>{
 await saveProfile(env,'s-user',{study_year:'3',university:'มหาวิทยาลัยของฉัน'},0,'web');
 const r=await createSeason(env,'s-user',{name:'ภาคฤดูร้อน'},'line');
 await saveProfile(env,'s-user',{study_year:'4'},1,'web');
 expect((await context(scoped(env,r.season.id),'s-user')).season.education.study_year).toBe('3');
 expect((await context(env,'s-user')).profile.study_year).toBe('4');
});
it('rejects stale updates and foreign seasons; shares selection',async()=>{
 const r=await createSeason(env,'s-user',{name:'สหกิจ'},'web');
 expect(await selectSeason(env,'s-user',r.season.id,0,'line')).toEqual({ok:true});
 expect((await context(env,'s-user')).season.id).toBe(r.season.id);
 expect(await selectSeason(env,'s-user',r.season.id,0,'web')).toEqual({ok:false,error:'conflict'});
 expect(await selectSeason(env,'s-user','foreign',1,'web')).toEqual({ok:false,error:'not_found'});
 await saveProfile(env,'s-user',{preferred_name:'โชค'},0,'web');
 expect(await saveProfile(env,'s-user',{preferred_name:'stale'},0,'line')).toEqual({ok:false,error:'conflict'});
 expect((await context(env,'s-user')).profile.preferred_name).toBe('โชค');
 expect((await env.DB.prepare("SELECT * FROM audit_log WHERE entity='profile'").all()).results).toHaveLength(1);
});

it('edits only explicit season and rejects invented or invalid duration/date values',async()=>{
 const c=await context(env,'s-user');
 const r=await createSeason(env,'s-user',{name:'อีกฤดู'},'web');
 expect((await saveSeason(env,'s-user',c.season.id,{education:{study_year:'2'},details:{hours:270,hours_status:'known',weeks_status:'unknown'}},0,'web')).ok).toBe(true);
 expect((await context(scoped(env,r.season.id),'s-user')).season.education.study_year).toBeNull();
 expect((await saveSeason(env,'s-user',c.season.id,{details:{hours:0}},1,'line')).error).toBe('bad_request');
 expect((await saveSeason(env,'s-user',c.season.id,{details:{start_date:'2027-02-30'}},1,'line')).error).toBe('bad_request');
 expect((await saveSeason(env,'s-user',c.season.id,{name:'stale'},0,'line')).error).toBe('conflict');
});
