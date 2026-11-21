'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
function boot(flags={},fetchOverride){
  const routes=new Map(),calls=[];
  const app={use(){},get(p,...h){routes.set('GET '+p,h)},post(p,...h){routes.set('POST '+p,h)}};
  const express=()=>app;express.json=express.static=()=>()=>{};
  class WS{static OPEN=1;static Server=class{constructor(){this.clients=new Set();}on(){}};}
  const context={__filename:'isolated-server.cjs',console:{log(){},error(){},warn(){},table(){}},Buffer,URL,AbortSignal,
    setInterval(){return 1;},clearInterval(){},setTimeout(){throw Error('Unexpected timer');},
    process:{env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',...flags}},
    fetch:async(url,init)=>{calls.push({url,body:init.body?JSON.parse(init.body):null});if(fetchOverride)return fetchOverride(url,init);
      const b=JSON.parse(init.body);return {ok:true,json:async()=>({deviceId:b.p_device,directive:null})};},
    require:n=>{
      if(n==='express')return express;if(n==='cors')return()=>()=>{};
      if(n==='http')return {createServer:()=>({listen(){}})};
      if(n==='ws')return WS;if(n==='crypto')return crypto;
      if(n.startsWith('./'))return require(path.join(__dirname,'..',n));
      throw Error('Blocked dependency '+n);
    }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8'),context);
  return {routes,calls};
}

const prefGet='GET /api/device/:deviceId/preferences';
const prefPost='POST /api/device/:deviceId/preferences';
for(const value of [undefined,'false','1','TRUE'])test('preferences remain off unless explicitly true: '+value,()=>{
 const h=boot(value===undefined?{}:{DEVICE_PREFERENCES_ENABLED:value});
 assert.equal(h.routes.has(prefGet),false);assert.equal(h.routes.has(prefPost),false);assert.equal(h.calls.length,0);
});
test('enabled preference routes register authentication before handler',()=>{
 const h=boot({DEVICE_PREFERENCES_ENABLED:'true'});
 for(const route of [prefGet,prefPost]){
  const chain=h.routes.get(route);assert.equal(chain.length,2);assert.equal(chain[0].name,'requireSupabaseAuth');
 }
 assert.equal(h.routes.has('POST /handover/poll'),false);assert.equal(h.calls.length,0);
});
function response(){return {code:200,set(){return this},setHeader(){},status(c){this.code=c;return this},json(d){this.body=d;return this}}}
test('enabled route rejects missing token before any RPC',async()=>{
 const h=boot({DEVICE_PREFERENCES_ENABLED:'true'});const res=response();
 await h.routes.get(prefGet)[0]({headers:{}},res,()=>assert.fail('unauthenticated next'));
 assert.equal(res.code,401);assert.equal(h.calls.length,0);
});
test('enabled route passes authenticated context to preference RPC',async()=>{
 const v={deviceId:'HP-002',generation:0,revision:0,settings:null,override_mode:'AUTO',testmode:false};
 const h=boot({DEVICE_PREFERENCES_ENABLED:'true'},async url=>({ok:true,json:async()=>url.endsWith('/auth/v1/user')?{id:'11111111-1111-4111-8111-111111111111'}:v}));
 const req={headers:{authorization:'Bearer fixture-user'},params:{deviceId:'HP-002'}};const res=response();
 let next=false;await h.routes.get(prefGet)[0](req,res,()=>{next=true});assert.equal(next,true);
 await h.routes.get(prefGet)[1](req,res);assert.equal(res.code,200);assert.deepEqual(res.body,{...v,automatic_movement_enabled:false});
 assert.deepEqual(h.calls.map(c=>c.url.split('/').at(-1)),['user','honorpole_preferences_read_r1']);
});


test('both preference routes report the same device-specific bench scope', async () => {
 const settings={
  installation_zip:'80122',installation_city:'Fixture',installation_county:'Fixture',
  installation_state:'Colorado',installation_state_code:'CO',installation_county_fips:'08005',
  timezone:'America/Denver', latitude:39.58,longitude:-104.95,
  sun_schedule_enabled:false,raise_at_sunrise:false,lower_at_sunset:false,
  illuminated_at_night:false,auto_half_staff:true,enable_federal_alerts:true,
  enable_state_alerts:true,enable_local_alerts:true,auto_apply_verified_directives:true,
 };
 const h=boot({DEVICE_PREFERENCES_ENABLED:'true',AUTO_PREFERENCE_COMMANDS_ENABLED:'false',
  AUTO_PREFERENCE_BENCH_DEVICE_ID:'HP-002'},async (_url,init)=>{
  const body=JSON.parse(init.body);
  return {ok:true,json:async()=>({deviceId:body.p_device,generation:0,revision:3,
   settings,override_mode:'DOWN',testmode:false})};
 });
 for(const deviceId of ['HP-001','HP-002']){
  const req={params:{deviceId},query:{device_id:deviceId},accessToken:'fixture-user-token',
   user:{id:'11111111-1111-4111-8111-111111111111'}};
  for(const route of [prefGet,'GET /auto/preferences']){
   const res=response();
   await h.routes.get(route)[1](req,res);
   assert.equal(res.code,200);
   assert.equal(res.body.deviceId,deviceId);
   assert.equal(res.body.automatic_movement_enabled,deviceId==='HP-002');
  }
 }
});
