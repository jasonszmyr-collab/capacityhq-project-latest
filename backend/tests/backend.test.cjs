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
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../factory-registry.cjs'),'utf8'),{...common,module:registry,require:n=>{if(n==='node:crypto')return crypto;throw Error('Blocked require '+n)}});
 const context=vm.createContext({...common,__filename:'isolated-server.cjs',require:n=>{
  if(n==='express')return express;if(n==='cors')return ()=>()=>{};
  if(n==='http')return {createServer:()=>({listen(){}})};if(n==='ws')return WS;if(n==='crypto')return crypto;
  if(n==='./factory-registry.cjs')return registry.exports;throw Error('Blocked require '+n);
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8')+'\nthis.inspect={states,commandsByDevice,wss,getDeviceState};',context);
 async function request(method,route,fields={}){
  const h=routes.get(method+' '+route);assert.ok(h,'Route registered');
  const req={method,headers:{},body:{},query:{},params:{},...fields};
  const res={code:200,data:undefined,status(c){this.code=c;return this},json(d){this.data=d;return this}};
  for(const handler of h){let proceed=false;await handler(req,res,()=>{proceed=true});if(!proceed)break}
  return res;
 }
 return {request,calls,...context.inspect,tick(ms){now+=ms;for(const x of intervals)if(x.ms===5000)x.f()}};
}
const auth={authorization:'Bearer fixture-token'}, auto={'x-honorpole-auto-secret':'fake-auto'}, device={'x-device-secret':'legacy-four'};
const send=(h,body={command:'FULL'})=>h.request('POST','/api/device/:deviceId/command',{params:{deviceId:'HP-004'},headers:auth,body});
test('missing user token rejects before fetch/queue',async()=>{const h=harness();const r=await h.request('POST','/api/device/:deviceId/command',{params:{deviceId:'HP-004'},body:{command:'FULL'}});assert.equal(r.code,401);assert.equal(h.calls.length,0);assert.equal(h.commandsByDevice.size,0)});
test('invalid user token rejects',async()=>{const h=harness({fetch:async()=>({ok:false,json:async()=>({})})});assert.equal((await send(h)).code,401);assert.equal(h.commandsByDevice.size,0)});
test('authentication outage fails closed',async()=>{const h=harness({fetch:async()=>{throw Error('mock outage')}});assert.equal((await send(h)).code,503);assert.equal(h.commandsByDevice.size,0)});
test('nonmember cannot queue',async()=>{const h=harness({denied:true});assert.equal((await send(h)).code,403);assert.equal(h.commandsByDevice.size,0)});
test('authorized command targets URL device despite hostile body ID',async()=>{const h=harness();assert.equal((await send(h,{command:' half ',device_id:'HP-001'})).code,200);assert.equal(h.getDeviceState('HP-004').motor,'HALF');assert.equal(h.getDeviceState('HP-001').commandPending,false);assert.match(h.calls[1].url,/device_id=eq.HP-004/)});
for(const command of ['INVALID',null,42])test('invalid command rejected: '+command,async()=>{const h=harness();assert.equal((await send(h,{command})).code,400);assert.equal(h.commandsByDevice.size,0)});
test('queued STOP cannot be replaced by FULL',async()=>{const h=harness();await send(h,{command:'STOP'});assert.equal((await send(h)).code,409);assert.equal(h.getDeviceState('HP-004').motor,'STOP')});
test('STOP replaces pending movement',async()=>{const h=harness();await send(h);assert.equal((await send(h,{command:'STOP'})).code,200);assert.equal(h.getDeviceState('HP-004').motor,'STOP')});
test('AUTO wrong secret cannot queue',async()=>{const h=harness();assert.equal((await h.request('POST','/auto/control',{headers:{'x-honorpole-auto-secret':'wrong'},body:{device_id:'HP-004',motor:'FULL'}})).code,401);assert.equal(h.commandsByDevice.size,0)});
test('AUTO status requires explicit device ID',async()=>{const h=harness();assert.equal((await h.request('GET','/auto/status',{headers:auto})).code,400)});
test('AUTO control missing ID rejects without queue',async()=>{const h=harness();assert.equal((await h.request('POST','/auto/control',{headers:auto,body:{motor:'FULL'}})).code,400);assert.equal(h.commandsByDevice.size,0)});
test('telemetry wrong secret cannot change online state',async()=>{const h=harness();assert.equal((await h.request('POST','/status',{headers:{'x-device-secret':'bad'},body:{device_id:'HP-004',position:8000}})).code,401);assert.equal(h.getDeviceState('HP-004').online,false)});
test('conflicting telemetry aliases rejected',async()=>{const h=harness();assert.equal((await h.request('POST','/status',{headers:device,body:{device_id:'HP-004',deviceId:'HP-001'}})).code,400)});
test('credential lookup outage does not fall back to legacy',async()=>{const h=harness({fetch:async()=>{throw Error('outage')}});assert.equal((await h.request('POST','/status',{headers:device,body:{device_id:'HP-004'}})).code,503);assert.equal(h.getDeviceState('HP-004').online,false)});
test('revoked enrollment rejects even valid legacy credential',async()=>{const h=harness({fetch:async()=>({ok:true,json:async()=>[{device_id:'HP-004',secret_hash:crypto.createHash('sha256').update('A'.repeat(64)).digest('hex'),enabled:false}]})});assert.equal((await h.request('POST','/status',{headers:device,body:{device_id:'HP-004'}})).code,401)});
test('telemetry cannot replace command before delivery',async()=>{const h=harness();await send(h);await h.request('POST','/status',{headers:device,body:{device_id:'HP-004',mode:'IDLE',moving:false,position:4000,full:8000}});const s=h.getDeviceState('HP-004');assert.equal(s.motor,'FULL');assert.equal(s.commandPending,true);assert.equal(s.percent,50)});
test('poll delivers only target command; telemetry then confirms stopped',async()=>{const h=harness();await send(h);const r=await h.request('GET','/control',{headers:device,query:{device_id:'HP-004'}});assert.equal(r.data.motor,'FULL');assert.ok(r.data.commandId);assert.equal(h.getDeviceState('HP-004').commandPending,false);assert.equal(h.getDeviceState('HP-004').status,'delivered');await h.request('POST','/status',{headers:device,body:{device_id:'HP-004',mode:'IDLE',moving:false}});assert.equal(h.getDeviceState('HP-004').motor,'STOP');assert.equal(h.getDeviceState('HP-001').commandDeliveredAt,null)});
test('stale telemetry goes offline after 15 seconds',async()=>{const h=harness();await h.request('POST','/status',{headers:device,body:{device_id:'HP-004',mode:'IDLE',moving:false}});h.tick(15001);assert.equal(h.getDeviceState('HP-004').online,false)});
test('shared viewer can queue commands for assigned pole only',async()=>{const h=harness({role:'viewer'});assert.equal((await send(h)).code,200);assert.equal(h.getDeviceState('HP-004').commandPending,true);assert.equal(h.getDeviceState('HP-001').commandPending,false)});

test('unauthorized WebSocket connection sends no telemetry',()=>{const h=harness();const frames=[];let closed=false;h.wss.events.connection({send:s=>frames.push(s),close(){closed=true},on(){}},{});assert.equal(frames.length,0);assert.equal(closed,true)});
async function upgrade(h,url){const req={url};let result;await h.wss.config.verifyClient({req},(...args)=>{result=args});assert.ok(result);return {result,req}}
for(const body of [{motor:'FULL',device_id:'bad'},{motor:'FULL',device_id:42},{motor:'FULL',device_id:'HP-004',deviceId:'HP-001'}])test('AUTO rejects invalid/conflicting ID '+JSON.stringify(body),async()=>{const h=harness();assert.equal((await h.request('POST','/auto/control',{headers:auto,body})).code,400);assert.equal(h.commandsByDevice.size,0)});
test('AUTO explicit target remains isolated',async()=>{const h=harness();assert.equal((await h.request('POST','/auto/control',{headers:auto,body:{motor:'FULL',device_id:'HP-004'}})).code,200);assert.equal(h.getDeviceState('HP-001').commandPending,false);assert.equal(h.getDeviceState('HP-004').commandPending,true)});
test('viewer retains device status read access',async()=>{const h=harness({role:'viewer'});assert.equal((await h.request('GET','/api/device/:deviceId/status',{headers:auth,params:{deviceId:'HP-004'}})).code,200)});
test('shared viewer can use legacy command endpoint for assigned pole',async()=>{const h=harness({role:'viewer'});assert.equal((await h.request('POST','/control',{headers:auth,body:{device_id:'HP-004',command:'STOP'}})).code,200);assert.equal(h.getDeviceState('HP-004').motor,'STOP');assert.equal(h.getDeviceState('HP-001').commandPending,false)});
for(const role of ['owner','unknown',null])test('unapproved command role fails closed '+role,async()=>{const h=harness({role});assert.equal((await send(h)).code,403);assert.equal(h.commandsByDevice.size,0)});
for(const url of ['/ws','/ws?token=t','/ws?token=t&deviceId=bad','/ws?token=t&deviceId=HP-004&deviceId=HP-001','/other?token=t&deviceId=HP-004'])test('WebSocket rejects incomplete/ambiguous subscription '+url,async()=>{const h=harness();assert.equal((await upgrade(h,url)).result[0],false);assert.equal(h.calls.length,0)});
test('WebSocket wrong token rejects',async()=>{const h=harness({fetch:async()=>({ok:false,json:async()=>({})})});assert.equal((await upgrade(h,'/ws?token=bad&deviceId=HP-004')).result[1],401)});
test('WebSocket nonmember rejects',async()=>{const h=harness({denied:true});assert.equal((await upgrade(h,'/ws?token=t&deviceId=HP-004')).result[1],403)});
test('WebSocket auth outage rejects',async()=>{const h=harness({fetch:async()=>{throw Error('outage')}});assert.equal((await upgrade(h,'/ws?token=t&deviceId=HP-004')).result[1],503)});
test('WebSocket viewer connects only to authorized device',async()=>{const h=harness({role:'viewer'});const u=await upgrade(h,'/ws?token=t&deviceId=HP-004');assert.equal(u.result[0],true);const frames=[];const ws={readyState:1,send:s=>frames.push(JSON.parse(s)),on(){},close(){throw Error('Unexpected close')}};h.wss.events.connection(ws,u.req);h.wss.clients.add(ws);assert.equal(frames[0].deviceId,'HP-004');await h.request('POST','/auto/control',{headers:auto,body:{device_id:'HP-001',motor:'FULL'}});assert.equal(frames.length,1);await h.request('POST','/auto/control',{headers:auto,body:{device_id:'HP-004',motor:'FULL'}});assert.equal(frames.length,2);assert.equal(frames[1].deviceId,'HP-004')});

test('shared viewer cannot command another pole',async()=>{const h=harness({role:'viewer'});assert.equal((await h.request('POST','/api/device/:deviceId/command',{headers:auth,params:{deviceId:'HP-001'},body:{command:'FULL'}})).code,403);assert.equal(h.commandsByDevice.size,0)});
test('membership for another user cannot authorize commands',async()=>{const h=harness({fetch:async url=>({ok:true,json:async()=>url.endsWith('/auth/v1/user')?{id:'user-fixture'}:[{device_id:'HP-004',user_id:'other-user',role:'admin'}]})});assert.equal((await send(h)).code,403);assert.equal(h.commandsByDevice.size,0)});
test('shared viewer cannot create share codes',async()=>{const h=harness({role:'viewer'});assert.equal((await h.request('POST','/api/device/:deviceId/share',{headers:auth,params:{deviceId:'HP-004'}})).code,403);assert.equal(h.calls.length,2);assert.equal(h.commandsByDevice.size,0)});
