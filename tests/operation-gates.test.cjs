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
 const gateModule={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../backend/handover-access.cjs'),'utf8'),{...common,module:gateModule});
 const context=vm.createContext({...common,__filename:'isolated-server.cjs',require:n=>{
  if(n==='express')return express;if(n==='cors')return ()=>()=>{};
  if(n==='http')return {createServer:()=>({listen(){}})};if(n==='ws')return WS;if(n==='crypto')return crypto;
  if(n==='./handover-access.cjs')return gateModule.exports;
  if(n==='./setup-access.cjs')return setupModule.exports;
  if(n==='./factory-registry.cjs')return registry.exports;throw Error('Blocked require '+n);
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../backend/server.cjs'),'utf8')+'\nthis.inspect={states,commandsByDevice,wss,getDeviceState,queuedAuthority};',context);
 async function request(method,route,fields={}){
  const h=routes.get(method+' '+route);assert.ok(h,'Route registered');
  const req={method,headers:{},body:{},query:{},params:{},...fields};
  const res={code:200,data:undefined,status(c){this.code=c;return this},json(d){this.data=d;return this},set(){return this}};
  for(const handler of h){let proceed=false;await handler(req,res,()=>{proceed=true});if(!proceed)break}
  return res;
 }
 return {request,calls,...context.inspect,tick(ms){now+=ms;for(const x of intervals)if(x.ms===5000)x.f()}};
}
const auth={authorization:'Bearer fixture-token'},device={'x-device-secret':'A'.repeat(64)};
function fixture(){
 const p={frozen:false,generation:0,role:'admin'},gateCalls=[];
 const h=harness({env:{HANDOVER_GATES_ENABLED:'true',DEVICE_PAIRING_SECRETS:JSON.stringify({'HP-004':'A'.repeat(64)})},fetch:async(url,init)=>{
  if(url.endsWith('/auth/v1/user')){if(p.authError)return {ok:false,status:401};return {ok:true,json:async()=>({id:'user-fixture'})};}
  if(url.includes('/rest/v1/device_users?'))return {ok:true,json:async()=>[{device_id:'HP-004',user_id:'user-fixture',role:p.role}]};
  if(url.endsWith('/rpc/honorpole_factory_lookup'))return {ok:true,json:async()=>[]};
  const auto=url.endsWith('/rpc/honorpole_authorize_auto_r1');
  assert.ok(auto||url.endsWith('/rpc/honorpole_authorize_operation_r1'));
  const b=JSON.parse(init.body);gateCalls.push({auto,b,init});
  if(p.wait)await p.wait;
  if(p.outage)return {ok:false,status:503,json:async()=>({code:'XX000'})};
  if(p.frozen || (b.p_generation!==null && b.p_generation!==p.generation))return {ok:false,json:async()=>({code:'HP409'})};
  if(!auto && (p.gateRole||p.role)==='viewer' && b.p_channel==='setup')return {ok:false,json:async()=>({code:'HP403'})};
  return {ok:true,json:async()=>p.malformed?{}:{allowed:true,deviceId:'HP-004',channel:auto?'auto':b.p_channel,generation:p.generation}};
 }});
 const send=(command='FULL')=>h.request('POST','/api/device/:deviceId/command',{params:{deviceId:'HP-004'},headers:auth,body:{command}});
 const auto=()=>h.request('POST','/auto/control',{headers:{'x-honorpole-auto-secret':'fake-auto'},body:{device_id:'HP-004',command:'FULL'}});
 const poll=()=>h.request('GET','/control',{headers:device,query:{device_id:'HP-004'}});
 const setupPoll=(boot='B'.repeat(32))=>h.request('GET','/setup/poll',{headers:device,query:{device_id:'HP-004',boot,clock:'1000'}});
 const open=()=>h.request('POST','/api/device/:deviceId/setup',{headers:auth,params:{deviceId:'HP-004'}});
 const status=requestId=>h.request('GET','/api/device/:deviceId/setup/:requestId',{headers:auth,params:{deviceId:'HP-004',requestId}});
 async function board(){const r=await h.request('POST','/status',{headers:device,body:{deviceId:'HP-004',mode:'IDLE',moving:false}});assert.equal(r.code,200);assert.equal((await setupPoll()).code,200);}
 return {p,h,gateCalls,send,auto,poll,setupPoll,open,status,board};
}
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await Promise.resolve()}assert.fail('Expected async checkpoint not reached')}
for(const route of ['manual','legacy','auto'])test('frozen gate refuses enqueue '+route,async()=>{
 const f=fixture();f.p.frozen=true;let r;
 if(route==='manual')r=await f.send();else if(route==='auto')r=await f.auto();
 else r=await f.h.request('POST','/control',{headers:auth,body:{device_id:'HP-004',command:'FULL'}});
 assert.equal(r.code,409);assert.equal(f.h.commandsByDevice.size,0);
});
test('queued user generation is sent back at delivery',async()=>{
 const f=fixture();f.p.generation=7;const q=await f.send();assert.equal(q.code,200);
 const r=await f.poll();assert.equal(r.data.commandId,q.data.commandId);assert.equal(f.gateCalls.at(-1).b.p_generation,7);
 assert.doesNotMatch(JSON.stringify(q.data),/fixture-token|fake-service/);
});
test('viewer retains gated command access',async()=>{const f=fixture();f.p.role='viewer';assert.equal((await f.send()).code,200);assert.equal((await f.poll()).data.motor,'FULL')});
for(const change of ['frozen','generation'])test('queued user delivery invalidated by '+change,async()=>{
 const f=fixture();await f.send();f.p[change]=change==='frozen'?true:1;
 const r=await f.poll();assert.equal(r.data.commandId,null);assert.equal(r.data.motor,'STOP');
 assert.equal(f.h.getDeviceState('HP-004').commandPending,false);
 assert.equal(f.h.commandsByDevice.get('HP-004').cancellationReason,'handover_blocked');
});
for(const change of ['frozen','generation'])test('AUTO delivery invalidated by '+change,async()=>{
 const f=fixture();assert.equal((await f.auto()).code,200);assert.equal(f.gateCalls[0].init.headers.Authorization,'Bearer fake-service');
 f.p[change]=change==='frozen'?true:1;const r=await f.poll();assert.equal(r.data.commandId,null);
});
test('enqueue outage creates no command',async()=>{const f=fixture();f.p.outage=true;assert.equal((await f.send()).code,503);assert.equal(f.h.commandsByDevice.size,0)});
test('delivery outage holds command for retry',async()=>{
 const f=fixture(),q=await f.send();f.p.outage=true;assert.equal((await f.poll()).code,503);assert.equal(f.h.getDeviceState('HP-004').commandPending,true);
 f.p.outage=false;assert.equal((await f.poll()).data.commandId,q.data.commandId);
});
test('STOP enqueue and delivery bypass frozen/outage generation gate',async()=>{
 const f=fixture();f.p.frozen=f.p.outage=true;const q=await f.send('STOP');assert.equal(q.code,200);
 f.p.authError=true;const r=await f.poll();assert.equal(r.data.motor,'STOP');assert.equal(r.data.commandId,q.data.commandId);assert.equal(f.gateCalls.length,0);
});
test('pending enqueue authorization cannot overwrite replacement STOP',async()=>{
 const f=fixture();let release;f.p.wait=new Promise(r=>release=r);const pending=f.send();await until(()=>f.gateCalls.length===1);
 const stop=await f.send('STOP');release();const original=await pending;assert.equal(original.code,409);assert.equal((await f.poll()).data.commandId,stop.data.commandId);
});
test('record without generation is cancelled rather than upgraded',async()=>{
 const f=fixture();await f.send();const record=f.h.commandsByDevice.get('HP-004');f.h.queuedAuthority.get(record).generation=undefined;
 assert.equal((await f.poll()).data.commandId,null);
});
test('gated setup opens and delivers with its original generation',async()=>{
 const f=fixture();await f.board();const o=await f.open();assert.equal(o.code,202);const r=await f.setupPoll();assert.equal(r.data.setup.requestId,o.data.requestId);
 assert.equal(f.gateCalls.at(-1).b.p_generation,0);
});
test('frozen setup enqueue is refused',async()=>{const f=fixture();await f.board();f.p.frozen=true;assert.equal((await f.open()).code,409);assert.equal((await f.setupPoll()).data.setup,null)});
for(const change of ['frozen','generation'])test('pending setup delivery invalidated by '+change,async()=>{
 const f=fixture();await f.board();const o=await f.open();f.p[change]=change==='frozen'?true:1;assert.equal((await f.setupPoll()).data.setup,null);
 f.p.frozen=false;f.p.generation=0;assert.equal((await f.status(o.data.requestId)).code,404);
});
test('setup delivery outage preserves pending retry',async()=>{
 const f=fixture();await f.board();const o=await f.open();f.p.outage=true;const r=await f.setupPoll();assert.equal(r.code,503);assert.equal(r.data.setup,null);
 f.p.outage=false;assert.equal((await f.setupPoll()).data.setup.requestId,o.data.requestId);
});
test('setup status cannot reveal password after freeze',async()=>{
 const f=fixture();await f.board();const o=await f.open();await f.setupPoll();
 const ack=await f.h.request('POST','/setup/result',{headers:device,body:{deviceId:'HP-004',boot:'B'.repeat(32),requestId:o.data.requestId,result:'OPEN'}});
 assert.equal(ack.code,200);assert.equal((await f.status(o.data.requestId)).data.result,'OPEN');f.p.frozen=true;
 const r=await f.status(o.data.requestId);assert.equal(r.code,409);assert.equal(r.data.password,undefined);
});
test('setup database role check overrides stale HTTP admin snapshot',async()=>{
 const f=fixture();await f.board();f.p.gateRole='viewer';assert.equal((await f.open()).code,403);assert.equal((await f.setupPoll()).data.setup,null);
});
test('board reboot during setup enqueue grant prevents opening',async()=>{
 const f=fixture();await f.board();let release;f.p.wait=new Promise(r=>release=r);const opening=f.open();await until(()=>f.gateCalls.length===1);
 await f.setupPoll('C'.repeat(32));release();assert.equal((await opening).code,409);
});
test('concurrent setup opens create only one session',async()=>{
 const f=fixture();await f.board();let release;f.p.wait=new Promise(r=>release=r);const a=f.open(),b=f.open();await until(()=>f.gateCalls.length===2);release();
 const r=await Promise.all([a,b]);assert.deepEqual(r.map(x=>x.code).sort(),[202,409]);
});
test('malformed generation response cannot queue command or setup',async()=>{
 const f=fixture();await f.board();f.p.malformed=true;assert.equal((await f.send()).code,503);assert.equal((await f.open()).code,503);assert.equal(f.h.commandsByDevice.size,0);
});

test('late enqueue grant cannot undo an already-delivered replacement STOP',async()=>{
 const f=fixture();let release;f.p.wait=new Promise(r=>release=r);const pending=f.send();await until(()=>f.gateCalls.length===1);
 const stop=await f.send('STOP');assert.equal((await f.poll()).data.commandId,stop.data.commandId);release();assert.equal((await pending).code,409);
 assert.equal((await f.poll()).data.commandId,null);
});
