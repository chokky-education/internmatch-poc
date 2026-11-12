import {env} from 'cloudflare:test';
import {beforeEach,it,expect} from 'vitest';
import {context,createSeason,selectSeason} from '../src/seasons.js';
import {proposeProfile,proposeSeason} from '../src/profile-proposals.js';
import {confirmProposal} from '../src/milestones.js';
import {runCardAction} from '../src/actions.js';
const U='proposal-user';
beforeEach(async()=>{await env.DB.exec('DELETE FROM users; DELETE FROM seasons; DELETE FROM pending_actions; DELETE FROM audit_log; DELETE FROM messages;');await env.DB.prepare('INSERT INTO users(id,email,created_at) VALUES (?,?,?)').bind(U,'proposals@example.test',new Date().toISOString()).run();await context(env,U);});
it('requires confirmation and confirms only once across channels',async()=>{
 const p=await proposeProfile(env,U,{preferred_name:'ทดสอบ',study_year:'3'});
 expect((await context(env,U)).profile).toEqual({});
 const results=await Promise.all([confirmProposal(env,U,p.proposal.id,'web'),confirmProposal(env,U,p.proposal.id,'line')]);
 expect(results.every(r=>r.ok)).toBe(true);
 expect((await context(env,U)).user.profile_version).toBe(1);
 expect((await env.DB.prepare("SELECT * FROM audit_log WHERE entity='profile_edit'").all()).results).toHaveLength(1);
});
it('expired, stale and foreign proposals never overwrite data',async()=>{
 const one=await proposeProfile(env,U,{study_year:'3'}),two=await proposeProfile(env,U,{study_year:'4'});
 await confirmProposal(env,U,one.proposal.id,'line');
 expect((await confirmProposal(env,U,two.proposal.id,'web')).error).toBe('conflict');
 expect((await confirmProposal(env,'other',two.proposal.id,'web')).error).toBe('not_found');
 await env.DB.prepare("UPDATE pending_actions SET expires_at='2000-01-01' WHERE id=?").bind(two.proposal.id).run();
 expect((await confirmProposal(env,U,two.proposal.id,'web')).error).toBe('expired');
 expect((await context(env,U)).profile.study_year).toBe('3');
});
it('season edit stays on the card target after selection switches',async()=>{
 const origin=(await context(env,U)).season.id;
 const p=await proposeSeason(env,U,{name:'แก้ฤดูเดิม'});
 const other=await createSeason(env,U,{name:'ใหม่'},'web');await selectSeason(env,U,other.season.id,0,'web');
 expect((await runCardAction(env,U,'line','proposal_confirm:'+p.proposal.id)).ok).toBe(true);
 expect((await context(env,U)).season.name).toBe('ใหม่');
 expect((await env.DB.prepare('SELECT name FROM seasons WHERE id=?').bind(origin).first()).name).toBe('แก้ฤดูเดิม');
});
