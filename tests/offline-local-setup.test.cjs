const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={}) {
 const module={exports:{}};
 const result=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
 assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 vm.runInNewContext(result.outputText,{module,exports:module.exports,console,Date,Error,btoa,setTimeout,require:id=>{assert.ok(id in imports,`Unexpected import ${id}`);return imports[id];}});
 return module.exports;
}
const {ProtectedSetupSession}=load('src/services/protectedSetupSession.ts',{'./wifiScanResponse':load('src/services/wifiScanResponse.ts')});
const password='A'.repeat(32);
function harness(selected=null){
 let scope='signed-out:0:0:',cloudCalls=0,statusId='HP-002',saveStatus=200,pending;
 const calls=[];
 const cloud={getCurrentDeviceId:()=>selected,getProtectedSetupScope:()=>scope,requestProtectedSetup:async()=>{cloudCalls++;throw Object.assign(Error('not authorized'),{status:403});}};
 const api=load('src/services/protectedSetup.ts',{'./cloudService':{default:cloud},'./protectedSetupSession':{ProtectedSetupSession},'@capacitor/core':{CapacitorHttp:{request:async options=>{calls.push(options);if(options.url.endsWith('/status'))return pending?pending:{status:200,data:{deviceId:statusId}};return options.method==='POST'?{status:saveStatus,data:{success:saveStatus===200}}:{status:200,data:{networks:[{ssid:'NewHome',rssi:-45,secure:true}]}};}}}});
 return {...api,calls,get cloudCalls(){return cloudCalls;},get selected(){return selected;},scope:v=>scope=v,status:v=>statusId=v,saveStatus:v=>saveStatus=v,pending:v=>pending=v};
}
test('signed-out owner can scan and save using matching ID and setup card with no cloud request',async()=>{
 const h=harness();h.useLocalSetup('HP-002',password);assert.equal(h.getSetupDeviceId(),'HP-002');assert.equal((await h.protectedSetup.scan())[0].ssid,'NewHome');await h.protectedSetup.save('NewHome',' exact home password ');
 assert.equal(h.cloudCalls,0);assert.equal(h.selected,null);const post=h.calls.find(c=>c.method==='POST');assert.equal(post.url,'http://192.168.4.1/save');assert.equal(post.data.password,' exact home password ');assert.equal(post.disableRedirects,true);assert.equal(post.headers.Authorization,`Basic ${btoa('setup:'+password)}`);
 assert.equal(h.protectedSetup.details(),null);assert.equal(h.getSetupDeviceId(),'HP-002');
});
test('local card targets another pole without mutating selected cloud pole',()=>{const h=harness('HP-004');h.useLocalSetup('HP-002',password);assert.equal(h.getSetupDeviceId(),'HP-002');assert.equal(h.selected,'HP-004');h.clearLocalSetup();assert.equal(h.getSetupDeviceId(),'HP-004');assert.equal(h.protectedSetup.details(),null);});
test('wrong local identity sends neither setup auth nor home password',async()=>{const h=harness();h.useLocalSetup('HP-002',password);h.status('HP-003');await assert.rejects(()=>h.protectedSetup.save('Home','home-secret'));assert.equal(h.calls.length,1);assert.equal(h.calls[0].headers,undefined);assert.equal(h.calls[0].data,undefined);});
test('account or cloud-selection scope change clears offline credentials',()=>{const h=harness('HP-004');h.useLocalSetup('HP-002',password);h.scope('new-account:1:1:HP-004');assert.equal(h.protectedSetup.details(),null);assert.equal(h.getSetupDeviceId(),'HP-004');});
test('invalid card ID or password cannot leave a previous session active',()=>{const h=harness('HP-004');for(const [id,key] of [['HP-X',password],['HP-002','bad']]){h.useLocalSetup('HP-002',password);assert.throws(()=>h.useLocalSetup(id,key));assert.equal(h.protectedSetup.details(),null);assert.equal(h.getSetupDeviceId(),'HP-004');}});
test('switching local target invalidates pending identity check before any write',async()=>{const h=harness();let resolve;h.pending(new Promise(r=>resolve=r));h.useLocalSetup('HP-002',password);const save=h.protectedSetup.save('Home','secret');h.useLocalSetup('HP-003',password);resolve({status:200,data:{deviceId:'HP-002'}});await assert.rejects(()=>save);assert.equal(h.calls.length,1);});
test('refused card password consumes credential and never replays write',async()=>{const h=harness();h.useLocalSetup('HP-002',password);h.saveStatus(401);await assert.rejects(()=>h.protectedSetup.save('Home','secret'));await assert.rejects(()=>h.protectedSetup.save('Home','secret'));assert.equal(h.calls.filter(c=>c.method==='POST').length,1);});
test('local credentials do not grant cloud setup permission',async()=>{const h=harness();h.useLocalSetup('HP-002',password);await assert.rejects(()=>h.protectedSetup.open(),/administrator/);assert.equal(h.cloudCalls,1);assert.equal(h.protectedSetup.details(),null);});
function formHarness(){
 let state=[],refs=[],index=0,ri=0,initial=true,effects=[],used=[],cleared=0;
 const React={useState:v=>{const i=index++;if(!(i in state))state[i]=typeof v==='function'?v():v;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useRef:v=>{const i=ri++;return refs[i]||(refs[i]={current:v});},useEffect:fn=>{if(initial)effects.push(fn);}};
 const jsx=(type,props)=>({type,props:props||{}});
 const Page=load('src/pages/ProtectedSetup.tsx',{'react':React,'react/jsx-runtime':{jsx,jsxs:jsx},'react-router-dom':{useNavigate:()=>()=>{}},'../components/AppHeader':{default:'header'},'../components/BottomNav':{default:'nav'},'../components/RecoveryPasswords':{default:'recovery'},'../services/cloudService':{default:{getCurrentDeviceId:()=>null}},'@capacitor/clipboard':{Clipboard:{}},'../services/protectedSetup':{protectedSetup:{details:()=>null,cancelPending(){}},getSetupDeviceId:()=>null,clearLocalSetup:()=>cleared++,useLocalSetup:(...a)=>used.push(a)}}).default;
 function nodes(v){if(!v||typeof v!=='object')return[];if(Array.isArray(v))return v.flatMap(nodes);return[v,...nodes(v.props?.children)];}
 function render(){index=0;ri=0;return nodes(Page());}
 render();initial=false;
 // Set mounted ref without creating a real long-lived interval.
 refs[0].current=true;
 return {render,used,input:(label,value)=>render().find(n=>n.props['aria-label']===label).props.onChange({target:{value}})};
}
test('signed-out setup page exposes card ID/password form while online opening is disabled',()=>{const h=formHarness();const buttons=h.render().filter(n=>n.type==='button');assert.ok(buttons.find(n=>n.props.children==='Open protected setup').props.disabled);h.input('Offline setup pole ID','hp-002');h.input('Private setup-card password',password);const card=h.render().find(n=>n.type==='button'&&n.props.children==='Use setup-card password');assert.equal(card.props.disabled,false);card.props.onClick();assert.deepEqual(h.used,[['HP-002',password]]);});
