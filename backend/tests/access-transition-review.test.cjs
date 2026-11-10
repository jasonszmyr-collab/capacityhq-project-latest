'use strict';
// Stateful membership changes are synthetic; no accounts or devices are touched.
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const prefix=fs.readFileSync(__dirname+'/backend.test.cjs','utf8').split('const auth=')[0];
assert.ok(prefix.includes('function harness(options={}'));
const harness=new Function('require','__dirname',prefix+'\nreturn harness;')(require,__dirname);
function fixture(){
 const membership=new Map([['old-user','admin']]);
 const h=harness({fetch:async(url,init)=>{
  const token=(init.headers?.Authorization||'').replace('Bearer ','');
  const user=token==='new-token'?'new-user':'old-user';let data;
  if(url.endsWith('/auth/v1/user'))data={id:user};
  else if(url.includes('/rest/v1/device_users?')){
   const q=new URL(url).searchParams,id=q.get('device_id')?.replace(/^eq\./,''),uid=q.get('user_id')?.replace(/^eq\./,'');
   data=membership.has(uid)&&id==='HP-004'?[{device_id:id,user_id:uid,role:membership.get(uid)}]:[];
  }else if(url.endsWith('/rpc/honorpole_factory_lookup'))data=[];
  else throw Error('Unconfigured fixture request: '+url);
  return {ok:true,json:async()=>data};
 }});
 const user=(method,route,token='old-token',body={},params={})=>h.request(method,route,{headers:{authorization:'Bearer '+token},body,params:{deviceId:'HP-004',...params}});
 return {h,membership,user};
}
test('same signed-in user loses command, status, share and setup access after membership removal',async()=>{
 const {h,membership,user}=fixture();assert.equal((await user('GET','/api/device/:deviceId/status')).code,200);membership.delete('old-user');
 for(const [method,route,body,params]of [
  ['POST','/api/device/:deviceId/command',{command:'FULL'}],['POST','/control',{device_id:'HP-004',command:'FULL'}],
  ['GET','/api/device/:deviceId/status'],['POST','/api/device/:deviceId/share'],['POST','/api/device/:deviceId/setup'],
  ['GET','/api/device/:deviceId/setup/:requestId',{}, {requestId:'old-session'}]
 ])assert.equal((await user(method,route,'old-token',body,params)).code,403,route);
 assert.equal(h.commandsByDevice.size,0);
});
test('membership removal cannot replace an existing queued STOP',async()=>{
 const {h,membership,user}=fixture();const original=await user('POST','/api/device/:deviceId/command','old-token',{command:'STOP'});
 assert.equal(original.code,200);membership.delete('old-user');
 assert.equal((await user('POST','/api/device/:deviceId/command','old-token',{command:'FULL'})).code,403);
 assert.equal(h.commandsByDevice.get('HP-004').commandId,original.data.commandId);assert.equal(h.commandsByDevice.get('HP-004').motor,'STOP');
});
test('downgraded viewer retains assigned-pole control but cannot share or access another pole',async()=>{
 const {membership,user}=fixture();membership.set('old-user','viewer');
 assert.equal((await user('POST','/api/device/:deviceId/command','old-token',{command:'HALF'})).code,200);
 assert.equal((await user('POST','/api/device/:deviceId/share')).code,403);
 assert.equal((await user('GET','/api/device/:deviceId/status','old-token',{}, {deviceId:'HP-001'})).code,403);
});
test('simulated handover denies old administrator and permits replacement administrator',async()=>{
 const {membership,user}=fixture();assert.equal((await user('GET','/api/device/:deviceId/status')).code,200);
 assert.equal((await user('GET','/api/device/:deviceId/status','new-token')).code,403);
 membership.delete('old-user');membership.set('new-user','admin');
 assert.equal((await user('GET','/api/device/:deviceId/status')).code,403);
 assert.equal((await user('POST','/api/device/:deviceId/command','old-token',{command:'FULL'})).code,403);
 assert.equal((await user('GET','/api/device/:deviceId/status','new-token')).code,200);
 assert.equal((await user('POST','/api/device/:deviceId/command','new-token',{command:'STOP'})).code,200);
});
test('membership restoration permits control while unknown roles remain denied',async()=>{
 const {membership,user}=fixture();membership.delete('old-user');assert.equal((await user('GET','/api/device/:deviceId/status')).code,403);
 membership.set('old-user','unknown');assert.equal((await user('POST','/api/device/:deviceId/command','old-token',{command:'FULL'})).code,403);
 membership.set('old-user','admin');assert.equal((await user('POST','/api/device/:deviceId/command','old-token',{command:'STOP'})).code,200);
});
test('motion queued before revocation is cancelled before delivery',async()=>{
 const {h,membership,user}=fixture();const queued=await user('POST','/api/device/:deviceId/command','old-token',{command:'FULL'});assert.equal(queued.code,200);
 membership.delete('old-user');assert.equal((await user('GET','/api/device/:deviceId/status')).code,403);
 const polled=await h.request('GET','/control',{headers:{'x-device-secret':'legacy-four'},query:{deviceId:'HP-004'}});
 assert.equal(polled.code,200);assert.equal(polled.data.motor,'STOP');assert.equal(polled.data.commandId,null);assert.equal(h.getDeviceState('HP-004').commandPending,false);
 // The original characterization is now a required cancellation expectation.
});
