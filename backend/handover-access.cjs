'use strict';
// Returns the database's current generation. Callers must preserve it on queued
// records and pass it back at delivery. No process-local cache is authoritative.
function createOperationGates({supabaseUrl,anonKey,serviceKey,fetchImpl=fetch}) {
 async function call(name,body,token,key,deviceId,channel,expected) {
  if(!token || !key)return {status:503};
  if(expected!==undefined && (!Number.isSafeInteger(expected)||expected<0))return {status:409};
  try {
   const response=await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`,{
    method:'POST',signal:AbortSignal.timeout(8000),
    headers:{Authorization:`Bearer ${token}`,apikey:key,'Content-Type':'application/json'},
    body:JSON.stringify(body)
   });
   if(!response.ok){if([401,403].includes(response.status))return {status:response.status};let r;try{r=await response.json()}catch{}
    return {status:({HP400:400,HP401:401,HP403:403,HP404:403,HP409:409})[r?.code]||503};}
   const r=await response.json();
   if(r?.allowed!==true || r.deviceId!==deviceId || r.channel!==channel ||
      !Number.isSafeInteger(r.generation)||r.generation<0 ||
      (expected!==undefined&&r.generation!==expected))return {status:503};
   return {status:200,generation:r.generation};
  }catch{return {status:503};}
 }
 return {
  user({deviceId,token,channel,expectedGeneration}) {
   if(!['command','setup'].includes(channel))return Promise.resolve({status:400});
   return call('honorpole_authorize_operation_r1',{
    p_device:deviceId,p_channel:channel,p_generation:expectedGeneration??null
   },token,anonKey,deviceId,channel,expectedGeneration);
  },
  auto({deviceId,expectedGeneration}) {
   return call('honorpole_authorize_auto_r1',{
    p_device:deviceId,p_generation:expectedGeneration??null
   },serviceKey,serviceKey,deviceId,'auto',expectedGeneration);
  }
 };
}
module.exports={createOperationGates};
