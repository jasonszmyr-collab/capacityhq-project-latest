'use strict';
const {validSettings}=require('./preference-authority.cjs');
const integer=n=>Number.isSafeInteger(n)&&n>=0;
function createPreferenceAuto({supabaseUrl,serviceKey,fetchImpl=fetch}){
 async function call(name,body){
  if(!supabaseUrl||!serviceKey)return {status:503};
  try{const r=await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`,{method:'POST',headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),body:JSON.stringify(body)});
   const v=await r.json();if(!r.ok)return {status:({HP400:400,HP403:403,HP404:403,HP409:409})[v?.code]||503};return {status:200,value:v};
  }catch{return {status:503}}
 }
 return {
  async devices(){const r=await call('honorpole_preferences_auto_devices_r1',{});if(r.status!==200)return r;
   if(!Array.isArray(r.value?.deviceIds)||r.value.deviceIds.some(d=>typeof d!=='string'||!/^HP-[0-9]{3,6}$/.test(d)))return {status:503};
   return {status:200,value:{deviceIds:r.value.deviceIds}};
  },
  async read(deviceId){
   const r=await call('honorpole_preferences_auto_read_r1',{p_device:deviceId});if(r.status!==200)return r;
   const v=r.value;if(v?.deviceId!==deviceId||!integer(v.generation)||!integer(v.revision)||v.revision<1||!validSettings(v.settings)||!['AUTO','FULL','HALF','DOWN'].includes(v.override_mode)||typeof v.testmode!=='boolean')return {status:503};
   return {status:200,value:{deviceId,generation:v.generation,revision:v.revision,settings:v.settings,override_mode:v.override_mode,testmode:v.testmode}};
  },
  async check(deviceId,snapshot){
   if(!snapshot||!integer(snapshot.generation)||!integer(snapshot.revision)||snapshot.revision<1)return {status:409};
   const r=await call('honorpole_preferences_auto_check_r1',{p_device:deviceId,p_generation:snapshot.generation,p_revision:snapshot.revision});if(r.status!==200)return r;
   if(r.value?.allowed!==true||r.value.deviceId!==deviceId||r.value.generation!==snapshot.generation||r.value.revision!==snapshot.revision)return {status:503};
   return {status:200,generation:snapshot.generation,revision:snapshot.revision};
  },
 };
}
module.exports={createPreferenceAuto};
