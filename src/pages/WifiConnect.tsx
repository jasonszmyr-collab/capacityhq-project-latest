import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";

import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";

import { protectedSetup } from "../services/protectedSetup";
import cloudService from "../services/cloudService";

export default function WifiConnect() {

  const location = useLocation();
  const navigate = useNavigate();

  const network = location.state;

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const mounted = useRef(false);
  const submitting = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const [error, setError] = useState<string | null>(null);

  //--------------------------------------------------
  // Verify a network was selected
  //--------------------------------------------------

  useEffect(() => {

    if (!network) {
      navigate("/wifi");
    }

  }, [network, navigate]);

  //--------------------------------------------------
  // Connect HonorPole
  //--------------------------------------------------

  const handleConnect = async () => {

    if (submitting.current) return;

    if (!network?.ssid) {

      setError("No WiFi network selected.");

      return;

    }

    if (network.secure !== false && password.length === 0) {

      setError("Please enter the WiFi password.");

      return;

    }

    submitting.current = true;
    setLoading(true);
    setError(null);

    try {

      const deviceId = cloudService.getCurrentDeviceId();
      await protectedSetup.save(network.ssid, password);
      if (!mounted.current) return;
      setPassword("");

      //--------------------------------------------------
      // Go to provisioning screen
      //--------------------------------------------------

      navigate(
        "/wifi/provisioning",
        {
          state: {
            ssid: network.ssid,
            deviceId
          }
        }
      );

    } catch (err: unknown) {
      if (mounted.current) setError(err instanceof Error ? err.message : "Wi-Fi submission could not be confirmed.");
    } finally {
      submitting.current = false;
      if (mounted.current) setLoading(false);
    }

  };

  //--------------------------------------------------
  // UI
  //--------------------------------------------------

  return (

    <div className="relative min-h-screen">

      <AppHeader title="Connect to WiFi" />

      <div className="px-6 pt-24 pb-24 text-white">

        <div className="max-w-md mx-auto space-y-6">

          <div className="text-center">

            <h2 className="text-2xl font-bold">

              {network?.ssid ?? "Unknown Network"}

            </h2>

            <p className="text-gray-300 mt-2">

              Enter your WiFi password to connect HonorPole.

            </p>

          </div>

          <button disabled={loading} onClick={() => navigate("/wifi/protected")}
            className="w-full p-3 border border-white/30 rounded-xl">
            Open protected setup / enter setup password
          </button>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            placeholder="Home WiFi Password"
            className="w-full p-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-400"
          />

          {error && (

            <div className="text-red-400 text-center">

              {error}

            </div>

          )}

          <button
            onClick={handleConnect}
            disabled={loading}
            className="w-full py-4 bg-green-600 rounded-xl font-bold text-lg disabled:opacity-50"
          >
            {loading
              ? "Connecting HonorPole..."
              : "Connect HonorPole"}
          </button>

        </div>

      </div>

      <BottomNav />

    </div>

  );

}