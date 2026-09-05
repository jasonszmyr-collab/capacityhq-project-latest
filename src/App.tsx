import "./App.css";
import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";

import ProvisioningProgress from "./pages/ProvisioningProgress";

import HomePage from "./components/HomePage";
import FlagControlTest from "./components/FlagControlTest";
import CloudControlPage from "./components/CloudControlPage";
import Login from "./components/Login";
import ResetPassword from "./components/ResetPassword";

import WifiScan from "./pages/WifiScan";
import WifiConnect from "./pages/WifiConnect";
import Settings from "./pages/Settings";

import { supabase } from "./services/supabaseClient";
import { cloudService } from "./services/cloudService";

function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");

  useEffect(() => {
    let mounted = true;

    const handleRecoveryUrl = async (url: string) => {
      if (!url.startsWith("com.capacity.app://reset-password")) {
        return;
      }

      try {
        setRecoveryError("");

        const hashIndex = url.indexOf("#");

        if (hashIndex === -1) {
          setRecoveryError("Invalid password recovery link.");
          setPasswordRecovery(true);
          return;
        }

        const hash = url.substring(hashIndex + 1);
        const params = new URLSearchParams(hash);

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const type = params.get("type");

        if (
          type !== "recovery" ||
          !accessToken ||
          !refreshToken
        ) {
          setRecoveryError(
            "Password recovery session information is missing."
          );
          setPasswordRecovery(true);
          return;
        }

        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          console.error("Unable to establish recovery session:", error);
          setRecoveryError(
            error.message || "Unable to establish password recovery session."
          );
          setPasswordRecovery(true);
          return;
        }

        setUser(data.session?.user ?? null);
        setPasswordRecovery(true);
      } catch (error) {
        console.error("Recovery URL processing failed:", error);
        setRecoveryError("Unable to process the password recovery link.");
        setPasswordRecovery(true);
      }
    };

    const initializeAuth = async () => {
      const { data } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (data.session?.access_token) {
  cloudService.setAuthToken(data.session.access_token);
} else {
  cloudService.clearAuthentication();
}

      setUser(data.session?.user ?? null);
      setLoading(false);
    };

    void initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {

        if (session?.access_token) {
  cloudService.setAuthToken(session.access_token);
} else {
  cloudService.clearAuthentication();
}
        setUser(session?.user ?? null);

        if (event === "PASSWORD_RECOVERY") {
          setPasswordRecovery(true);
        }

        if (event === "SIGNED_OUT") {
          setPasswordRecovery(false);
        }
      }
    );

    let appUrlOpenHandle:
      | Awaited<ReturnType<typeof CapacitorApp.addListener>>
      | undefined;

    const setupDeepLinkHandling = async () => {
      appUrlOpenHandle = await CapacitorApp.addListener(
        "appUrlOpen",
        ({ url }) => {
          void handleRecoveryUrl(url);
        }
      );

      const launchUrl = await CapacitorApp.getLaunchUrl();

      if (launchUrl?.url) {
        await handleRecoveryUrl(launchUrl.url);
      }
    };

    void setupDeepLinkHandling();

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();

      if (appUrlOpenHandle) {
        void appUrlOpenHandle.remove();
      }
    };
  }, []);

  if (loading) {
    return <div className="text-white">Loading...</div>;
  }

  return (
    <div className="app-container relative min-h-screen overflow-hidden">
      <video
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        playsInline
        loop
      >
        <source src="/flag.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-black/60"></div>

      <div className="relative z-10">
        {passwordRecovery ? (
          <>
            {recoveryError && (
              <div className="mx-auto mt-4 max-w-md rounded-lg border bg-white p-3 text-sm">
                {recoveryError}
              </div>
            )}

            <ResetPassword />
          </>
        ) : (
          <Routes>
            {!user && <Route path="*" element={<Login />} />}

            {user && (
              <>
                <Route path="/" element={<HomePage />} />
                <Route path="/wifi" element={<WifiScan />} />
                <Route path="/setup" element={<WifiScan />} />
                <Route path="/cloud" element={<CloudControlPage />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/flag-test" element={<FlagControlTest />} />

                <Route path="/wifi/scan" element={<WifiScan />} />
                <Route path="/wifi/connect" element={<WifiConnect />} />

                <Route
                  path="/wifi/provisioning"
                  element={<ProvisioningProgress />}
                />

                <Route path="*" element={<Navigate to="/" />} />
              </>
            )}
          </Routes>
        )}
      </div>
    </div>
  );
}

export default App;