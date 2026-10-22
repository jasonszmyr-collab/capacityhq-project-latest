const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };
const tick = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };
const session = (id='user-a', token='token-a') => ({access_token:token,user:{id}});
function harness() {
  const initial = deferred(), refresh = deferred();
  let effect, listener, recover, user=null, token=null, cleanup;
  const calls=[];
  const cloudService = {
    setAuthentication(t,u) { token=t;user=u;calls.push(['auth',t,u]); },
    clearAuthentication() { token=null;user=null;calls.push(['clear']); },
    setSessionRecoveryHandler(h) {recover=h;},
    getUserId:()=>user,
    isAuthenticated:()=>!!(user&&token),
    setAuthToken(){throw Error('Must apply identity and token atomically');},
    setUserId(){throw Error('Must apply identity and token atomically');},
    sendCommand(){throw Error('Recovery must never replay a command');}
  };
  const supabase={auth:{
    getSession:()=>initial.promise,
    refreshSession:()=>refresh.promise,
    onAuthStateChange(cb){listener=cb;return {data:{subscription:{unsubscribe(){calls.push(['unsubscribe']);}}}};}
  }};
  const react={useEffect(cb){effect=cb;},useState(v){return [v,()=>{}];}};
  const filename=path.join(__dirname,'../src/App.tsx');
  const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020},reportDiagnostics:true});
  assert.equal(output.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
  const module={exports:{}};
  vm.runInNewContext(output.outputText,{module,exports:module.exports,console,URLSearchParams,
    require(name){
      if(name==='react')return react;
      if(name==='react/jsx-runtime')return {jsx(){return null;},jsxs(){return null;}};
      if(name==='./services/cloudService')return {cloudService};
      if(name==='./services/supabaseClient')return {supabase};
      if(name==='@capacitor/app')return {App:{addListener:async()=>({remove(){}}),getLaunchUrl:async()=>null}};
      return {};
    }});
  module.exports.default(); cleanup=effect();
  return {initial,refresh,calls,event:(...a)=>listener(...a),recover:()=>recover(),cleanup,
    get handler(){return recover;},get user(){return user;},get token(){return token;}};
}
test('initial session applies token and identity atomically',async()=>{const h=harness();h.initial.resolve({data:{session:session()}});await tick();assert.equal(h.user,'user-a');assert.equal(h.token,'token-a');h.cleanup();});
test('late initial read cannot resurrect signed-out session',async()=>{const h=harness();h.event('SIGNED_OUT',null);h.initial.resolve({data:{session:session()}});await tick();assert.equal(h.user,null);h.cleanup();});
test('late initial read cannot replace newer account',async()=>{const h=harness();h.event('SIGNED_IN',session('user-b','token-b'));h.initial.resolve({data:{session:session()}});await tick();assert.equal(h.user,'user-b');h.cleanup();});
test('same-account session refresh updates token',async()=>{const h=harness();h.event('SIGNED_IN',session());const p=h.recover();h.refresh.resolve({data:{session:session('user-a','renewed')},error:null});assert.equal(await p,true);assert.equal(h.token,'renewed');h.cleanup();});
test('auth refresh event is accepted for the same account',async()=>{const h=harness();h.event('SIGNED_IN',session());const p=h.recover();h.event('TOKEN_REFRESHED',session('user-a','renewed'));h.refresh.resolve({data:{session:session('user-a','renewed')},error:null});assert.equal(await p,true);h.cleanup();});
test('invalid refresh credentials clear authentication',async()=>{const h=harness();h.event('SIGNED_IN',session());const p=h.recover();h.refresh.resolve({data:{session:null},error:{status:401}});assert.equal(await p,false);assert.equal(h.user,null);h.cleanup();});
test('network outage cannot report recovery success',async()=>{const h=harness();h.event('SIGNED_IN',session());const p=h.recover();h.refresh.resolve({data:{session:null},error:{status:503}});assert.equal(await p,false);assert.equal(h.user,'user-a');h.cleanup();});
test('sign-out during refresh ignores late response',async()=>{const h=harness();h.event('SIGNED_IN',session());const p=h.recover();h.event('SIGNED_OUT',null);h.refresh.resolve({data:{session:session()},error:null});assert.equal(await p,false);assert.equal(h.user,null);h.cleanup();});
test('account switch during refresh ignores late response',async()=>{const h=harness();h.event('SIGNED_IN',session());const p=h.recover();h.event('SIGNED_IN',session('user-b','token-b'));h.refresh.resolve({data:{session:session()},error:null});assert.equal(await p,false);assert.equal(h.user,'user-b');h.cleanup();});
test('unmount ignores refresh and removes recovery handler',async()=>{const h=harness();h.event('SIGNED_IN',session());const p=h.recover();h.cleanup();h.refresh.resolve({data:{session:session('user-a','late')},error:null});assert.equal(await p,false);assert.equal(h.token,'token-a');assert.equal(h.handler,null);});
