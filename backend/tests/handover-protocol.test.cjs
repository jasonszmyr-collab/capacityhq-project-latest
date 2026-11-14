'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {MAX, message, signDirective, verifyAcknowledgement} = require('../handover-protocol.cjs');
const key = 'A'.repeat(64);
const base = {deviceId:'HP-002', boot:'B'.repeat(32), ticket:'C'.repeat(32),
  requestId:'12345678-1234-1234-1234-123456789abc', action:'HOLD', generation:7, nextGeneration:7, deadline:45100};
function ack(p) {
  const a={...p, state:p.action==='HOLD'?'QUIESCED':'RELEASED'};
  a.signature=crypto.createHmac('sha256',key).update(message(a,true)).digest('hex').toUpperCase();return a;
}
test('canonical HOLD directive uses domain and all correlation fields',()=>{
  assert.equal(message(base), `HPHANDOVER1|DIRECTIVE|HP-002|${base.boot}|${base.ticket}|${base.requestId}|HOLD|7|7|45100`);
});
test('signer only returns authenticated wire fields',()=>{
  const signed=signDirective({...base,token:'PRIVATE',owner:'PRIVATE'},key);
  assert.equal(signed.token,undefined);assert.equal(signed.owner,undefined);
  assert.match(signed.signature,/^[0-9A-F]{64}$/);
});
for(const [field,value] of Object.entries({deviceId:'HP-003',boot:'D'.repeat(32),ticket:'E'.repeat(32),
  requestId:'22345678-1234-1234-1234-123456789abc',action:'RELEASE',generation:8,nextGeneration:8,deadline:45101}))
  test(`ACK rejects mismatched ${field}`,()=>assert.equal(verifyAcknowledgement({...ack(base),[field]:value},base,key),false));
for(const [label,patch] of [
  ['zero identity',{deviceId:'HP-000'}],['delimiter injection',{deviceId:'HP-002|ACK'}],
  ['newline identity',{deviceId:'HP-002\n'}],['newline request',{requestId:base.requestId+'\n'}],
  ['lowercase boot',{boot:'b'.repeat(32)}],['short ticket',{ticket:'C'}],
  ['uppercase UUID',{requestId:base.requestId.toUpperCase()}],['negative generation',{generation:-1}],
  ['fractional generation',{generation:0.5}],['unsafe generation',{generation:MAX+1}],
  ['string generation',{generation:'7'}],['hold advances generation',{nextGeneration:8}],
  ['release skips generation',{action:'RELEASE',nextGeneration:9}],
  ['release overflow',{action:'RELEASE',generation:MAX,nextGeneration:MAX}],
  ['unknown action',{action:'STOP'}],['negative deadline',{deadline:-1}],
  ['oversize deadline',{deadline:0x100000000}],['string deadline',{deadline:'45100'}]
]) test(`signer rejects ${label}`,()=>assert.throws(()=>signDirective({...base,...patch},key),TypeError));
test('HOLD ACK verifies only as QUIESCED',()=>{
  const a=ack(base);assert.equal(verifyAcknowledgement(a,base,key),true);
  assert.equal(verifyAcknowledgement({...a,state:'RELEASED'},base,key),false);
});
test('RELEASE ACK verifies separately and advances exactly once',()=>{
  const p={...base,action:'RELEASE',nextGeneration:8};
  assert.equal(verifyAcknowledgement(ack(p),p,key),true);
  assert.equal(verifyAcknowledgement(ack(p),base,key),false);
});
for(const signature of ['', '0'.repeat(64), 'A'.repeat(63), 'G'.repeat(64), 'a'.repeat(64)])
  test(`bad ACK signature ${signature.slice(0,4)}/${signature.length}`,()=>assert.equal(verifyAcknowledgement({...ack(base),signature},base,key),false));
test('directive signature cannot authenticate an acknowledgement',()=>{
  assert.equal(verifyAcknowledgement({...signDirective(base,key),state:'QUIESCED'},base,key),false);
});
test('wrong factory key fails closed',()=>assert.equal(verifyAcknowledgement(ack(base),base,'F'.repeat(64)),false));
test('malformed input never verifies',()=>{
  for(const a of [null,{},[],false,'packet'])assert.equal(verifyAcknowledgement(a,base,key),false);
  assert.equal(verifyAcknowledgement(ack(base),null,key),false);
});
test('generation boundary serializes without rounding',()=>{
  const p={...base,generation:MAX,nextGeneration:MAX};assert.ok(message(p).includes('|9007199254740991|9007199254740991|'));
  assert.equal(verifyAcknowledgement(ack(p),p,key),true);
});
for(const secret of ['', 'a'.repeat(64),'A'.repeat(63),'G'.repeat(64)])
  test(`invalid key ${secret.slice(0,1)}/${secret.length}`,()=>assert.throws(()=>signDirective(base,secret),TypeError));
module.exports={base,key};
