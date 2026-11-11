'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
// Executes unchanged source. No real sockets, timers, environment or network.
function harness(options={}) {
 const routes=new Map(), intervals=[], calls=[];
 const app={use(){},get(p,...h){routes.set('GET '+p,h)},post(p,...h){routes.set('POST '+p,h)}};
 const express=()=>app; express.json=express.static=()=>()=>{};
 class WS {static OPEN=1; static Server=class{constructor(config){this.config=config;this.clients=new Set();this.events={}} on(k,f){this.events[k]=f}}}
 let now=1791650000000;
 class Clock extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
 const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fake-anon',SUPABASE_SERVICE_ROLE_KEY:'fake-service',AUTO_CONTROL_SECRET:'fake-auto',DEVICE_REGISTRY_ENABLED:'true',DEVICE_PAIRING_SECRETS:JSON.stringify({'HP-004':'legacy-four'}),...options.env};
 const fakeFetch=async(url,init={})=>{calls.push({url,init});if(!url.startsWith('https://fixture.invalid/'))throw Error('Network blocked');
  if(options.fetch)return options.fetch(url,init);
  let data;
  if(url.endsWith('/auth/v1/user'))data={id:'user-fixture'};
  else if(url.includes('/rest/v1/device_users?'))data=options.denied?[]:[{device_id:'HP-004',user_id:'user-fixture',role:Object.hasOwn(options,'role')?options.role:'admin'}];
  else if(url.endsWith('/rpc/honorpole_factory_lookup'))data=[];
  else throw Error('Unconfigured mock request: '+url);
  return {ok:true,json:async()=>data};};
 const common={console:{log(){},error(){},warn(){},table(){}},fetch:fakeFetch,Date:Clock,URL,AbortSignal,Buffer,setInterval:(f,ms)=>{intervals.push({f,ms});return intervals.length},clearInterval(){},setTimeout(){throw Error('Unexpected timer')},process:{env}};
 const registry={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../backend/factory-registry.cjs'),'utf8'),{...common,module:registry,require:n=>{if(n==='node:crypto')return crypto;throw Error('Blocked require '+n)}});
 const setupModule={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../backend/setup-access.cjs'),'utf8'),{...common,module:setupModule,require:n=>{assert.equal(n,'node:crypto');return crypto}});
 const context=vm.createContext({...common,__filename:'isolated-server.cjs',require:n=>{
  if(n==='express')return express;if(n==='cors')return ()=>()=>{};
  if(n==='http')return {createServer:()=>({listen(){}})};if(n==='ws')return WS;if(n==='crypto')return crypto;
  if(n==='./setup-access.cjs')return setupModule.exports;
  if(n==='./factory-registry.cjs')return registry.exports;throw Error('Blocked require '+n);
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../backend/server.cjs'),'utf8')+'\nthis.inspect={states,commandsByDevice,wss,getDeviceState};',context);
 async function request(method,route,fields={}){
  const h=routes.get(method+' '+route);assert.ok(h,'Route registered');
  const req={method,headers:{},body:{},query:{},params:{},...fields};
  const res={code:200,data:undefined,status(c){this.code=c;return this},json(d){this.data=d;return this}};
  for(const handler of h){let proceed=false;await handler(req,res,()=>{proceed=true});if(!proceed)break}
  return res;
 }
 return {request,calls,...context.inspect,tick(ms){now+=ms;for(const x of intervals)if(x.ms===5000)x.f()}};
}
const auth={authorization:'Bearer fixture-token'};
function fixture({rpcCode,throwRpc=false,result,revoked=false}={}){
 const calls=[];
 const h=harness({fetch:async(url,init)=>{
  if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'user-fixture'})};
  if(url.includes('/rest/v1/device_users?'))return {ok:true,json:async()=>[{device_id:'HP-004',user_id:'user-fixture',role:'admin'}]};
  assert.ok(url.endsWith('/rpc/honorpole_create_share_r1'),'No direct table insert');calls.push({url,init});
  if(throwRpc)throw Error('internal service credential must not leak');
  return {ok:!(rpcCode||revoked),json:async()=>rpcCode||revoked?{code:rpcCode||'HP403',message:'private database details'}:result===undefined?{deviceId:'HP-004',expiresAt:'2030-01-01T00:00:00Z'}:result};
 }});
 return {calls,send:()=>h.request('POST','/api/device/:deviceId/share',{headers:auth,params:{deviceId:'HP-004'}})};
}
test('share uses authenticated RPC, hashes code and uses database expiry',async()=>{
 const h=fixture(),r=await h.send();assert.equal(r.code,200);assert.match(r.data.code,/^[A-F0-9]{6}(?:-[A-F0-9]{6}){2}$/);
 const {init}=h.calls[0];assert.equal(init.headers.Authorization,'Bearer fixture-token');assert.equal(init.headers.apikey,'fake-anon');
 const data=JSON.parse(init.body);assert.deepEqual(data,{p_device_id:'HP-004',p_token_hash:crypto.createHash('sha256').update(r.data.code).digest('hex')});
 assert.equal(r.data.expiresAt,'2030-01-01T00:00:00Z');assert.ok(init.signal);assert.doesNotMatch(JSON.stringify(r.data),/fake-service|fixture-token/);
});
test('database revocation overrides stale HTTP membership',async()=>{
 const r=await fixture({revoked:true}).send();assert.equal(r.code,403);assert.equal(r.data.code,undefined);
});
for(const [code,status] of [['HP400',400],['HP401',401],['HP403',403],['HP409',409],['XX000',503]])test('share RPC maps '+code,async()=>{
 const r=await fixture({rpcCode:code}).send();assert.equal(r.code,status);assert.doesNotMatch(JSON.stringify(r.data),/private database details/);
});
for(const result of [{},null,{deviceId:'HP-003',expiresAt:'2030-01-01'},{deviceId:'HP-004',expiresAt:'bad'},{deviceId:'HP-004',expiresAt:123}])test('malformed share result withheld '+JSON.stringify(result),async()=>{
 const h=fixture({result});const r=await h.send();assert.equal(r.code,503);assert.equal(r.data.code,undefined);
});
test('share RPC outage returns no generated code or internal error',async()=>{
 const r=await fixture({throwRpc:true}).send();assert.equal(r.code,503);assert.equal(r.data.code,undefined);assert.doesNotMatch(JSON.stringify(r.data),/internal service/);
});
