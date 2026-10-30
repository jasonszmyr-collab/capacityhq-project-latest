const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
function load(file,imports={}) {
 const module={exports:{}};
 const output=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
 assert.equal((output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 vm.runInNewContext(output.outputText,{module,exports:module.exports,Error,Date,console,btoa,setTimeout,clearTimeout,setInterval,clearInterval,require:id=>{if(!(id in imports))throw Error('Unexpected import '+id);return imports[id];}});
 return module.exports;
}
const {ProtectedSetupSession}=load('src/services/protectedSetupSession.ts',{'./wifiScanResponse':load('src/services/wifiScanResponse.ts')});
const requestId='A'.repeat(32),password='B'.repeat(32);
const start={success:true,deviceId:'HP-004',requestId};
const opened={...start,result:'OPEN',password,ssid:'HonorPole-Setup-HP-004',remainingMs:590000};
function harness() {
 let time=1000,context={deviceId:'HP-004',scope:'account-a:selection1'},cloudCalls=[],localCalls=[];
 const deps={context:()=>context,now:()=>time,pause:async()=>{time+=1500;},encode:btoa,
 cloud:async(id,request)=>{cloudCalls.push({id,request});return request?opened:start;},
 local:async(route,headers,data)=>{localCalls.push({route,headers,data});return route==='/status'?{status:200,data:{serialNumber:'HP-004'}}:{status:200,data:{success:true}};}};
 const service=new ProtectedSetupSession(deps);
 return {service,deps,cloudCalls,localCalls,setContext:value=>context=value,setTime:value=>time=value};
}
test('only acknowledged OPEN installs a credential; polling is scoped to request and pole',async()=>{
 const h=harness();let polls=0;
 h.deps.cloud=async(id,request)=>{h.cloudCalls.push({id,request});return !request?start:++polls===1?{...start,result:'PENDING'}:opened;};
 await h.service.open();assert.equal(h.service.details().password,password);assert.equal(h.cloudCalls.length,3);assert.equal(h.cloudCalls[2].request,requestId);assert.equal(h.localCalls.length,0);
});
for(const [name,reply] of [
 ['wrong device',{...opened,deviceId:'HP-003'}],['wrong request',{...opened,requestId:'C'.repeat(32)}],
 ['missing password',{...opened,password:undefined}],['invalid password',{...opened,password:'bad'}],
 ['wrong SSID',{...opened,ssid:'HonorPole-Setup-HP-003'}],['zero lifetime',{...opened,remainingMs:0}],
 ['nonfinite lifetime',{...opened,remainingMs:NaN}],['oversized lifetime',{...opened,remainingMs:700000}],
 ['refused',{...start,result:'REFUSED'}],['unknown',{...start,result:'OTHER'}]
])test('rejects '+name,async()=>{const h=harness();h.deps.cloud=async(id,request)=>request?reply:start;await assert.rejects(()=>h.service.open());assert.equal(h.service.details(),null);});
test('pending deadline stops waiting without automatic resubmission',async()=>{
 const h=harness();let posts=0;h.deps.cloud=async(id,request)=>{if(!request)posts++;return request?{...start,result:'PENDING'}:start;};
 await assert.rejects(()=>h.service.open(),/not confirmed/);assert.equal(posts,1);assert.equal(h.service.details(),null);
});
test('cancelled page ignores late OPEN',async()=>{
 const h=harness();let resolve;h.deps.cloud=()=>new Promise(r=>resolve=r);const pending=h.service.open();h.service.cancelPending();resolve(start);await assert.rejects(()=>pending,/cancelled/);assert.equal(h.service.details(),null);
});
for(const context of [{deviceId:'HP-003',scope:'account-a:selection2'},{deviceId:'HP-004',scope:'account-b:selection1'},{deviceId:null,scope:'signed-out'}])test('context switch blocks old credential '+context.scope,async()=>{
 const h=harness();h.service.useUsb(password);h.setContext(context);await assert.rejects(()=>h.service.save('Home','home-password'));assert.equal(h.localCalls.length,0);assert.equal(h.service.details(),null);
});
test('USB input validates setup password separately from home password',()=>{
 const h=harness();assert.throws(()=>h.service.useUsb('home-password'));assert.throws(()=>h.service.useUsb('b'.repeat(32)));h.service.useUsb(password);assert.equal(h.service.details().password,password);
});
test('expired credential never reaches network',async()=>{const h=harness();h.service.useUsb(password);h.setTime(602000);await assert.rejects(()=>h.service.save('Home','pw'));assert.equal(h.localCalls.length,0);});
for(const status of [{serialNumber:'HP-003'},{},{serialNumber:'HP-004',deviceId:'HP-003'},{deviceId:4}])test('identity mismatch blocks Authorization and home password '+JSON.stringify(status),async()=>{
 const h=harness();h.service.useUsb(password);h.deps.local=async(route,headers,data)=>{h.localCalls.push({route,headers,data});return{status:200,data:status};};await assert.rejects(()=>h.service.save('Home','private-home-password'),/selected HonorPole/);assert.equal(h.localCalls.length,1);assert.equal(h.localCalls[0].headers,undefined);assert.equal(h.localCalls[0].data,undefined);
});
test('confirmed matching AP gets setup Basic auth and exact home password once',async()=>{
 const h=harness();await h.service.open();await h.service.save('Home',' home password ');assert.equal(h.localCalls.length,2);const save=h.localCalls[1];assert.equal(save.route,'/save');assert.equal(save.headers.Authorization,'Basic '+btoa('setup:'+password));assert.equal(save.data.password,' home password ');assert.equal(h.service.details(),null);await assert.rejects(()=>h.service.save('Home','again'));assert.equal(h.localCalls.length,2);
});
for(const status of [401,403,415,500])test('HTTP '+status+' save is not success and consumes credential',async()=>{
 const h=harness();h.service.useUsb(password);h.deps.local=async route=>route==='/status'?{status:200,data:{deviceId:'HP-004'}}:{status,data:{}};await assert.rejects(()=>h.service.save('Home','pw'));assert.equal(h.service.details(),null);
});
test('HTTP 200 refusal cannot claim saved',async()=>{const h=harness();h.service.useUsb(password);h.deps.local=async route=>route==='/status'?{status:200,data:{deviceId:'HP-004'}}:{status:200,data:{success:false}};await assert.rejects(()=>h.service.save('Home','pw'),/did not confirm/);});
test('timeout after POST is not replayed',async()=>{
 const h=harness();h.service.useUsb(password);let writes=0;h.deps.local=async route=>{if(route==='/status')return{status:200,data:{deviceId:'HP-004'}};writes++;throw Error('transport');};await assert.rejects(()=>h.service.save('Home','pw'));await assert.rejects(()=>h.service.save('Home','pw'));assert.equal(writes,1);
});
test('switch during AP identity check sends no write',async()=>{
 const h=harness();h.service.useUsb(password);let resolve;h.deps.local=route=>{h.localCalls.push(route);return new Promise(r=>resolve=r);};const saving=h.service.save('Home','pw');h.setContext({deviceId:'HP-003',scope:'changed'});resolve({status:200,data:{deviceId:'HP-004'}});await assert.rejects(()=>saving,/changed/);assert.equal(h.localCalls.length,1);
});
test('simultaneous saves cannot overlap',async()=>{
 const h=harness();h.service.useUsb(password);let resolve;h.deps.local=()=>new Promise(r=>resolve=r);const first=h.service.save('Home','pw');await assert.rejects(()=>h.service.save('Home','pw'),/already/);resolve({status:500,data:{}});await assert.rejects(()=>first);
});
test('real adapter fixes AP destination, blocks redirects, and sanitizes transport errors',async()=>{
 let calls=[];let fail=false;
 const cloud={getCurrentDeviceId:()=> 'HP-004',getProtectedSetupScope:()=> 'same',requestProtectedSetup:async(id,req)=>req?opened:start};
 const {protectedSetup}=load('src/services/protectedSetup.ts',{'./cloudService':{default:cloud},'./protectedSetupSession':{ProtectedSetupSession},'@capacitor/core':{CapacitorHttp:{request:async options=>{calls.push(options);if(fail)throw Error('sensitive-body');return options.method==='GET'?{status:200,data:{deviceId:'HP-004'}}:{status:200,data:{success:true}};}}}});
 protectedSetup.useUsb(password);await protectedSetup.save('Home','pw');assert.equal(calls[1].url,'http://192.168.4.1/save');assert.equal(calls[1].disableRedirects,true);assert.equal(calls[0].headers,undefined);
 fail=true;protectedSetup.useUsb(password);await assert.rejects(()=>protectedSetup.save('Home','pw'),e=>!e.message.includes('sensitive-body'));
});
for(const file of ['src/pages/ProtectedSetup.tsx','src/pages/WifiConnect.tsx','src/pages/ProvisioningProgress.tsx','src/services/cloudService.ts','src/App.tsx'])test('TypeScript syntax '+file,()=>{
 const output=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});assert.equal((output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
});
function connectHarness(save) {
 const states=[],refs=[],effects=[],navigation=[];let si=0,ri=0,initialized=false;
 const react={useState:v=>{const i=si++;if(!(i in states))states[i]=v;return[states[i],v=>states[i]=v];},useRef:v=>{const i=ri++;return refs[i]||(refs[i]={current:v});},useEffect:fn=>{if(!initialized)effects.push(fn);}};
 const jsx=(type,props)=>({type,props:props||{}});
 const Page=load('src/pages/WifiConnect.tsx',{'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-router-dom':{useLocation:()=>({state:{ssid:'Home',secure:true}}),useNavigate:()=> (...args)=>navigation.push(args)},'../components/AppHeader':{default:'header'},'../components/BottomNav':{default:'nav'},'../services/protectedSetup':{protectedSetup:{save},getSetupDeviceId:()=> 'HP-004'},'../services/cloudService':{default:{getCurrentDeviceId:()=> 'HP-004'}}}).default;
 function nodes(v){if(!v||typeof v!=='object')return[];if(Array.isArray(v))return v.flatMap(nodes);return[v,...nodes(v.props?.children)];}
 function render(){si=0;ri=0;return nodes(Page());}
 render();initialized=true;const cleanups=effects.map(fn=>fn());
 return {navigation,render,unmount:()=>cleanups.forEach(fn=>fn?.()),password:value=>render().find(n=>n.type==='input').props.onChange({target:{value}}),submit:()=>render().find(n=>n.type==='button'&&n.props.onClick&&String(n.props.children).includes('Connect')).props.onClick()};
}
test('connection page passes exact password, prevents overlap, and routes only after confirmed save',async()=>{
 let resolve,calls=[];const h=connectHarness((...args)=>{calls.push(args);return new Promise(r=>resolve=r);});h.password(' home pw ');const first=h.submit();await h.submit();assert.equal(calls.length,1);assert.equal(calls[0][1],' home pw ');assert.equal(h.navigation.length,0);resolve();await first;assert.equal(h.navigation[0][0],'/wifi/provisioning');assert.equal(h.navigation[0][1].state.deviceId,'HP-004');assert.equal(h.navigation[0][1].state.password,undefined);
});
test('unmounted connection page cannot navigate on late save completion',async()=>{
 let resolve;const h=connectHarness(()=>new Promise(r=>resolve=r));h.password('pw');const pending=h.submit();h.unmount();resolve();await pending;assert.equal(h.navigation.length,0);
});
test('rejected save stays on connection page',async()=>{const h=connectHarness(async()=>{throw Error('refused');});h.password('pw');await h.submit();assert.equal(h.navigation.length,0);assert.ok(h.render().some(n=>n.props.children==='refused'));});
