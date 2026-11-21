'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
function boot(flags={},fetchOverride){
  const routes=new Map(),calls=[];
  const app={use(){},get(p,...h){routes.set('GET '+p,h)},post(p,...h){routes.set('POST '+p,h)}};
  const express=()=>app;express.json=express.static=()=>()=>{};
  class WS{static OPEN=1;static Server=class{constructor(){this.clients=new Set();}on(){}};}
  const context={__filename:'isolated-server.cjs',console:{log(){},error(){},warn(){},table(){}},Buffer,URL,AbortSignal,
    setInterval(){return 1;},clearInterval(){},setTimeout(){throw Error('Unexpected timer');},
    process:{env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',...flags}},
    fetch:async(url,init)=>{calls.push({url,body:init.body?JSON.parse(init.body):null});if(fetchOverride)return fetchOverride(url,init);
      const b=JSON.parse(init.body);return {ok:true,json:async()=>({deviceId:b.p_device,directive:null})};},
    require:n=>{
      if(n==='express')return express;if(n==='cors')return()=>()=>{};
      if(n==='http')return {createServer:()=>({listen(){}})};
      if(n==='ws')return WS;if(n==='crypto')return crypto;
      if(n.startsWith('./'))return require(path.join(__dirname,'..',n));
      throw Error('Blocked dependency '+n);
    }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8')+'\nglobalThis.testAPI={queueCommand,checkQueuedAuthority,commandsByDevice};',context);
  return {routes,calls,api:context.testAPI,env:context.process.env};
}


function fixture(flags={}){
 let revision=7;let outage=false;
 const h=boot({DEVICE_PREFERENCES_ENABLED:'true',AUTO_PREFERENCE_COMMANDS_ENABLED:'true',HANDOVER_GATES_ENABLED:'true',SUPABASE_ANON_KEY:'fixture-anon',...flags},async(url,init)=>{
  const b=JSON.parse(init.body||'{}');
  if(url.endsWith('honorpole_preferences_auto_check_r1')){
   if(outage)throw Error('unavailable');
   return b.p_revision===revision?{ok:true,json:async()=>({allowed:true,deviceId:b.p_device,generation:0,revision})}:{ok:false,json:async()=>({code:'HP409'})};
  }
  if(url.endsWith('honorpole_authorize_auto_r1'))return {ok:true,json:async()=>({allowed:true,deviceId:b.p_device,channel:'auto',generation:0})};
  throw Error('Unexpected fixture RPC '+url);
 });
 return {...h,change(){revision++},fail(){outage=true}};
}
test('AUTO admission requires the version of the settings actually evaluated',async()=>{
 const h=fixture();const result=await h.api.queueCommand('HP-002','FULL','AUTO',{kind:'auto'});
 assert.equal(result.denied,true);assert.equal(result.status,409);assert.equal(h.api.commandsByDevice.size,0);
});
test('changed settings cancel an already queued AUTO decision at fresh delivery check',async()=>{
 const h=fixture();const r=await h.api.queueCommand('HP-002','FULL','AUTO',{kind:'auto',preferences:{generation:0,revision:7}});assert.ok(r.commandId);
 const record=h.api.commandsByDevice.get('HP-002');assert.equal(await h.api.checkQueuedAuthority(record,'HP-002'),200);
 h.change();assert.equal(await h.api.checkQueuedAuthority(record,'HP-002'),409);
});
test('AUTO settings authorization outage fails closed at delivery',async()=>{
 const h=fixture();await h.api.queueCommand('HP-002','FULL','AUTO',{kind:'auto',preferences:{generation:0,revision:7}});h.fail();
 assert.equal(await h.api.checkQueuedAuthority(h.api.commandsByDevice.get('HP-002'),'HP-002'),503);
});
test('STOP is not blocked by missing preferences or an authority outage',async()=>{
 const h=fixture();h.fail();const result=await h.api.queueCommand('HP-002','STOP','AUTO',{kind:'auto'});
 assert.ok(result.commandId);assert.equal(result.motor,'STOP');assert.equal(h.calls.length,0);
});
test('settings version at admission is copied rather than retaining a mutable input object',async()=>{
 const h=fixture(),snapshot={generation:0,revision:7};await h.api.queueCommand('HP-002','FULL','AUTO',{kind:'auto',preferences:snapshot});
 snapshot.revision=8;h.change();assert.equal(await h.api.checkQueuedAuthority(h.api.commandsByDevice.get('HP-002'),'HP-002'),409);
});

test('disabling the authority never silently accepts a versioned AUTO decision as legacy',async()=>{
 const h=boot({DEVICE_PREFERENCES_ENABLED:'false'});
 const r=await h.api.queueCommand('HP-002','FULL','AUTO',{kind:'auto',preferences:{generation:0,revision:7}});
 assert.equal(r.denied,true);assert.equal(r.status,503);assert.equal(h.api.commandsByDevice.size,0);assert.equal(h.calls.length,0);
});

test('new preference authority does not implicitly activate automatic movement',async()=>{
 const h=boot({DEVICE_PREFERENCES_ENABLED:'true'});
 const r=await h.api.queueCommand('HP-002','FULL','AUTO',{kind:'auto',preferences:{generation:0,revision:7}});
 assert.equal(r.denied,true);assert.equal(r.status,503);assert.equal(h.calls.length,0);
});


const benchAuthority = {kind:'auto', preferences:{generation:0, revision:7}};

test('bench scope permits only HP-002 with the service-wide switch off', async () => {
 const h=fixture({AUTO_PREFERENCE_COMMANDS_ENABLED:'false', AUTO_PREFERENCE_BENCH_DEVICE_ID:'HP-002'});
 const denied=await h.api.queueCommand('HP-001','FULL','AUTO',benchAuthority);
 assert.equal(denied.status,503);
 assert.equal(h.calls.length,0);
 assert.equal(h.api.commandsByDevice.has('HP-001'),false);
 const allowed=await h.api.queueCommand('HP-002','FULL','AUTO',benchAuthority);
 assert.ok(allowed.commandId);
 const record=h.api.commandsByDevice.get('HP-002');
 assert.equal(await h.api.checkQueuedAuthority(record,'HP-002'),200);
 delete h.env.AUTO_PREFERENCE_BENCH_DEVICE_ID;
 assert.equal(await h.api.checkQueuedAuthority(record,'HP-002'),409);
});

test('explicit bench scope limits movement even if the service-wide switch is on', async () => {
 const h=fixture({AUTO_PREFERENCE_BENCH_DEVICE_ID:'HP-002'});
 const denied=await h.api.queueCommand('HP-001','FULL','AUTO',benchAuthority);
 assert.equal(denied.status,503);
 const stop=await h.api.queueCommand('HP-001','STOP','AUTO',{kind:'auto'});
 assert.equal(stop.motor,'STOP');
 assert.equal(h.calls.length,0);
});

test('invalid bench scope never falls back to the service-wide switch', async () => {
 for(const scope of ['', 'HP-000', 'HP-002,HP-001']){
  const h=fixture({AUTO_PREFERENCE_BENCH_DEVICE_ID:scope});
  const result=await h.api.queueCommand('HP-002','FULL','AUTO',benchAuthority);
  assert.equal(result.status,503);
  assert.equal(h.api.commandsByDevice.size,0);
  assert.equal(h.calls.length,0);
 }
});

test('bench scope cannot enable legacy AUTO without preference authority', async () => {
 const h=boot({DEVICE_PREFERENCES_ENABLED:'false',AUTO_PREFERENCE_BENCH_DEVICE_ID:'HP-002'});
 const denied=await h.api.queueCommand('HP-002','FULL','AUTO',{kind:'auto'});
 assert.equal(denied.status,503);
 assert.equal(h.api.commandsByDevice.size,0);
 assert.equal(h.calls.length,0);
});
