// Local UAT entry only; production wrangler.toml continues to use src/index.js.
import {seedUser} from '../../worker/src/store.js';
import worker from '../../worker/src/index.js';
import {sendDueReminders} from '../../worker/src/reminders.js';
export default {
 async fetch(req,env,ctx){
  const url=new URL(req.url);
  if(url.pathname==='/__uat/seed'){await seedUser(env,'alpha');return Response.json({ok:true});}
  if(url.pathname==='/__uat/cron')return Response.json(await sendDueReminders(env,new Date(url.searchParams.get('now')||Date.now())));
  return worker.fetch(req,env,ctx);
 }
};
