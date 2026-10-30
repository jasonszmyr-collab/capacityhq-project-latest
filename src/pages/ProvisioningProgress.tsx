import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import cloudService from "../services/cloudService";
import { getSetupDeviceId } from "../services/protectedSetup";
import { discovery } from "../services/deviceDiscovery";

import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";

export default function ProvisioningProgress() {

  const navigate = useNavigate();
  const location = useLocation();

  const ssid =
    location.state?.ssid || "Your WiFi";

  const [progress, setProgress] = useState(0);

  const [status, setStatus] = useState(
    "Sending WiFi Credentials..."
  );

  const [detail, setDetail] = useState(
    "Please keep the HonorPole powered on."
  );

  const [deviceIP, setDeviceIP] = useState("");
  const [firmware, setFirmware] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const deviceId = location.state?.deviceId;
    const scope = cloudService.getProtectedSetupScope();
    let active = true;
    let next: ReturnType<typeof setTimeout>;
    const current = () => active && scope === cloudService.getProtectedSetupScope() && deviceId === getSetupDeviceId();
    if (!deviceId || deviceId !== getSetupDeviceId()) {
      setFailed(true); setStatus("Select the HonorPole again");
      setDetail("This page has no matching Wi-Fi save for the selected pole.");
      return () => { active = false; };
    }
    setProgress(35);
    setStatus("Wi-Fi settings saved");
    setDetail(`Reconnect your phone to ${ssid}. Keep ${deviceId} powered on while it restarts. We will check that same pole.`);
    const deadline = Date.now() + 90000;
    async function poll() {
      if (!current()) return;
      try {
        const device = await discovery.discover(deviceId, false);
        if (!current()) return;
        if (device) {
          setDeviceIP(device.ip); setFirmware(device.firmware);
          setProgress(100); setStatus(`${deviceId} found on the local network`);
          setDetail("This pole responded at the local address shown below. This confirms local reachability; it does not verify the requested Wi-Fi network or cloud access. Sign in with its authorized account to check cloud access.");
          return;
        }
      } catch { /* Failed discovery cannot establish reconnection. */ }
      if (!current()) return;
      if (Date.now() >= deadline) {
        setFailed(true); setStatus("Reconnection not confirmed");
        setDetail(`Reconnect your phone to ${ssid} and check ${deviceId} on Home. A failed search does not establish that the Wi-Fi password is wrong.`);
        return;
      }
      next = setTimeout(() => void poll(), 2000);
    }
    next = setTimeout(() => void poll(), 5000);
    return () => { active = false; clearTimeout(next); };
  }, [ssid, location.state?.deviceId]);

  return (

    <div className="relative min-h-screen">

      <AppHeader title="HonorPole Setup" />

      <div className="px-6 pt-24 pb-24 text-white">

        <div className="max-w-md mx-auto space-y-8">

          <div className="text-center">

            <h1 className="text-3xl font-bold">

              {status}

            </h1>

            <h2 className="text-xl mt-2">

              {ssid}

            </h2>

          </div>

          <div className="w-full h-6 rounded-full bg-white/20 overflow-hidden">

            <div
              className="h-full bg-green-500 transition-all duration-700"
              style={{
                width: `${progress}%`
              }}
            />

          </div>

          <div className="text-center text-lg">

            {progress}%

          </div>

          <div className="text-center text-gray-300">

            {detail}

          </div>

          {failed && (
            <div className="space-y-4 rounded-xl border border-red-400/40 bg-red-950/70 p-4">
              <p className="text-center text-sm text-red-100">
                Confirm the WiFi password, keep HonorPole powered on, and make sure the selected network is 2.4 GHz.
              </p>

              <button
                type="button"
                onClick={() => navigate("/setup", { replace: true })}
                className="w-full rounded-xl bg-blue-600 py-4 text-lg font-bold"
              >
                Try Setup Again
              </button>

              <button
                type="button"
                onClick={() => navigate("/", { replace: true })}
                className="w-full rounded-xl border border-white/30 bg-white/10 py-3 font-semibold"
              >
                Return Home
              </button>
            </div>
          )}
          {progress === 100 && (

  <div className="rounded-xl bg-white/10 p-4 text-center space-y-2">

    <div>

      <strong>IP Address</strong>

      <br />

      {deviceIP}

    </div>

    <div>

      <strong>Firmware</strong>

      <br />

      {firmware}

    </div>

  </div>

)}

          {progress === 100 && (

            <button
              onClick={() => navigate("/")}
              className="w-full py-4 rounded-xl bg-green-600 font-bold text-lg"
            >
              Continue
            </button>

          )}

        </div>

      </div>

      <BottomNav />

    </div>

  );

}

