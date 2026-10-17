'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {createFactoryRegistry}=require('../factory-registry.cjs');
const key='A'.repeat(64),factory='F'.repeat(64),requestId='12345678-1234-1234-1234-123456789012';
function harness(options={}){let calls=[];let status,body;const registry=createFactoryRegistry({supabaseUrl:'https://example.invalid',serviceKey:'mock',enabled:true,factorySecret:factory,legacyTelemetryIds:['HP-001'],fetchImpl:async(url,req)=>{calls.push({url,body:JSON.parse(req.body)});if(options.unavailable)throw Error('offline');return {ok:!options.rpcError,json:async()=> options.rpcError?{code:options.rpcError}:options.response??{deviceId:'HP-001',created:false,claimed:true,migrated:true}}},...options.config});return {registry,calls,res:{status(n){status=n;return this},json(v){body=v;return this}},get status(){return status},get body(){return body}};}
function req(){return {headers:{'x-honorpole-factory-secret':factory},body:{deviceId:'HP-001',requestId,secret:key}};}
test('Existing-device migration hashes credentials, retains ID, returns no secret',async()=>{const h=harness();await h.registry.migrate(req(),h.res);assert.equal(h.status,200);assert.equal(h.calls.length,1);assert.match(h.calls[0].url,/honorpole_factory_migrate$/);assert.equal(h.calls[0].body.p_device_id,'HP-001');assert.equal(h.calls[0].body.p_secret_hash,crypto.createHash('sha256').update(key).digest('hex'));assert.equal(JSON.stringify(h.body).includes(key),false);assert.equal(h.body.created,false);});
for(const [name,mutate,status] of [
 ['missing factory auth',r=>delete r.headers['x-honorpole-factory-secret'],401],
 ['wrong factory auth',r=>r.headers['x-honorpole-factory-secret']='B'.repeat(64),401],
 ['unapproved existing ID',r=>r.body.deviceId='HP-002',400],
 ['malformed ID',r=>r.body.deviceId='../HP-001',400],
 ['missing ID',r=>delete r.body.deviceId,400],
 ['wrong request type',r=>r.body.requestId=12,400],
 ['bad request UUID',r=>r.body.requestId='bad',400],
 ['bad secret length',r=>r.body.secret='short',400],
 ['lowercase secret',r=>r.body.secret='a'.repeat(64),400],
 ['missing secret',r=>delete r.body.secret,400]])
 test(name+' refused before RPC',async()=>{const h=harness(),r=req();mutate(r);await h.registry.migrate(r,h.res);assert.equal(h.status,status);assert.equal(h.calls.length,0);});
test('Disabled registry refuses migration',async()=>{const h=harness({config:{enabled:false}});await h.registry.migrate(req(),h.res);assert.equal(h.status,503);assert.equal(h.calls.length,0);});
for(const [code,status] of [['HP400',400],['HP404',404],['HP409',409],['XX000',503]])test('RPC '+code+' maps safely',async()=>{const h=harness({rpcError:code});await h.registry.migrate(req(),h.res);assert.equal(h.status,status);assert.equal(JSON.stringify(h.body).includes(key),false);});
for(const response of [{deviceId:'HP-002',created:false,claimed:true,migrated:true},{deviceId:'HP-001',created:true,claimed:true,migrated:true},{deviceId:'HP-001',created:false,claimed:false,migrated:true},{}])test('Malformed migration RPC response rejected '+JSON.stringify(response),async()=>{const h=harness({response});await h.registry.migrate(req(),h.res);assert.equal(h.status,503);});
test('Idempotent SQL result accepted without reporting new enrollment',async()=>{const h=harness({response:{deviceId:'HP-001',created:false,claimed:true,migrated:false}});await h.registry.migrate(req(),h.res);assert.equal(h.status,200);assert.equal(h.body.migrated,false);});
test('Credential service failure does not downgrade migration',async()=>{const h=harness({unavailable:true});await h.registry.migrate(req(),h.res);assert.equal(h.status,503);});
test('SQL writes credentials only and restricts execution',()=>{const sql=fs.readFileSync(__dirname+'/../sql/2026-10-17-existing-device-migration.sql','utf8');assert.doesNotMatch(sql,/(insert\s+into|update|delete\s+from)\s+public\.(devices|device_users)\b/i);assert.match(sql,/pg_advisory_xact_lock\(179123, 1005\)/);assert.match(sql,/v_existing.revoked_at is not null/);assert.match(sql,/grant execute[^;]+to service_role/i);assert.match(sql,/revoke all[^;]+from public,anon,authenticated,service_role/i);});
