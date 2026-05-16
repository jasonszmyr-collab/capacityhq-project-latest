import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";

import {
  wifiService,
  type WiFiNetwork
} from "../services/wifiService";

export default function WifiScan() {
  const navigate = useNavigate();

  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);

  const [isHonorPoleConnected, setIsHonorPoleConnected] = useState(false);
  const [deviceReachable, setDeviceReachable] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // INIT
  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    setScanning(true);
    setError(null);

    const redirected = await checkConnection();

    // Only scan if NOT redirected
    if (!redirected) {
      await scanForNetworks();
    }

    setScanning(false);
  };

  // CHECK DEVICE + AUTO FLOW
  const checkConnection = async (): Promise<boolean> => {
    try {
      const status = await wifiService.getNetworkStatus();
      const onHonorPole = status?.ssid?.includes("HonorPole");

      setIsHonorPoleConnected(onHonorPole);

      if (!onHonorPole) return false;

      const reachable = await wifiService.testHonorPoleConnection();
      setDeviceReachable(reachable);

      if (!reachable) return false;

      // Scan networks
      const availableNetworks = await wifiService.scanNetworks();

      if (!availableNetworks.length) {
        setError("No WiFi networks found");
        return false;
      }

      // Remove HonorPole AP + sort strongest
      const filtered = availableNetworks
        .filter(n => n.ssid !== "HonorPole-Setup")
        .sort((a, b) => b.signal - a.signal);

      if (!filtered.length) {
        setError("No valid WiFi networks found");
        return false;
      }

      const strongest = filtered[0];

      // AUTO REDIRECT
      navigate("/wifi/connect", { state: strongest });

      return true;

    } catch {
      setError("Failed to detect HonorPole device");
      return false;
    }
  };

  // MANUAL SCAN
  const scanForNetworks = async () => {
    try {
      const result = await wifiService.scanNetworks();
      setNetworks(result);
    } catch {
      setError("Failed to scan networks");
    }
  };

  return (
    <div className="relative min-h-screen">

      <AppHeader title="Scan Networks" />

      <div className="px-6 pt-24 pb-24 text-white space-y-6">

        {/* STATUS */}
        <div className="p-4 rounded-xl border border-white/20 bg-white/10 text-center">

          {!isHonorPoleConnected && (
            <div className="text-yellow-300 text-sm">
              ⚠️ Connect to <b>HonorPole-Setup</b> WiFi
              <div className="text-xs mt-1 text-gray-300">
                Open phone WiFi settings
              </div>
            </div>
          )}

          {isHonorPoleConnected && !deviceReachable && (
            <div className="text-red-400 text-sm">
              ❌ Device not reachable (192.168.4.1)
            </div>
          )}

          {isHonorPoleConnected && deviceReachable && (
            <div className="text-green-400 text-sm animate-pulse">
              🚀 Preparing connection...
            </div>
          )}

        </div>

        {/* ACTION */}
        <button
          onClick={init}
          disabled={scanning}
          className="w-full py-3 bg-white/10 rounded-xl border border-white/20 hover:bg-white/20 transition disabled:opacity-50"
        >
          {scanning ? "Scanning..." : "Refresh"}
        </button>

        {/* ERROR */}
        {error && (
          <div className="text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* NETWORK LIST (fallback) */}
        <div className="space-y-3">

          {networks.map((net) => (
            <button
              key={net.ssid}
              onClick={() => navigate("/wifi/connect", { state: net })}
              className="w-full p-4 bg-white/10 rounded-xl border border-white/20 text-left hover:bg-white/20 transition"
            >
              <div className="flex justify-between">
                <span>{net.ssid}</span>
                <span>{net.signal}%</span>
              </div>

              <div className="text-xs text-gray-300">
                {net.secure ? "Secured" : "Open"}
              </div>
            </button>
          ))}

        </div>

      </div>

      <BottomNav />
    </div>
  );
}