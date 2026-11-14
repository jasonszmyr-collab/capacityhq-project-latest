'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http');
const {createHandoverDelivery}=require('../handover-delivery.cjs');
const {message,signDirective}=require('../handover-protocol.cjs');
const key='A'.repeat(64),hash=crypto.createHash('sha256').update(key).digest('hex');
const p={deviceId:'HP-002',boot:'B'.repeat(32),ticket:'D'.repeat(32),requestId:'12345678-1234-1234-1234-123456789abc',action:'RELEASE',generation:0,nextGeneration:1,deadline:45100};
const poll={deviceId:p.deviceId,boot:p.boot,ticket:p.ticket,deadline:p.deadline};
function ack(){const a={...p,state:'RELEASED'};a.signature=crypto.createHmac('sha256',key).update(message(a,true)).digest('hex').toUpperCase();return a;}
function harness(fetchOverride){
 const calls=[];
 const service=createHandoverDelivery({supabaseUrl:'https://fixture.invalid',serviceKey:'synthetic-service',fetchImpl:async(url,init)=>{
  const name=url.split('/').at(-1),body=JSON.parse(init.body);calls.push({name,body});
  if(fetchOverride)return fetchOverride(name,body);
  return {ok:true,json:async()=>name==='honorpole_handover_advance_ack_r1'?
   {accepted:true,deviceId:p.deviceId,boot:p.boot,ticket:p.ticket,signature:ack().signature}:{deviceId:p.deviceId,directive:p}};
 }});
 async function call(kind,b=kind==='poll'?poll:ack()){
  const headers={};const res={code:200,set(k,v){headers[k]=v;return this},status(c){this.code=c;return this},json(v){this.data=v;return this},end(){return this}};
  await service[kind]({headers:{'x-device-secret':key},body:b},res);return {...res,headers};
 }
 return {calls,call,service};
}
test('RELEASE poll signs only the issued generation transition',async()=>{
 const h=harness(),r=await h.call('poll');assert.equal(r.code,200);assert.deepEqual(r.data,signDirective(p,key));
 assert.equal(h.calls[0].name,'honorpole_handover_issue_directive_r1');assert.equal(h.calls[0].body.p_secret_hash,hash);
 assert.equal(JSON.stringify(h.calls).includes(key),false);assert.equal(r.headers['Cache-Control'],'no-store');
});
test('RELEASED ACK verifies durable issuance then calls atomic recorder',async()=>{
 const h=harness(),r=await h.call('acknowledge');assert.equal(r.code,200);assert.equal(r.data.signature,ack().signature);
 assert.deepEqual(h.calls.map(c=>c.name),['honorpole_handover_get_directive_r1','honorpole_handover_advance_ack_r1']);
 assert.deepEqual(h.calls[1].body,{p_device:p.deviceId,p_secret_hash:hash,p_ack:ack()});
});
test('fresh backend handler can retry a lost RELEASE receipt',async()=>{
 assert.deepEqual((await harness().call('acknowledge')).data,(await harness().call('acknowledge')).data);
});
for(const [label,patch] of [['wrong state',{state:'QUIESCED'}],['wrong action',{action:'HOLD'}],['wrong next generation',{nextGeneration:2}],['extra field',{completed:true}],['bad signature format',{signature:'bad'}]])
 test(`RELEASE ACK malformed ${label} never records`,async()=>{
  const h=harness(),r=await h.call('acknowledge',{...ack(),...patch});assert.equal(r.code,400);assert.equal(h.calls.length,0);
 });
for(const [label,patch] of [['signature',{signature:'0'.repeat(64)}],['request',{requestId:'22345678-1234-1234-1234-123456789abc'}],['boot',{boot:'E'.repeat(32)}],['ticket',{ticket:'E'.repeat(32)}],['deadline',{deadline:45101}]])
 test(`RELEASE ACK uncorrelated ${label} never records`,async()=>{
  const h=harness(),r=await h.call('acknowledge',{...ack(),...patch});assert.equal(r.code,409);assert.equal(h.calls.length,1);
 });
for(const code of ['HP401','HP409','XX000'])test(`RELEASE completion refusal ${code} leaves ACK unconfirmed`,async()=>{
 const h=harness(async(name)=>name==='honorpole_handover_get_directive_r1'?{ok:true,json:async()=>({deviceId:p.deviceId,directive:p})}:{ok:false,json:async()=>({code,message:'PRIVATE'})});
 const r=await h.call('acknowledge');assert.equal(r.code,({HP401:401,HP409:409})[code]||503);assert.equal(JSON.stringify(r.data).includes('PRIVATE'),false);
});
for(const patch of [{accepted:false},{ticket:'F'.repeat(32)},{signature:'F'.repeat(64)}])test('uncorrelated RELEASE receipt fails closed '+JSON.stringify(patch),async()=>{
 const h=harness(async(name)=>({ok:true,json:async()=>name==='honorpole_handover_get_directive_r1'?{deviceId:p.deviceId,directive:p}:{accepted:true,deviceId:p.deviceId,boot:p.boot,ticket:p.ticket,signature:ack().signature,...patch}}));
 assert.equal((await h.call('acknowledge')).code,503);
});
test('localhost HTTP delivers signed RELEASE and exact ACK confirmation',async()=>{
 const h=harness(),server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);req.body=JSON.parse(Buffer.concat(chunks).toString());
  res.set=(k,v)=>{res.setHeader(k,v);return res};res.status=c=>{res.statusCode=c;return res};
  res.json=v=>{const b=JSON.stringify(v);res.setHeader('Content-Length',Buffer.byteLength(b));res.end(b)};
  await h.service[req.url==='/handover/poll'?'poll':'acknowledge'](req,res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const post=(route,b)=>fetch(`http://127.0.0.1:${server.address().port}`+route,{method:'POST',headers:{'x-device-secret':key,'Content-Type':'application/json'},body:JSON.stringify(b)});
  const issued=await post('/handover/poll',poll);assert.equal(issued.status,200);assert.deepEqual(await issued.json(),signDirective(p,key));
  const receipt=await post('/handover/ack',ack());assert.equal(receipt.status,200);assert.deepEqual(await receipt.json(),{success:true,accepted:true,deviceId:p.deviceId,boot:p.boot,ticket:p.ticket,signature:ack().signature});
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
