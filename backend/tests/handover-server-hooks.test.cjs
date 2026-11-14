'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
function boot(flags={},fetchOverride){
  const routes=new Map(),calls=[];
  const app={use(){},get(p,...h){routes.set('GET '+p,h)},post(p,...h){routes.set('POST '+p,h)}};
  const express=()=>app;express.json=express.static=()=>()=>{};
  class WS{static OPEN=1;static Server=class{constructor(){this.clients=new Set();}on(){}};}
  const context={__filename:'isolated-server.cjs',console:{log(){},error(){},warn(){},table(){}},Buffer,URL,AbortSignal,
    setInterval(){return 1;},clearInterval(){},setTimeout(){throw Error('Unexpected timer');},
    process:{env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',...flags}},
    fetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});if(fetchOverride)return fetchOverride(url,init);
      const b=JSON.parse(init.body);return {ok:true,json:async()=>({deviceId:b.p_device,directive:null})};},
    require:n=>{
      if(n==='express')return express;if(n==='cors')return()=>()=>{};
      if(n==='http')return {createServer:()=>({listen(){}})};
      if(n==='ws')return WS;if(n==='crypto')return crypto;
      if(n.startsWith('./'))return require(path.join(__dirname,'..',n));
      throw Error('Blocked dependency '+n);
    }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8'),context);
  return {routes,calls};
}
for(const flags of [{},{HANDOVER_TRANSPORT_ENABLED:'true'},
  {HANDOVER_TRANSPORT_ENABLED:'true',HANDOVER_GATES_ENABLED:'true'},
  {HANDOVER_TRANSPORT_ENABLED:'true',DEVICE_REGISTRY_ENABLED:'true'}])
 test(`server does not register transport without all prerequisites ${JSON.stringify(flags)}`,()=>{
   const h=boot(flags);assert.equal(h.routes.has('POST /handover/poll'),false);assert.equal(h.routes.has('POST /handover/ack'),false);assert.equal(h.calls.length,0);
 });
test('enabled full server routes reach fresh database-authenticated delivery handler',async()=>{
  const h=boot({HANDOVER_TRANSPORT_ENABLED:'true',HANDOVER_GATES_ENABLED:'true',DEVICE_REGISTRY_ENABLED:'true'});
  assert.equal(h.routes.has('POST /handover/ack'),true);assert.equal(h.calls.length,0);
  const res={code:200,set(){return this;},status(c){this.code=c;return this;},json(d){this.data=d;return this;},end(){return this;}};
  await h.routes.get('POST /handover/poll')[0]({headers:{'x-device-secret':'A'.repeat(64)},
    body:{deviceId:'HP-002',boot:'B'.repeat(32),ticket:'C'.repeat(32),deadline:45100}},res);
  assert.equal(res.code,204);assert.equal(h.calls.length,1);assert.match(h.calls[0].url,/honorpole_handover_issue_directive_r1$/);
});

test('enabled full server routes deliver RELEASE and receipt RELEASED through the single atomic advance RPC',async()=>{
 const {message,signDirective}=require('../handover-protocol.cjs');
 const key='A'.repeat(64),p={deviceId:'HP-002',boot:'B'.repeat(32),ticket:'C'.repeat(32),requestId:'12345678-1234-1234-1234-123456789abc',action:'RELEASE',generation:0,nextGeneration:1,deadline:45100};
 const a={...p,state:'RELEASED'};a.signature=crypto.createHmac('sha256',key).update(message(a,true)).digest('hex').toUpperCase();
 const h=boot({HANDOVER_TRANSPORT_ENABLED:'true',HANDOVER_GATES_ENABLED:'true',DEVICE_REGISTRY_ENABLED:'true'},async(url)=>({ok:true,json:async()=>url.endsWith('honorpole_handover_advance_ack_r1')?{accepted:true,deviceId:p.deviceId,boot:p.boot,ticket:p.ticket,signature:a.signature}:{deviceId:p.deviceId,directive:p}}));
 function response(){return {code:200,set(){return this},status(c){this.code=c;return this},json(d){this.data=d;return this},end(){return this}};}
 const polled=response();await h.routes.get('POST /handover/poll')[0]({headers:{'x-device-secret':key},body:{deviceId:p.deviceId,boot:p.boot,ticket:p.ticket,deadline:p.deadline}},polled);
 assert.equal(polled.code,200);assert.deepEqual(polled.data,signDirective(p,key));
 const saved=response();await h.routes.get('POST /handover/ack')[0]({headers:{'x-device-secret':key},body:a},saved);
 assert.equal(saved.code,200);assert.equal(saved.data.signature,a.signature);
 assert.deepEqual(h.calls.map(c=>c.url.split('/').at(-1)),['honorpole_handover_issue_directive_r1','honorpole_handover_get_directive_r1','honorpole_handover_advance_ack_r1']);
});
