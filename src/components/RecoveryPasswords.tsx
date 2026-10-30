import { useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Clipboard } from "@capacitor/clipboard";
import cloudService from "../services/cloudService";
import { protectedSetup } from "../services/protectedSetup";
import type { SetupSession } from "../services/protectedSetupSession";
import { recoveryAvailable, recoveryVault, type RecoveryEntry } from "../services/recoveryVault";

export default function RecoveryPasswords({ session, onUse }: {
    session: SetupSession | null;
    onUse(deviceId: string, password: string): void;
}) {
    const [entries, setEntries] = useState<RecoveryEntry[]>([]);
    const [choice, setChoice] = useState("");
    const [unlocked, setUnlocked] = useState<{ entry: RecoveryEntry; password: string; scope: string } | null>(null);
    const [reveal, setReveal] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const revision = useRef(0);
    const working = useRef(false);
    const foreground = useRef(true);
    const visibilityVersion = useRef(0);
    const ownerId = cloudService.getUserId();
    const scope = cloudService.getProtectedSetupScope();
    const available = recoveryAvailable();
    const key = (entry: RecoveryEntry) => `${entry.ownerId}:${entry.deviceId}`;
    useEffect(() => {
        const version = ++revision.current;
        setUnlocked(null); setReveal(false); setChoice(""); setEntries([]); setMessage(""); setError("");
        working.current = false; setBusy(false);
        if (available) recoveryVault.list(ownerId).then(result => {
            if (version === revision.current) setEntries(result);
        }).catch(() => { if (version === revision.current) setError("Could not load this phone's saved recovery passwords."); });
        return () => {
            ++revision.current;
            void recoveryVault.cancelPending().catch(() => {});
        };
    }, [ownerId, scope, available]);
    useEffect(() => {
        let disposed = false;
        let remove: (() => Promise<void>) | undefined;
        App.addListener("appStateChange", state => {
            foreground.current = state.isActive;
            if (!state.isActive) {
                ++visibilityVersion.current;
                setUnlocked(null); setReveal(false); setMessage("");
            }
        }).then(listener => { if (disposed) void listener.remove(); else remove = () => listener.remove(); });
        return () => { disposed = true; if (remove) void remove(); };
    }, []);
    useEffect(() => {
        if (!unlocked) return;
        const timer = setTimeout(() => { setUnlocked(null); setReveal(false); }, 60000);
        return () => clearTimeout(timer);
    }, [unlocked]);
    async function action(task: () => Promise<void>) {
        if (working.current) return;
        working.current = true; setBusy(true); setError(""); setMessage("");
        const version = revision.current, visibility = visibilityVersion.current;
        try { await task(); }
        catch (failure) {
            if (version === revision.current && foreground.current && visibility === visibilityVersion.current)
                setError(failure instanceof Error ? failure.message : "Recovery action was not completed.");
        } finally {
            if (version === revision.current) { working.current = false; setBusy(false); }
        }
    }
    function guard(version: number, originalScope: string, visibility = visibilityVersion.current) {
        if (!foreground.current || visibility !== visibilityVersion.current)
            throw new Error("Recovery was interrupted. Unlock again while the app is open.");
        if (version !== revision.current || originalScope !== cloudService.getProtectedSetupScope())
            throw new Error("Account or pole changed. Open recovery again.");
    }
    async function save() {
        const current = protectedSetup.details();
        const owner = cloudService.getUserId();
        if (!owner || !current?.recoveryPassword || current.deviceId !== cloudService.getCurrentDeviceId())
            throw new Error("Open online setup on recovery-capable firmware before saving its permanent password.");
        const entry = { ownerId: owner, deviceId: current.deviceId };
        const version = revision.current, originalScope = cloudService.getProtectedSetupScope(), visibility = visibilityVersion.current;
        await recoveryVault.save(entry, current.recoveryPassword);
        guard(version, originalScope, visibility);
        const result = await recoveryVault.list(owner);
        guard(version, originalScope, visibility);
        setEntries(result); setChoice(key(entry));
        setMessage(`Permanent recovery password saved on this phone for ${entry.deviceId}. It works with BOOT setup after the old Wi-Fi is unavailable.`);
    }
    async function unlock() {
        const entry = entries.find(item => key(item) === choice);
        if (!entry) throw new Error("Choose a saved HonorPole first.");
        const version = revision.current, originalScope = cloudService.getProtectedSetupScope(), visibility = visibilityVersion.current;
        const password = await recoveryVault.read(entry);
        guard(version, originalScope, visibility);
        setUnlocked({ entry, password, scope: originalScope }); setReveal(false);
    }
    async function forget() {
        const entry = entries.find(item => key(item) === choice);
        if (!entry) throw new Error("Choose a saved HonorPole first.");
        const version = revision.current, originalScope = cloudService.getProtectedSetupScope(), visibility = visibilityVersion.current;
        await recoveryVault.forget(entry);
        guard(version, originalScope, visibility);
        setEntries(previous => previous.filter(item => key(item) !== choice));
        setChoice(""); setUnlocked(null); setReveal(false);
        setMessage("Recovery password removed from this phone. The pole's password and ownership were not changed.");
    }
    return <section className="space-y-3 border border-white/30 rounded-xl p-4" aria-label="Saved offline recovery">
        <h3 className="text-lg font-bold">Moving or changing Wi-Fi</h3>
        <p className="text-sm">Before losing the old Wi-Fi, open online setup below and save this pole's permanent recovery password. The temporary online setup password is different.</p>
        {!available && <p className="text-sm">Save and unlock recovery passwords in the Android app. This browser does not store them.</p>}
        {available && <>
            <button disabled={busy || !ownerId || !session?.recoveryPassword || session.deviceId !== cloudService.getCurrentDeviceId()}
                onClick={() => void action(save)} className="w-full p-3 bg-blue-600 rounded-xl disabled:opacity-50">Save for offline recovery</button>
            {!session?.recoveryPassword && <p className="text-sm">Saving requires an online setup confirmation from updated recovery-capable firmware. Older firmware provides only a temporary password.</p>}
            <p className="text-sm">Saved passwords stay encrypted on this phone and require its screen-lock PIN, pattern or password. They remain available while signed out. Reinstalling the app or replacing the phone removes this copy.</p>
            {entries.length === 0 ? <p>No saved recovery password on this phone{ownerId ? " for this account" : ""}.</p> : <>
                <label className="block">Saved HonorPole
                    <select aria-label="Saved recovery HonorPole" value={choice} disabled={busy}
                        onChange={event => { setChoice(event.target.value); setUnlocked(null); setReveal(false); setMessage(""); }} className="block w-full p-3 bg-slate-800 rounded-xl">
                        <option value="">Choose a pole</option>
                        {entries.map((entry, index) => <option key={key(entry)} value={key(entry)}>{entry.deviceId}{entries.filter(item => item.deviceId === entry.deviceId).length > 1 ? ` — saved record ${index + 1}` : ""}</option>)}
                    </select>
                </label>
                <button disabled={busy || !choice} onClick={() => void action(unlock)} className="w-full p-3 border rounded-xl disabled:opacity-50">Unlock saved recovery password</button>
                <button disabled={busy || !choice} onClick={() => void action(forget)} className="w-full p-2 border rounded-xl disabled:opacity-50">Remove saved password from this phone</button>
            </>}
            {unlocked && <div className="space-y-3">
                <p>Recovery Wi-Fi: <b>HonorPole-Setup-{unlocked.entry.deviceId}</b></p>
                <input aria-label="Saved recovery password" readOnly type={reveal ? "text" : "password"} value={unlocked.password} className="w-full p-2 bg-black/40 rounded" />
                <label className="flex gap-2"><input type="checkbox" checked={reveal} onChange={event => setReveal(event.target.checked)} />Show recovery password</label>
                <button disabled={busy} onClick={() => void action(async () => {
                    guard(revision.current, unlocked.scope);
                    await Clipboard.write({ string: unlocked.password, label: "HonorPole recovery password" });
                    setMessage("Copied. Use this password for the BOOT-opened setup Wi-Fi. Clear your clipboard after use.");
                })} className="w-full p-3 bg-blue-600 rounded-xl">Copy recovery password</button>
                <button disabled={busy} onClick={() => {
                    try {
                        guard(revision.current, unlocked.scope);
                        onUse(unlocked.entry.deviceId, unlocked.password);
                    } catch { setError("Account or pole changed. Unlock recovery again."); }
                    setUnlocked(null); setReveal(false);
                }} className="w-full p-3 bg-green-600 rounded-xl">Use saved password for Wi-Fi setup</button>
                <p className="text-sm">Keep the pole idle. Leave BOOT released for 5 seconds after startup, then hold it for 3 seconds and release. Join the recovery Wi-Fi using this password. Do not request a temporary online setup window at the same time.</p>
            </div>}
        </>}
        {busy && <p role="status">Complete the phone unlock prompt…</p>}
        {message && <p role="status" aria-live="polite">{message}</p>}
        {error && <p role="alert" className="text-red-300">{error}</p>}
        <p className="text-sm">If the pole is already offline and no password was saved, the app cannot retrieve it through the disconnected network. Restore its old connection or contact support. Removing a saved password does not revoke other copies; ownership handover needs a separate credential change.</p>
    </section>;
}
