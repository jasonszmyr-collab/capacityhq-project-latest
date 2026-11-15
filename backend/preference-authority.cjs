'use strict';
// Candidate core only: user JWT -> one atomic database RPC. No Base44 writes.
const ID=/^HP-[0-9]{3,6}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES=new Set(['AUTO','FULL','HALF','DOWN']);
const STRINGS=['installation_zip','installation_city','installation_county','installation_state','installation_state_code','installation_county_fips','timezone'];
const BOOLEANS=['sun_schedule_enabled','raise_at_sunrise','lower_at_sunset','illuminated_at_night','auto_half_staff','enable_federal_alerts','enable_state_alerts','enable_local_alerts','auto_apply_verified_directives'];
const SETTINGS=[...STRINGS,...BOOLEANS,'latitude','longitude'];
const object=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const exact=(o,keys)=>object(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const integer=n=>Number.isSafeInteger(n)&&n>=0;
function validSettings(s){
 if(!exact(s,SETTINGS)||!STRINGS.every(k=>typeof s[k]==='string'&&s[k].length<=120)||
    !BOOLEANS.every(k=>typeof s[k]==='boolean')||!/^\d{5}$/.test(s.installation_zip)||
    !/^[A-Z]{2}$/.test(s.installation_state_code)||!Number.isFinite(s.latitude)||
    Math.abs(s.latitude)>90||!Number.isFinite(s.longitude)||Math.abs(s.longitude)>180)return false;
 try{new Intl.DateTimeFormat('en-US',{timeZone:s.timezone});return true}catch{return false}
}
function createPreferenceAuthority({supabaseUrl,anonKey,fetchImpl=fetch,automaticMovementEnabled=false}){
 function context(req,res){
  res.set('Cache-Control','no-store');res.set('Pragma','no-cache');
  const d=req.params?.deviceId;
  if(typeof d!=='string'||!ID.test(d)||Number(d.slice(3))===0)throw {status:400};
  if(!UUID.test(req.user?.id||'')||typeof req.accessToken!=='string'||!req.accessToken.trim())throw {status:401};
  return d;
 }
 function view(v,d){
  if(!exact(v,['deviceId','generation','revision','settings','override_mode','testmode'])||v.deviceId!==d||
     !integer(v.generation)||!integer(v.revision)||!MODES.has(v.override_mode)||typeof v.testmode!=='boolean'||
     (v.settings!==null&&!validSettings(v.settings)))throw {status:503};
  return {deviceId:d,generation:v.generation,revision:v.revision,
   settings:v.settings===null?null:Object.fromEntries(SETTINGS.map(k=>[k,v.settings[k]])),override_mode:v.override_mode,testmode:v.testmode};
 }
 async function rpc(req,name,body,d){
  if(!supabaseUrl||!anonKey)throw {status:503};
  try{
   const r=await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`,{
    method:'POST',headers:{Authorization:`Bearer ${req.accessToken}`,apikey:anonKey,'Content-Type':'application/json'},
    signal:AbortSignal.timeout(8000),body:JSON.stringify(body)});
   const value=await r.json();
   if(!r.ok)throw {status:({HP400:400,HP401:401,HP403:403,HP404:403,HP409:409,'23505':409})[value?.code]||([401,403].includes(r.status)?r.status:503)};
   return view(value,d);
  }catch(e){throw {status:[400,401,403,409].includes(e?.status)?e.status:503}}
 }
 const failure=(res,e)=>res.status([400,401,403,409].includes(e?.status)?e.status:503).json({success:false,error:({400:'Check the preference request.',401:'Sign in again.',403:'Current device access is required.',409:'The pole or its settings changed. Refresh before saving.'})[e?.status]||'Device preferences are temporarily unavailable.'});
 const action=fn=>async(req,res)=>{try{return await fn(req,res,context(req,res))}catch(e){return failure(res,e)}};
 return {
  get:action(async(req,res,d)=>res.json({...await rpc(req,'honorpole_preferences_read_r1',{p_device:d},d),automatic_movement_enabled:automaticMovementEnabled===true})),
  write:action(async(req,res,d)=>{
   const b=req.body;
   if(!(exact(b,['operationId','generation','revision','kind','value'])||(exact(b,['device_id','operationId','generation','revision','kind','value'])&&b.device_id===d))||!UUID.test(b.operationId)||
      !integer(b.generation)||!integer(b.revision)||!['settings','override','testmode'].includes(b.kind)||
      (b.kind==='settings'?!validSettings(b.value):b.kind==='override'?!MODES.has(b.value):typeof b.value!=='boolean'))throw {status:400};
   return res.json({...await rpc(req,'honorpole_preferences_write_r1',{
    p_device:d,p_operation:b.operationId,p_generation:b.generation,p_revision:b.revision,p_kind:b.kind,p_value:b.value,
   },d),automatic_movement_enabled:automaticMovementEnabled===true});
  }),
 };
}
module.exports={createPreferenceAuthority,validSettings};
