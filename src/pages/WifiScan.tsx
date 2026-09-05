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
  const [debug, setDebug] = useState("");

  const [networks, setNetworks] = useState<WiFiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);

  const [isHonorPoleConnected, setIsHonorPoleConnected] = useState(false);
  const [deviceReachable, setDeviceReachable] = useState(false);

  const [error, setError] = useState<string | null>(null);

  //--------------------------------------------------
  // INITIALIZE
  //--------------------------------------------------

  useEffect(() => {
    init();
  }, []);

  //--------------------------------------------------
  // INITIALIZE PAGE
  //--------------------------------------------------

  const init = async () => {

    console.log("========== WIFI SETUP ==========");

    setScanning(true);
    setError(null);

    console.log("INIT START");

    const connected = await checkConnection();

    console.log("CONNECTED:", connected);

    if (!connected) {
      setError("Connect to HonorPole-Setup WiFi first.");
    }

    setScanning(false);
  };

  //--------------------------------------------------
  // CHECK HONORPOLE CONNECTION
  //--------------------------------------------------

  const checkConnection = async (): Promise<boolean> => {

  try {

    setDebug("Checking HonorPole...");

    const connected = await wifiService.isConnectedToHonorPole();

    setDebug(prev => prev + "\nConnected: " + connected);

    if (!connected) {

      setIsHonorPoleConnected(false);
      setDeviceReachable(false);

      return false;
    }

    setIsHonorPoleConnected(true);
    setDeviceReachable(true);

    setDebug(prev => prev + "\nScanning...");

    const availableNetworks = await wifiService.scanNetworks();

    setDebug(prev => prev + "\nNetworks Found: " + availableNetworks.length);

    if (!availableNetworks.length) {

      setError("No WiFi networks found");

      return false;
    }

    const filtered = availableNetworks
      .filter(n => n.ssid !== "HonorPole-Setup")
      .sort((a, b) => b.signal - a.signal);

    setNetworks(filtered);

    return true;

  } catch (err: any) {

  setDebug(prev =>
    prev +
    "\nERROR:\n" +
    (err?.message || JSON.stringify(err) || String(err))
  );

  setIsHonorPoleConnected(false);
  setDeviceReachable(false);

  return false;

}

};

  //--------------------------------------------------
  // MANUAL REFRESH
  //--------------------------------------------------

  const scanForNetworks = async () => {

    setScanning(true);

    try {

      const result =
        await wifiService.scanNetworks();

      console.log("Manual Scan:", result);

      const filtered = result
        .filter(n => n.ssid !== "HonorPole-Setup")
        .sort((a, b) => b.signal - a.signal);

      setNetworks(filtered);

    } catch (err) {

      console.error(err);

      setError("Failed to scan networks");

    }

    setScanning(false);
  };

  //--------------------------------------------------
  // UI
  //--------------------------------------------------

  return (

    <div className="relative min-h-screen">

      <AppHeader title="Setup" />

      <div className="px-6 pt-24 pb-24 text-white space-y-6">

        {/* STATUS */}

        <div className="p-4 rounded-xl border border-white/20 bg-white/10 text-center">

          {!isHonorPoleConnected && (

            <div className="text-yellow-300">

              ⚠ Connect to <b>HonorPole-Setup</b>

              <div className="text-xs mt-2 text-gray-300">
                Connect your phone to the HonorPole WiFi
                network, then press Refresh.
              </div>

            </div>

          )}

          {isHonorPoleConnected && !deviceReachable && (

            <div className="text-red-400">

              Device Found
              <br />
              Waiting for Response...

            </div>

          )}

          {isHonorPoleConnected && deviceReachable && (

            <div className="text-green-400">

              ✓ HonorPole Connected

            </div>

          )}

        </div>

        {/* BUTTON */}

        <button

          onClick={scanForNetworks}

          disabled={scanning}

          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50"

        >

          {scanning ? "Scanning..." : "Refresh Networks"}

        </button>

        {/* ERROR */}

        {error && (

          <div className="text-red-400 text-center">

            {error}

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