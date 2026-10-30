import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import RecoveryPasswords from "../components/RecoveryPasswords";
import cloudService from "../services/cloudService";
import { protectedSetup, useLocalSetup, clearLocalSetup, getSetupDeviceId } from "../services/protectedSetup";
import { Clipboard } from "@capacitor/clipboard";

export default function ProtectedSetup() {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [usbPassword, setUsbPassword] = useState("");
    const [offlineDeviceId, setOfflineDeviceId] = useState(() => getSetupDeviceId() ?? "");
    const [reveal, setReveal] = useState(false);
    const [copyMessage, setCopyMessage] = useState("");
    const [, update] = useState(0);
    const mounted = useRef(false);
    const opening = useRef(false);
    const requestVersion = useRef(0);
    useEffect(() => {
        mounted.current = true;
        const timer = setInterval(() => update(value => value + 1), 1000);
        return () => { mounted.current = false; clearInterval(timer); protectedSetup.cancelPending(); };
    }, []);
    const session = protectedSetup.details();
    const deviceId = getSetupDeviceId();
    const cloudDeviceId = cloudService.getCurrentDeviceId();
    async function open() {
        if (opening.current) return;
        const version = ++requestVersion.current;
        opening.current = true; setBusy(true); setError(""); setReveal(false); setCopyMessage("");
        clearLocalSetup();
        try { await protectedSetup.open(); }
        catch (err) { if (mounted.current && version === requestVersion.current) setError(err instanceof Error ? err.message : "Unable to open setup."); }
        finally { if (version === requestVersion.current) { opening.current = false; if (mounted.current) { setBusy(false); update(value => value + 1); } } }
    }
    async function copySetupPassword() {
        setCopyMessage("");
        const current = protectedSetup.details();
        if (!current) {
            setCopyMessage("Setup password expired. Open setup again.");
            return;
        }
        try {
            await Clipboard.write({
                string: current.password,
                label: "HonorPole setup password"
            });
            if (mounted.current) setCopyMessage("Copied. Paste it into Android Wi-Fi settings.");
        } catch {
            if (mounted.current) setCopyMessage("Could not copy the password. Please try again.");
        }
    }
    function useUsb() {
        try { useLocalSetup(offlineDeviceId.trim().toUpperCase(), usbPassword.trim()); ++requestVersion.current; opening.current = false; setBusy(false); setUsbPassword(""); setError(""); setReveal(false); setCopyMessage(""); update(value => value + 1); }
        catch (err) { setError(err instanceof Error ? err.message : "Invalid setup password."); }
    }
    return <div className="relative min-h-screen">
        <AppHeader title="Protected Wi-Fi setup" reserveSpace />
        <div className="px-6 pt-6 pb-24 text-white space-y-5 max-w-md mx-auto">
            <h2 className="text-xl font-bold">Set up {deviceId ?? "an HonorPole"}</h2>
            <p>Online setup: your phone and pole must have internet. Keep the pole idle. Only its administrator can open setup online.</p>
            <button disabled={busy || !cloudDeviceId} onClick={open} className="w-full p-4 bg-blue-600 rounded-xl disabled:opacity-50">
                {busy ? "Waiting for the pole to open setup..." : "Open protected setup"}
            </button>
            {busy && <button onClick={() => {
                protectedSetup.cancelPending(); ++requestVersion.current;
                opening.current = false; setBusy(false); setError("");
            }} className="w-full p-3 border rounded-xl">Stop waiting — use setup card</button>}
            <p className="text-sm">Stopping the wait does not close setup or cancel a request already sent to the pole. For offline setup, use the private setup-card password after physically opening the hotspot. Do not send another online opening request while one is pending.</p>
            {session && <div className="space-y-4 p-4 bg-white/10 rounded-xl">
                <p>In Android Wi-Fi settings, join <b>HonorPole-Setup-{session.deviceId}</b> using this setup password. Stay connected when Android warns there is no internet.</p>
                <input aria-label="Setup Wi-Fi password" readOnly type={reveal ? "text" : "password"} value={session.password}
                    className="w-full p-2 text-sm bg-black/40 rounded" />
                <button type="button" onClick={copySetupPassword}
                    className="w-full p-3 bg-blue-600 rounded-xl">Copy setup password</button>
                <p role="status" aria-live="polite" className="text-sm">{copyMessage}</p>
                <label className="flex gap-2"><input type="checkbox" checked={reveal} onChange={event => setReveal(event.target.checked)} />Show setup password</label>
                <p className="text-sm">App credential time remaining: {Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 60000))} minutes. The pole’s actual setup window may close sooner.</p>
                <button onClick={() => navigate("/setup")} className="w-full p-4 bg-green-600 rounded-xl">I joined setup Wi-Fi — scan networks</button>
                <button onClick={() => { clearLocalSetup(); setReveal(false); setCopyMessage(""); update(value => value + 1); }} className="w-full p-2 border rounded-xl">Forget setup password</button>
            </div>}
            <RecoveryPasswords session={session} onUse={(id, password) => {
                try {
                    useLocalSetup(id, password);
                    ++requestVersion.current; opening.current = false; setBusy(false);
                    setOfflineDeviceId(id); setUsbPassword(""); setError(""); setReveal(false); setCopyMessage("");
                    update(value => value + 1);
                } catch (err) { setError(err instanceof Error ? err.message : "Unable to use recovery password."); }
            }} />
            <h3 className="text-lg font-bold">New Wi-Fi or no pole internet</h3>
            <p className="text-sm">Keep the pole powered and idle. After startup, leave BOOT released for at least 5 seconds. Hold BOOT for at least 3 seconds, then release to open its protected setup Wi-Fi for 10 minutes. Do not hold BOOT while powering on or resetting.</p>
            <p className="text-sm">Enter the pole ID and private password from its setup card. This works without signing in or changing your selected cloud pole. The setup password is separate from your new Wi-Fi password. Older firmware requires USB SETUP in Serial Monitor.</p>
            <label className="block">Pole ID on setup card
                <input aria-label="Offline setup pole ID" autoCapitalize="characters" autoComplete="off" value={offlineDeviceId}
                    onChange={event => setOfflineDeviceId(event.target.value)} placeholder="HP-002" className="w-full p-3 bg-white/10 rounded-xl" />
            </label>
            <input aria-label="Private setup-card password" type="password" autoComplete="off" value={usbPassword}
                onChange={event => setUsbPassword(event.target.value)} className="w-full p-3 bg-white/10 rounded-xl" />
            <button disabled={!offlineDeviceId.trim()} onClick={useUsb} className="w-full p-3 border rounded-xl disabled:opacity-50">Use setup-card password</button>
            {error && <p role="alert" className="text-red-400">{error}</p>}
            <p className="text-sm">Changing Wi-Fi does not transfer ownership. A new owner also needs the account handover completed.</p>
            <p className="text-sm">Leaving this page stops waiting for a new request; an already opened setup window closes on the pole's timer. Temporary setup passwords are kept only for this app session. Permanent recovery passwords are retained only when you choose Save for offline recovery.</p>
        </div><BottomNav />
    </div>;
}
