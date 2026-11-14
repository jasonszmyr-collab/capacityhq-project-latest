'use strict';
const crypto=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID=/^HP-[0-9]{3,6}$/;
const PHASES=new Set(['offered','accepted','quiescing','cancel_requested','cancel_releasing','cancelled','expired','releasing','completed']);
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const uuid=v=>typeof v==='string'&&UUID.test(v);
function createHandoverApp({supabaseUrl,anonKey,newTransfers=false,fetchImpl=fetch}){
 function context(req,res){
  res.set('Cache-Control','no-store');res.set('Pragma','no-cache');
  if(!uuid(req.user?.id)||typeof req.accessToken!=='string'||!req.accessToken.trim())throw {status:401};
  return req.user.id;
 }
 function codeHash(code){
  if(typeof code!=='string'||!/^[0-9a-f]{64}$/i.test(code))throw {status:400};
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
 }
 function view(v){
  if(!v||!uuid(v.invitationId)||typeof v.deviceId!=='string'||!ID.test(v.deviceId)||Number(v.deviceId.slice(3))===0||
    !uuid(v.initiator)||(v.recipient!==null&&!uuid(v.recipient))||
    (v.recipientEmail!==null&&typeof v.recipientEmail!=='string')||!Number.isSafeInteger(v.generation)||v.generation<0||
    !PHASES.has(v.phase)||typeof v.frozen!=='boolean'||typeof v.expiresAt!=='string'||!Number.isFinite(Date.parse(v.expiresAt)))throw {status:503};
  // Never forward arbitrary RPC fields (in particular hash/code/token material).
  return {invitationId:v.invitationId,deviceId:v.deviceId,initiator:v.initiator,recipient:v.recipient,
   recipientEmail:v.recipientEmail,generation:v.generation,phase:v.phase,expiresAt:v.expiresAt,frozen:v.frozen};
 }
 async function rpc(req,name,body){
  if(!supabaseUrl||!anonKey)throw {status:503};
  try{
   const r=await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`,{method:'POST',
    headers:{Authorization:`Bearer ${req.accessToken}`,apikey:anonKey,'Content-Type':'application/json'},
    signal:AbortSignal.timeout(8000),body:JSON.stringify(body)});
   const data=await r.json();
   if(!r.ok)throw {status:({HP400:400,HP401:401,HP403:403,HP404:404,HP409:409,HP410:410,'23505':409})[data?.code]||([401,403].includes(r.status)?r.status:503)};
   return data;
  }catch(e){throw {status:[400,401,403,404,409,410].includes(e?.status)?e.status:503};}
 }
 function failure(res,e){
  const status=[400,401,403,404,409,410].includes(e?.status)?e.status:503;
  const errors={400:'Check the invitation details.',401:'Sign in again to continue.',403:'This account cannot perform that action.',
   404:'The invitation is unavailable to this account.',409:'The transfer changed or the pole needs a single current owner. Refresh before continuing.',410:'The invitation has expired.',503:'Ownership transfer is temporarily unavailable.'};
  return res.status(status).json({success:false,error:errors[status]});
 }
 function action(fn){return async(req,res)=>{try{const user=context(req,res);return await fn(req,res,user)}catch(e){return failure(res,e)}};}
 const capabilities=action(async(req,res)=>{
  const v=await rpc(req,'honorpole_handover_app_capabilities_r1',{});
  if(v?.available!==true||typeof v.canStart!=='boolean')throw {status:503};
  return res.json({available:true,canStart:newTransfers&&v.canStart});
 });
 const list=action(async(req,res,user)=>{
  const data=await rpc(req,'honorpole_handover_app_list_r1',{});
  if(!Array.isArray(data)||data.length>50)throw {status:503};
  const invitations=data.map(view);if(invitations.some(v=>v.initiator!==user&&v.recipient!==user))throw {status:503};
  return res.json({invitations});
 });
 const create=action(async(req,res,user)=>{
  if(!newTransfers)throw {status:503};
  const b=req.body;if(!exact(b,['invitationId','deviceId','code'])||!uuid(b.invitationId)||typeof b.deviceId!=='string'||!ID.test(b.deviceId)||Number(b.deviceId.slice(3))===0)throw {status:400};
  const data=view(await rpc(req,'honorpole_handover_invite_r1',{p_invitation:b.invitationId,p_device:b.deviceId,p_hash:codeHash(b.code)}));
  if(data.initiator!==user||data.invitationId!==b.invitationId||data.deviceId!==b.deviceId)throw {status:503};
  return res.json(data);
 });
 const accept=action(async(req,res,user)=>{
  if(!newTransfers)throw {status:503};
  if(!exact(req.body,['code']))throw {status:400};
  const data=view(await rpc(req,'honorpole_handover_redeem_r1',{p_hash:codeHash(req.body.code)}));
  if(data.recipient!==user)throw {status:503};return res.json(data);
 });
 const confirm=action(async(req,res,user)=>{
  if(!newTransfers)throw {status:503};
  if(!uuid(req.params?.invitationId)||!exact(req.body,['recipientId'])||!uuid(req.body.recipientId))throw {status:400};
  const data=view(await rpc(req,'honorpole_handover_app_confirm_r1',{p_invitation:req.params.invitationId,p_recipient:req.body.recipientId}));
  if(data.initiator!==user||data.invitationId!==req.params.invitationId||data.recipient!==req.body.recipientId)throw {status:503};
  return res.json(data);
 });
 const status=action(async(req,res,user)=>{
  if(!uuid(req.params?.invitationId))throw {status:400};
  const data=view(await rpc(req,'honorpole_handover_app_status_r1',{p_invitation:req.params.invitationId}));
  if(data.invitationId!==req.params.invitationId||(data.initiator!==user&&data.recipient!==user))throw {status:503};return res.json(data);
 });
 const cancel=action(async(req,res,user)=>{
  if(!uuid(req.params?.invitationId)||!exact(req.body,[]))throw {status:400};
  const data=view(await rpc(req,'honorpole_handover_app_cancel_r1',{p_invitation:req.params.invitationId}));
  if(data.invitationId!==req.params.invitationId||(data.initiator!==user&&data.recipient!==user))throw {status:503};return res.json(data);
 });
 return {capabilities,list,create,accept,confirm,status,cancel};
}
module.exports={createHandoverApp};
