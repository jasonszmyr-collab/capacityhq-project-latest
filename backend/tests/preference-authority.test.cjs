'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createPreferenceAuthority}=require('../preference-authority.cjs');
const actor='11111111-1111-4111-8111-111111111111',operation='22222222-2222-4222-8222-222222222222';
const view={deviceId:'HP-002',generation:3,revision:8,settings:null,override_mode:'AUTO',testmode:false};
const body={operationId:operation,generation:3,revision:7,kind:'override',value:'AUTO'};
function request(overrides={}){return {params:{deviceId:'HP-002'},user:{id:actor},accessToken:'fixture-user-token',body:{...body},...overrides}}
function response(){return {code:200,headers:{},set(k,v){this.headers[k]=v;return this},status(s){this.code=s;return this},json(v){this.body=v;return this}}}
function setup(result=view,status=200){const calls=[];const api=createPreferenceAuthority({supabaseUrl:'https://fixture.invalid',anonKey:'fixture-anon',fetchImpl:async(url,options)=>{
 calls.push({url,options});return new Response(JSON.stringify(result),{status})}});return {api,calls}}
test('write forwards user token and exact versioned request to one RPC',async()=>{
 const {api,calls}=setup();const r=response();await api.write(request(),r);
 assert.equal(r.code,200);assert.deepEqual(r.body,{...view,automatic_movement_enabled:false});assert.equal(calls.length,1);
 assert.equal(calls[0].options.headers.Authorization,'Bearer fixture-user-token');
 assert.deepEqual(JSON.parse(calls[0].options.body),{p_device:'HP-002',p_operation:operation,p_generation:3,p_revision:7,p_kind:'override',p_value:'AUTO'});
 assert.equal(r.headers['Cache-Control'],'no-store');
});
test('read uses one authenticated read RPC',async()=>{const {api,calls}=setup();const r=response();await api.get(request(),r);assert.equal(r.code,200);assert.ok(calls[0].url.endsWith('/honorpole_preferences_read_r1'));assert.deepEqual(JSON.parse(calls[0].options.body),{p_device:'HP-002'})});
for(const [name,change] of [
 ['missing revision',b=>delete b.revision],['negative generation',b=>b.generation=-1],
 ['unsafe revision',b=>b.revision=Number.MAX_SAFE_INTEGER+1],['invalid operation',b=>b.operationId='bad'],
 ['extra field',b=>b.admin=true],['invalid mode',b=>b.value='RAISE'],
 ['unknown kind',b=>b.kind='owner'],['malformed settings',b=>{b.kind='settings';b.value={}}],
])test(name+' is rejected before RPC',async()=>{const {api,calls}=setup();const q=request();change(q.body);const r=response();await api.write(q,r);assert.equal(r.code,400);assert.equal(calls.length,0)});
for(const id of ['HP-000','HP-2','HP-002/evil',null])test('invalid device '+id,async()=>{const {api,calls}=setup();const r=response();await api.get(request({params:{deviceId:id}}),r);assert.equal(r.code,400);assert.equal(calls.length,0)});
test('missing authenticated context never reaches RPC',async()=>{const {api,calls}=setup();const r=response();await api.write(request({user:null}),r);assert.equal(r.code,401);assert.equal(calls.length,0)});
for(const [code,status] of [['HP400',400],['HP401',401],['HP403',403],['HP404',403],['HP409',409],['XX000',503]])test('safe error mapping '+code,async()=>{
 const {api}=setup({code,message:'sensitive details'},400);const r=response();await api.write(request(),r);assert.equal(r.code,status);assert.ok(!JSON.stringify(r.body).includes('sensitive'));
});
for(const [name,v] of [['wrong device',{...view,deviceId:'HP-001'}],['unexpected field',{...view,secret:'fixture'}],['unsafe revision',{...view,revision:1e20}],['bad mode',{...view,override_mode:'RAISE'}]])test('malformed RPC response '+name,async()=>{const {api}=setup(v);const r=response();await api.get(request(),r);assert.equal(r.code,503);assert.ok(!JSON.stringify(r.body).includes('fixture'))});
test('upstream failure fails closed',async()=>{const api=createPreferenceAuthority({supabaseUrl:'https://fixture.invalid',anonKey:'fixture',fetchImpl:async()=>{throw Error('sensitive')}});const r=response();await api.write(request(),r);assert.equal(r.code,503);assert.ok(!JSON.stringify(r.body).includes('sensitive'))});
test('missing configuration fails closed without fetch',async()=>{const api=createPreferenceAuthority({supabaseUrl:'',anonKey:'',fetchImpl:async()=>assert.fail('fetch')});const r=response();await api.get(request(),r);assert.equal(r.code,503)});
