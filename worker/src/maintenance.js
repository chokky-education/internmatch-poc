// Temporary release entry, deployed only during the reviewed D1 upgrade.
// It preserves all secrets/bindings and stops both writers and scheduled sends.
import {json,corsHeaders} from './http.js';
export default {
 async fetch(req,env){
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(env,req)});
  return json({ok:false,error:'maintenance',message:'กำลังปรับปรุงระบบ กรุณาลองใหม่ในอีกสักครู่'},503,env,req,{'Retry-After':'60'});
 },
 async scheduled() {},
};
