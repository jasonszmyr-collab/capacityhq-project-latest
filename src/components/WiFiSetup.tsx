import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

import { wifiService } from "../services/wifiService";

export default function WiFiSetup() {

  const navigate = useNavigate();

  const [message, setMessage] = useState("Searching for HonorPole...");
  const [busy, setBusy] = useState(true);

  useEffect(() => {

    let cancelled = false;

    const discover = async () => {

      setBusy(true);
      setMessage("Searching for HonorPole...");

      // Try several times because the ESP32 may still be rebooting
      for (let attempt = 1; attempt <= 10; attempt++) {

        if (cancelled) return;

        console.log(`Discovery Attempt ${attempt}`);

        const device = await wifiService.discoverHonorPole();

        if (device) {

          console.log("HonorPole Found", device);

          const status = await wifiService.getDeviceStatus();

          if (!status) {

            setMessage("HonorPole detected.");

            setBusy(false);

            return;

          }

          // Still running as setup AP
          if (status.apMode === true) {

            navigate("/wifi/scan");

            return;

          }

          // Already connected to router
          navigate("/");

          return;

        }

        setMessage(`Searching... (${attempt}/10)`);

        await new Promise(resolve => setTimeout(resolve, 2000));

      }

      setBusy(false);

      setMessage(
        "Unable to locate HonorPole. Connect your phone to the HonorPole-Setup WiFi network and try again."
      );

    };

    discover();

    return () => {

      cancelled = true;

    };

  }, [navigate]);

  return (

    <div className="relative min-h-screen overflow-hidden bg-slate-950">

  {/* Waving American flag background */}
  <video
    className="absolute inset-0 h-full w-full object-cover"
    autoPlay
    muted
    loop
    playsInline
  >
    <source src="/flag.mp4" type="video/mp4" />
  </video>

  {/* Dark overlay for readability */}
  <div className="absolute inset-0 bg-slate-950/60" />

  <div className="relative z-10">
    <AppHeader title="WiFi Setup" />

      <div className="px-6 pt-24 pb-24 text-white">

        <div className="max-w-4xl mx-auto text-center space-y-6">

          <h1 className="text-3xl font-bold">
            HonorPole Setup
          </h1>

          <p className="text-gray-300">
            {message}
          </p>

          {busy && (

            <div className="animate-pulse text-blue-400">

              Discovering HonorPole...

            </div>

          )}

        </div>

      </div>

            <BottomNav />

 	 </div>

	</div>

  );

}