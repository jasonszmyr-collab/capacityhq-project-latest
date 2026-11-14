'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http');
const {createHandoverDelivery}=require('../handover-delivery.cjs');
const {message,verifyAcknowledgement}=require('../handover-protocol.cjs');
const key='A'.repeat(64),hash=crypto.createHash('sha256').update(key).digest('hex');
const p={deviceId:'HP-002',boot:'B'.repeat(32),ticket:'C'.repeat(32),requestId:'12345678-1234-1234-1234-123456789abc',action:'HOLD',generation:7,nextGeneration:7,deadline:45100};
const poll={deviceId:p.deviceId,boot:p.boot,ticket:p.ticket,deadline:p.deadline};
function ack(){const a={...p,state:'QUIESCED'};a.signature=crypto.createHmac('sha256',key).update(message(a,true)).digest('hex').toUpperCase();return a;}
function harness(options={}){
  const calls=[];
  const service=createHandoverDelivery({supabaseUrl:'https://fixture.invalid',serviceKey:options.noService?'':'fixture-service',fetchImpl:async(url,init)=>{
    const name=url.split('/').at(-1),body=JSON.parse(init.body);calls.push({name,body,headers:init.headers});
    if(options.fetch)return options.fetch(name,body);
    let data;
    if(name==='honorpole_handover_issue_directive_r1')data={deviceId:p.deviceId,directive:options.empty?null:p};
    else if(name==='honorpole_handover_get_directive_r1')data={deviceId:p.deviceId,directive:p};
    else if(name==='honorpole_handover_advance_ack_r1')data={accepted:true,deviceId:p.deviceId,boot:p.boot,ticket:p.ticket,signature:ack().signature};
    else throw Error('Unexpected RPC');
    return {ok:true,json:async()=>data};
  }});
  async function call(kind,body=kind==='poll'?poll:ack(),header=key){
    const headers={};const res={code:200,data:undefined,set(k,v){headers[k]=v;return this},status(n){this.code=n;return this},json(v){this.data=v;return this},end(){return this}};
    await service[kind]({headers:{'x-device-secret':header},body},res);return {...res,headers};
  }
  return {service,calls,call};
}
test('poll signs only database-issued frozen HOLD and transmits only credential hash to RPC',async()=>{
  const h=harness(),r=await h.call('poll');assert.equal(r.code,200);assert.equal(r.data.action,'HOLD');
  assert.equal(h.calls[0].body.p_secret_hash,hash);assert.equal(JSON.stringify(h.calls).includes(key),false);
  assert.equal(r.headers['Cache-Control'],'no-store');assert.equal(r.headers.Pragma,'no-cache');
  const expected=crypto.createHmac('sha256',key).update(message(p)).digest('hex').toUpperCase();assert.equal(r.data.signature,expected);
});
test('no active frozen request returns 204 without a directive',async()=>assert.equal((await harness({empty:true}).call('poll')).code,204));
test('valid QUIESCED ACK is verified against durable issued record before recording',async()=>{
  const h=harness(),r=await h.call('acknowledge');assert.equal(r.code,200);assert.equal(r.data.accepted,true);
  assert.deepEqual(h.calls.map(c=>c.name),['honorpole_handover_get_directive_r1','honorpole_handover_advance_ack_r1']);
  assert.equal(h.calls[1].body.p_secret_hash,hash);assert.deepEqual(h.calls[1].body.p_ack,ack());
});
test('fresh handler after backend restart can correlate ACK through durable RPC rather than memory',async()=>{
  const first=harness();await first.call('poll');const second=harness();assert.equal((await second.call('acknowledge')).code,200);
});
for(const header of ['',undefined,'A'.repeat(63),'a'.repeat(64),'A'.repeat(64)+' '])
  test(`malformed credential ${String(header).length} does not call database`,async()=>{
    const h=harness(),r=await h.call('poll',poll,header===undefined?null:header);assert.equal(r.code,401);assert.equal(h.calls.length,0);
  });
for(const [label,patch] of [['extra field',{requestId:p.requestId}],['wrong boot',{boot:'b'.repeat(32)}],
 ['wrong ticket',{ticket:'C'}],['fraction deadline',{deadline:1.5}],['string deadline',{deadline:'45100'}],
 ['overflow deadline',{deadline:0x100000000}]])
 test(`poll rejects ${label} before RPC`,async()=>{const h=harness(),r=await h.call('poll',{...poll,...patch});assert.equal(r.code,400);assert.equal(h.calls.length,0);});
