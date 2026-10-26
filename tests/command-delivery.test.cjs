const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/services/commandDelivery.ts'),'utf8');
function load(clock){
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout});
 return module.exports;
}
function clock(){let id=0;const tasks=new Map();return {tasks,setTimeout(fn,ms){tasks.set(++id,{fn,ms});return id},clearTimeout(i){tasks.delete(i)},run(ms){const entry=[...tasks].find(([,v])=>v.ms===ms);assert.ok(entry,`timer ${ms}`);tasks.delete(entry[0]);entry[1].fn()}}}
const req={deviceId:'HP-004',commandId:'cmd-current',command:'stop'};
const good={serialNumber:'HP-004',command:{id:'cmd-current',pending:false,createdAt:10,deliveredAt:20}};
for(const [name,payload,expected] of [
 ['matching delivery',good,true],
 ['idle telemetry alone',{serialNumber:'HP-004',movement:'STOPPED',commandStatus:'idle'},false],
 ['wrong pole',{...good,serialNumber:'HP-003'},false],
 ['old command',{...good,command:{...good.command,id:'cmd-old'}},false],
 ['still pending',{...good,command:{...good.command,pending:true}},false],
 ['missing pending',{...good,command:{id:'cmd-current',deliveredAt:20}},false],
 ['null delivery',{...good,command:{...good.command,deliveredAt:null}},false],
 ['zero delivery',{...good,command:{...good.command,deliveredAt:0}},false],
 ['string delivery',{...good,command:{...good.command,deliveredAt:'20'}},false],
 ['invalid timestamp',{...good,command:{...good.command,deliveredAt:NaN}},false],
 ['stale timestamp',{...good,command:{...good.command,deliveredAt:5}},false],
 ['null payload',null,false]
])test(name,()=>assert.equal(load(clock()).hasMatchingDelivery(payload,req),expected));
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()};
test('matching delivery updates notice without claiming acceptance',async()=>{const c=clock(),messages=[];load(c).watchCommandDelivery(req,async()=>good,m=>messages.push(m),()=>true);await flush();assert.equal(messages.length,1);assert.match(messages[0],/Server reports STOP delivered/);assert.match(messages[0],/Board acceptance is not confirmed/);assert.equal(c.tasks.size,2)});
test('old record followed by matching record',async()=>{const c=clock(),messages=[];let n=0;load(c).watchCommandDelivery(req,async()=>++n===1?{...good,command:{...good.command,id:'old'}}:good,m=>messages.push(m),()=>true);await flush();assert.equal(messages.length,0);c.run(2000);await flush();assert.equal(messages.length,1)});
test('deadline ends indefinite waiting',async()=>{const c=clock(),messages=[];load(c).watchCommandDelivery(req,async()=>({}),m=>messages.push(m),()=>true);await flush();c.run(30000);assert.equal(messages.length,1);assert.match(messages[0],/delivery .* is not confirmed/);assert.equal(c.tasks.size,0)});
test('slow late response cannot override timeout',async()=>{const c=clock(),messages=[];let resolve;load(c).watchCommandDelivery(req,()=>new Promise(r=>resolve=r),m=>messages.push(m),()=>true);c.run(30000);resolve(good);await flush();assert.equal(messages.length,1);assert.match(messages[0],/is not confirmed/)});
test('read failure cannot establish delivery',async()=>{const c=clock(),messages=[];load(c).watchCommandDelivery(req,async()=>{throw Error('unavailable')},m=>messages.push(m),()=>true);await flush();assert.equal(messages.length,0);c.run(30000);assert.equal(messages.length,1)});
test('device or account switch ignores in-flight delivery',async()=>{const c=clock(),messages=[];let current=true,resolve;load(c).watchCommandDelivery(req,()=>new Promise(r=>resolve=r),m=>messages.push(m),()=>current);current=false;resolve(good);await flush();assert.equal(messages.length,0);assert.equal(c.tasks.size,0)});
test('unmount/new command cancellation ignores late response',async()=>{const c=clock(),messages=[];let resolve;const cancel=load(c).watchCommandDelivery(req,()=>new Promise(r=>resolve=r),m=>messages.push(m),()=>true);cancel();resolve(good);await flush();assert.equal(messages.length,0);assert.equal(c.tasks.size,0)});
for(const file of ['src/services/cloudService.ts','src/hooks/useCommandDelivery.ts','src/components/HomePage.tsx','src/components/CloudDeviceControl.tsx'])test(`TypeScript syntax: ${file}`,()=>{const out=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});assert.equal((out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0)});
function hookHarness(){
 const c=clock(),messages=[],refs=[];let index=0,cleanup,device='HP-004',user='user-a';let reads=0;
 const cloud={getCommandTrackingScope:()=>`${user}:${device}`,getUserId:()=>user,isAuthenticated:()=>user!==null,getCommandDeliveryStatus:async id=>{reads++;assert.equal(id,'HP-004');return good}};
 const React={useRef:value=>{const i=index++;return refs[i]||(refs[i]={current:value})},useEffect:fn=>{if(!cleanup)cleanup=fn()}};
 const module={exports:{}};
 const hookCode=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/hooks/useCommandDelivery.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(hookCode,{module,exports:module.exports,require:id=>id==='react'?React:id==='../services/cloudService'?{default:cloud}:load(c)});
 function render(id=device){device=id;index=0;return module.exports.useCommandDelivery(device,m=>messages.push(m))}
 return {c,messages,render,setUser:v=>user=v,unmount:()=>cleanup(),get reads(){return reads}};
}
test('hook integrates matching status into queued notice',async()=>{const h=hookHarness();h.render().trackCommand({success:true,stage:'queued',message:'Queued',commandId:req.commandId},'HP-004','stop');await flush();assert.equal(h.reads,1);assert.equal(h.messages.length,2);assert.match(h.messages[1],/Server reports STOP delivered/)});
test('hook refuses result from previous device',()=>{const h=hookHarness();const old=h.render();h.render('HP-003');old.trackCommand({stage:'queued',message:'old',commandId:req.commandId},'HP-004','stop');assert.equal(h.messages.length,0);assert.equal(h.reads,0)});
test('hook missing command ID does not wait indefinitely',()=>{const h=hookHarness();h.render().trackCommand({stage:'queued',message:'Queued'},'HP-004','stop');assert.match(h.messages.at(-1),/No command ID/);assert.equal(h.reads,0)});
test('hook does not watch submitted local result',()=>{const h=hookHarness();h.render().trackCommand({stage:'submitted',message:'Local acceptance unconfirmed'},'HP-004','stop');assert.equal(h.reads,0);assert.equal(h.messages.length,1)});
test('hook unmount blocks in-flight completion',async()=>{const h=hookHarness();h.render().trackCommand({stage:'queued',message:'Queued',commandId:req.commandId},'HP-004','stop');h.unmount();await flush();assert.deepEqual(h.messages,['Queued'])});
test('hook account change blocks in-flight completion',async()=>{const h=hookHarness();h.render().trackCommand({stage:'queued',message:'Queued',commandId:req.commandId},'HP-004','stop');h.setUser('user-b');await flush();assert.deepEqual(h.messages,['Queued'])});
