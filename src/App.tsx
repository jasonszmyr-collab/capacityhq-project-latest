import "./App.css";
import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import HomePage from "./components/HomePage";
import FlagControlTest from "./components/FlagControlTest";
import WiFiSetup from "./components/WiFiSetup";
import HonorPoleConfig from "./components/HonorPoleConfig";
import CloudControlPage from "./components/CloudControlPage";
import Login from "./components/Login";

// ✅ NEW PAGES
import WifiScan from "./pages/WifiScan";
import WifiConnect from "./pages/WifiConnect";

import { supabase } from "./services/supabaseClient";

function App() {
  const [user, setUser] = useState<any>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const demo = localStorage.getItem("demoMode") === "true";
    setDemoMode(demo);

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (loading) return <div className="text-white">Loading...</div>;

  return (
    <div className="app-container relative min-h-screen overflow-hidden">

      {/* 🇺🇸 Background */}
      <video
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        playsInline
        loop
      >
        <source src="/flag.mp4" type="video/mp4" />
      </video>

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60"></div>

      <div className="relative z-10">

        <Routes>

          {!user && !demoMode && (
            <Route path="*" element={<Login />} />
          )}

          {(user || demoMode) && (
            <>
              {/* MAIN */}
              <Route path="/" element={<HomePage />} />
              <Route path="/wifi" element={<WifiScan />} />
              <Route path="/setup" element={<WifiScan />} />
              <Route path="/cloud" element={<CloudControlPage />} />
              <Route path="/flag-test" element={<FlagControlTest />} />

              {/* WIFI FLOW */}
              <Route path="/wifi/scan" element={<WifiScan />} />
              <Route path="/wifi/connect" element={<WifiConnect />} />

              <Route path="*" element={<Navigate to="/" />} />
            </>
          )}

        </Routes>

      </div>
    </div>
  );
}

export default App;