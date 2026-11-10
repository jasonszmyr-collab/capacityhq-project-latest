'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const prefix=fs.readFileSync(__dirname+'/backend.test.cjs','utf8').split('const auth=')[0];
const harness=new Function('require','__dirname',prefix+'\nreturn harness;')(require,__dirname);
function fixture(){
 const p={role:'admin',auth:200,membership:200,userId:'old-user'};
 const h=harness({fetch:async(url,init)=>{
  let data;
  if(url.endsWith('/auth/v1/user')){
   if(p.authGate)await p.authGate;
   if(p.authThrow)throw Error('auth unavailable');
   if(p.auth!==200)return {ok:false,status:p.auth};
   data={id:p.userId};
  }else if(url.includes('/rest/v1/device_users?')){
   if(p.gate)await p.gate;
   if(p.throw)throw Error('membership unavailable');
   if(p.membership!==200)return {ok:false,status:p.membership};
   const q=new URL(url).searchParams;
   data=p.malformed?{}:p.role?[{device_id:p.deviceId||q.get('device_id').slice(3),user_id:p.rowUser||q.get('user_id').slice(3),role:p.role}]:[];
  }else if(url.endsWith('/rpc/honorpole_factory_lookup'))data=[];
  else throw Error('Unexpected URL '+url);
  return {ok:true,json:async()=>data};
 }});
 const send=(command='FULL',source='MANUAL',legacy=false)=>h.request('POST',legacy?'/control':'/api/device/:deviceId/command',{
  headers:{authorization:'Bearer old-token'},params:{deviceId:'HP-004'},body:{device_id:'HP-004',command,source}});
 const poll=()=>h.request('GET','/control',{headers:{'x-device-secret':'legacy-four'},query:{deviceId:'HP-004'}});
 return {p,h,send,poll};
}
for(const command of ['FULL','HALF','BOTTOM','CAL','CANCEL','RESET','REBOOT'])test('revoked queued '+command+' is cancelled before delivery',async()=>{
 const {p,h,send,poll}=fixture();const q=await send(command);assert.equal(q.code,200);p.role=null;
 const r=await poll();assert.equal(r.code,200);assert.equal(r.data.motor,'STOP');assert.equal(r.data.commandId,null);
 const s=h.getDeviceState('HP-004'),rec=h.commandsByDevice.get('HP-004');
 assert.equal(s.commandPending,false);assert.equal(s.commandDeliveredAt,null);assert.equal(s.commandResult,null);
 assert.equal(rec.commandId,q.data.commandId);assert.equal(rec.deliveredAt,null);assert.equal(rec.cancellationReason,'access_revoked');
 p.role='admin';assert.equal((await poll()).data.commandId,null,'restoration cannot revive cancelled command');
});
for(const legacy of [false,true])test('both user routes recheck even spoofed AUTO source '+legacy,async()=>{
 const {p,send,poll}=fixture();assert.equal((await send('FULL','AUTO',legacy)).code,200);p.role=null;assert.equal((await poll()).data.commandId,null);
});
for(const role of ['admin','viewer'])test('still authorized '+role+' delivers exactly once',async()=>{
 const {p,h,send,poll}=fixture();const q=await send();p.role=role;const r=await poll();assert.equal(r.data.commandId,q.data.commandId);assert.equal(r.data.motor,'FULL');
 assert.equal(h.getDeviceState('HP-004').status,'delivered');assert.equal((await poll()).data.commandId,null);
 assert.ok(!JSON.stringify([...h.commandsByDevice]).includes('old-token'),'queue records contain no bearer');
});
for(const change of [{role:'unknown'},{rowUser:'other-user'},{deviceId:'HP-001'},{auth:401},{auth:403},{userId:'different-user'}])test('invalid queued authority '+JSON.stringify(change),async()=>{
 const {p,h,send,poll}=fixture();await send();Object.assign(p,change);assert.equal((await poll()).data.commandId,null);assert.equal(h.getDeviceState('HP-004').commandPending,false);
});
for(const change of [{auth:500},{membership:503},{throw:true},{authThrow:true},{malformed:true}])test('transient failure holds for retry '+JSON.stringify(change),async()=>{
 const {p,h,send,poll}=fixture();const q=await send();Object.assign(p,change);let r=await poll();assert.equal(r.code,503);assert.equal(r.data.commandId,null);
 assert.equal(h.getDeviceState('HP-004').commandPending,true);assert.equal(h.commandsByDevice.get('HP-004').deliveredAt,null);
 Object.assign(p,{auth:200,membership:200,throw:false,authThrow:false,malformed:false});r=await poll();assert.equal(r.data.commandId,q.data.commandId);
});
test('queued STOP survives revocation and does not require user auth',async()=>{
 const {p,h,send,poll}=fixture();const q=await send('STOP');p.role=null;p.authThrow=true;
 const before=h.calls.filter(x=>x.url.endsWith('/auth/v1/user')).length;const r=await poll();assert.equal(r.data.motor,'STOP');assert.equal(r.data.commandId,q.data.commandId);
 assert.equal(h.calls.filter(x=>x.url.endsWith('/auth/v1/user')).length,before);
});
test('trusted AUTO remains independent of user membership',async()=>{
 const {p,h,poll}=fixture();const q=await h.request('POST','/auto/control',{headers:{'x-honorpole-auto-secret':'fake-auto'},body:{device_id:'HP-004',command:'FULL'}});
 p.authThrow=true;p.role=null;assert.equal((await poll()).data.commandId,q.data.commandId);
});
for(const replacement of ['STOP','HALF'])for(const denied of [false,true])test('in-flight '+(denied?'denial':'allow')+' cannot consume replacement '+replacement,async()=>{
 const {p,h,send,poll}=fixture();const original=await send();let release,entered;
 const reached=new Promise(r=>entered=r);p.gate=new Promise(r=>release=r);
 const oldGate=p.gate;p.gate={then(resolve,reject){entered();return oldGate.then(resolve,reject)}};
 const first=poll();await reached;p.gate=null;const q=await send(replacement);assert.equal(q.code,200);p.role=denied?null:'admin';release();
 const r=await first;assert.equal(r.data.commandId,null);assert.equal(h.getDeviceState('HP-004').commandPending,true);
 assert.equal(h.commandsByDevice.get('HP-004').commandId,q.data.commandId);assert.equal(h.commandsByDevice.get('HP-004').deliveredAt,null);
 assert.notEqual(original.data.commandId,q.data.commandId);
 if(replacement==='STOP')assert.equal((await poll()).data.commandId,q.data.commandId);
});
test('simultaneous polls deliver a queued motion at most once',async()=>{
 const {p,send,poll}=fixture();const q=await send();let release; p.gate=new Promise(r=>release=r);
 const a=poll(),b=poll();await new Promise(r=>setImmediate(r));release();const results=await Promise.all([a,b]);
 assert.equal(results.filter(r=>r.data.commandId===q.data.commandId).length,1);
});
