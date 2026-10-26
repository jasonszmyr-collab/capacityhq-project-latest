const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const root=path.join(__dirname,'../src');
async function flush(){for(let i=0;i<15;i++)await Promise.resolve()}
function harness(){
 const timers=new Map();let next=0,scope='account-a:1',calls=0,load=async()=>{throw Error('offline')};
 const context={setTimeout(fn,ms){timers.set(++next,{fn,ms});return next},clearTimeout(id){timers.delete(id)}};
 vm.createContext(context);
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync(path.join(root,'services/deviceListRecovery.ts'),'utf8')).replace(/export /g,'')+';this.watch=watchDeviceList',context);
 const loaded=[],errors=[];
 const opts={load:()=>{calls++;return load()},getScope:()=>scope,onLoaded:d=>loaded.push(d),onError:()=>errors.push('retry')};
 return {timers,loaded,errors,opts,watch:context.watch,setLoad(fn){load=fn},setScope(s){scope=s},get calls(){return calls},start(){return context.watch(opts)},tick(){const [id,t]=timers.entries().next().value;timers.delete(id);assert.equal(t.ms,5000);t.fn()}};
}
test('failed startup read automatically recovers without navigation',async()=>{const h=harness();h.start();await flush();assert.equal(h.errors.length,1);h.setLoad(async()=>[{deviceId:'HP-002'}]);h.tick();await flush();assert.equal(h.loaded[0][0].deviceId,'HP-002');assert.equal(h.timers.size,0)});
test('continued failures keep exactly one retry timer',async()=>{const h=harness();h.start();await flush();for(let i=0;i<5;i++){assert.equal(h.timers.size,1);h.tick();await flush()}assert.equal(h.calls,6);assert.equal(h.loaded.length,0)});
test('valid empty assigned list settles without automatic reselection or retry',async()=>{const h=harness();h.setLoad(async()=>[]);h.start();await flush();assert.equal(h.loaded[0].length,0);assert.equal(h.timers.size,0);assert.equal(h.errors.length,0)});
test('unmount clears pending retry',async()=>{const h=harness();const cancel=h.start();await flush();cancel();assert.equal(h.timers.size,0)});
test('late success after unmount cannot populate list',async()=>{const h=harness();let finish;h.setLoad(()=>new Promise(r=>finish=r));const cancel=h.start();cancel();finish([{deviceId:'HP-002'}]);await flush();assert.equal(h.loaded.length,0)});
test('late failure after unmount cannot schedule another read',async()=>{const h=harness();let fail;h.setLoad(()=>new Promise((_,r)=>fail=r));const cancel=h.start();cancel();fail(Error('offline'));await flush();assert.equal(h.errors.length,0);assert.equal(h.timers.size,0)});
test('old account result cannot populate new account selector',async()=>{const h=harness();let finish;h.setLoad(()=>new Promise(r=>finish=r));h.start();h.setScope('account-b:2');finish([{deviceId:'HP-002'}]);await flush();assert.equal(h.loaded.length,0)});
test('same-account signout and login invalidates old result',async()=>{const h=harness();let finish;h.setLoad(()=>new Promise(r=>finish=r));h.start();h.setScope('account-a:3');finish([{deviceId:'HP-002'}]);await flush();assert.equal(h.loaded.length,0)});
test('old login retry timer cannot issue a new read',async()=>{const h=harness();h.start();await flush();h.setScope('account-b:2');h.tick();await flush();assert.equal(h.calls,1);assert.equal(h.timers.size,0)});
function service(){
 let src=stripTypeScriptTypes(fs.readFileSync(path.join(root,'services/cloudService.ts'),'utf8')).replace(/^import .*from .*;\s*$/mg,'').replace(/import\.meta\.env/g,'({})').replace(/export const cloudService\s*=\s*new CloudService\(\);/,'').replace(/export default cloudService;/,'').replace(/export /g,'');
 const ctx={console:{error(){}},window:{}};vm.createContext(ctx);vm.runInContext(src+';this.Service=CloudService;',ctx);return Object.assign(Object.create(ctx.Service.prototype),{userId:'account-a',setupAuthRevision:1,devices:new Map()});
}
test('list scope ignores token and pole changes but changes at login boundary',()=>{const s=service(),scope=s.getDeviceListScope();s.authRevision=9;s.authToken='new';s.currentDeviceId='HP-003';s.selectionRevision=12;assert.equal(s.getDeviceListScope(),scope);s.setupAuthRevision++;assert.notEqual(s.getDeviceListScope(),scope)});
test('getDevices refuses to cache a response from previous login',async()=>{const s=service();let finish;s.request=()=>new Promise(r=>finish=r);const read=s.getDevices();s.userId='account-b';s.setupAuthRevision++;finish([{deviceId:'HP-002'}]);await assert.rejects(read,/Login changed/);assert.equal(s.devices.size,0)});
function component(){
 const text=fs.readFileSync(path.join(root,'components/CloudDeviceControl.tsx'),'utf8');const start=text.indexOf('    useEffect(() => watchDeviceList');const end=text.indexOf('    useEffect(() =>',start+10);assert.ok(start>=0&&end>start);
 let opts,current='HP-002';const assigned=[],selected=[],states=[];
 const ctx={useEffect(fn){fn()},watchDeviceList(o){opts=o;return ()=>{}},cloudService:{getCurrentDeviceId:()=>current,setDevice:d=>assigned.push(d.deviceId),getDevices:async()=>[],getDeviceListScope:()=> 'a:1'},setDeviceListState:s=>states.push(s),setDevices(){},setSelectedDevice:s=>selected.push(s)};
 vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(text.slice(start,end)),ctx);
 return {opts,assigned,selected,states,select(id){current=id}};
}
test('real component keeps current selection when delayed list arrives',()=>{const h=component();h.select('HP-003');h.opts.onLoaded([{deviceId:'HP-002'},{deviceId:'HP-003'}]);assert.deepEqual(h.assigned,['HP-003']);assert.deepEqual(h.selected,['HP-003']);assert.equal(h.states[0],'ready')});
test('real component read failure retains selection and does not select a fallback',()=>{const h=component();h.opts.onError();assert.deepEqual(h.assigned,[]);assert.deepEqual(h.selected,[]);assert.equal(h.states[0],'retrying')});
