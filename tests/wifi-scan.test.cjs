const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
function load(file,imports={}){
 const module={exports:{}};
 const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 const out=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 assert.equal((out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 vm.runInNewContext(out.outputText,{module,exports:module.exports,console,setTimeout,clearTimeout,require:id=>{
  if(!(id in imports))throw Error(`Unexpected import ${id}`);return imports[id];
 }});
 return module.exports;
}
const response=load('src/services/wifiScanResponse.ts');
for(const data of [[],{networks:[]},'[]','{"networks":[]}'])test('explicit empty scan '+JSON.stringify(data),()=>{
 assert.equal(response.readWiFiScanResponse(200,data).length,0);
});
for(const data of [null,{},'', 'bad', {networks:null},{networks:{}},{networks:[null]}, {networks:[{ssid:12}]},{networks:[{ssid:'x',rssi:'bad'}]}, {success:false,networks:[]},{error:'denied',networks:[]},{accepted:false,networks:[]},{status:'failed',networks:[]}])test('invalid or failed reply is not empty '+JSON.stringify(data),()=>{
 assert.throws(()=>response.readWiFiScanResponse(200,data),response.WiFiScanError);
});
for(const status of [401,403,408,500])test('HTTP '+status+' is not empty',()=>assert.throws(()=>response.readWiFiScanResponse(status,{networks:[]}),response.WiFiScanError));
test('scan maps signal, filters hidden SSIDs and sorts',()=>{
 const result=response.readWiFiScanResponse(200,{networks:[{ssid:'weak',rssi:-90},{ssid:'strong',rssi:-40,secure:true},{ssid:'  ',rssi:-30}]});
 assert.equal(result.length,2);assert.equal(result[0].ssid,'strong');assert.equal(result[0].signal,100);assert.equal(result[1].signal,20);assert.equal(result[0].secure,true);
});
function serviceHarness(reply){
 let requests=0;
 const {wifiService:service}=load('src/services/wifiService.ts',{
  './wifiScanResponse':response,
  '@capacitor/core':{CapacitorHttp:{request:async()=>{requests++;if(reply instanceof Error)throw reply;return reply;}}},
  '@capacitor/network':{Network:{}},'@capacitor/preferences':{Preferences:{}}
 });
 service.discoverHonorPole=async()=>{service.deviceUrl='http://192.168.4.1';return {ip:'192.168.4.1'};};
 return {service,get requests(){return requests;}};
}
test('service returns a successful empty response',async()=>assert.equal((await serviceHarness({status:200,data:{networks:[]}}).service.scanNetworks()).length,0));
test('service reports unreachable discovery without requesting scan',async()=>{
 const h=serviceHarness({status:200,data:[]});h.service.discoverHonorPole=async()=>null;
 await assert.rejects(()=>h.service.scanNetworks(),e=>e.code==='unreachable');assert.equal(h.requests,0);
});
test('service propagates refusal and legacy wrapper propagates failure',async()=>{
 const h=serviceHarness({status:403,data:[]});await assert.rejects(()=>h.service.scanForNetworks(),e=>e.code==='request');
});
test('service reports transport timeout without exposing transport details',async()=>{
 const h=serviceHarness(new Error('private transport detail'));await assert.rejects(()=>h.service.scanNetworks(),e=>e.code==='unreachable'&&!e.message.includes('private'));
});
// Small hook/JSX harness executes the real page callbacks and renders their state.
function pageHarness(scan){
 const state=[],refs=[],effects=[];let index=0,refIndex=0,tree,cleanup,initialized=false;
 const react={useState:initial=>{const i=index++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useRef:initial=>{const i=refIndex++;return refs[i]||(refs[i]={current:initial});},useEffect:fn=>{if(!initialized)effects.push(fn);}};
 const jsx=(type,props)=>({type,props:props||{}});
 const Page=load('src/pages/WifiScan.tsx',{'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-router-dom':{useNavigate:()=>()=>{}},'../components/AppHeader':{default:'header'},'../components/BottomNav':{default:'nav'},'../services/wifiService':{wifiService:{scanNetworks:scan}},'../services/wifiScanResponse':response}).default;
 function render(){index=0;refIndex=0;tree=Page();return tree;}
 function nodes(v){if(v==null||typeof v==='boolean')return[];if(Array.isArray(v))return v.flatMap(n=>nodes(n));if(typeof v!=='object')return[v];return[v,...nodes(v.props.children)];}
 function text(){render();return nodes(tree).filter(n=>typeof n==='string').join(' ');}
 function refresh(){render();return nodes(tree).find(n=>n.type==='button'&&String(n.props.children).includes('Networks')).props.onClick();}
 render();initialized=true;cleanup=effects[0]();
 return {text,refresh,unmount:()=>cleanup(),replay:()=>{cleanup();cleanup=effects[0]();},nodes:()=>{render();return nodes(tree);}};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('initial empty scan preserves connected status and explains refresh',async()=>{
 const h=pageHarness(async()=>[]);await flush();const text=h.text();assert.match(text,/HonorPole Connected/);assert.match(text,/No home Wi-Fi networks/);assert.doesNotMatch(text,/Connect to HonorPole-Setup WiFi first/);
});
test('setup-only SSIDs count as no selectable home networks',async()=>{
 const h=pageHarness(async()=>[{ssid:'HonorPole-Setup-HP-004',signal:80,secure:true}]);await flush();assert.match(h.text(),/No home Wi-Fi networks/);
});
test('error then populated refresh clears error and displays network',async()=>{
 let n=0;const h=pageHarness(async()=>{if(!n++)throw new response.WiFiScanError('request','Access refused');return[{ssid:'Home',signal:80,secure:true}];});await flush();assert.match(h.text(),/Access refused/);await h.refresh();assert.match(h.text(),/Home/);assert.match(h.text(),/HonorPole Connected/);assert.doesNotMatch(h.text(),/Access refused|No home Wi-Fi networks/);
});
test('populated then empty refresh removes stale selectable networks',async()=>{
 let n=0;const h=pageHarness(async()=>n++?[]:[{ssid:'Old network',signal:80,secure:true}]);await flush();assert.match(h.text(),/Old network/);await h.refresh();assert.doesNotMatch(h.text(),/Old network/);assert.match(h.text(),/No home Wi-Fi networks/);
});
test('empty then failed refresh shows error without stale empty message',async()=>{
 let n=0;const h=pageHarness(async()=>{if(n++)throw new response.WiFiScanError('unreachable','Connection timed out');return[];});await flush();await h.refresh();assert.match(h.text(),/Connection timed out/);assert.doesNotMatch(h.text(),/No home Wi-Fi networks|HonorPole Connected/);
});
test('unmounted page ignores late scan and duplicate refresh does not overlap',async()=>{
 let resolve,calls=0;const h=pageHarness(()=>{calls++;return new Promise(r=>resolve=r);});
 // Initial request is pending; invoke the button callback directly despite disabled UI.
 const button=h.nodes().find(n=>n.type==='button');button.props.onClick();assert.equal(calls,1);
 h.unmount();resolve([{ssid:'Late result',signal:80,secure:true}]);await flush();assert.doesNotMatch(h.text(),/Late result/);
});

test('effect cleanup and replay ignore the old scan result',async()=>{
 const pending=[];const h=pageHarness(()=>new Promise(r=>pending.push(r)));h.replay();assert.equal(pending.length,2);
 pending[1]([{ssid:'Current network',signal:70,secure:true}]);await flush();
 pending[0]([{ssid:'Stale network',signal:80,secure:true}]);await flush();
 assert.match(h.text(),/Current network/);assert.doesNotMatch(h.text(),/Stale network/);
});
