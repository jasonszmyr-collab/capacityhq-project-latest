// Exercises the real service's transport callbacks with no network or devices.
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
async function flush(){for(let i=0;i<15;i++)await Promise.resolve()}
function harness(){
 let source=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../src/services/cloudService.ts'),'utf8'));
 source=source.replace(/^import .*from .*;\s*$/mg,'').replace(/import\.meta\.env/g,'({})').replace(/export const cloudService\s*=\s*new CloudService\(\);/,'').replace(/export default cloudService;/,'').replace(/export /g,'');
 const intervals=[],sockets=[];class FakeSocket{constructor(){sockets.push(this)}close(){}}
 const ctx={console:{log(){},warn(){},error(){}},WebSocket:FakeSocket,structuredClone,window:{setInterval:fn=>{intervals.push(fn);return intervals.length}},clearInterval(){}};
 vm.createContext(ctx);vm.runInContext(source+';this.Service=CloudService;',ctx);
 const service=Object.create(ctx.Service.prototype),telemetry=[],connections=[];
 Object.assign(service,{authToken:'fixture',userId:'user-a',authBlocked:false,connectionRequested:true,currentDeviceId:'HP-002',selectionRevision:1,authRevision:1,localConnected:false,telemetryTimer:null,connected:true,connectionMode:'cloud',telemetry:{online:true,serialNumber:'HP-002',calibrated:true,currentPosition:586,targetPosition:586,network:{cloudConnected:true,websocketConnected:true}},telemetrySubscribers:new Set([value=>telemetry.push(value)]),connectionSubscribers:new Set([value=>connections.push(value)]),getDeviceStatus:async()=>{throw Error('offline')},requireSelection(id,revision){if(id!==this.currentDeviceId||revision!==this.selectionRevision)throw Error('selection changed')},isAuthenticated(){return !!this.authToken},stopWebSocket(){},stopHeartbeat(){},startHeartbeat(){},scheduleReconnect(){}});
 return {service,telemetry,connections,intervals,sockets};
}

test('failed cloud status read publishes Offline telemetry to Control',async()=>{const h=harness();h.service.startTelemetryPolling();await flush();assert.equal(h.service.connected,false);assert.equal(h.telemetry.at(-1).online,false);assert.equal(h.telemetry.at(-1).network.websocketConnected,false);assert.equal(h.connections.at(-1),false)});
test('failed local status read also clears cached Online badge',async()=>{const h=harness();h.service.localConnected=true;h.service.getLocalStatus=async()=>{throw Error('unreachable local board')};h.service.startTelemetryPolling();await flush();assert.equal(h.telemetry.at(-1).online,false)});
test('fresh successful status restores Online after failure',async()=>{const h=harness();h.service.startTelemetryPolling();await flush();h.service.getDeviceStatus=async()=>({online:true,network:{cloudConnected:true,websocketConnected:false}});h.intervals[0]();await flush();assert.equal(h.telemetry.at(-1).online,true);assert.equal(h.connections.at(-1),true)});
test('offline transition preserves reported pole positions and calibration',async()=>{const h=harness();h.service.startTelemetryPolling();await flush();assert.equal(h.service.telemetry.currentPosition,586);assert.equal(h.service.telemetry.targetPosition,586);assert.equal(h.service.telemetry.calibrated,true)});
test('late failure from previous pole cannot change new selection',async()=>{const h=harness();let reject;h.service.getDeviceStatus=()=>new Promise((_,r)=>reject=r);h.service.startTelemetryPolling();h.service.currentDeviceId='HP-003';h.service.selectionRevision++;reject(Error('late old failure'));await flush();assert.equal(h.telemetry.length,0);assert.equal(h.connections.length,0)});
test('late failure from old authentication cannot change current telemetry',async()=>{const h=harness();let reject;h.service.getDeviceStatus=()=>new Promise((_,r)=>reject=r);h.service.startTelemetryPolling();h.service.authRevision++;reject(Error('late auth failure'));await flush();assert.equal(h.telemetry.length,0)});
test('current WebSocket close clears Online telemetry',()=>{const h=harness();h.service.startWebSocket();h.sockets[0].onclose({code:1006});assert.equal(h.telemetry.at(-1).online,false);assert.equal(h.telemetry.at(-1).network.websocketConnected,false);assert.equal(h.connections.at(-1),false)});
test('old WebSocket close cannot clear new device telemetry',()=>{const h=harness();h.service.startWebSocket();h.service.currentDeviceId='HP-003';h.sockets[0].onclose({code:1006});assert.equal(h.telemetry.length,0);assert.equal(h.service.telemetry.online,true)});
test('network failure never dispatches a command',async()=>{const h=harness();h.service.sendCommandResult=()=>{throw Error('MUST NOT SEND')};h.service.startTelemetryPolling();await flush();assert.equal(h.telemetry.at(-1).online,false)});
