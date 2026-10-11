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
 let server,wss,readyResolve;
 const ready=new Promise(r=>readyResolve=r), calls=[];
 const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fake-anon',SUPABASE_SERVICE_ROLE_KEY:'fake-service',AUTO_CONTROL_SECRET:'fake-auto',DEVICE_REGISTRY_ENABLED:'true',DEVICE_PAIRING_SECRETS:JSON.stringify({'HP-004':'local-device-fixture'})};
 const fakeFetch=async(url,init={})=>{
  assert.ok(url.startsWith('https://fixture.invalid/'),'Every server fetch must be mocked');calls.push({url,init});
  const token=(init.headers?.Authorization||'').replace('Bearer ','');let data;
  if(url.endsWith('/auth/v1/user')){if(!['admin-token','viewer-token'].includes(token))return {ok:false,json:async()=>({})};data={id:token==='admin-token'?'admin-user':'viewer-user'};}
  else if(url.includes('/rest/v1/device_users?')){const u=new URL(url), id=u.searchParams.get('device_id').slice(3),uid=u.searchParams.get('user_id').slice(3);data=id==='HP-004'?[{device_id:id,user_id:uid,role:token==='viewer-token'?'viewer':'admin'}]:[];}
  else if(url.endsWith('/rpc/honorpole_factory_lookup'))data=[];
  else throw Error('Unconfigured mock fetch');
  return {ok:true,json:async()=>data};
 };
 const shared={fetch:fakeFetch,console:{log(){},warn(){},error(){},table(){}},URL,Date,Buffer,AbortSignal,setInterval(){return 0},clearInterval(){},process:{env}};
 const reg={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../factory-registry.cjs'),'utf8'),{...shared,module:reg,require:n=>{assert.equal(n,'node:crypto');return crypto}});
 class TestServer extends WS.Server{constructor(opts){super(opts);wss=this}}
 function WebSocketModule(){};WebSocketModule.Server=TestServer;WebSocketModule.OPEN=WS.OPEN;
 const context=vm.createContext({...shared,__filename:'local-candidate-server.cjs',require:n=>{
  if(n==='express')return express;if(n==='cors')return cors;if(n==='crypto')return crypto;
  if(n==='./factory-registry.cjs')return reg.exports;if(n==='ws')return WebSocketModule;
  if(n==='http')return {createServer:app=>{server=http.createServer(app);server.listen=()=>http.Server.prototype.listen.call(server,0,'127.0.0.1',readyResolve);return server}};
  throw Error('Blocked require '+n);
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8'),context);await ready;
 const base='http://127.0.0.1:'+server.address().port;
 async function request(route,body,headers={}){const response=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});return {code:response.status,data:await response.json()};}
 async function connect(query){return new Promise((resolve,reject)=>{const frames=[];const ws=new WS(base.replace('http:','ws:')+'/ws'+query);const timer=setTimeout(()=>{ws.terminate();reject(Error('Local handshake timed out'))},5000);ws.on('error',()=>{});ws.on('unexpected-response',(req,res)=>{clearTimeout(timer);res.resume();req.destroy();resolve({code:res.statusCode,frames})});ws.on('message',data=>{frames.push(JSON.parse(data.toString()));if(frames.length===1){clearTimeout(timer);resolve({code:101,ws,frames})}});});}
 return {request,connect,calls,async close(){for(const c of wss.clients)c.terminate();await new Promise(r=>wss.close(r));server.closeAllConnections();await new Promise(r=>server.close(r));}};
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
