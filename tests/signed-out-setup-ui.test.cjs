const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={}) {
 const module={exports:{}};
 const result=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
 assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 vm.runInNewContext(result.outputText,{module,exports:module.exports,console,Date,Error,btoa,setTimeout,localStorage:{removeItem(){}},require:id=>{assert.ok(id in imports,`Unexpected import ${id}`);return imports[id];}});
 return module.exports;
}
function nodes(v){if(!v||typeof v!=='object')return[];if(Array.isArray(v))return v.flatMap(nodes);return[v,...nodes(v.props?.children)];}
function headerHarness(initial){
 let authenticated=initial,logouts=0;const navigation=[];
 const jsx=(type,props)=>({type,props:props||{}});
 const Header=load('src/components/AppHeader.tsx',{
  react:{useLayoutEffect(){},useRef:v=>({current:v}),useState:v=>[v,()=>{}]},
  'react/jsx-runtime':{jsx,jsxs:jsx},
  'react-router-dom':{useNavigate:()=> (...args)=>navigation.push(args),useLocation:()=>({pathname:'/setup'})},
  '../services/supabaseClient':{supabase:{auth:{signOut:async()=>{logouts++;return{error:null};}}}},
  '../services/cloudService':{default:{isAuthenticated:()=>authenticated}},
  '../services/useSystemStatus':{useSystemStatus:()=>({isOnline:false,physicalPosition:'UNKNOWN'})}
 }).default;
 return {render:()=>nodes(Header({title:'Setup'})),navigation,get logouts(){return logouts;},auth:v=>authenticated=v};
}
test('signed-out setup header offers Sign In and returns to account login without calling signOut',()=>{
 const h=headerHarness(false);const tree=h.render();assert.equal(tree.some(n=>n.props.children==='Sign Out'),false);
 tree.find(n=>n.type==='button'&&n.props.children==='Sign In').props.onClick();
 assert.equal(h.navigation[0][0],'/');assert.equal(h.logouts,0);
});
test('signed-in header retains logout and follows changed auth state on rerender',async()=>{
 const h=headerHarness(true);h.render().find(n=>n.type==='button'&&n.props.children==='Sign Out').props.onClick();assert.equal(h.logouts,1);await new Promise(resolve=>setImmediate(resolve));assert.equal(h.navigation[0][0],'/');
 h.auth(false);assert.ok(h.render().find(n=>n.type==='button'&&n.props.children==='Sign In'));
});
test('missing setup target gives the local card route before contacting pole or cloud',async()=>{
 let calls=0;const {ProtectedSetupSession}=load('src/services/protectedSetupSession.ts',{'./wifiScanResponse':load('src/services/wifiScanResponse.ts')});
 const session=new ProtectedSetupSession({context:()=>({deviceId:null,scope:'signed-out'}),local:async()=>{calls++;},cloud:async()=>{calls++;},now:Date.now,pause:async()=>{},encode:btoa});
 await assert.rejects(()=>session.scan(),/pole ID and private setup-card password in protected setup/);
 assert.equal(calls,0);
});
