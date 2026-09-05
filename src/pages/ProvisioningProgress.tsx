import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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

  //------------------------------------------------
  // Stage 1
  //------------------------------------------------

  setProgress(15);

  setStatus("Credentials Saved");

  setDetail(
    "HonorPole accepted your WiFi settings."
  );

  //------------------------------------------------
  // Stage 2
  //------------------------------------------------

  const stage2 = setTimeout(() => {

    setProgress(35);

    setStatus("Restarting HonorPole...");

    setDetail(
      "The device is rebooting."
    );

  }, 1500);

  //------------------------------------------------
  // Stage 3
  //------------------------------------------------

  const stage3 = setTimeout(() => {

    setProgress(60);

    setStatus(`Connecting to ${ssid}`);

    setDetail(
      "Joining your home WiFi network..."
    );

  }, 5000);

  //------------------------------------------------
  // Stage 4 - Discover HonorPole
  //------------------------------------------------

  let search: ReturnType<typeof setInterval>;

  let failureTimer: ReturnType<typeof setTimeout>;

  const discoverTimer = setTimeout(() => {

    setProgress(80);

    setStatus("Searching for HonorPole...");

    setDetail(
      "Looking for the device on your network..."
    );

    search = setInterval(async () => {

  try {

    const device = await discovery.discover();

    if (!device) {
      return;
    }

    clearInterval(search);
    clearTimeout(failureTimer);

    setDeviceIP(device.ip);
    setFirmware(device.firmware);

    setProgress(100);

    setStatus("HonorPole Connected!");

    setDetail("Device found successfully.");

  } catch (error) {

    console.error(
      "HonorPole discovery failed:",
      error
    );

  }

}, 2000);

// Stop searching after 60 seconds.
failureTimer = setTimeout(() => {

  clearInterval(search);

  setFailed(true);

  setStatus("Unable to Find HonorPole");

  setDetail(
    "HonorPole did not reconnect to your WiFi. Check that the WiFi password is correct and that the device is powered on, then try setup again."
  );

}, 60000);

}, 10000);

  //------------------------------------------------
  // Cleanup
  //------------------------------------------------

  return () => {

  clearTimeout(stage2);
  clearTimeout(stage3);
  clearTimeout(discoverTimer);
  clearTimeout(failureTimer);

  if (search) {
    clearInterval(search);
  }

};

}, [ssid]);

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