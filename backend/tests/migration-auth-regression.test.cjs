'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {createFactoryRegistry} = require('../factory-registry.cjs');
const {createSetupAccess, signature} = require('../setup-access.cjs');
const key = 'A'.repeat(64), oldKey = 'B'.repeat(64), factory = 'F'.repeat(64);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function response() {
  return {code:200, body:null, headers:{}, status(n){this.code=n;return this;},
    json(value){this.body=value;return this;}, set(k,v){this.headers[k]=v;return this;}};
}
function registry(record, fail=false) {
  return createFactoryRegistry({supabaseUrl:'https://example.invalid',serviceKey:'mock',
    enabled:true, factorySecret:factory, legacyTelemetryIds:['HP-001'],
    legacySecrets:{'HP-001':oldKey,'HP-002':oldKey},
    fetchImpl:async()=>{if(fail)throw Error('unavailable');return {ok:true,json:async()=>record?[record]:[]};}});
}
for (const method of ['requireTelemetryAuth','requirePairingAuth']) {
  for (const [name, secret, enabled, expected] of [
    ['new key accepted',key,true,200],['old key rejected',oldKey,true,401],
    ['missing key rejected','',true,401],['revoked key rejected',key,false,401]
  ]) test(`${method}: enrolled ${name}`,async()=>{
    const r=registry({device_id:'HP-001',secret_hash:hash(key),enabled});
    const res=response();let next=0;
    await r[method]({method:'GET',query:{device_id:'HP-001'},headers:{'x-device-secret':secret}},res,()=>next++);
    assert.equal(res.code,expected);assert.equal(next,expected===200?1:0);
  });
}
test('Unenrolled legacy telemetry continues; phone setup requires credentials',async()=>{
  const r=registry(null), req={method:'GET',query:{device_id:'HP-001'},headers:{}};
  let next=0;await r.requireTelemetryAuth(req,response(),()=>next++);assert.equal(next,1);
  const res=response();await r.requirePairingAuth(req,res,()=>assert.fail('bypass'));assert.equal(res.code,401);
});
test('HP-002 legacy credentials remain accepted',async()=>{
  const r=registry(null);let next=0;
  await r.requirePairingAuth({method:'GET',query:{device_id:'HP-002'},headers:{'x-device-secret':oldKey}},response(),()=>next++);
  assert.equal(next,1);
});
test('Registry outage fails closed even for compatible legacy telemetry',async()=>{
  const res=response();await registry(null,true).requireTelemetryAuth(
    {method:'GET',query:{device_id:'HP-001'},headers:{}},res,()=>assert.fail('downgrade'));
  assert.equal(res.code,503);
});
test('Enrollment clears the cached legacy lookup before next device request',async()=>{
  let enrolled=false;let lookups=0;
  const r=createFactoryRegistry({supabaseUrl:'https://example.invalid',serviceKey:'mock',
    enabled:true,factorySecret:factory,legacyTelemetryIds:['HP-001'],fetchImpl:async(url)=>{
      if(url.endsWith('honorpole_factory_migrate')){enrolled=true;return {ok:true,json:async()=>({deviceId:'HP-001',created:false,claimed:true,migrated:true})};}
      lookups++;return {ok:true,json:async()=>enrolled?[{device_id:'HP-001',secret_hash:hash(key),enabled:true}]:[]};
    }});
  const device={method:'GET',query:{device_id:'HP-001'},headers:{}};
  await r.requireTelemetryAuth(device,response(),()=>{});assert.equal(lookups,1);
  const res=response();await r.migrate({headers:{'x-honorpole-factory-secret':factory},
    body:{deviceId:'HP-001',requestId:'12345678-1234-1234-1234-123456789012',secret:key}},res);
  assert.equal(res.code,200);
  const denied=response();await r.requireTelemetryAuth(device,denied,()=>assert.fail('stale bypass'));
  assert.equal(denied.code,401);assert.equal(lookups,2);
});
test('Protected phone setup polls, signs, acknowledges, and reveals password only to admin',()=>{
  const now=100000;let randomCount=0;
  const setup=createSetupAccess({now:()=>now,random:()=> (++randomCount===1?'C':'D').repeat(32),
    getState:()=>({online:true,lastSeen:now,state:'IDLE',commandPending:false,motor:'STOP',status:'idle'})});
  const boot='E'.repeat(32),deviceId='HP-001';
  setup.poll({deviceId,query:{boot,clock:'1000'},headers:{'x-device-secret':key}},response());
  const admin={params:{deviceId},user:{id:'owner'},deviceMembership:{user_id:'owner',device_id:deviceId,role:'admin'}};
  const opened=response();setup.open(admin,opened);assert.equal(opened.code,202);
  const requestId=opened.body.requestId;admin.params.requestId=requestId;
  const pending=response();setup.status(admin,pending);assert.equal(pending.body.password,undefined);
  const poll=response();setup.poll({deviceId,query:{boot,clock:'1100'},headers:{'x-device-secret':key}},poll);
  assert.equal(poll.body.setup.signature,signature(poll.body.setup,key));
  const ack=response();setup.acknowledge({deviceId,body:{boot,requestId,result:'OPEN'}},ack);assert.equal(ack.code,200);
  const ready=response();setup.status(admin,ready);assert.equal(ready.body.ssid,'HonorPole-Setup-HP-001');assert.equal(ready.body.password,'D'.repeat(32));
  const denied=response();setup.status({...admin,deviceMembership:{...admin.deviceMembership,role:'viewer'}},denied);assert.equal(denied.code,403);
});
test('Migration route is registered once; all protected phone setup routes retain their middleware',()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8');
  for (const route of [
    'app.post("/api/factory/devices/migrate", factoryRegistry.migrate);',
    'app.post("/api/factory/devices", factoryRegistry.register);',
    'app.post("/api/device/:deviceId/setup", requireSupabaseAuth, requireDeviceAccess, phoneSetup.open);',
    'app.get("/api/device/:deviceId/setup/:requestId", requireSupabaseAuth, requireDeviceAccess, phoneSetup.status);',
    'app.get("/setup/poll", factoryRegistry.requirePairingAuth, phoneSetup.poll);',
    'app.post("/setup/result", factoryRegistry.requirePairingAuth, phoneSetup.acknowledge);'
  ]) assert.equal(server.split(route).length-1,1,route);
});
