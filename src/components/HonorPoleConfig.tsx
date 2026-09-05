import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

export default function HonorPoleConfig() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">

      {/* WAVING FLAG BACKGROUND */}
      <video
        className="fixed inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      >
        <source src="/flag.mp4" type="video/mp4" />
      </video>

      {/* DARK OVERLAY FOR READABILITY */}
      <div className="fixed inset-0 bg-black/55" />

      {/* APP CONTENT */}
      <div className="relative z-10 min-h-screen">

        {/* HEADER */}
        <AppHeader title="HonorPole Setup" />

        {/* CONTENT */}
        <div className="p-6 pt-24 pb-24">
          <div className="max-w-3xl mx-auto text-center space-y-6">

            <h1 className="text-3xl font-bold">
              Device Setup
            </h1>

            <p className="text-gray-200">
              Use this page to connect or reconfigure your HonorPole device.
            </p>

            {/* DEVICE INFO */}
            <div className="mt-6 p-4 rounded-lg bg-black/50 backdrop-blur-sm space-y-2">

              <p>
                Device: <strong>HonorPole</strong>
              </p>

              <p>
                Cloud Service: <strong>HonorPole Cloud</strong>
              </p>

              <p>
                Connection:{" "}
                <span className="text-green-400">Ready</span>
              </p>

            </div>

            {/* INSTRUCTIONS */}
            <div className="mt-6 p-4 rounded-lg bg-black/50 backdrop-blur-sm text-sm text-gray-200">

              <p>
                To configure or reconnect WiFi:
              </p>

              <p className="mt-2 font-semibold text-white">
                1. Connect your phone to: HonorPole-Setup
              </p>

              <p>
                2. Open: http://192.168.4.1
              </p>

              <p className="mt-2">
                3. Select your 2.4 GHz WiFi network and enter its password.
              </p>

              <p className="mt-2">
                After setup is complete, reconnect your phone to your normal WiFi
                or cellular connection and return to the HonorPole app.
              </p>

            </div>

          </div>
        </div>

        {/* BOTTOM NAV */}
        <BottomNav />

      </div>
    </div>
  );
}