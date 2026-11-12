// Local UAT entry only; production wrangler.toml continues to use src/index.js.
import {createSession,sessionCookie} from '../../worker/src/auth.js';
import {seedUser} from '../../worker/src/store.js';
import worker from '../../worker/src/index.js';
import {sendDueReminders} from '../../worker/src/reminders.js';
export default {
 async fetch(req,env,ctx){
  const url=new URL(req.url);
  if(url.pathname==='/__uat/login'){
   const user=url.searchParams.get('account')==='b'?'beta':'alpha';
   const token=await createSession(env,user);
   return new Response(null,{status:302,headers:{Location:'/', 'Set-Cookie':sessionCookie(token)}});
  }
  if(url.pathname==='/open.html')return env.ASSETS.fetch(req);
  if(url.pathname==='/__uat/seed'){await seedUser(env,'alpha');return Response.json({ok:true});}
  if(url.pathname==='/__uat/cron')return Response.json(await sendDueReminders(env,new Date(url.searchParams.get('now')||Date.now())));
  return worker.fetch(req,env,ctx);
 }
};
