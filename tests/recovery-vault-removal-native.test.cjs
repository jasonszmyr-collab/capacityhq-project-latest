const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('native removal rejects surviving record files and preserves unrelated records', () => {
    const source = fs.readFileSync(path.join(__dirname,
        '../android/app/src/main/java/com/capacity/app/RecoveryVaultPlugin.java'), 'utf8');
    const match = source.match(
        /(if \(method\.equals\("forget"\)\) \{[\s\S]*?\r?\n            \})\r?\n            Cipher/
    );
    assert.ok(match, 'Expected native removal branch was not found');
    const branch = match[1];

    const javaSource = `
import java.util.HashSet;
import java.util.Set;

public class VaultRemovalCheck {
    static final Set<String> files = new HashSet<>();
    static String retained;

    static class File {
        final String name;
        File(String name) { this.name = name; }
        String getPath() { return name; }
        boolean exists() { return files.contains(name); }
    }
    static File file(String id) { return new File("record.json"); }

    static class AtomicFile {
        void delete() {
            for (String name : new String[]{
                "record.json", "record.json.bak", "record.json.new"
            }) {
                if (!name.equals(retained)) files.remove(name);
            }
        }
    }

    static class Call {
        boolean resolved;
        boolean rejected;
        void resolve() { resolved = true; }
        void reject() { rejected = true; }
    }

    static void runRemoval(Call call) {
        try {
            String id = "synthetic";
            String method = "forget";
            AtomicFile target = new AtomicFile();
            ${branch}
        } catch (Exception failure) {
            call.reject();
        }
    }

    static void check(String name, boolean populated,
                      String survivor, boolean expectSuccess) {
        files.clear();
        files.add("unrelated.json");
        if (populated) {
            files.add("record.json");
            files.add("record.json.bak");
            files.add("record.json.new");
        }
        retained = survivor;
        Call call = new Call();
        runRemoval(call);
        if (call.resolved != expectSuccess ||
            call.rejected == expectSuccess ||
            !files.contains("unrelated.json")) {
            throw new AssertionError(name);
        }
        if (survivor != null && !files.contains(survivor)) {
            throw new AssertionError("Failure simulation did not retain file");
        }
        System.out.println("PASS " + name);
    }

    public static void main(String[] args) {
        check("successful removal", true, null, true);
        check("already absent record", false, null, true);
        check("main record remains", true, "record.json", false);
        check("backup remains", true, "record.json.bak", false);
        check("pending write remains", true, "record.json.new", false);
    }
}
`;
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-vault-test-'));
    try {
        const file = path.join(temporary, 'VaultRemovalCheck.java');
        fs.writeFileSync(file, javaSource);
        const suffix = process.platform === 'win32' ? '.exe' : '';
        function run(command, args) {
            const result = spawnSync(command + suffix, args, { encoding: 'utf8' });
            assert.ifError(result.error);
            assert.equal(result.status, 0, result.stdout + result.stderr);
            return result.stdout;
        }
        run('javac', ['-d', temporary, file]);
        console.log(run('java', ['-cp', temporary, 'VaultRemovalCheck']));
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});
