const {test}=require('node:test'),assert=require('node:assert/strict');
const {createSetupAccess,signature}=require('../setup-access.cjs');
const key='A'.repeat(64),boot='B'.repeat(32),permanent='E'.repeat(32);
function response(){return{code:200,headers:{},status(v){this.code=v;return this;},set(k,v){this.headers[k]=v;return this;},json(v){this.body=v;return this;}};}
function harness(capable=true){
 let time=100000,count=0;
 const setup=createSetupAccess({now:()=>time,random:()=> (++count===1?'C':'D').repeat(32),getState:()=>({online:true,lastSeen:time,state:'IDLE',commandPending:false,motor:'STOP',status:'idle'})});
 const poll=(extra={})=>{const res=response();setup.poll({deviceId:'HP-002',query:{boot,clock:'1000',...(capable?{recovery:'1'}:{}),...extra},headers:{'x-device-secret':key}},res);return res;};poll();
 const admin={params:{deviceId:'HP-002'},user:{id:'owner'},deviceMembership:{user_id:'owner',device_id:'HP-002',role:'admin'}};
 const started=response();setup.open(admin,started);assert.equal(started.code,202);admin.params.requestId=started.body.requestId;
 const status=(req=admin)=>{const res=response();setup.status(req,res);return res;};
 const ack=(data={})=>{const res=response();setup.acknowledge({deviceId:'HP-002',body:{boot,requestId:started.body.requestId,result:'OPEN',...data}},res);return res;};
 return{setup,admin,poll,status,ack,time:v=>time=v};
}
test('permanent credential requires signed v2 opening and matching acknowledged OPEN',()=>{const h=harness();assert.equal(h.status().body.recoveryPassword,undefined);const packet=h.poll().body.setup;assert.equal(packet.recovery,true);assert.equal(packet.signature,signature(packet,key));assert.notEqual(packet.signature,signature({...packet,recovery:false},key));assert.equal(h.ack({recoveryPassword:permanent}).code,200);const result=h.status();assert.equal(result.body.password,'D'.repeat(32));assert.equal(result.body.recoveryPassword,permanent);assert.equal(result.headers['Cache-Control'],'no-store');});
for(const value of [undefined,'bad','e'.repeat(32),'E'.repeat(33),123])test('invalid permanent credential rejected '+value,()=>{const h=harness();assert.equal(h.ack({recoveryPassword:value}).code,400);assert.equal(h.status().body.result,'PENDING');assert.equal(h.status().body.recoveryPassword,undefined);});
test('legacy board never promotes temporary or unsolicited credential to recovery',()=>{const h=harness(false),packet=h.poll().body.setup;assert.equal(packet.recovery,undefined);assert.equal(packet.signature,signature(packet,key));h.ack({recoveryPassword:permanent});assert.equal(h.status().body.recoveryPassword,undefined);});
test('refused opening exposes neither password',()=>{const h=harness();h.ack({result:'REFUSED',recoveryPassword:permanent});assert.equal(h.status().body.password,undefined);assert.equal(h.status().body.recoveryPassword,undefined);});
test('ack retries cannot replace accepted recovery value',()=>{const h=harness();h.ack({recoveryPassword:permanent});h.ack({recoveryPassword:'F'.repeat(32)});assert.equal(h.status().body.recoveryPassword,permanent);});
test('wrong boot and request cannot attach recovery',()=>{const h=harness();for(const data of [{boot:'F'.repeat(32)},{requestId:'F'.repeat(32)}])assert.equal(h.ack({...data,recoveryPassword:permanent}).code,409);assert.equal(h.status().body.recoveryPassword,undefined);});
test('nonadmin, revoked membership, different user and different pole cannot read recovery',()=>{const h=harness();h.ack({recoveryPassword:permanent});for(const req of [{...h.admin,deviceMembership:{...h.admin.deviceMembership,role:'viewer'}},{...h.admin,deviceMembership:null},{...h.admin,user:{id:'other'}},{...h.admin,params:{...h.admin.params,deviceId:'HP-003'}}]){const res=h.status(req);assert.equal(res.code,403);assert.equal(res.body.recoveryPassword,undefined);}});
test('replacement administrator cannot inherit another owner session',()=>{const h=harness();h.ack({recoveryPassword:permanent});assert.equal(h.status({...h.admin,user:{id:'newowner'},deviceMembership:{...h.admin.deviceMembership,user_id:'newowner'}}).code,404);});
test('expiry and board restart remove recovery session',()=>{for(const reset of ['expiry','restart']){const h=harness();h.ack({recoveryPassword:permanent});if(reset==='expiry')h.time(700000);else h.poll({boot:'F'.repeat(32)});assert.equal(h.status().code,404);}});
