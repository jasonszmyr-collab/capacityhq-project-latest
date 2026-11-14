'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createHandoverApp}=require('../handover-app.cjs');
const id='40145678-1234-1234-1234-123456789abc',owner='00000000-0000-0000-0000-000000000001',recipient='00000000-0000-0000-0000-000000000002',code='A'.repeat(64);
const sample=()=>({invitationId:id,deviceId:'HP-401',initiator:owner,recipient:null,recipientEmail:null,generation:0,phase:'offered',expiresAt:'2099-01-01T00:00:00Z',frozen:false});
function fixture(options={}){
 const calls=[];let result=sample();
 const app=createHandoverApp({supabaseUrl:'https://fixture.invalid',anonKey:'synthetic-anon',newTransfers:options.enabled!==false,fetchImpl:async(url,init)=>{
  const body=JSON.parse(init.body);calls.push({url,headers:init.headers,body});
  if(options.fetch)return options.fetch(url,init);
  return {ok:true,json:async()=>result};
 }});
 async function run(method,body={},user=owner,params={invitationId:id}){
  const res={code:200,headers:{},set(k,v){this.headers[k]=v;return this},status(n){this.code=n;return this},json(data){this.data=data;return this}};
  await app[method]({user:{id:user},accessToken:'synthetic-jwt',body,params},res);return res;
 }
 return {run,calls,set result(v){result=v}};
}
test('owner create hashes the code and forwards only authenticated JWT authority',async()=>{
 const f=fixture(),r=await f.run('create',{invitationId:id,deviceId:'HP-401',code});assert.equal(r.code,200);
 assert.equal(f.calls[0].headers.Authorization,'Bearer synthetic-jwt');assert.equal(f.calls[0].headers.apikey,'synthetic-anon');
 assert.deepEqual(f.calls[0].body,{p_invitation:id,p_device:'HP-401',p_hash:crypto.createHash('sha256').update(code).digest('hex')});
 assert.ok(!JSON.stringify(r.data).includes(code));assert.equal(r.headers['Cache-Control'],'no-store');
});
for(const body of [{invitationId:id,deviceId:'HP-401',code,actor:owner},{invitationId:id,deviceId:'HP-401',code,recipientId:recipient},{invitationId:id,deviceId:'HP-000',code},{invitationId:'bad',deviceId:'HP-401',code},{invitationId:id,deviceId:'HP-401',code:'bad'}])test('untrusted create fields never reach SQL '+JSON.stringify(body),async()=>{const f=fixture();assert.equal((await f.run('create',body)).code,400);assert.equal(f.calls.length,0)});
test('redeem binds the response to authenticated recipient and hides hash material',async()=>{
 const f=fixture();f.result={...sample(),recipient,phase:'accepted',token_hash:'private-hash',code};
 const r=await f.run('accept',{code:code.toLowerCase()},recipient);assert.equal(r.code,200);assert.equal(r.data.recipient,recipient);assert.equal(r.data.code,undefined);assert.equal(r.data.token_hash,undefined);
 assert.equal(f.calls[0].body.p_hash,crypto.createHash('sha256').update(code).digest('hex'));
});
test('confirm requires exact bound recipient and has no actor/source bypass',async()=>{
 const f=fixture();f.result={...sample(),recipient,phase:'quiescing',frozen:true};
 assert.equal((await f.run('confirm',{recipientId:recipient})).code,200);
 assert.deepEqual(f.calls[0].body,{p_invitation:id,p_recipient:recipient});
 assert.equal((await f.run('confirm',{recipientId:recipient,source:'AUTO'})).code,400);
});
test('wrong-account RPC response fails closed without disclosure',async()=>{
 const f=fixture();f.result={...sample(),initiator:recipient};const r=await f.run('create',{invitationId:id,deviceId:'HP-401',code});assert.equal(r.code,503);assert.equal(r.data.recipient,undefined);
});
for(const status of [400,401,403,404,409,410,503])test('RPC error '+status+' is sanitized',async()=>{
 const f=fixture({fetch:async()=>({ok:false,status:400,json:async()=>({code:'HP'+status,message:'private '+code})})});
 const r=await f.run('create',{invitationId:id,deviceId:'HP-401',code});assert.equal(r.code,status);assert.ok(!JSON.stringify(r.data).includes(code));
});
test('network/JSON failures do not retry ownership writes',async()=>{
 const f=fixture({fetch:async()=>{throw Error('private '+code)}});const r=await f.run('create',{invitationId:id,deviceId:'HP-401',code});assert.equal(r.code,503);assert.equal(f.calls.length,1);assert.ok(!JSON.stringify(r.data).includes(code));
});
test('disabled new transfers retain list, status and cancellation recovery',async()=>{
 const f=fixture({enabled:false});assert.equal((await f.run('create',{invitationId:id,deviceId:'HP-401',code})).code,503);assert.equal((await f.run('accept',{code},recipient)).code,503);assert.equal((await f.run('confirm',{recipientId:recipient})).code,503);assert.equal(f.calls.length,0);
 f.result=[sample()];assert.equal((await f.run('list')).code,200);f.result=sample();assert.equal((await f.run('status')).code,200);assert.equal((await f.run('cancel')).code,200);
});
test('capabilities require both runtime and database policy',async()=>{const f=fixture({enabled:false});f.result={available:true,canStart:true};assert.equal((await f.run('capabilities')).data.canStart,false)});
test('participant list refuses foreign records instead of exposing them',async()=>{const f=fixture();f.result=[{...sample(),initiator:recipient}];const r=await f.run('list');assert.equal(r.code,503);assert.equal(r.data.invitations,undefined)});
test('invalid context never reaches SQL',async()=>{const f=fixture();assert.equal((await f.run('list',{},'unverified')).code,401);assert.equal(f.calls.length,0)});
