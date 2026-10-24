import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import cloudService from "../services/cloudService";
import { protectedSetup } from "../services/protectedSetup";

export default function ProtectedSetup() {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [usbPassword, setUsbPassword] = useState("");
    const [reveal, setReveal] = useState(false);
    const [, update] = useState(0);
    const mounted = useRef(false);
    const opening = useRef(false);
    useEffect(() => {
        mounted.current = true;
        const timer = setInterval(() => update(value => value + 1), 1000);
        return () => { mounted.current = false; clearInterval(timer); protectedSetup.cancelPending(); };
    }, []);
    const session = protectedSetup.details();
    const deviceId = cloudService.getCurrentDeviceId();
    async function open() {
        if (opening.current) return;
        opening.current = true; setBusy(true); setError(""); setReveal(false);
        try { await protectedSetup.open(); }
        catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : "Unable to open setup."); }
        finally { opening.current = false; if (mounted.current) { setBusy(false); update(value => value + 1); } }
    }
    function useUsb() {
        try { protectedSetup.useUsb(usbPassword); setUsbPassword(""); setError(""); setReveal(false); update(value => value + 1); }
        catch (err) { setError(err instanceof Error ? err.message : "Invalid setup password."); }
    }
    return <div className="relative min-h-screen">
        <AppHeader title="Protected Wi-Fi setup" />
        <div className="px-6 pt-24 pb-24 text-white space-y-5 max-w-md mx-auto">
            <h2 className="text-xl font-bold">Set up {deviceId ?? "an HonorPole"}</h2>
            <p>Start while your phone and pole have internet. Keep the pole idle. Only its administrator can open setup from the app.</p>
            <button disabled={busy || !deviceId} onClick={open} className="w-full p-4 bg-blue-600 rounded-xl disabled:opacity-50">
                {busy ? "Waiting for the pole to open setup..." : "Open protected setup"}
            </button>
            <p className="text-sm">For USB setup, send SETUP in Serial Monitor and enter the setup password printed there. This is separate from your home Wi-Fi password.</p>
            <input aria-label="USB setup password" type="password" autoComplete="off" value={usbPassword}
                onChange={event => setUsbPassword(event.target.value)} className="w-full p-3 bg-white/10 rounded-xl" />
            <button disabled={busy || !deviceId} onClick={useUsb} className="w-full p-3 border rounded-xl disabled:opacity-50">Use USB setup password</button>
            {error && <p role="alert" className="text-red-400">{error}</p>}
            {session && <div className="space-y-4 p-4 bg-white/10 rounded-xl">
                <p>In Android Wi-Fi settings, join <b>HonorPole-Setup-{session.deviceId}</b> using this setup password. Stay connected when Android warns there is no internet.</p>
                <input aria-label="Setup Wi-Fi password" readOnly type={reveal ? "text" : "password"} value={session.password}
                    className="w-full p-2 text-sm bg-black/40 rounded" />
                <label className="flex gap-2"><input type="checkbox" checked={reveal} onChange={event => setReveal(event.target.checked)} />Show setup password</label>
                <p className="text-sm">App credential time remaining: {Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 60000))} minutes. A USB-opened window may close sooner.</p>
                <button onClick={() => navigate("/setup")} className="w-full p-4 bg-green-600 rounded-xl">I joined setup Wi-Fi — scan networks</button>
                <button onClick={() => { protectedSetup.clear(); setReveal(false); update(value => value + 1); }} className="w-full p-2 border rounded-xl">Forget setup password</button>
            </div>}
            <p className="text-sm">Leaving this page stops waiting for a new request; an already opened setup window closes on the pole's timer. Setup passwords are kept only for this app session.</p>
        </div><BottomNav />
    </div>;
}
