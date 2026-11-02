'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createFactoryRegistry}=require('../factory-registry.cjs');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const id='HP-900001',code='JKLM-NPQR',previous='ABCD-EFGH';
const requestId='AABBCCDD-1234-4567-89AB-AABBCCDDEEFF';
const expiry='2099-01-01T00:00:00Z';
function harness(options={}){
 const calls=[];
 const registry=createFactoryRegistry({enabled:true,supabaseUrl:'https://fixture.invalid',serviceKey:'synthetic-service',fetchImpl:async(url,init)=>{
  assert.ok(url.startsWith('https://fixture.invalid/rest/v1/rpc/'));
  calls.push({url,body:JSON.parse(init.body),init});
  return {ok:!options.error,json:async()=>options.error?{code:options.error,message:'private database detail'}:options.malformed?{deviceId:'HP-900002',expiresAt:expiry}:{deviceId:id,expiresAt:expiry}};
 }});
 const run=async(fields={})=>{
  const req={deviceId:id,body:{pairingCode:code,requestId,previousPairingCode:previous,...fields}};
  const res={statusCode:200,status(n){this.statusCode=n;return this},json(data){this.data=data;return this}};
  await registry.reissue(req,res);return res;
 };
 return {registry,calls,run};
}
test('guarded replacement calls distinct RPC with normalized UUID and hashes only',async()=>{
 const h=harness(),r=await h.run({pairingCode:' jklm-npqr ',previousPairingCode:' abcd-efgh '});
 assert.equal(r.statusCode,200);assert.equal(r.data.pairingProtocol,3);assert.equal(r.data.requestId,requestId.toLowerCase());assert.equal(h.calls.length,1);
 assert.ok(h.calls[0].url.endsWith('/honorpole_replace_pairing_code_r3'));
 assert.deepEqual(h.calls[0].body,{p_device_id:id,p_request_id:requestId.toLowerCase(),p_expected_pairing_hash:hash(previous),p_pairing_code_hash:hash(code)});
 assert.ok(!JSON.stringify(h.calls[0].body).includes(previous));assert.ok(!JSON.stringify(r.data).includes(code));
});
for(const [label,fields] of [
 ['request without predecessor',{previousPairingCode:undefined}],
 ['predecessor without request',{requestId:undefined}],
 ['null request',{requestId:null}],['numeric request',{requestId:4}],
 ['invalid UUID',{requestId:'not-a-uuid'}],['padded UUID',{requestId:' '+requestId}],
 ['null predecessor',{previousPairingCode:null}],['numeric predecessor',{previousPairingCode:3}],
 ['invalid predecessor',{previousPairingCode:'AAAA-0000'}],
 ['unchanged code',{previousPairingCode:code}],['equal normalized code',{previousPairingCode:' jklm-npqr '}]
])test('guard contract refuses '+label+' without RPC',async()=>{const h=harness(),r=await h.run(fields);assert.equal(r.statusCode,400);assert.equal(h.calls.length,0)});
for(const [error,status] of [['HP400',400],['HP401',401],['HP404',404],['HP409',409],['HP410',410],['23505',503],['PGRST202',503]])test('guarded refusal maps safely '+error,async()=>{
 const h=harness({error}),r=await h.run();assert.equal(r.statusCode,status);assert.equal(h.calls.length,1);assert.ok(!JSON.stringify(r.data).includes('private database detail'));
});
test('a guarded RPC refusal never falls back to the legacy mutator',async()=>{
 const h=harness({error:'PGRST202'}),r=await h.run();assert.equal(r.statusCode,503);assert.equal(h.calls.length,1);assert.ok(h.calls.every(c=>c.url.endsWith('/honorpole_replace_pairing_code_r3')));
});
test('malformed guarded success fails closed',async()=>{const h=harness({malformed:true});assert.equal((await h.run()).statusCode,503)});
test('exact guarded retry sends identical request data and forwards fixed server expiry',async()=>{
 const h=harness(),a=await h.run(),b=await h.run();assert.deepEqual(h.calls[0].body,h.calls[1].body);assert.equal(a.data.expiresAt,b.data.expiresAt);
});
test('legacy two-field client still calls only hardened legacy RPC',async()=>{
 const h=harness(),r=await h.run({requestId:undefined,previousPairingCode:undefined});assert.equal(r.statusCode,200);
 assert.ok(h.calls[0].url.endsWith('/honorpole_reissue_pairing_code'));
 assert.deepEqual(h.calls[0].body,{p_device_id:id,p_pairing_code_hash:hash(code)});
});
