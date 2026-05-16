import { CapacitorHttp } from "@capacitor/core";

export async function findDeviceIP(): Promise<string | null> {
  const base = "192.168.10."; // adjust if needed

  for (let i = 1; i < 255; i++) {
    const ip = base + i;

    try {
      const res = await CapacitorHttp.get({
        url: `http://${ip}/status`,
        connectTimeout: 300,
        readTimeout: 300,
      });

      if (res.status === 200) {
        console.log("FOUND DEVICE:", ip);
        return ip;
      }
    } catch {
      // ignore
    }
  }

  return null;
}