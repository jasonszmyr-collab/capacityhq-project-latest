'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createFactoryRegistry}=require('../factory-registry.cjs');
const secret='A'.repeat(64), deviceId='HP-998001', code='ABCD-EFGH';
const expiresAt='2099-01-01T01:00:00.000Z';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const response=()=>({code:200,data:null,status(c){this.code=c;return this},json(d){this.data=d;return this}});
function harness(options={}) {
 const calls=[];
 const fetchImpl=async(url,init)=>{
  if(!url.startsWith('https://fixture.invalid/'))throw Error('Network blocked');
  calls.push({url,init,body:JSON.parse(init.body)});
  if(url.endsWith('/honorpole_factory_lookup')) {
   if(options.lookupThrow)throw Error('fixture auth outage');
   const rows=options.record===undefined?[{device_id:deviceId,secret_hash:sha(secret),enabled:true}]:options.record;
   return {ok:true,json:async()=>rows};
  }
  assert.ok(url.endsWith('/honorpole_reissue_pairing_code'),'only atomic RPC may issue a code');
  if(options.throwRpc)throw Error('fixture database failure: do not leak');
  if(options.badJson)return {ok:true,json:async()=>{throw Error('bad JSON')}};
  return {ok:!options.rpcError,json:async()=>options.rpcError?{code:options.rpcError,message:'private error do not leak'}:(Object.hasOwn(options,'data')?options.data:{deviceId,expiresAt})};
 };
 const registry=createFactoryRegistry({supabaseUrl:'https://fixture.invalid',serviceKey:options.noKey?'':'fixture-service',anonKey:'fixture-anon',enabled:options.enabled!==false,fetchImpl});
 const request=async(extra={})=>{
  const req={method:'POST',body:{deviceId,pairingCode:code},headers:{'x-device-secret':secret},...extra};
  const res=response();let proceed=false;
  await registry.requirePairingAuth(req,res,()=>{proceed=true});
  if(proceed)await registry.reissue(req,res);
  return res;
 };
 return {registry,calls,request};
}
test('authenticated request uses one atomic RPC with hash only and bounded deadline',async()=>{
 const h=harness(),r=await h.request();assert.equal(r.code,200);
 assert.equal(r.data.deviceId,deviceId);assert.equal(r.data.expiresAt,expiresAt);
 assert.equal(h.calls.length,2);
 const c=h.calls[1];assert.equal(c.init.method,'POST');assert.ok(c.init.signal instanceof AbortSignal);
 assert.deepEqual(c.body,{p_device_id:deviceId,p_pairing_code_hash:sha(code)});
 assert.equal(c.init.headers.Authorization,'Bearer fixture-service');
 assert.ok(!JSON.stringify(r.data).includes(code));assert.ok(!JSON.stringify(c.body).includes(secret));
});
test('lowercase padded code normalizes before hashing',async()=>{const h=harness();const r=await h.request({body:{deviceId,pairingCode:' abcd-efgh '}});assert.equal(r.code,200);assert.equal(h.calls[1].body.p_pairing_code_hash,sha(code));});
for(const value of [undefined,null,42,{},'', 'ABCD', 'ABCI-EFGH','ABCD-EFG0','ABCD-EFGH-XXXX'])test('invalid code rejects without write RPC '+JSON.stringify(value),async()=>{const h=harness();const r=await h.request({body:{deviceId,pairingCode:value}});assert.equal(r.code,400);assert.equal(h.calls.length,1);});
for(const [name,fields,status] of [
 ['missing secret',{headers:{}},401],
 ['wrong secret',{headers:{'x-device-secret':'B'.repeat(64)}},401],
 ['conflicting IDs',{body:{deviceId,device_id:'HP-998002',pairingCode:code}},400],
 ['invalid ID',{body:{deviceId:'invalid',pairingCode:code}},400],
 ['nonstring ID',{body:{deviceId:42,pairingCode:code}},400]
])test('authentication boundary '+name,async()=>{const h=harness();const r=await h.request(fields);assert.equal(r.code,status);assert.equal(h.calls.filter(c=>c.url.endsWith('/honorpole_reissue_pairing_code')).length,0);});
for(const [name,record] of [['revoked',[{device_id:deviceId,secret_hash:sha(secret),enabled:false}]],['wrong-device record',[{device_id:'HP-998002',secret_hash:sha(secret),enabled:true}]],['malformed record',{}]])test('registry boundary '+name,async()=>{const h=harness({record});const r=await h.request();assert.ok([401,503].includes(r.code));assert.equal(h.calls.length,1);});
test('credential lookup outage fails closed',async()=>{const h=harness({lookupThrow:true});assert.equal((await h.request()).code,503);assert.equal(h.calls.length,1);});
test('missing service credential fails without network',async()=>{const h=harness({noKey:true});assert.equal((await h.request()).code,503);assert.equal(h.calls.length,0);});
test('disabled registry rejects direct reissue without RPC',async()=>{const h=harness({enabled:false}),r=response();await h.registry.reissue({deviceId,body:{pairingCode:code}},r);assert.equal(r.code,503);assert.equal(h.calls.length,0);});
for(const [error,status] of [['HP400',400],['HP401',401],['HP404',404],['HP409',409],['HP410',410],['23505',503],['PGRST202',503],['unexpected',503]])test('database refusal maps safely '+error,async()=>{const h=harness({rpcError:error});const r=await h.request();assert.equal(r.code,status);assert.equal(r.data.success,false);assert.ok(!JSON.stringify(r.data).includes('private error'));assert.equal(h.calls.length,2);});
for(const data of [null,[],{}, {deviceId:'HP-998002',expiresAt},{deviceId,expiresAt:'invalid'},{deviceId,expiresAt:42}])test('malformed success response fails closed '+JSON.stringify(data),async()=>{const h=harness({data});assert.equal((await h.request()).code,503);assert.equal(h.calls.length,2);});
for(const opts of [{throwRpc:true},{badJson:true}])test('transport/JSON failure returns unavailable without fallback '+JSON.stringify(opts),async()=>{const h=harness(opts);const r=await h.request();assert.equal(r.code,503);assert.ok(!JSON.stringify(r.data).includes('do not leak'));assert.equal(h.calls.length,2);});
test('active retry returns database expiry without extending it in JavaScript',async()=>{const h=harness();const a=await h.request(),b=await h.request();assert.equal(a.data.expiresAt,b.data.expiresAt);assert.equal(h.calls.length,3);for(const c of h.calls.slice(1))assert.deepEqual(Object.keys(c.body).sort(),['p_device_id','p_pairing_code_hash']);});
test('reissue requires middleware-derived ID; cannot use body alone',async()=>{const h=harness(),r=response();await h.registry.reissue({body:{deviceId,pairingCode:code}},r);assert.equal(r.code,400);assert.equal(h.calls.length,0);});
test('claim RPC remains user-authenticated and membership refusal remains 409',async()=>{
 const calls=[];const registry=createFactoryRegistry({supabaseUrl:'https://fixture.invalid',serviceKey:'service',anonKey:'anon',enabled:true,fetchImpl:async(url,init)=>{calls.push({url,init});return {ok:false,json:async()=>({code:'HP409'})}}});
 const r=response();await registry.claim({body:{deviceId,pairingCode:code},accessToken:'fixture-user-token'},r,()=>{throw Error('legacy fallback forbidden')});
 assert.equal(r.code,409);assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/honorpole_claim_device'));assert.equal(calls[0].init.headers.Authorization,'Bearer fixture-user-token');
});
test('actual server wires the code route once behind device authentication',()=>{
 const routes=[],registry={requirePairingAuth(){},requireTelemetryAuth(){},register(){},migrate(){},reissue(){},claim(){}};
 const app={use(){},get(){},post(p,...handlers){routes.push({p,handlers})}};
 const express=()=>app;express.json=express.static=()=>()=>{};
 class WS {static OPEN=1;static Server=class{constructor(){this.clients=new Set()}on(){}}}
 const setup={open(){},status(){},poll(){},acknowledge(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8'),{__filename:'fixture-server.cjs',console:{log(){},error(){},warn(){}},process:{env:{}},Buffer,URL,AbortSignal,fetch(){throw Error('Network forbidden')},setInterval(){},clearInterval(){},setTimeout(){throw Error('Unexpected timer')},require:n=>{
  if(n==='express')return express;if(n==='cors')return ()=>()=>{};if(n==='http')return {createServer:()=>({listen(){}})};if(n==='ws')return WS;if(n==='crypto')return crypto;
  if(n==='./factory-registry.cjs')return {createFactoryRegistry:()=>registry};if(n==='./setup-access.cjs')return {createSetupAccess:()=>setup};throw Error('Blocked module '+n);
 }});
 const matching=routes.filter(r=>r.p==='/api/device/pairing-code');assert.equal(matching.length,1);assert.equal(matching[0].handlers.length,2);assert.equal(matching[0].handlers[0],registry.requirePairingAuth);assert.equal(matching[0].handlers[1],registry.reissue);
});
