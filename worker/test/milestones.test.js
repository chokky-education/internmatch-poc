import {env} from 'cloudflare:test';
import {beforeEach,it,expect} from 'vitest';
import {context,createSeason,selectSeason} from '../src/seasons.js';
import {saveMilestone,confirmProposal,listMilestones} from '../src/milestones.js';
const U='milestone-user',future='2099-03-20';
beforeEach(async()=>{await env.DB.exec('DELETE FROM users; DELETE FROM seasons; DELETE FROM milestones; DELETE FROM pending_actions; DELETE FROM reminders; DELETE FROM audit_log;');await env.DB.prepare('INSERT INTO users(id,email,created_at) VALUES (?,?,?)').bind(U,'m@example.test',new Date().toISOString()).run();await context(env,U);});
it('proposes future reminders without writing; confirm is idempotent and origin-bound',async()=>{
 const m=await saveMilestone(env,U,{title:'ใบตอบรับ',date:future},'web');
 expect((await env.DB.prepare('SELECT * FROM reminders').all()).results).toHaveLength(0);
 expect(m.proposal.payload.reminders[0].due_at).toBe('2099-03-13T02:00:00.000Z');
 const other=await createSeason(env,U,{name:'another'},'web');await selectSeason(env,U,other.season.id,0,'line');
 expect((await confirmProposal(env,U,m.proposal.id,'line')).ok).toBe(true);
 expect((await confirmProposal(env,U,m.proposal.id,'web')).replayed).toBe(true);
 const rows=(await env.DB.prepare('SELECT * FROM reminders').all()).results;
 expect(rows).toHaveLength(2);expect(rows[0].season_id).toBe(m.proposal.season_id);
 expect(await listMilestones(env,U)).toHaveLength(0);
});
it('atomically moves unsent reminders and preserves ones already claimed by cron',async()=>{
 const m=await saveMilestone(env,U,{title:'ส่งงาน',date:future},'web');await confirmProposal(env,U,m.proposal.id,'web');
 const edit=await saveMilestone(env,U,{title:'ส่งงาน',date:'2099-03-27',version:1},'web',m.id);
 const rows=(await env.DB.prepare('SELECT * FROM reminders ORDER BY due_at').all()).results;
 await env.DB.prepare('UPDATE reminders SET sent_at=?,version=version+1 WHERE id=?').bind(new Date().toISOString(),rows[0].id).run();
 const result=await confirmProposal(env,U,edit.proposal.id,'line');
 expect(result.sent_preserved).toBe(1);
 expect((await listMilestones(env,U))[0].date).toBe('2099-03-27');
 expect((await env.DB.prepare('SELECT due_at FROM reminders WHERE id=?').bind(rows[1].id).first()).due_at).toBe('2099-03-26T02:00:00.000Z');
 expect((await env.DB.prepare('SELECT due_at FROM reminders WHERE id=?').bind(rows[0].id).first()).due_at).toBe(rows[0].due_at);
});
it('rejects foreign, stale and expired cards, retains drafts without dates',async()=>{
 const m=await saveMilestone(env,U,{title:'ยังไม่รู้วัน',date:null},'web');expect(m.proposal.payload.reminders).toEqual([]);
 expect((await confirmProposal(env,'foreign',m.proposal.id,'line')).error).toBe('not_found');
 await env.DB.prepare('UPDATE pending_actions SET expires_at=? WHERE id=?').bind('2020-01-01',m.proposal.id).run();
 expect((await confirmProposal(env,U,m.proposal.id,'line')).error).toBe('expired');
 const n=await saveMilestone(env,U,{title:'test',date:future},'web');
 await env.DB.prepare('UPDATE milestones SET version=version+1 WHERE id=?').bind(n.id).run();
 expect((await confirmProposal(env,U,n.proposal.id,'line')).error).toBe('conflict');
 expect((await saveMilestone(env,U,{title:'x',date:'2027-02-30'},'web')).error).toBe('bad_request');
});
it('rejects stale unsent reminder versions and rolls back milestone when audit fails',async()=>{
 const m=await saveMilestone(env,U,{title:'test',date:future},'web');await confirmProposal(env,U,m.proposal.id,'web');
 const edit=await saveMilestone(env,U,{title:'new',date:'2099-03-27',version:1},'web',m.id);
 await env.DB.prepare('UPDATE reminders SET version=version+1 WHERE milestone_id=?').bind(m.id).run();
 expect((await confirmProposal(env,U,edit.proposal.id,'web')).error).toBe('conflict');
 expect((await listMilestones(env,U))[0].date).toBe(future);
 const current=await saveMilestone(env,U,{title:'new',date:'2099-03-27',version:1},'web',m.id);
 await env.DB.exec("CREATE TRIGGER fail_milestone_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
 try {await expect(confirmProposal(env,U,current.proposal.id,'web')).rejects.toThrow();expect((await listMilestones(env,U))[0].date).toBe(future);}finally{await env.DB.exec('DROP TRIGGER fail_milestone_audit;');}
});
it('invalidates an edit when an older initial reminder proposal is confirmed later',async()=>{
 const m=await saveMilestone(env,U,{title:'interleave',date:future},'web');
 const edit=await saveMilestone(env,U,{title:'interleave',date:'2099-03-27',version:0},'web',m.id);
 await confirmProposal(env,U,m.proposal.id,'line');
 expect((await confirmProposal(env,U,edit.proposal.id,'web')).error).toBe('conflict');
});
it('protects a later snooze and offers reminders when an unknown date becomes known',async()=>{
 const m=await saveMilestone(env,U,{title:'unknown',date:null},'web');
 const edit=await saveMilestone(env,U,{title:'known',date:future,version:0},'web',m.id);
 expect(edit.proposal.payload.reminders).toHaveLength(2);
 await confirmProposal(env,U,edit.proposal.id,'web');
 const next=await saveMilestone(env,U,{title:'later',date:'2099-03-27',version:1},'web',m.id);
 const rem=await env.DB.prepare('SELECT id FROM reminders WHERE milestone_id=?').bind(m.id).first();
 const {snoozeReminder}=await import('../src/store.js');await snoozeReminder(env,U,rem.id,60,'line');
 expect((await confirmProposal(env,U,next.proposal.id,'web')).error).toBe('conflict');
});
