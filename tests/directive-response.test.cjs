const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname,
    "../src/services/honorPoleDirectiveService.ts"), "utf8");
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
    }
}).outputText;

function client(fetchImpl) {
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
        module, exports: module.exports, fetch: fetchImpl, Error, Date
    });
    return Object.assign(module.exports.getHonorPoleDirectiveStatus, { coverageWarning: module.exports.getDirectiveCoverageWarning });
}
function tier() {
    return {
        active: false, title: null, position: null, verified: false,
        verification_status: null, source_url: null, start: null, end: null
    };
}
function fixture() {
    return {
        device_id: "HP-002", federal: tier(), state: tier(), local: tier(),
        effective: {
            position: "FULL", authority: "SCHEDULE",
            title: "No active half-staff directive"
        },
        updated: "2026-10-29T00:16:31.925Z",
        coverage: { local_policy: "UNMAPPED" },
        auto_recommendation: { warning: "Coverage not assessed." }
    };
}
function reply(value) {
    return client(async () => ({ ok: true, json: async () => value }));
}

test("valid inactive response preserves coverage warnings", async () => {
    const value = fixture();
    const result = await reply(value)("HP-002");
    assert.equal(result, value);
    assert.equal(result.auto_recommendation.warning, "Coverage not assessed.");
});
test("valid active directive is retained", async () => {
    const value = fixture();
    Object.assign(value.federal, {
        active: true, verified: true, title: "Test directive", position: "HALF"
    });
    const result = await reply(value)("HP-002");
    assert.equal(result.federal.title, "Test directive");
    assert.equal(result.federal.verified, true);
});
test("optional local tier may be absent", async () => {
    const value = fixture();
    delete value.local;
    assert.equal((await reply(value)("HP-002")).device_id, "HP-002");
});
for (const [name, change] of [
    ["wrong pole", v => { v.device_id = "HP-003"; }],
    ["missing pole", v => { delete v.device_id; }],
    ["missing federal", v => { delete v.federal; }],
    ["null state", v => { v.state = null; }],
    ["array federal", v => { v.federal = []; }],
    ["string active", v => { v.federal.active = "false"; }],
    ["string verified", v => { v.federal.verified = "true"; }],
    ["object title", v => { v.state.title = {}; }],
    ["missing tier field", v => { delete v.state.position; }],
    ["invalid local", v => { v.local = null; }],
    ["missing effective", v => { delete v.effective; }],
    ["object position", v => { v.effective.position = {}; }],
    ["invalid timestamp", v => { v.updated = "not-a-date"; }],
    ["numeric timestamp", v => { v.updated = 123; }],
    ["timezone missing", v => { v.updated = "2026-10-29T00:16:31"; }],
    ["failure response", v => { v.success = false; }],
    ["error response", v => { v.error = "unavailable"; }]
]) {
    test("rejects " + name, async () => {
        const value = fixture();
        change(value);
        await assert.rejects(() => reply(value)("HP-002"), /validated/);
    });
}
for (const value of [null, [], {}, "bad", 42]) {
    test("rejects malformed top-level " + JSON.stringify(value), async () => {
        await assert.rejects(() => reply(value)("HP-002"), /validated/);
    });
}
test("HTTP failure rejects before reading JSON", async () => {
    const read = client(async () => ({
        ok: false, status: 503,
        json: async () => { throw Error("JSON should not be read"); }
    }));
    await assert.rejects(() => read("HP-002"), /503/);
});
test("invalid JSON rejects", async () => {
    const read = client(async () => ({
        ok: true, json: async () => { throw SyntaxError("Invalid JSON"); }
    }));
    await assert.rejects(() => read("HP-002"), /Invalid JSON/);
});
test("network failure rejects", async () => {
    const read = client(async () => { throw Error("Network unavailable"); });
    await assert.rejects(() => read("HP-002"), /Network unavailable/);
});
test("coverage warning is available for display without changing directive status", async () => {
    const read = reply(fixture());
    const status = await read("HP-002");
    assert.equal(read.coverageWarning(status), "Coverage not assessed.");
    assert.equal(status.federal.active, false);
    assert.equal(status.effective.position, "FULL");
});
test("local coverage warning is retained alongside the general warning", async () => {
    const value = fixture();
    value.auto_recommendation.local_warning = "Local coverage is unmapped.";
    const read = reply(value);
    assert.equal(read.coverageWarning(await read("HP-002")),
        "Coverage not assessed. Local coverage is unmapped.");
});
test("legacy response reports unavailable coverage information", async () => {
    const value = fixture();
    delete value.auto_recommendation;
    const read = reply(value);
    assert.equal(read.coverageWarning(await read("HP-002")),
        "Directive-source coverage information is unavailable.");
});
test("missing directive status cannot retain a coverage warning", () => {
    assert.equal(reply(fixture()).coverageWarning(null), null);
});
test("explicitly empty warnings do not invent a warning", async () => {
    const value = fixture();
    value.auto_recommendation = { warning: null, local_warning: "" };
    const read = reply(value);
    assert.equal(read.coverageWarning(await read("HP-002")), null);
});
for (const recommendation of [
    null, [], "bad", { warning: {} }, { local_warning: 42 }
]) {
    test("rejects malformed coverage warning " + JSON.stringify(recommendation), async () => {
        const value = fixture();
        value.auto_recommendation = recommendation;
        await assert.rejects(() => reply(value)("HP-002"), /validated/);
    });
}