import { useState } from "react";

// ✅ FIXED PATHS
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";

export default function Onboarding() {
  const [step, setStep] = useState(1);

  return (
    <div className="relative min-h-screen bg-gray-900 text-white">

      {/* HEADER */}
      <AppHeader title="Setup Your HonorPole" />

      {/* CONTENT */}
      <div className="px-6 pt-24 pb-24 text-center space-y-6">

        {step === 1 && (
          <>
            <h1 className="text-2xl font-bold">
              Welcome to HonorPole
            </h1>

            <p className="text-gray-300">
              Let’s get your device connected.
            </p>

            <button
              onClick={() => setStep(2)}
              className="w-full p-4 bg-blue-600 rounded-lg"
            >
              Start Setup
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-xl font-bold">
              Connect to Device
            </h1>

            <p className="text-gray-300">
              Go to your WiFi settings and connect to:
            </p>

            <p className="font-bold text-lg">
              HonorPole-Setup
            </p>

            <button
              onClick={() => setStep(3)}
              className="w-full p-4 bg-green-600 rounded-lg"
            >
              I’m Connected
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-xl font-bold">
              Configure WiFi
            </h1>

            <p className="text-gray-300">
              Open your browser and go to:
            </p>

            <p className="font-bold text-lg">
              192.168.4.1
            </p>

            <p className="text-gray-400 text-sm">
              Select your network and enter your password.
            </p>

            <button
              onClick={() => setStep(4)}
              className="w-full p-4 bg-blue-600 rounded-lg"
            >
              Continue
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="text-xl font-bold">
              You're Ready!
            </h1>

            <p className="text-gray-300">
              Your HonorPole is now connected.
            </p>

            <button
              onClick={() => window.location.href = "/cloud"}
              className="w-full p-4 bg-green-600 rounded-lg"
            >
              Go to Control
            </button>
          </>
        )}

      </div>

      {/* FOOTER */}
      <BottomNav />
    </div>
  );
}