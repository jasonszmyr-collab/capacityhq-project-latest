import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";

import {
  wifiService,
  type WiFiNetwork
} from "../services/wifiService";

import { WiFiScanError } from "../services/wifiScanResponse";

export default function WifiScan() {

  const navigate = useNavigate();
  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
  const [scanning, setScanning] = useState(true);
  const [isHonorPoleConnected, setIsHonorPoleConnected] = useState(false);
  const [deviceReachable, setDeviceReachable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyScan, setEmptyScan] = useState(false);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const busy = useRef(false);

  // Initial load and Refresh use the same result and recovery handling.
  const scanForNetworks = async () => {
    if (!mounted.current || busy.current) return;
    busy.current = true;
    const id = ++requestId.current;
    const current = () => mounted.current && requestId.current === id;
    setScanning(true);
    setError(null);
    setEmptyScan(false);
    setNetworks([]);
    setIsHonorPoleConnected(false);
    setDeviceReachable(false);
    try {
      const result = await wifiService.scanNetworks();
      if (!current()) return;
      const filtered = result
        .filter(n => n.ssid !== "HonorPole-Setup" && !n.ssid.startsWith("HonorPole-Setup-"))
        .sort((a, b) => b.signal - a.signal);
      setIsHonorPoleConnected(true);
      setDeviceReachable(true);
      setNetworks(filtered);
      setEmptyScan(filtered.length === 0);
    } catch (err) {
      if (!current()) return;
      // A rejected or malformed HTTP reply still establishes reachability.
      const reached = err instanceof WiFiScanError && err.code !== "unreachable";
      setIsHonorPoleConnected(reached);
      setDeviceReachable(reached);
      setError(err instanceof WiFiScanError ? err.message
        : "Unable to scan Wi-Fi networks. Check the connection and press Refresh Networks to try again.");
    } finally {
      if (current()) {
        busy.current = false;
        setScanning(false);
      }
    }
  };

  useEffect(() => {
    mounted.current = true;
    void scanForNetworks();
    return () => {
      mounted.current = false;
      ++requestId.current;
      busy.current = false;
    };
  }, []);

  //--------------------------------------------------
  // UI
  //--------------------------------------------------

  return (

    <div className="relative min-h-screen">

      <AppHeader title="Setup" />

      <div className="px-6 pt-24 pb-24 text-white space-y-6">

        {/* STATUS */}

        <div className="p-4 rounded-xl border border-white/20 bg-white/10 text-center">

          {scanning && <div role="status">Checking HonorPole and scanning Wi-Fi networks...</div>}

          {!scanning && !isHonorPoleConnected && (

            <div className="text-yellow-300">

              ⚠ Connect to <b>HonorPole-Setup</b>

              <div className="text-xs mt-2 text-gray-300">
                Connect your phone to the HonorPole WiFi
                network, then press Refresh.
              </div>

            </div>

          )}

          {!scanning && isHonorPoleConnected && !deviceReachable && (

            <div className="text-red-400">

              Device Found
              <br />
              Waiting for Response...

            </div>

          )}

          {!scanning && isHonorPoleConnected && deviceReachable && (

            <div className="text-green-400">

              ✓ HonorPole Connected

            </div>

          )}

        </div>

        <button onClick={() => navigate("/wifi/protected")}
          className="w-full p-3 rounded-xl border border-white/30">
          Open protected setup / enter setup password
        </button>

        {/* BUTTON */}

        <button

          onClick={scanForNetworks}

          disabled={scanning}

          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50"

        >

          {scanning ? "Scanning..." : "Refresh Networks"}

        </button>

        {/* ERROR */}

        {error && !scanning && (

          <div role="alert" className="text-red-400 text-center">

            {error}

          </div>

        )}

        {emptyScan && !scanning && !error && (
          <div role="status" className="text-amber-300 text-center">
            No home Wi-Fi networks were found. Keep connected to this pole's
            HonorPole-Setup Wi-Fi, move the pole closer to your router if needed,
            then press Refresh Networks.
          </div>
        )}

        {/* NETWORKS */}

        <div className="space-y-3">

          {networks.map((net) => (

            <button

              key={net.ssid}

              onClick={() =>
                navigate(
                  "/wifi/connect",
                  { state: net }
                )
              }

              className="w-full p-4 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20"

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