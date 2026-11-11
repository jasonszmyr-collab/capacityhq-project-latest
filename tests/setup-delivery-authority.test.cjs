'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createSetupAccess,signature}=require('../backend/setup-access.cjs');
const id='HP-002', boot='B'.repeat(32), secret='A'.repeat(64);
function response(){return {code:200,headers:{},set(k,v){this.headers[k]=v;return this},status(v){this.code=v;return this},json(v){this.body=v;return this}}}
function harness(check=async()=>200){
 let time=100000,counter=0;
 const state={online:true,lastSeen:time,state:'IDLE',commandPending:false,motor:'STOP',status:'idle'};
 const calls=[];
 const api=createSetupAccess({getState:()=>state,now:()=>time,random:()=>String(++counter).padStart(32,'0'),
  ...(check===null?{}:{checkAuthority:async a=>{calls.push(a);return check(a)}})});
 const pollReq=(b=boot)=>({deviceId:id,query:{boot:b,clock:'1234'},headers:{'x-device-secret':secret}});
 const userReq=()=>({params:{deviceId:id},user:{id:'old-owner'},accessToken:'private-access-token',
  deviceMembership:{device_id:id,user_id:'old-owner',role:'admin'}});
 async function poll(b=boot){const r=response();await api.poll(pollReq(b),r);return r}
 function open(){const r=response();api.open(userReq(),r);assert.equal(r.code,202);return r.body.requestId}
 function status(requestId){const r=response();api.status({...userReq(),params:{deviceId:id,requestId}},r);return r}
 return {api,state,calls,poll,pollReq,open,status,advance(ms){time+=ms;state.lastSeen=time}};
}
async function pending(check){const h=harness(check);await h.poll();h.requestId=h.open();return h}
test('current administrator receives a correctly signed packet',async()=>{
 const h=await pending();const r=await h.poll();assert.equal(r.code,200);
 assert.equal(r.body.setup.requestId,h.requestId);
 assert.equal(r.body.setup.signature,signature(r.body.setup,secret));
 assert.deepEqual(h.calls,[{deviceId:id,userId:'old-owner',token:'private-access-token'}]);
 assert.equal(r.headers['Cache-Control'],'no-store');
 assert.doesNotMatch(JSON.stringify(r.body),/private-access-token|old-owner/);
});
for(const code of [401,403])test(`authority ${code} cancels pending setup without disclosure`,async()=>{
 const h=await pending(async()=>code);const r=await h.poll();assert.equal(r.code,200);assert.equal(r.body.setup,null);
 assert.equal(h.status(h.requestId).code,404);await h.poll();assert.equal(h.calls.length,1);
});
for(const code of [503,500,undefined,true,'200'])test(`authority ${String(code)} fails closed and preserves retry`,async()=>{
 const h=await pending(async()=>code);const r=await h.poll();assert.equal(r.code,503);assert.equal(r.body.setup,null);
 assert.equal(h.status(h.requestId).body.result,'PENDING');
 assert.doesNotMatch(JSON.stringify(r.body),/password|private-access-token/);
});
test('authorization exception fails closed',async()=>{
 const h=await pending(async()=>{throw Error('private-access-token')});const r=await h.poll();
 assert.equal(r.code,503);assert.equal(r.body.setup,null);assert.doesNotMatch(JSON.stringify(r.body),/private-access-token/);
});
test('missing authority checker fails closed',async()=>{
 const h=await pending(null);assert.equal((await h.poll()).code,503);
});
test('authorization outage can recover with same pending request',async()=>{
 let code=503;const h=await pending(async()=>code);assert.equal((await h.poll()).code,503);code=200;
 assert.equal((await h.poll()).body.setup.requestId,h.requestId);
});
async function overlap(change){
 let resolve;const h=await pending(()=>new Promise(r=>resolve=r));const r=response();
 const running=h.api.poll(h.pollReq(),r);await Promise.resolve();await change(h);resolve(200);await running;
 assert.equal(r.body.setup,null);return h;
}
test('request expiry during authorization cannot deliver',()=>overlap(h=>h.advance(45000)));
test('controller reboot during authorization cannot deliver',()=>overlap(h=>h.poll('C'.repeat(32))));
test('busy controller during authorization cannot deliver',()=>overlap(h=>{h.state.commandPending=true}));
test('stale telemetry during authorization cannot deliver',()=>overlap(h=>{h.advance(15000);h.state.lastSeen-=15000}));
test('replacement request during authorization stays intact',async()=>{
 let newId;const h=await overlap(async h=>{h.advance(45000);await h.poll();newId=h.open()});
 assert.notEqual(newId,h.requestId);assert.equal(h.status(newId).body.result,'PENDING');
});
test('acknowledged request during authorization cannot redeliver',()=>overlap(h=>{
 const r=response();h.api.acknowledge({deviceId:id,body:{boot,requestId:h.requestId,result:'OPEN'}},r);
 assert.equal(r.code,200);
}));
test('no pending request performs no authority query',async()=>{
 const h=harness();assert.equal((await h.poll()).body.setup,null);assert.equal(h.calls.length,0);
});
test('blocked controller performs no authority query',async()=>{
 const h=await pending();h.state.motor='FULL';assert.equal((await h.poll()).body.setup,null);assert.equal(h.calls.length,0);
});
// Exercise the helper actually embedded in the candidate server, without starting
// a server or contacting Supabase. Mocked responses are not live acceptance.
const server=fs.readFileSync(path.join(__dirname,'../backend/server.cjs'),'utf8');
const start=server.indexOf('async function checkActorAuthority(');
const end=server.indexOf('\napp.get("/control"',start);
assert.ok(start>0&&end>start);
function actorHelper(fetch){
 const context={fetch,AbortSignal,SUPABASE_URL:'https://example.invalid',process:{env:{SUPABASE_ANON_KEY:'anon'}}};
 vm.createContext(context);vm.runInContext(server.slice(start,end),context);return context.checkActorAuthority;
}
function fetchFor(role='admin',user='old-owner'){
 return async url=>({ok:true,json:async()=>url.includes('/auth/')?{id:user}:[{device_id:id,user_id:'old-owner',role}]});
}
const actor={kind:'user',token:'private-access-token',userId:'old-owner'};
test('server helper allows admin setup and rejects downgraded viewer',async()=>{
 assert.equal(await actorHelper(fetchFor())(actor,id,['admin']),200);
 assert.equal(await actorHelper(fetchFor('viewer'))(actor,id,['admin']),403);
});
test('existing queued-command viewer behavior is retained',async()=>{
 assert.equal(await actorHelper(fetchFor('viewer'))(actor,id),200);
 assert.equal(await actorHelper(fetchFor())({kind:'auto'},id),200);
});
test('server helper rejects mismatched identity and missing token',async()=>{
 assert.equal(await actorHelper(fetchFor('admin','someone-else'))(actor,id,['admin']),401);
 assert.equal(await actorHelper(fetchFor())({...actor,token:''},id,['admin']),403);
});
test('server helper bounds requests and transmits only original credentials',async()=>{
 const calls=[];const check=actorHelper(async(url,options)=>{calls.push({url,options});return fetchFor()(url)});
 assert.equal(await check(actor,id,['admin']),200);assert.equal(calls.length,2);
 assert.equal(calls[0].options.headers.Authorization,'Bearer private-access-token');
 assert.equal(calls[0].options.signal,calls[1].options.signal);
 assert.match(calls[1].url,/user_id=eq.old-owner/);
});
test('server helper rejects wrong-device or malformed membership and network errors',async()=>{
 for(const value of [null,{},[],[{device_id:'HP-003',user_id:'old-owner',role:'admin'}]]){
  const check=actorHelper(async url=>({ok:true,json:async()=>url.includes('/auth/')?{id:'old-owner'}:value}));
  assert.notEqual(await check(actor,id,['admin']),200);
 }
 assert.equal(await actorHelper(async()=>{throw Error('offline')})(actor,id,['admin']),503);
});
for(const status of [401,403,500])test(`server helper handles authentication HTTP ${status}`,async()=>{
 const check=actorHelper(async()=>({ok:false,status}));
 assert.equal(await check(actor,id,['admin']),status===500?503:401);
});
function runningServer(role){
 const routes=new Map();const app={use(){},get(route,...handlers){routes.set('GET '+route,handlers)},post(route,...handlers){routes.set('POST '+route,handlers)}};
 const express=()=>app;express.json=express.static=()=>()=>{};
 const factory=new Proxy({}, {get:()=>()=>{}});
 const context={__filename:'candidate/server.cjs',console:{log(){},error(){}},process:{env:{SUPABASE_ANON_KEY:'anon'}},
  AbortSignal,URL,URLSearchParams,setInterval(){},fetch:fetchFor(role),
  require(name){if(name==='express')return express;if(name==='cors')return ()=>()=>{};
   if(name==='http')return {createServer:()=>({listen(){}})};
   if(name==='ws')return {OPEN:1,Server:class{constructor(){this.clients=new Set()}on(){}}};
   if(name==='./factory-registry.cjs')return {createFactoryRegistry:()=>factory};
   if(name==='./setup-access.cjs')return {createSetupAccess};if(name==='crypto')return require('node:crypto');
   throw Error('Unexpected dependency '+name);
  }};
 vm.createContext(context);vm.runInContext(server,context);
 const state=vm.runInContext('getDeviceState("HP-002")',context);
 Object.assign(state,{online:true,lastSeen:Date.now(),state:'IDLE',commandPending:false,motor:'STOP',status:'idle'});
 async function call(method,route,req){const r=response();await routes.get(method+' '+route).at(-1)(req,r);return r}
 return {call,queue:vm.runInContext('queueCommand',context)};
}
for(const role of ['admin','viewer'])test(`actual server setup wiring: current role ${role}`,async()=>{
 const app=runningServer(role);
 const poll={deviceId:id,query:{boot,clock:'1234'},headers:{'x-device-secret':secret}};
 await app.call('GET','/setup/poll',poll);
 const opened=await app.call('POST','/api/device/:deviceId/setup',{
  params:{deviceId:id},user:{id:'old-owner'},accessToken:'private-access-token',
  deviceMembership:{device_id:id,user_id:'old-owner',role:'admin'}});
 assert.equal(opened.code,202);
 const result=await app.call('GET','/setup/poll',poll);
 assert.equal(result.code,200);
 if(role==='admin')assert.equal(result.body.setup.requestId,opened.body.requestId);
 else assert.equal(result.body.setup,null);
});

for(const role of ['viewer','admin','removed'])test(`actual queued command wiring retains authority behavior: ${role}`,async()=>{
 const app=runningServer(role);
 app.queue(id,'FULL','MANUAL',actor);
 const r=await app.call('GET','/control',{query:{device_id:id}});
 assert.equal(r.code,200);
 assert.equal(r.body.motor,role==='removed'?'STOP':'FULL');
});
