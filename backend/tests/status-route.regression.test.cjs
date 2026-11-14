const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual legacy /status handler and actual state helpers without
// starting the service, connecting to Supabase, or issuing controller commands.
const source = fs.readFileSync(path.join(__dirname, '..', 'server.cjs'), 'utf8').replace(/\r\n/g, '\n');
function extract(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Source boundary missing: ${start}`);
  return source.slice(from, to);
}
function load() {
  let handler;
  const sandbox = vm.createContext({
    app: {get(route, fn) {
      assert.equal(route, '/status');
      handler = fn;
    }},
  });
  const deviceId = source.match(/^const DEVICE_ID = "(HP-[0-9]+)";/m);
  assert.ok(deviceId, 'Use the real configured default device ID');
  vm.runInContext(`const DEVICE_ID = ${JSON.stringify(deviceId[1])};`, sandbox);
  vm.runInContext(extract('const states = new Map();',
    '// =========================================================\n// SERVER + WEBSOCKET'), sandbox);
  vm.runInContext(extract('app.get("/status", (req, res) => {',
    '// =========================================================\n// DEVICE PAIRING CODE REGISTRATION'), sandbox);
  assert.equal(typeof handler, 'function');
  return {sandbox, handler};
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

test('legacy GET /status reports the default device and exact existing telemetry without writes', () => {
  const {sandbox, handler} = load();
  const fixture = {
    online: true, status: 'idle', state: 'IDLE', motor: 'STOP',
    position: 125, target: 125, full: 900, half: 450, percent: 14,
    firmware: 'fixture-fw', wifi: true, ip: '192.0.2.10', rssi: -55,
    lastSeen: 123456, commandPending: true, commandId: 'fixture-command',
    commandSource: 'TEST', commandCreatedAt: 100, commandDeliveredAt: 110,
  };
  vm.runInContext(`Object.assign(getDeviceState(DEVICE_ID), ${JSON.stringify(fixture)});
    Object.assign(getDeviceState('HP-002'), {position: 777, full: 2314});`, sandbox);
  const before = vm.runInContext('JSON.stringify([...states])', sandbox);
  let result;
  handler({query: {}}, {json(body) { result = plain(body); }});
  assert.deepEqual(result, {
    deviceId: 'HP-001', online: true, status: 'idle', state: 'IDLE', motor: 'STOP',
    position: 125, target: 125, full: 900, half: 450, percent: 14,
    firmware: 'fixture-fw', wifi: true, ip: '192.0.2.10', rssi: -55,
    lastSeen: 123456,
    command: {pending: true, id: 'fixture-command', source: 'TEST', createdAt: 100, deliveredAt: 110},
  });
  assert.equal(vm.runInContext('JSON.stringify([...states])', sandbox), before,
    'A status read must not change state or command delivery fields');
});

test('query parameters cannot select another pole through the legacy public endpoint', () => {
  const {sandbox, handler} = load();
  vm.runInContext(`Object.assign(getDeviceState('HP-001'), {position: 111});
    Object.assign(getDeviceState('HP-002'), {position: 222});`, sandbox);
  const before = vm.runInContext('JSON.stringify([...states])', sandbox);
  for (const query of [{device_id: 'HP-002'}, {deviceId: 'HP-002'}, {device_id: '../../bad'}]) {
    let result;
    handler({query}, {json(body) { result = plain(body); }});
    assert.equal(result.deviceId, 'HP-001');
    assert.equal(result.position, 111);
  }
  assert.equal(vm.runInContext('JSON.stringify([...states])', sandbox), before);
});
