const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, imports = {}) {
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    const result = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    });
    vm.runInNewContext(result.outputText, {
        module, exports: module.exports, URL,
        require(id) {
            assert.ok(id in imports, `Unexpected import ${id}`);
            return imports[id];
        }
    });
    return module.exports;
}
function harness(saved, respondingAddress) {
    const calls = [], writes = [];
    const identity = load("src/services/localDeviceIdentity.ts");
    const { discovery } = load("src/services/deviceDiscovery.ts", {
        "@capacitor/core": { CapacitorHttp: {
            request: async ({ url }) => {
                calls.push(url);
                return url === respondingAddress + "/status"
                    ? { status: 200, data: { device: "HonorPole", deviceId: "HP-002", firmware: "test" } }
                    : { status: 404, data: {} };
            }
        }},
        "@capacitor/preferences": { Preferences: {
            get: async () => ({ value: saved }),
            set: async value => writes.push(value)
        }},
        "./localDeviceIdentity": identity
    });
    return { discovery, calls, writes };
}
test("reconnection rejects an AP-only response, including cached AP address", async () => {
    const h = harness("192.168.4.1", "http://192.168.4.1");
    assert.equal(await h.discovery.discover("HP-002", false), null);
    assert.ok(h.calls.every(url => new URL(url).hostname !== "192.168.4.1"));
    assert.equal(h.writes.length, 0);
});
test("reconnection accepts a matching pole at a LAN address", async () => {
    const h = harness("192.168.0.189", "http://192.168.0.189");
    const found = await h.discovery.discover("HP-002", false);
    assert.equal(found.deviceId, "HP-002");
    assert.equal(found.ip, "192.168.0.189");
});
test("ordinary discovery retains setup AP support", async () => {
    const h = harness(null, "http://192.168.4.1");
    const found = await h.discovery.discover("HP-002");
    assert.equal(found.ip, "192.168.4.1");
});