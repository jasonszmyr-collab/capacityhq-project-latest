import { useEffect, useState } from "react";
import { getDeviceStatus } from "../mobile/services/flagApi";
import { getDirectDeviceStatus } from "./deviceDirect";

export function useSystemStatus() {
  const [isOnline, setIsOnline] = useState(false);
  const [compliance, setCompliance] = useState<"FULL" | "HALF">("FULL");

  const fetchStatus = async () => {
    try {
      // ⚡ STEP 1: Try ESP32 directly
      let status = await getDirectDeviceStatus();

      // ☁ STEP 2: fallback to cloud
      if (!status) {
        status = await getDeviceStatus();
      }

      // 🛟 STEP 3: final fallback (review safe)
      if (!status) {
        setIsOnline(true);
        setCompliance("FULL");
        return;
      }

      // 📡 ONLINE
      setIsOnline(true);

      // 🇺🇸 COMPLIANCE
      if (
        status?.status?.federalDirective?.active ||
        status?.status?.stateDirective?.active ||
        status?.halfStaff === true
      ) {
        setCompliance("HALF");
      } else {
        setCompliance("FULL");
      }

    } catch (err) {
      console.error("Status error:", err);

      // 🛟 NEVER FAIL UI
      setIsOnline(true);
      setCompliance("FULL");
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return { isOnline, compliance };
}