import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

export default function WiFiScan() {

  const navigate = useNavigate();

  useEffect(() => {

    const checkHonorPole = async () => {

      try {

        const response = await fetch(
          "http://192.168.4.1/status"
        );

        if (!response.ok) {

          alert(
            "ESP32 returned HTTP " +
            response.status
          );

          return;
        }

        const data =
          await response.json();

        console.log(
          "HonorPole Status:",
          data
        );

        alert(
          JSON.stringify(data)
        );

        if (
          data.device === "HonorPole" &&
          data.apMode === true
        ) {

          navigate(
            "/wifi/scan"
          );

          return;
        }

        alert(
          "HonorPole found but not in setup mode."
        );

      } catch (err: any) {

        console.error("FETCH ERROR:", err);

        alert(
          "FETCH ERROR:\n\n" +
          JSON.stringify(err)
        );

      }

    };

    checkHonorPole();

  }, [navigate]);

  return (

    <div className="relative min-h-screen">

      <AppHeader title="WiFi Setup" />

      <div className="px-6 pt-24 pb-24 text-white">

        <div className="max-w-4xl mx-auto text-center space-y-6">

          <h1 className="text-3xl font-bold">
            HonorPole Setup
          </h1>

          <p className="text-gray-300">
            Checking HonorPole device...
          </p>

          <div className="animate-pulse text-blue-400">
            Connecting to 192.168.4.1
          </div>

        </div>

      </div>

      <BottomNav />

    </div>
  );
}