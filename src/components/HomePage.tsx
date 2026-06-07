import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

// 🔥 USE CLOUD (NOT LOCAL IP)
const API = "https://capacityhq-project-latest.onrender.com";

const HomePage = () => {

  const [deviceStatus, setDeviceStatus] = useState<"online" | "offline">("offline");
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [commandStatus, setCommandStatus] = useState<string | null>(null);

  useEffect(() => {

    const checkDevice = async () => {
      try {

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(API + "/control", {
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          throw new Error("Bad response");
        }

        const data = await res.json();

        console.log("Device response:", data);

        // ✅ VALID RESPONSE CHECK
        if (data && typeof data.motor !== "undefined") {
          setDeviceStatus("online");
          setLastSeen(new Date().toISOString());
          setCommandStatus("connected");
        } else {
          setDeviceStatus("offline");
        }

      } catch (err) {
        console.log("Device check failed:", err);
        setDeviceStatus("offline");
        setCommandStatus("error");
      }
    };

    // initial check
    checkDevice();

    // repeat every 5 seconds
    const interval = setInterval(checkDevice, 5000);

    return () => clearInterval(interval);

  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">

      {/* 🌟 BACKGROUND */}
      <div
        className="absolute inset-0 bg-cover bg-center blur-sm scale-105"
        style={{ backgroundImage: "url('/flag.jpg')" }}
      />

      {/* 🔥 OVERLAY */}
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10">

        <AppHeader title="HonorPole" />

        {/* Logout */}
        <button
          onClick={() => window.location.reload()}
          className="absolute top-4 right-4 z-50 px-4 py-2 
                     bg-black/60 text-white rounded-xl backdrop-blur 
                     hover:bg-black/80 transition"
        >
          Logout
        </button>

        <section className="flex items-center justify-center min-h-screen px-6 pt-24 pb-24">
          <div className="glass-panel flex flex-col items-center text-center animate-fade-in">

            <h1 className="mb-4 text-5xl font-semibold text-red-500 tracking-tight">
              TEST BUILD 123
            </h1>

            <p className="text-gray-300">
              Smart Flag Control System
            </p>

            {/* 🔥 DEVICE STATUS */}
            <div className="flex items-center gap-2 mt-4">

              <div
                className={`w-3 h-3 rounded-full ${
                  deviceStatus === "online"
                    ? "bg-green-400"
                    : "bg-red-400"
                }`}
              />

              <span className="text-sm text-gray-300">
                {deviceStatus === "online"
                  ? "Device Online"
                  : "Device Offline"}
              </span>
            </div>

            {/* 🔥 LAST SEEN */}
            {lastSeen && (
              <p className="text-xs text-gray-400 mt-1">
                Last activity: {new Date(lastSeen).toLocaleTimeString()}
              </p>
            )}

            {/* 🔥 COMMAND STATUS */}
            {commandStatus && (
              <div className="mt-3 px-4 py-2 rounded-lg bg-white/10 backdrop-blur text-sm text-gray-200">
                {commandStatus === "connected" && "🟢 Connected"}
                {commandStatus === "sending" && "⏳ Sending..."}
                {commandStatus === "sent" && "✅ Command Sent"}
                {commandStatus === "error" && "❌ Connection Error"}
              </div>
            )}

            {/* BUTTONS */}
            <div className="flex flex-col gap-4 mt-8 w-full">

              <Link to="/cloud" className="btn flex items-center justify-center gap-2">
                ☁ <span>Cloud Control</span>
              </Link>

              <Link to="/wifi" className="btn flex items-center justify-center gap-2">
  ⚙            <span>HonorPole Setup</span>
              </Link>

              <Link to="/wifi" className="btn flex items-center justify-center gap-2">
                📶 <span>WiFi Manager</span>
              </Link>

              <Link to="/flag-test" className="btn flex items-center justify-center gap-2">
                🚩 <span>Flag Control Test</span>
              </Link>

            </div>

          </div>
        </section>

        <BottomNav />
      </div>
    </div>
  );
};

export default HomePage;