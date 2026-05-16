import { useState, useEffect } from "react";

import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";

// Layout
import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

// Services
import { findDeviceIP } from "../services/deviceDiscovery";
import { sendCommand, getStatus } from "../services/deviceService";

// =======================
// 🎨 UI HELPERS
// =======================
function getFlagVisual(position: string) {
  switch (position) {
    case "moving_up":
      return "⬆ Raising...";
    case "moving_down":
      return "⬇ Lowering...";
    case "up":
      return "🇺🇸 Full Staff";
    case "down":
      return "🏳 Half Staff";
    case "stopped":
      return "⛔ Stopped";
    default:
      return "Unknown";
  }
}

function getAnimationClass(position: string) {
  if (position === "moving_up" || position === "moving_down") {
    return "animate-pulse";
  }
  return "";
}

function getPositionColor(position: string) {
  switch (position) {
    case "up":
      return "text-green-400";
    case "down":
      return "text-red-400";
    case "stopped":
      return "text-yellow-400";
    default:
      return "text-gray-400";
  }
}

// =======================
// 💾 STORAGE HELPERS
// =======================
function saveIP(ip: string) {
  localStorage.setItem("device_ip", ip);
}

function loadSavedIP(): string | null {
  return localStorage.getItem("device_ip");
}

// =======================
// 🧠 COMPONENT
// =======================
export default function FlagControlTest() {
  const [deviceIP, setDeviceIP] = useState<string | null>(null);
  const [loadingIP, setLoadingIP] = useState(true);

  const [status, setStatus] = useState<any>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // =======================
  // 🔍 INIT (LOAD OR SCAN)
  // =======================
  useEffect(() => {
    const init = async () => {
      setLoadingIP(true);

      const saved = loadSavedIP();

      if (saved) {
        try {
          const res = await getStatus(saved);

          if (res.status === 200) {
            setDeviceIP(saved);
            setLoadingIP(false);
            return;
          }
        } catch {
          console.log("Saved IP failed");
        }
      }

      const ip = await findDeviceIP();

      if (ip) {
        setDeviceIP(ip);
        saveIP(ip);
      } else {
        setError("Device not found. Check WiFi.");
      }

      setLoadingIP(false);
    };

    init();
  }, []);

  // =======================
  // 📡 LIVE STATUS POLLING
  // =======================
  useEffect(() => {
    if (!deviceIP) return;

    const fetchStatus = async () => {
      try {
        const res = await getStatus(deviceIP);
        setStatus(res.data);
      } catch {
        console.log("Status fetch failed");
      }
    };

    fetchStatus();

    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [deviceIP]);

  // =======================
  // 🎯 HANDLER
  // =======================
  const handleCommand = async (cmd: string) => {
    if (!deviceIP) return;

    setError(null);
    setSuccess(null);

    try {
      await sendCommand(deviceIP, cmd);
      setSuccess(`Command sent: ${cmd}`);
    } catch {
      setError("Failed to send command");
    }
  };

  // =======================
  // 🎨 UI
  // =======================
  return (
    <div className="relative min-h-screen bg-gray-50">
      <AppHeader title="HonorPole Control" />

      <div className="p-6 pt-20 pb-20">
        <div className="max-w-7xl mx-auto">

          <h1 className="text-4xl font-bold mb-2">
            HonorPole Dashboard
          </h1>

          <p className="text-gray-600">
            Smart Flag Control System
          </p>

          {/* DEVICE STATUS */}
          <div className="mt-3 flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                deviceIP ? "bg-green-400 animate-pulse" : "bg-red-400"
              }`}
            />
            <span className="text-sm text-gray-600">
              {loadingIP
                ? "Searching for device..."
                : deviceIP
                ? `Connected (${deviceIP})`
                : "Device not found"}
            </span>
          </div>

          {/* ALERTS */}
          {error && (
            <Alert className="mt-4 bg-red-50 border-red-200">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mt-4 bg-green-50 border-green-200">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {/* LIVE STATUS */}
          <Card className="mt-6 bg-black text-white rounded-2xl shadow-lg">
            <CardHeader>
              <CardTitle>Live Status</CardTitle>
              <CardDescription className="text-gray-300">
                Real-time device state
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              {status && (
                <div className="text-center">

                  <div className="text-sm">
                    WiFi: {status.wifi}
                  </div>

                  <div
                    className={`text-3xl font-bold ${getAnimationClass(
                      status.position
                    )} ${getPositionColor(status.position)}`}
                  >
                    {getFlagVisual(status.position)}
                  </div>

                </div>
              )}
            </CardContent>
          </Card>

          {/* CONTROL */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Manual Control</CardTitle>
              <CardDescription>
                Direct motor control
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">

              <Button
                disabled={!deviceIP}
                onClick={() => handleCommand("UP")}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                ⬆ Raise Flag
              </Button>

              <Button
                disabled={!deviceIP}
                onClick={() => handleCommand("DOWN")}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                ⬇ Lower Flag
              </Button>

              <Button
                disabled={!deviceIP}
                onClick={() => handleCommand("STOP")}
                className="bg-yellow-500 hover:bg-yellow-600 text-black"
              >
                ⛔ Stop
              </Button>

            </CardContent>
          </Card>

        </div>
      </div>

      <BottomNav />
    </div>
  );
}