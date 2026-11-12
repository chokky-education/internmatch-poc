import {it,expect} from 'vitest';
import maintenance from '../src/maintenance.js';
it('rejects all traffic before touching data/providers and pauses cron',async()=>{
 for(const [path,method] of [['/api/state','GET'],['/api/auth/request','POST'],['/line/webhook','POST']]){
  const r=await maintenance.fetch(new Request('https://api.test'+path,{method}),{});
  expect(r.status).toBe(503);expect(r.headers.get('Retry-After')).toBe('60');expect((await r.json()).error).toBe('maintenance');
 }
 await expect(maintenance.scheduled()).resolves.toBeUndefined();
});
