'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createFactoryRegistry}=require('../factory-registry.cjs');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const id='HP-900001';
function harness(options={}){
 const calls=[];
 const registry=createFactoryRegistry({enabled:options.enabled!==false,serviceKey:'synthetic-service',supabaseUrl:'https://fixture.invalid',fetchImpl:async(url,init)=>{
  assert.equal(url,'https://fixture.invalid/rest/v1/rpc/honorpole_pairing_protocol_r3');calls.push(JSON.parse(init.body));
  return {ok:!options.error,json:async()=>options.error?{code:options.error,message:'private'}:Object.hasOwn(options,'data')?options.data:{deviceId:id,protocol:3}};
 }});
 const run=async(deviceId=id)=>{const res={code:200,status(n){this.code=n;return this},json(d){this.data=d;return this}};await registry.pairingProtocol({deviceId},res);return res;};return {run,calls};
}
test('protocol discovery uses one read-only SQL RPC and returns bounded capability',async()=>{const h=harness(),r=await h.run();assert.equal(r.code,200);assert.deepEqual(r.data,{success:true,deviceId:id,pairingProtocol:3});assert.deepEqual(h.calls,[{p_device_id:id}]);});
for(const data of [null,{}, {deviceId:'HP-900002',protocol:3},{deviceId:id,protocol:2},{deviceId:id,protocol:'3'}])test('malformed capability fails closed '+JSON.stringify(data),async()=>{assert.equal((await harness({data}).run()).code,503);});
for(const [error,status] of [['HP400',400],['HP404',404],['HP409',409],['PGRST202',503]])test('capability safe refusal '+error,async()=>{const r=await harness({error}).run();assert.equal(r.code,status);assert.ok(!JSON.stringify(r.data).includes('private'));});
test('disabled protocol discovery makes no SQL request',async()=>{const h=harness({enabled:false});assert.equal((await h.run()).code,503);assert.equal(h.calls.length,0)});
test('capability requires middleware-derived identity',async()=>{const h=harness();assert.equal((await h.run('invalid')).code,400);assert.equal(h.calls.length,0)});
test('server protects GET capability with the same device-auth middleware',()=>{
 const routes=[],registry={requirePairingAuth(){},requireTelemetryAuth(){},register(){},migrate(){},reissue(){},claim(){},pairingProtocol(){}};
 const app={use(){},get(p,...handlers){routes.push({p,handlers})},post(){}};const express=()=>app;express.json=express.static=()=>()=>{};
 class WS{static OPEN=1;static Server=class{constructor(){this.clients=new Set()}on(){}}}
 const setup={open(){},status(){},poll(){},acknowledge(){}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../server.cjs'),'utf8'),{__filename:'synthetic-server.cjs',console:{log(){},error(){},warn(){}},process:{env:{}},Buffer,URL,AbortSignal,fetch(){throw Error('Network forbidden')},setInterval(){},clearInterval(){},setTimeout(){throw Error('Unexpected timer')},require:n=>{
  if(n==='express')return express;if(n==='cors')return ()=>()=>{};if(n==='http')return {createServer:()=>({listen(){}})};if(n==='ws')return WS;if(n==='crypto')return crypto;if(n==='./factory-registry.cjs')return {createFactoryRegistry:()=>registry};if(n==='./setup-access.cjs')return {createSetupAccess:()=>setup};throw Error(n);
 }});
 const found=routes.filter(x=>x.p==='/api/device/pairing-protocol');assert.equal(found.length,1);assert.deepEqual(found[0].handlers,[registry.requirePairingAuth,registry.pairingProtocol]);
});
