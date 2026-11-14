'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function fixture(){
 const membership=new Set(['old-user']),frames=[],closed=[];let reads=0,hook;
 const app={use(){},get(){},post(){}},express=()=>app;express.json=express.static=()=>()=>{};
 class WS{static OPEN=1;static Server=class{constructor(){this.clients=new Set()}on(){}}}
 const context=vm.createContext({__filename:'isolated-server.cjs',console:{log(){},warn(){},error(){},table(){}},Buffer,URL,AbortSignal,
  setInterval(){return 1},clearInterval(){},setTimeout(){throw Error('Unexpected timer')},
  process:{env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'synthetic-anon'}},
  fetch:async(url)=>{
   if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'old-user'})};
   if(url.includes('/rest/v1/device_users?')){
    const n=++reads,rows=membership.has('old-user')?[{device_id:'HP-004',user_id:'old-user',role:'admin'}]:[];
    return {ok:true,json:async()=>{if(hook)await hook(n);return rows}};
   }
   throw Error('Unexpected external request');
  },require:n=>{
   if(n==='express')return express;if(n==='cors')return()=>()=>{};if(n==='http')return {createServer:()=>({listen(){}})};
   if(n==='ws')return WS;if(n==='crypto')return crypto;
   if(n.startsWith('./'))return require(path.join(__dirname,'..',n));throw Error('Unexpected module '+n);
  }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8')+'\nthis.h={webSocketAccess,refreshWebSocketAccess,getDeviceState,broadcastState,wss};',context);
 const h=context.h,ws={readyState:1,honorPoleDeviceId:'HP-004',send:s=>frames.push(JSON.parse(s)),close:(...a)=>{closed.push(a);ws.readyState=3}};
 const access={token:'synthetic-token',userId:'old-user',deviceId:'HP-004'};
 h.webSocketAccess.set(ws,access);h.wss.clients.add(ws);
 return {h,ws,access,membership,frames,closed,get reads(){return reads},set hook(f){hook=f},refresh:(send=true)=>h.refreshWebSocketAccess(ws,send),state:h.getDeviceState('HP-004')};
}
test('new-owner telemetry during an old pending membership read requires fresh authority',async()=>{
 const f=fixture(),entered=deferred(),release=deferred();f.hook=async n=>{if(n===1){entered.resolve();await release.promise}};
 const pending=f.refresh();await entered.promise;
 f.membership.clear();f.state.motor='FULL';f.h.broadcastState('HP-004');release.resolve();await pending;
 assert.equal(f.reads,2);assert.equal(f.frames.length,0);assert.equal(f.closed[0][0],1008);
});
test('idle access check cannot authorize telemetry requested after its membership read',async()=>{
 const f=fixture(),entered=deferred(),release=deferred();f.hook=async n=>{if(n===1){entered.resolve();await release.promise}};
 const pending=f.refresh(false);await entered.promise;f.membership.clear();f.state.motor='FULL';f.refresh();release.resolve();await pending;
 assert.equal(f.reads,2);assert.equal(f.frames.length,0);assert.equal(f.closed[0][0],1008);
});
test('state mutation without broadcast cannot alter bytes captured before authorization',async()=>{
 const f=fixture(),entered=deferred(),release=deferred();f.hook=async()=>{entered.resolve();await release.promise};
 const pending=f.refresh();await entered.promise;f.membership.clear();f.state.motor='FULL';release.resolve();await pending;
 assert.equal(f.frames.length,1);assert.equal(f.frames[0].data.motor,'STOP');assert.equal(f.reads,1);
 // In-flight authorization can cover pre-check data, never post-check data.
});
test('authorized bursts coalesce to one latest snapshot with a subsequent check',async()=>{
 const f=fixture(),entered=deferred(),release=deferred();f.hook=async n=>{if(n===1){entered.resolve();await release.promise}};
 const pending=f.refresh();await entered.promise;
 for(let i=1;i<=100;i++){f.state.position=i;assert.equal(f.refresh(),pending)}
 release.resolve();await pending;assert.equal(f.reads,2);assert.equal(f.frames.length,1);assert.equal(f.frames[0].data.position,100);
});
test('a later change during the second check requires a third check',async()=>{
 const f=fixture(),first=deferred(),second=deferred(),r1=deferred(),r2=deferred();
 f.hook=async n=>{if(n===1){first.resolve();await r1.promise}if(n===2){second.resolve();await r2.promise}};
 const pending=f.refresh();await first.promise;f.state.position=1;f.refresh();r1.resolve();await second.promise;
 f.membership.clear();f.state.position=2;f.refresh();r2.resolve();await pending;
 assert.equal(f.reads,3);assert.equal(f.frames.length,0);assert.equal(f.closed[0][0],1008);
});
test('unchanged authorized telemetry sends once and next request checks again',async()=>{
 const f=fixture();await f.refresh();f.state.motor='HALF';await f.refresh();
 assert.equal(f.reads,2);assert.equal(f.frames.length,2);assert.equal(f.frames[1].data.motor,'HALF');assert.equal(f.access.pending,null);
});
test('idle-only recheck sends no telemetry',async()=>{const f=fixture();await f.refresh(false);assert.equal(f.frames.length,0);assert.equal(f.reads,1)});
test('outage fails closed and clears pending admission',async()=>{
 const f=fixture();f.hook=()=>{throw Error('synthetic outage')};await f.refresh();assert.equal(f.frames.length,0);assert.equal(f.closed[0][0],1013);assert.equal(f.access.pending,null);
});
test('closed socket receives no pending data',async()=>{
 const f=fixture(),entered=deferred(),release=deferred();f.hook=async()=>{entered.resolve();await release.promise};
 const pending=f.refresh();await entered.promise;f.ws.readyState=3;release.resolve();await pending;assert.equal(f.frames.length,0);assert.equal(f.closed.length,0);
});
test('superseded socket access cannot receive pending data',async()=>{
 const f=fixture(),entered=deferred(),release=deferred();f.hook=async()=>{entered.resolve();await release.promise};
 const pending=f.refresh();await entered.promise;f.h.webSocketAccess.set(f.ws,{token:'replacement'});release.resolve();await pending;
 assert.equal(f.frames.length,0);assert.equal(f.h.webSocketAccess.get(f.ws).token,'replacement');
});
test('other-device broadcast does not extend an authorization check',async()=>{
 const f=fixture(),entered=deferred(),release=deferred();f.hook=async()=>{entered.resolve();await release.promise};
 const pending=f.refresh();await entered.promise;f.h.broadcastState('HP-001');release.resolve();await pending;assert.equal(f.reads,1);assert.equal(f.frames.length,1);
});
test('synchronous transport callback cannot lose a later telemetry request',async()=>{
 const f=fixture(),send=f.ws.send;f.ws.send=s=>{send(s);if(f.frames.length===1){f.state.motor='HALF';f.refresh()}};
 await f.refresh();assert.equal(f.reads,2);assert.equal(f.frames.length,2);assert.equal(f.frames[1].data.motor,'HALF');
});
