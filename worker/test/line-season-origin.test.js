import {env} from 'cloudflare:test';
import {it,expect,vi} from 'vitest';
import {context,createSeason,selectSeason} from '../src/seasons.js';
import {handleEvent} from '../src/line.js';
it('captures season before awaiting LINE image download',async()=>{
 const u='line-slow';await env.DB.prepare('INSERT INTO users(id,email,line_user_id,created_at) VALUES (?,?,?,?)').bind(u,'slow@example.test','line-slow-id',new Date().toISOString()).run();
 const origin=(await context(env,u)).season.id,other=(await createSeason(env,u,{name:'other'},'web')).season.id;
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(url)=>{
  if(String(url).includes('api-data.line.me')){entered();await gate;return new Response(new Uint8Array([1]),{headers:{'Content-Type':'image/png'}});}
  if(String(url).includes('paxalabs'))return Response.json({fields:{company:'Slow OCR',role:'Intern'}});
  return Response.json({});
 });
 try{
  const request=handleEvent(env,{type:'message',source:{userId:'line-slow-id'},replyToken:'reply',message:{type:'image',id:'image-slow'}});
  await started;await selectSeason(env,u,other,0,'web');release();await request;
  expect((await env.DB.prepare('SELECT season_id FROM extractions WHERE user_id=?').bind(u).first()).season_id).toBe(origin);
 }finally{release();spy.mockRestore();}
});
