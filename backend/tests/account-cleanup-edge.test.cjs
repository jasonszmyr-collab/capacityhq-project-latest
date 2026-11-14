'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const handlerPath=path.join(__dirname,'../../supabase/functions/delete-account/handler.mjs');
const load=()=>import(pathToFileURL(handlerPath).href);
const uid='00000000-0000-0000-0000-000000000001';
async function fixture(options={}){
 const {createDeleteAccountHandler}=await load();const calls=[],logs=[];let checks=0;
 const user={auth:{getUser:async()=>options.badUser?{data:{user:null},error:{}}:{data:{user:{id:uid}},error:null}},rpc:async(name)=>{
  calls.push({kind:'preflight',name});checks++;
  if(options.preflight)return options.preflight(checks);
  return {data:{ready:true,userId:options.wrongUser?'other':uid},error:null};
 }};
 const admin={auth:{admin:{deleteUser:async(id,softDelete)=>{calls.push({kind:'deleteAuth',id,softDelete});if(options.throwDelete)throw Error('SECRET');return {error:options.deleteError?{code:'database_error'}:null}}}},from(){throw Error('Manual cleanup must not run')}};
 const h=createDeleteAccountHandler({createClient:(url,key,config)=>{calls.push({kind:'client',key,config});return key==='service'?admin:user},getEnv:n=>options.missingConfig?null:({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'})[n],logger:{error:(...x)=>logs.push(x)}});
 async function call(method='POST',body={},authorization='Bearer synthetic-user'){
  const req=new Request('http://fixture.invalid/delete-account',{method,headers:authorization?{Authorization:authorization}:undefined,...(method==='POST'?{body:JSON.stringify(body)}:{})});const r=await h(req);return {code:r.status,data:r.status===200&&method==='OPTIONS'?await r.text():await r.json(),headers:r.headers};
 }
 return {calls,logs,call};
}
test('Edge OPTIONS succeeds without creating SDK clients',async()=>{const f=await fixture(),r=await f.call('OPTIONS');assert.equal(r.code,200);assert.equal(f.calls.length,0)});
test('Edge GET refuses without creating SDK clients',async()=>{const f=await fixture();assert.equal((await f.call('GET')).code,405);assert.equal(f.calls.length,0)});
test('Edge missing bearer refuses',async()=>{const f=await fixture();assert.equal((await f.call('POST',{},'')).code,401);assert.equal(f.calls.length,0)});
test('Edge missing configuration fails closed',async()=>{const f=await fixture({missingConfig:true});assert.equal((await f.call()).code,500);assert.equal(f.calls.length,0)});
test('Edge invalid identity never attempts deletion',async()=>{const f=await fixture({badUser:true});assert.equal((await f.call()).code,401);assert.equal(f.calls.some(x=>x.kind==='deleteAuth'),false)});
for(const [code,status] of [['HP409',409],['HP401',401],['XX000',503]])test('Edge preflight '+code+' prevents all deletion',async()=>{const f=await fixture({preflight:async()=>({error:{code,message:'SECRET'}})});const r=await f.call();assert.equal(r.code,status);assert.equal(f.calls.some(x=>x.kind==='deleteAuth'),false);assert.equal(JSON.stringify(r.data).includes('SECRET'),false)});
test('Edge mismatched preflight identity fails closed',async()=>{const f=await fixture({wrongUser:true});assert.equal((await f.call()).code,503);assert.equal(f.calls.some(x=>x.kind==='deleteAuth'),false)});
test('Edge missing readiness fails closed',async()=>{const f=await fixture({preflight:async()=>({data:{userId:uid}})});assert.equal((await f.call()).code,503)});
test('Edge success uses only Auth deletion and authenticated identity',async()=>{const f=await fixture(),r=await f.call();assert.equal(r.code,200);assert.deepEqual(f.calls.filter(x=>x.kind==='deleteAuth'),[{kind:'deleteAuth',id:uid,softDelete:false}]);assert.equal(f.calls.filter(x=>x.kind==='preflight').length,1)});
test('Edge malicious body cannot select another account',async()=>{const f=await fixture();assert.equal((await f.call('POST',{userId:'victim',id:'victim'})).code,200);assert.equal(f.calls.find(x=>x.kind==='deleteAuth').id,uid)});
test('Edge concurrent freeze refusal is surfaced after Auth API error',async()=>{const f=await fixture({deleteError:true,preflight:async(n)=>n===1?{data:{ready:true,userId:uid}}:{error:{code:'HP409'}}});assert.equal((await f.call()).code,409);assert.equal(f.calls.filter(x=>x.kind==='deleteAuth').length,1)});
test('Edge unconfirmed deletion returns retry guidance rather than success',async()=>{const f=await fixture({deleteError:true});const r=await f.call();assert.equal(r.code,503);assert.equal(r.data.success,undefined);assert.match(r.data.error,/confirm/)});
test('Edge thrown network failure never logs private error content',async()=>{const f=await fixture({throwDelete:true});const r=await f.call();assert.equal(r.code,503);assert.equal(JSON.stringify([r.data,f.logs]).includes('SECRET'),false)});
test('Edge retains CORS and user bearer stays on the user client',async()=>{const f=await fixture();const r=await f.call();assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.equal(f.calls.find(x=>x.kind==='client'&&x.key==='anon').config.global.headers.Authorization,'Bearer synthetic-user');assert.equal(f.calls.find(x=>x.kind==='client'&&x.key==='service').config.global,undefined)});
