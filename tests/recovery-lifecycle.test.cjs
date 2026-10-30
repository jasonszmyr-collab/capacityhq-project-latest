const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={},globals={}){const module={exports:{}};const out=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});vm.runInNewContext(out.outputText,{module,exports:module.exports,Error,Date,console,btoa,setTimeout,clearTimeout,...globals,require:n=>{assert.ok(n in imports,'Unexpected import '+n);return imports[n];}});return module.exports;}
const permanent='E'.repeat(32),temporary='D'.repeat(32),entry={ownerId:'owner',deviceId:'HP-002'};
function nodes(v){if(!v||typeof v!=='object')return[];if(Array.isArray(v))return v.flatMap(nodes);return[v,...nodes(v.props?.children)];}
function component({owner='owner',recovery=permanent}={}){
 let states=[],refs=[],effects=[],si=0,ri=0,ei=0,queue=[],scope='scope1',currentOwner=owner,readImpl=async()=>permanent;const calls=[],used=[],listeners=[];
 const cloud={getUserId:()=>currentOwner,getProtectedSetupScope:()=>scope,getCurrentDeviceId:()=> 'HP-002'};
 const current={deviceId:'HP-002',scope,password:temporary,expiresAt:600000,...(recovery?{recoveryPassword:recovery}:{})};
 const React={useState:initial=>{const i=si++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef:initial=>{const i=ri++;return refs[i]||(refs[i]={current:initial});},useEffect:(fn,deps)=>{const i=ei++;if(!effects[i]||deps.some((d,n)=>d!==effects[i].deps[n])){const old=effects[i];effects[i]={deps};queue.push(()=>{old?.cleanup?.();effects[i].cleanup=fn();});}}};const jsx=(type,props)=>({type,props:props||{}});
 const Page=load('src/components/RecoveryPasswords.tsx',{
 react:React,'react/jsx-runtime':{jsx,jsxs:jsx},'@capacitor/app':{App:{addListener:async(n,fn)=>{listeners.push(fn);return{remove:async()=>{}};}}},'@capacitor/clipboard':{Clipboard:{write:async v=>calls.push(['copy',v])}},'../services/cloudService':{default:cloud},'../services/protectedSetup':{protectedSetup:{details:()=>current}},'../services/recoveryVault':{recoveryAvailable:()=>true,recoveryVault:{list:async id=>{calls.push(['list',id]);return[entry];},save:async(...v)=>calls.push(['save',...v]),read:async v=>{calls.push(['read',v]);return readImpl();},forget:async v=>calls.push(['forget',v]),cancelPending:async()=>calls.push(['cancelPending'])}}
 },{setTimeout:()=>1,clearTimeout:()=>{}}).default;
 function render(){si=ri=ei=0;const tree=nodes(Page({session:current,onUse:(...v)=>used.push(v)}));while(queue.length)queue.shift()();return tree;}
 const tick=async()=>{await new Promise(r=>setImmediate(r));return render();},button=text=>render().find(n=>n.type==='button'&&n.props.children===text);
 return{calls,used,render,tick,button,click:async text=>{button(text).props.onClick();return tick();},choose:()=>{render().find(n=>n.type==='select').props.onChange({target:{value:'owner:HP-002'}});render();},setOwner:v=>{currentOwner=v;scope+='x';render();},pending:fn=>readImpl=fn,background:()=>listeners.forEach(fn=>fn({isActive:false})),foreground:()=>listeners.forEach(fn=>fn({isActive:true})),unmount:()=>effects.forEach(e=>e.cleanup?.())};
}
test('Save stores only the acknowledged permanent password',async()=>{const h=component();h.render();await h.tick();await h.click('Save for offline recovery');const call=h.calls.find(c=>c[0]==='save');assert.equal(call[1].deviceId,'HP-002');assert.equal(call[1].ownerId,'owner');assert.equal(call[2],permanent);assert.notEqual(call[2],temporary);h.unmount();});
test('temporary-only session cannot save permanent recovery',async()=>{const h=component({recovery:null});h.render();await h.tick();assert.equal(h.button('Save for offline recovery').props.disabled,true);await h.click('Save for offline recovery');assert.equal(h.calls.some(c=>c[0]==='save'),false);h.unmount();});
test('signed-out owner unlocks saved credential and enters local setup',async()=>{const h=component({owner:null});h.render();await h.tick();h.choose();await h.click('Unlock saved recovery password');assert.ok(h.render().some(n=>n.props['aria-label']==='Saved recovery password'&&n.props.value===permanent));await h.click('Use saved password for Wi-Fi setup');assert.deepEqual(h.used,[['HP-002',permanent]]);assert.equal(h.render().some(n=>n.props['aria-label']==='Saved recovery password'),false);h.unmount();});
test('account switch ignores late native unlock',async()=>{const h=component();h.render();await h.tick();h.choose();let resolve;h.pending(()=>new Promise(r=>resolve=r));h.button('Unlock saved recovery password').props.onClick();h.setOwner('other');resolve(permanent);await h.tick();assert.equal(h.render().some(n=>n.props['aria-label']==='Saved recovery password'),false);assert.equal(h.used.length,0);h.unmount();});
test('backgrounding hides unlocked credential',async()=>{const h=component();h.render();await h.tick();h.choose();await h.click('Unlock saved recovery password');h.background();assert.equal(h.render().some(n=>n.props['aria-label']==='Saved recovery password'),false);h.unmount();});
test('cancelled unlock never offers a saved password',async()=>{const h=component();h.render();await h.tick();h.choose();h.pending(async()=>{throw Error('cancelled');});await h.click('Unlock saved recovery password');assert.equal(h.render().some(n=>n.props['aria-label']==='Saved recovery password'),false);h.unmount();});


test('late unlock cannot restore password after background and foreground',async()=>{
 const h=component();h.render();await h.tick();h.choose();let resolve;
 h.pending(()=>new Promise(r=>resolve=r));h.button('Unlock saved recovery password').props.onClick();
 h.background();h.foreground();resolve(permanent);await h.tick();
 assert.equal(h.render().some(n=>n.props['aria-label']==='Saved recovery password'),false);
 assert.equal(h.button('Unlock saved recovery password').props.disabled,false);
 h.pending(async()=>permanent);await h.click('Unlock saved recovery password');
 assert.equal(h.render().some(n=>n.props['aria-label']==='Saved recovery password'),true);h.unmount();
});
test('late unlock while inactive never displays password',async()=>{
 const h=component();h.render();await h.tick();h.choose();let resolve;
 h.pending(()=>new Promise(r=>resolve=r));h.button('Unlock saved recovery password').props.onClick();
 h.background();resolve(permanent);await h.tick();
 assert.equal(h.render().some(n=>n.props['aria-label']==='Saved recovery password'),false);h.unmount();
});


test('scope cleanup and unmount request native pending cancellation',async()=>{const h=component();h.render();await h.tick();h.setOwner('other');assert.equal(h.calls.filter(c=>c[0]==='cancelPending').length,1);h.unmount();assert.equal(h.calls.filter(c=>c[0]==='cancelPending').length,2);});
