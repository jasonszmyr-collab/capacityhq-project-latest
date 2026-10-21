'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const http=require('node:http');
const {createRequire}=require('node:module');
// Reuse installed project dependencies. No npm install or project edits required.
const dependencyRequire=process.env.HONORPOLE_TEST_PROJECT
 ? createRequire(path.join(process.env.HONORPOLE_TEST_PROJECT,'package.json')) : require;
const express=dependencyRequire('express'), cors=dependencyRequire('cors'), WS=dependencyRequire('ws');
async function start(){
 const policy={revoked:false,authStatus:200,membershipStatus:200}, intervals=[];
 let server,wss,readyResolve;
 const ready=new Promise(r=>readyResolve=r), calls=[];
 const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fake-anon',SUPABASE_SERVICE_ROLE_KEY:'fake-service',AUTO_CONTROL_SECRET:'fake-auto',DEVICE_REGISTRY_ENABLED:'true',DEVICE_PAIRING_SECRETS:JSON.stringify({'HP-004':'local-device-fixture'})};
 const fakeFetch=async(url,init={})=>{
  assert.ok(url.startsWith('https://fixture.invalid/'),'Every server fetch must be mocked');calls.push({url,init});
  const token=(init.headers?.Authorization||'').replace('Bearer ','');let data;
  if(url.endsWith('/auth/v1/user')){policy.authChecks=(policy.authChecks||0)+1;if(policy.revokeBeforeInitial && policy.authChecks===2)policy.revoked=true;if(policy.throwAuth)throw Error('fixture outage');if(policy.authStatus!==200 || !['admin-token','viewer-token'].includes(token))return {ok:false,status:policy.authStatus===200?401:policy.authStatus,json:async()=>({})};data={id:policy.userId || (token==='admin-token'?'admin-user':'viewer-user')};}
  else if(url.includes('/rest/v1/device_users?')){if(policy.membershipGate)await policy.membershipGate;if(policy.membershipStatus!==200)return {ok:false,status:policy.membershipStatus,json:async()=>({})};const u=new URL(url), id=u.searchParams.get('device_id').slice(3),uid=u.searchParams.get('user_id').slice(3);data=policy.malformed?{}:policy.revoked?[]:id==='HP-004'?[{device_id:policy.rowDeviceId || id,user_id:policy.rowUserId || uid,role:token==='viewer-token'?'viewer':'admin'}]:[];}
  else if(url.endsWith('/rpc/honorpole_factory_lookup'))data=[];
  else throw Error('Unconfigured mock fetch');
  return {ok:true,json:async()=>data};
 };
 const shared={fetch:fakeFetch,console:{log(){},warn(){},error(){},table(){}},URL,Date,Buffer,AbortSignal,setInterval(f,ms){intervals.push({f,ms});return intervals.length},clearInterval(){},process:{env}};
 const reg={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../factory-registry.cjs'),'utf8'),{...shared,module:reg,require:n=>{assert.equal(n,'node:crypto');return crypto}});
 class TestServer extends WS.Server{constructor(opts){super(opts);wss=this}}
 function WebSocketModule(){};WebSocketModule.Server=TestServer;WebSocketModule.OPEN=WS.OPEN;
 const setupModule={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../setup-access.cjs'),'utf8'),{...shared,module:setupModule,require:n=>{assert.equal(n,'node:crypto');return crypto}});
 const context=vm.createContext({...shared,__filename:'local-candidate-server.cjs',require:n=>{
  if(n==='express')return express;if(n==='cors')return cors;if(n==='crypto')return crypto;
  if(n==='./setup-access.cjs')return setupModule.exports;
  if(n==='./factory-registry.cjs')return reg.exports;if(n==='ws')return WebSocketModule;
  if(n==='http')return {createServer:app=>{server=http.createServer(app);server.listen=()=>http.Server.prototype.listen.call(server,0,'127.0.0.1',readyResolve);return server}};
  throw Error('Blocked require '+n);
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8'),context);await ready;
 const base='http://127.0.0.1:'+server.address().port;
 async function request(route,body,headers={}){const response=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});return {code:response.status,data:await response.json()};}
 async function connect(query){return new Promise((resolve,reject)=>{const frames=[];const ws=new WS(base.replace('http:','ws:')+'/ws'+query);const timer=setTimeout(()=>{ws.terminate();reject(Error('Local handshake timed out'))},5000);ws.on('error',()=>{});ws.on('close',code=>{if(frames.length===0){clearTimeout(timer);resolve({code,frames})}});ws.on('unexpected-response',(req,res)=>{clearTimeout(timer);res.resume();req.destroy();resolve({code:res.statusCode,frames})});ws.on('message',data=>{frames.push(JSON.parse(data.toString()));if(frames.length===1){clearTimeout(timer);resolve({code:101,ws,frames})}});});}
 return {request,connect,calls,policy,
  async broadcast(id){context.testDeviceId=id;vm.runInContext('broadcastState(testDeviceId)',context);await vm.runInContext('Promise.all([...wss.clients].map(ws=>webSocketAccess.get(ws)?.pending))',context)},
  async tickAccess(){const tick=intervals.find(x=>x.ms===10000);assert.ok(tick,'Idle access timer registered');tick.f();await vm.runInContext('Promise.all([...wss.clients].map(ws=>webSocketAccess.get(ws)?.pending))',context)},
  async close(){for(const c of wss.clients)c.terminate();await new Promise(r=>wss.close(r));server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
async function isolated(fn){const h=await start();try{await fn(h)}finally{await h.close()}}
const auto={'x-honorpole-auto-secret':'fake-auto'};
const viewer={Authorization:'Bearer viewer-token'};
test('real HTTP rejects anonymous commands',()=>isolated(async h=>{assert.equal((await h.request('/api/device/HP-004/command',{command:'FULL'})).code,401);assert.equal(h.calls.length,0)}));
test('real HTTP AUTO missing ID cannot queue HP-001',()=>isolated(async h=>{assert.equal((await h.request('/auto/control',{motor:'FULL'},auto)).code,400);const s=await h.request('/auto/status?device_id=HP-001',null,auto);assert.equal(s.data.command.pending,false)}));
test('real HTTP viewer can control assigned pole but not another',()=>isolated(async h=>{assert.equal((await h.request('/api/device/HP-004/command',{command:'HALF'},viewer)).code,200);assert.equal((await h.request('/api/device/HP-001/command',{command:'FULL'},viewer)).code,403);assert.equal((await h.request('/api/device/HP-004/share',{},viewer)).code,403)}));
test('real WebSocket missing credentials rejected before upgrade',()=>isolated(async h=>{assert.equal((await h.connect('')).code,401);assert.equal(h.calls.length,0)}));
test('real WebSocket invalid token rejected before upgrade',()=>isolated(async h=>{assert.equal((await h.connect('?token=bad&deviceId=HP-004')).code,401)}));
test('real WebSocket unauthorized device rejected before upgrade',()=>isolated(async h=>{assert.equal((await h.connect('?token=viewer-token&deviceId=HP-001')).code,403)}));
test('real WebSocket viewer receives selected device initial telemetry',()=>isolated(async h=>{const c=await h.connect('?token=viewer-token&deviceId=HP-004');assert.equal(c.code,101);assert.equal(c.frames[0].deviceId,'HP-004');assert.equal(c.frames[0].data.deviceId,'HP-004')}));
test('real WebSocket broadcasts exclude other device and deliver own command',()=>isolated(async h=>{const c=await h.connect('?token=viewer-token&deviceId=HP-004');await h.request('/auto/control',{device_id:'HP-001',motor:'FULL'},auto);await new Promise(r=>setTimeout(r,75));assert.equal(c.frames.length,1);const next=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No local telemetry received')),3000);c.ws.once('message',()=>{clearTimeout(timer);resolve()})});assert.equal((await h.request('/api/device/HP-004/command',{command:'HALF'},viewer)).code,200);await next;assert.equal(c.frames.length,2);assert.equal(c.frames[1].deviceId,'HP-004');assert.equal(c.frames[1].data.motor,'HALF')}));

// Actual localhost WebSocket connections, with only Supabase responses mocked.
function closed(ws){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Socket did not close')),3000);ws.once('close',(code,reason)=>{clearTimeout(timer);resolve({code,reason:reason.toString()})})})}
async function deniedOpenSocket(change, trigger='broadcast'){
 await isolated(async h=>{
  const c=await h.connect('?token=viewer-token&deviceId=HP-004');assert.equal(c.code,101);
  const done=closed(c.ws);change(h.policy);
  if(trigger==='timer')await h.tickAccess();else await h.broadcast('HP-004');
  const result=await done;assert.ok([1008,1013].includes(result.code));
  assert.equal(c.frames.length,1,'No post-revocation or unavailable-auth telemetry');
 });
}
test('revoked membership blocks next broadcast and closes an existing socket',()=>deniedOpenSocket(p=>{p.revoked=true}));
test('idle timer closes revoked connection without any broadcast',()=>deniedOpenSocket(p=>{p.revoked=true},'timer'));
test('expired or invalid token closes existing connection',()=>deniedOpenSocket(p=>{p.authStatus=401}));
test('auth service outage fails closed on an open socket',()=>deniedOpenSocket(p=>{p.authStatus=503}));
test('auth network exception fails closed',()=>deniedOpenSocket(p=>{p.throwAuth=true}));
test('membership service outage fails closed',()=>deniedOpenSocket(p=>{p.membershipStatus=503}));
test('malformed membership response fails closed',()=>deniedOpenSocket(p=>{p.malformed=true}));
test('different user identity cannot retain an existing subscription',()=>deniedOpenSocket(p=>{p.userId='other-user'}));
test('wrong user membership row closes existing connection',()=>deniedOpenSocket(p=>{p.rowUserId='other-user'}));
test('wrong device membership row closes existing connection',()=>deniedOpenSocket(p=>{p.rowDeviceId='HP-001'}));
test('authorization is refreshed before each delivery and shares a bounded deadline',()=>isolated(async h=>{
 const c=await h.connect('?token=viewer-token&deviceId=HP-004');const before=h.calls.length;
 const next=new Promise(resolve=>c.ws.once('message',resolve));await h.broadcast('HP-004');await next;
 const checks=h.calls.slice(before);assert.equal(checks.length,2);
 assert.ok(checks[0].url.endsWith('/auth/v1/user'));assert.match(checks[1].url,/device_id=eq.HP-004/);
 assert.equal(checks[0].init.signal,checks[1].init.signal);assert.equal(c.frames.length,2);
}));
test('in-flight check pauses frames, coalesces broadcasts, then uses fresh membership result',()=>isolated(async h=>{
 const c=await h.connect('?token=viewer-token&deviceId=HP-004');let release;
 h.policy.membershipGate=new Promise(r=>release=r);const before=h.calls.length;
 const a=h.broadcast('HP-004'),b=h.broadcast('HP-004');
 await new Promise(r=>setImmediate(r));assert.equal(c.frames.length,1);assert.equal(h.calls.length-before,2);
 const done=closed(c.ws);h.policy.revoked=true;release();await Promise.all([a,b]);await done;
 assert.equal(c.frames.length,1);
}));
test('revoking viewer leaves administrator subscription working',()=>isolated(async h=>{
 const v=await h.connect('?token=viewer-token&deviceId=HP-004');
 const a=await h.connect('?token=admin-token&deviceId=HP-004');
 // Return a mismatched row only for viewer via mutable response policy callback.
 h.policy.rowUserId='admin-user';const done=closed(v.ws);
 const next=new Promise(resolve=>a.ws.once('message',resolve));
 await h.broadcast('HP-004');await done;await next;
 assert.equal(v.frames.length,1);assert.equal(a.frames.length,2);
}));

test('membership revoked after upgrade sends no initial telemetry',()=>isolated(async h=>{
 h.policy.revokeBeforeInitial=true;
 const c=await h.connect('?token=viewer-token&deviceId=HP-004');
 assert.equal(c.code,1008);assert.equal(c.frames.length,0);
}));
test('closing during authorization cannot send a late telemetry frame',()=>isolated(async h=>{
 const c=await h.connect('?token=viewer-token&deviceId=HP-004');let release;
 h.policy.membershipGate=new Promise(r=>release=r);
 const pending=h.broadcast('HP-004');await new Promise(r=>setImmediate(r));
 const done=closed(c.ws);c.ws.close();await done;release();await pending;
 assert.equal(c.frames.length,1);
}));
