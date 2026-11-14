'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createFactoryRegistry}=require('../factory-registry.cjs');
const key='A'.repeat(64),newKey='B'.repeat(64),hash=k=>crypto.createHash('sha256').update(k).digest('hex');
function fixture(options={}){
 let record={device_id:'HP-004',secret_hash:hash(key),enabled:true};const calls=[];
 const registry=createFactoryRegistry({supabaseUrl:'https://fixture.invalid',serviceKey:'service',enabled:true,legacySecrets:{'HP-004':key},legacyTelemetryIds:options.legacy?['HP-004']:[],fetchImpl:async(url,init)=>{
  calls.push({url,body:JSON.parse(init.body)});if(options.fetch)return options.fetch(calls.length,record);
  return {ok:true,json:async()=>record?[record]:[]};
 }});
 async function auth(secret=key,kind='requireTelemetryAuth'){
  const res={code:200,status(n){this.code=n;return this},json(x){this.data=x;return this}};let admitted=false;
  await registry[kind]({method:'POST',headers:{'x-device-secret':secret},body:{deviceId:'HP-004'}},res,()=>{admitted=true});
  return {...res,admitted};
 }
 return {auth,calls,set record(v){record=v},get record(){return record}};
}
test('each admitted device request makes its own fresh registry lookup',async()=>{const f=fixture();assert.equal((await f.auth()).admitted,true);assert.equal((await f.auth()).admitted,true);assert.equal(f.calls.length,2)});
test('previously accepted key is rejected immediately after replacement',async()=>{const f=fixture();await f.auth();f.record={...f.record,secret_hash:hash(newKey)};assert.equal((await f.auth()).code,401);assert.equal((await f.auth(newKey)).admitted,true);assert.equal(f.calls.length,3)});
test('previously accepted key is rejected immediately after revocation',async()=>{const f=fixture();await f.auth();f.record={...f.record,enabled:false};assert.equal((await f.auth()).code,401)});
test('negative registry result is not cached across enrollment',async()=>{const f=fixture({legacy:true});f.record=null;assert.equal((await f.auth('')).admitted,true);f.record={device_id:'HP-004',secret_hash:hash(newKey),enabled:true};assert.equal((await f.auth('')).code,401);assert.equal((await f.auth(newKey)).admitted,true)});
test('fresh lookup outage never reuses earlier positive authority',async()=>{let broken=false;const f=fixture({fetch:async(n,r)=>{if(broken)throw Error('private');return {ok:true,json:async()=>[r]}}});await f.auth();broken=true;assert.equal((await f.auth()).code,503)});
test('fresh malformed record never reuses earlier positive authority',async()=>{const f=fixture();await f.auth();f.record={device_id:'HP-999',secret_hash:hash(key),enabled:true};assert.equal((await f.auth()).code,503)});
test('pairing authentication also uses fresh registry authority',async()=>{const f=fixture();assert.equal((await f.auth(key,'requirePairingAuth')).admitted,true);f.record={...f.record,enabled:false};assert.equal((await f.auth(key,'requirePairingAuth')).code,401)});
test('independent server instances observe replacement without invalidation broadcasts',async()=>{const a=fixture(),b=fixture();await a.auth();await b.auth();a.record={...a.record,secret_hash:hash(newKey)};b.record={...b.record,secret_hash:hash(newKey)};assert.equal((await a.auth()).code,401);assert.equal((await b.auth()).code,401);assert.equal((await a.auth(newKey)).admitted,true)});
test('later request does not join an older pending lookup or inherit its result',async()=>{
 let release;const wait=new Promise(r=>release=r);const f=fixture({fetch:async(n,r)=>{const captured={...r};if(n===1)await wait;return {ok:true,json:async()=>[captured]}}});
 const earlier=f.auth();f.record={...f.record,secret_hash:hash(newKey)};assert.equal((await f.auth(newKey)).admitted,true);assert.equal(f.calls.length,2);release();await earlier;
 assert.equal((await f.auth()).code,401);assert.equal(f.calls.length,3);
 // The earlier request read before replacement. Already-admitted/in-flight work
 // still requires the separate gate/barrier reconciliation; no stronger claim here.
});
test('lookup capacity is bounded and released after concurrent requests',async()=>{
 let release;const wait=new Promise(r=>release=r);const f=fixture({fetch:async(n,r)=>{await wait;return {ok:true,json:async()=>[r]}}});
 const pending=Array.from({length:100},()=>f.auth());assert.equal((await f.auth()).code,503);assert.equal(f.calls.length,100);release();assert.ok((await Promise.all(pending)).every(r=>r.admitted));assert.equal((await f.auth()).admitted,true);
});
test('failed lookups release admission capacity',async()=>{let broken=true;const f=fixture({fetch:async(n,r)=>{if(broken)throw Error('outage');return {ok:true,json:async()=>[r]}}});for(let n=0;n<105;n++)assert.equal((await f.auth()).code,503);broken=false;assert.equal((await f.auth()).admitted,true)});
test('revoked enrollment never falls back to configured legacy key',async()=>{const f=fixture({legacy:true});f.record={...f.record,enabled:false};assert.equal((await f.auth(key)).code,401)});
