import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";

import {
  wifiService,
  type WiFiCredentials
} from "../services/wifiService";

export default function WifiConnect() {
  const location = useLocation();
  const navigate = useNavigate();

  const network = location.state;

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // SAFETY: redirect if no network
  useEffect(() => {
    if (!network) {
      navigate("/wifi");
    }
  }, [network, navigate]);

  const handleConnect = async () => {
    if (!network?.ssid) {
      setError("No network selected");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const creds: WiFiCredentials = {
        ssid: network.ssid,
        password,
      };

      const result = await wifiService.sendCredentials(creds);

      if (result.success) {
        setSuccess("✅ Credentials sent successfully");

        // Return to WiFi screen after success
        setTimeout(() => {
          navigate("/wifi");
        }, 2000);

      } else {
        setError(result.message || "Provisioning failed");
      }

    } catch {
      setError("Failed to send credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen">

      <AppHeader title="Connect WiFi" />

      <div className="px-6 pt-24 pb-24 text-white">

        <div className="max-w-md mx-auto space-y-6">

          {/* NETWORK NAME */}
          <div className="text-center">
            <h2 className="text-xl font-semibold">
              {network?.ssid || "Unknown Network"}
            </h2>
            <p className="text-gray-300 text-sm">
              Enter password to connect
            </p>
          </div>

          {/* PASSWORD */}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="WiFi Password"
            className="w-full p-3 rounded-lg bg-white/10 border border-white/20 text-white"
          />

          {/* ERROR */}
          {error && (
            <div className="text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {/* SUCCESS */}
          {success && (
            <div className="text-green-400 text-sm text-center">
              {success}
            </div>
          )}

          {/* BUTTON */}
          <button
            onClick={handleConnect}
            disabled={loading}
            className="w-full py-3 bg-green-500 rounded-xl font-semibold disabled:opacity-50"
          >
            {loading ? "Connecting..." : "Connect"}
          </button>

        </div>

      </div>

      <BottomNav />
    </div>
  );
}