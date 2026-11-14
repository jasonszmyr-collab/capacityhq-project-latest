'use strict';
const crypto=require('node:crypto');
const {message,signDirective,verifyAcknowledgement}=require('./handover-protocol.cjs');
const ID=/^HP-[0-9]{3,6}$/,HEX=/^[0-9A-F]{32}$/,KEY=/^[0-9A-F]{64}$/;
const exact=(o,keys)=>o && !Array.isArray(o) && typeof o==='object' && Object.keys(o).length===keys.length && keys.every(k=>Object.hasOwn(o,k));
const exactHex=(s,re,n)=>typeof s==='string' && s.length===n && re.test(s);
function createHandoverDelivery({supabaseUrl,serviceKey,fetchImpl=fetch}){
  async function rpc(name,body){
    if(!serviceKey)throw {status:503};
    try{
      const r=await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`,{
        method:'POST',headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,'Content-Type':'application/json'},
        signal:AbortSignal.timeout(8000),body:JSON.stringify(body)});
      const data=await r.json();
      if(!r.ok)throw {status:({HP400:400,HP401:401,HP404:401,HP409:409})[data?.code] || 503};
      return data;
    }catch(e){throw {status:[400,401,409].includes(e?.status)?e.status:503};}
  }
  function context(req,res){
    res.set('Cache-Control','no-store');res.set('Pragma','no-cache');
    const key=req.headers?.['x-device-secret'],id=req.body?.deviceId;
    if(!exactHex(key,KEY,64) || typeof id!=='string' || !ID.test(id) || id.trim()!==id || Number(id.slice(3))===0)
      throw {status:401};
    return {key,id,hash:crypto.createHash('sha256').update(key).digest('hex')};
  }
  function error(res,e){return res.status([400,401,409].includes(e?.status)?e.status:503).json({success:false,error:'Handover transport unavailable or refused'});}
  async function poll(req,res){
    try{
      const {key,id,hash}=context(req,res),b=req.body;
      if(!exact(b,['deviceId','boot','ticket','deadline']) || !exactHex(b.boot,HEX,32) || !exactHex(b.ticket,HEX,32) ||
          !Number.isSafeInteger(b.deadline) || b.deadline<0 || b.deadline>0xffffffff)throw {status:400};
      // This transaction freshly checks enrolled credentials, frozen request and
      // generation under locks, then durably records the unsigned directive.
      const data=await rpc('honorpole_handover_issue_directive_r1',{
        p_device:id,p_secret_hash:hash,p_boot:b.boot,p_ticket:b.ticket,p_deadline:b.deadline});
      if(data?.deviceId!==id || !Object.hasOwn(data,'directive'))throw {status:503};
      if(data.directive===null)return res.status(204).end();
      const p=data.directive;
      if(p.deviceId!==id || p.boot!==b.boot || p.ticket!==b.ticket || p.deadline!==b.deadline || !['HOLD','RELEASE'].includes(p.action))throw {status:503};
      return res.status(200).json(signDirective(p,key));
    }catch(e){return error(res,e);}
  }
  async function acknowledge(req,res){
    try{
      const {key,id,hash}=context(req,res),a=req.body;
      if(!exact(a,['deviceId','boot','ticket','requestId','action','generation','nextGeneration','deadline','state','signature']) ||
          !['HOLD','RELEASE'].includes(a.action) || a.state!==(a.action==='HOLD'?'QUIESCED':'RELEASED') || !exactHex(a.signature,KEY,64))throw {status:400};
      try{message(a,true);}catch{throw {status:400};}
      const found=await rpc('honorpole_handover_get_directive_r1',{
        p_device:id,p_secret_hash:hash,p_boot:a.boot,p_ticket:a.ticket});
      if(found?.deviceId!==id || !found.directive)throw {status:503};
      if(!verifyAcknowledgement(a,found.directive,key))throw {status:409};
      // Reauthenticates current factory hash and repeats exact ledger correlation
      // inside the recording transaction, closing the read/verify/write race.
      const saved=await rpc('honorpole_handover_advance_ack_r1',{
        p_device:id,p_secret_hash:hash,p_ack:a});
      if(saved?.accepted!==true || saved.deviceId!==id || saved.boot!==a.boot ||
          saved.ticket!==a.ticket || saved.signature!==a.signature)throw {status:503};
      return res.status(200).json({success:true,accepted:true,deviceId:id,boot:a.boot,ticket:a.ticket,signature:a.signature});
    }catch(e){return error(res,e);}
  }
  return {poll,acknowledge};
}
module.exports={createHandoverDelivery};