for(const [label,patch] of [['different device',{deviceId:'HP-003'}],['different boot',{boot:'D'.repeat(32)}],
 ['different ticket',{ticket:'D'.repeat(32)}],['different deadline',{deadline:45101}],['invalid release',{action:'RELEASE',nextGeneration:9}],
 ['unsafe generation',{generation:Number.MAX_SAFE_INTEGER+1,nextGeneration:Number.MAX_SAFE_INTEGER+1}]])
 test(`malformed/uncorrelated issue result ${label} is never signed`,async()=>{
   const h=harness({fetch:async()=>({ok:true,json:async()=>({deviceId:p.deviceId,directive:{...p,...patch}})})});
   const r=await h.call('poll');assert.equal(r.code,503);assert.equal(r.data.signature,undefined);
 });
for(const code of ['HP401','HP404','HP409','HP400','XX000'])test(`SQL refusal ${code} maps without disclosing payload`,async()=>{
  const h=harness({fetch:async()=>({ok:false,json:async()=>({code,message:'PRIVATE'})})});const r=await h.call('poll');
  assert.equal(r.code,({HP401:401,HP404:401,HP409:409,HP400:400})[code]||503);assert.equal(JSON.stringify(r.data).includes('PRIVATE'),false);
});
test('RPC outage fails closed',async()=>assert.equal((await harness({fetch:async()=>{throw Error('PRIVATE')}}).call('poll')).code,503));
test('absent service configuration fails closed',async()=>{const h=harness({noService:true});assert.equal((await h.call('poll')).code,503);assert.equal(h.calls.length,0);});
test('bad HMAC never reaches record RPC',async()=>{
  const h=harness(),r=await h.call('acknowledge',{...ack(),signature:'0'.repeat(64)});assert.equal(r.code,409);assert.equal(h.calls.length,1);
});
test('wrong issued request never reaches record RPC',async()=>{
  const h=harness({fetch:async()=>({ok:true,json:async()=>({deviceId:p.deviceId,directive:{...p,generation:8,nextGeneration:8}})})});
  assert.equal((await h.call('acknowledge')).code,409);assert.equal(h.calls.length,1);
});
for(const patch of [{state:'RELEASED'},{action:'RELEASE',nextGeneration:8},{success:true},{generation:'7'}])
 test(`malformed ACK is refused ${JSON.stringify(patch)}`,async()=>{
   const h=harness();assert.equal((await h.call('acknowledge',{...ack(),...patch})).code,400);assert.equal(h.calls.length,0);
 });
test('credential revocation between read and record overrides earlier valid ACK',async()=>{
  const h=harness({fetch:async(name)=>name==='honorpole_handover_get_directive_r1'?
    {ok:true,json:async()=>({deviceId:p.deviceId,directive:p})}:{ok:false,json:async()=>({code:'HP401'})}});
  assert.equal((await h.call('acknowledge')).code,401);assert.equal(h.calls.length,2);
});
test('uncorrelated positive record response cannot confirm ACK',async()=>{
  const h=harness({fetch:async(name)=>({ok:true,json:async()=>name==='honorpole_handover_get_directive_r1'?
    {deviceId:p.deviceId,directive:p}:{accepted:true,deviceId:p.deviceId,boot:p.boot,ticket:'E'.repeat(32),signature:ack().signature}})});
  assert.equal((await h.call('acknowledge')).code,503);
});
test('localhost HTTP delivers signed HOLD and accepts correlated ACK',async()=>{
  const h=harness();const server=http.createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    req.body=JSON.parse(Buffer.concat(chunks).toString());
    res.set=(k,v)=>{res.setHeader(k,v);return res;};res.status=n=>{res.statusCode=n;return res;};
    res.json=v=>{const text=JSON.stringify(v);res.setHeader('Content-Type','application/json');res.setHeader('Content-Length',Buffer.byteLength(text));res.end(text);};
    await h.service[req.url==='/handover/poll'?'poll':'acknowledge'](req,res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  try{
    const post=(route,body,secret=key)=>fetch(url+route,{method:'POST',headers:{'x-device-secret':secret,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const r=await post('/handover/poll',poll);assert.equal(r.status,200);const signed=await r.json();assert.equal(signed.signature.length,64);
    const a=ack();assert.equal(verifyAcknowledgement(a,signed,key),true);
    const saved=await post('/handover/ack',a);assert.equal(saved.status,200);assert.equal((await saved.json()).signature,a.signature);
    const denied=await post('/handover/poll',poll,'bad');assert.equal(denied.status,401);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
