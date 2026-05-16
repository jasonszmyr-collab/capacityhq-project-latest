import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

export default function HonorPoleConfig() {
  return (
    <div className="relative min-h-screen bg-black text-white">

      {/* HEADER */}
      <AppHeader title="HonorPole Setup" />

      {/* CONTENT */}
      <div className="p-6 pt-24 pb-24">
        <div className="max-w-3xl mx-auto text-center space-y-6">

          <h1 className="text-3xl font-bold">
            Device Setup
          </h1>

          <p className="text-gray-300">
            Your HonorPole device is already configured and connected.
          </p>

          {/* DEVICE INFO */}
          <div className="mt-6 p-4 rounded-lg bg-white/10 space-y-2">

            <p>
              📡 Device IP: <strong>192.168.0.189</strong>
            </p>

            <p>
              🌐 Backend Server: <strong>192.168.0.169:3000</strong>
            </p>

            <p>
              🔌 Status: <span className="text-green-400">Connected</span>
            </p>

          </div>

          {/* INSTRUCTIONS */}
          <div className="mt-6 p-4 rounded-lg bg-white/10 text-sm text-gray-300">

            <p>
              If you need to reconfigure WiFi:
            </p>

            <p className="mt-2 font-semibold text-white">
              1. Connect to: HonorPole-Setup
            </p>

            <p>
              2. Open: http://192.168.4.1
            </p>

            <p className="mt-2">
              Then enter your WiFi credentials.
            </p>

          </div>

        </div>
      </div>

      {/* BOTTOM NAV */}
      <BottomNav />

    </div>
  );
}