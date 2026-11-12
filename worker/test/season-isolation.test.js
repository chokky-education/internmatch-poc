import {env} from 'cloudflare:test';
import {it,expect,beforeEach} from 'vitest';
import {context,createSeason,scoped,selectSeason} from '../src/seasons.js';
import {seedUser,getOverview,addApplication,updateApplicationStatus,addReminder,deleteReminder,setTask,addDocument} from '../src/store.js';
const U='isolation-user';
beforeEach(async()=>{
 await env.DB.exec('DELETE FROM users; DELETE FROM seasons; DELETE FROM applications; DELETE FROM tasks; DELETE FROM documents; DELETE FROM reminders; DELETE FROM audit_log;');
 await env.DB.prepare('INSERT INTO users(id,email,created_at) VALUES (?,?,?)').bind(U,'isolation@example.test',new Date().toISOString()).run();
 await seedUser(env,U);
});
it('isolates same-company applications, checklist, documents and reminder keywords',async()=>{
 const a=(await context(env,U)).season.id;
 const b=(await createSeason(env,U,{name:'สหกิจ'},'web')).season.id;
 for(const id of [a,b]) {
  const e=scoped(env,id);
  expect((await addApplication(e,U,{company:'Same Company',status:'Applied',truth_level:'USER_REPORTED'},'web')).ok).toBe(true);
  await addReminder(e,U,{text:'ส่งใบตอบรับ',datetime:'2027-03-01T09:00'},'line');
  await addDocument(e,U,{kind:'transcript',title:id,truth_level:'AI_EXTRACTED'},'web');
 }
 await updateApplicationStatus(scoped(env,a),U,{company:'Same Company',status:'Interview'},'line');
 await setTask(scoped(env,a),U,{task_keyword:'ลงทะเบียน',done:true},'web');
 await deleteReminder(scoped(env,a),U,{text_keyword:'ใบตอบรับ'},'web');
 const x=await getOverview(scoped(env,a),U),y=await getOverview(scoped(env,b),U);
 expect(x.applications[0].status).toBe('Interview');expect(y.applications[0].status).toBe('Applied');
 expect(x.reminders).toHaveLength(0);expect(y.reminders).toHaveLength(1);
 expect(x.my_documents[0].name).toBe(a);expect(y.my_documents[0].name).toBe(b);
 expect(x.university_checklist.find(t=>t.task.includes('ลงทะเบียน')).done).toBe(true);
 expect(y.university_checklist.find(t=>t.task.includes('ลงทะเบียน')).done).toBe(false);
 expect((await updateApplicationStatus(scoped(env,b),U,{id:x.applications[0].id,status:'Closed'},'web')).error).toBe('not_found');
});
it('keeps a captured request on its origin after account selection changes',async()=>{
 const a=(await context(env,U)).season.id,frozen=scoped(env,a);
 const b=(await createSeason(env,U,{name:'ถัดไป'},'web')).season.id;
 await selectSeason(env,U,b,0,'line');
 await addApplication(frozen,U,{company:'Slow request',status:'Saved',truth_level:'USER_REPORTED'},'web');
 expect((await getOverview(env,U)).applications).toHaveLength(0);
 expect((await getOverview(frozen,U)).applications).toHaveLength(1);
 const audit=await env.DB.prepare("SELECT season_id FROM audit_log WHERE entity='application'").first();
 expect(audit.season_id).toBe(a);
});
it('rolls back a data mutation when audit persistence fails',async()=>{
 await env.DB.exec("CREATE TRIGGER fail_test_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
 try {
  await expect(addApplication(env,U,{company:'Rollback',status:'Saved',truth_level:'USER_REPORTED'},'web')).rejects.toThrow();
  expect((await getOverview(env,U)).applications).toHaveLength(0);
 } finally {await env.DB.exec('DROP TRIGGER fail_test_audit;');}
});
it('a rapid repeated application request inserts and audits only once',async()=>{
 const a={company:'บริษัท Concurrent',status:'Saved',truth_level:'USER_REPORTED'};
 const results=await Promise.all([addApplication(env,U,a,'web'),addApplication(env,U,a,'line')]);
 expect(results.filter(r=>r.ok)).toHaveLength(1);
 expect((await getOverview(env,U)).applications).toHaveLength(1);
 expect((await env.DB.prepare("SELECT * FROM audit_log WHERE entity='application'").all()).results).toHaveLength(1);
});
