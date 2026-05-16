import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

export default function WiFiScan() {
  return (
    <div className="relative min-h-screen">

      <AppHeader title="WiFi Setup" />

      <div className="px-6 pt-24 pb-24 text-white">
        <div className="max-w-4xl mx-auto space-y-6 text-center">

          <h1 className="text-2xl font-bold">
            HonorPole WiFi Setup
          </h1>

          <p className="text-gray-300">
            Your device is already connected to WiFi.
          </p>

          <div className="mt-6 space-y-2 text-sm text-gray-400">
            <p>📡 Device IP: <strong>192.168.0.189</strong></p>
            <p>🌐 Backend: <strong>192.168.0.169:3000</strong></p>
          </div>

          <div className="mt-6 p-4 rounded-lg bg-white/10">
            <p className="text-sm text-gray-300">
              If you need to change WiFi, connect to:
            </p>

            <p className="mt-2 font-semibold text-white">
              HonorPole-Setup
            </p>

            <p className="text-xs text-gray-400 mt-1">
              Then open: http://192.168.4.1
            </p>
          </div>

        </div>
      </div>

      <BottomNav />

    </div>
  );
}