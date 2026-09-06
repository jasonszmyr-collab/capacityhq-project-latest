import { CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export interface DeviceInfo {
  ip: string;
  firmware: string;
  device: string;
}

class DeviceDiscovery {

  private readonly LAST_IP = "honorpole_last_ip";

  async discoverSaved(): Promise<DeviceInfo | null> {

    const saved = await Preferences.get({
      key: this.LAST_IP
    });

    if (!saved.value) {
      return null;
    }

    const base = saved.value.startsWith("http://")
      ? saved.value
      : `http://${saved.value}`;

    try {

      const response = await CapacitorHttp.request({
        method: "GET",
        url: `${base}/status`,
        connectTimeout: 500,
        readTimeout: 500
      });

      if (response.status !== 200) {
        return null;
      }

      const data = response.data;

      if (data.device !== "HonorPole") {
        return null;
      }

      return {
        ip: base.replace("http://", ""),
        firmware: data.firmware,
        device: data.device
      };

    } catch {
      return null;
    }
  }
  async discover(): Promise<DeviceInfo | null> {

    const saved = await Preferences.get({
      key: this.LAST_IP
    });

    const addresses: string[] = [];

    if (saved.value) {
      addresses.push(saved.value.startsWith("http://") ? saved.value : `http://${saved.value}`);
    }

    addresses.push("http://192.168.4.1");
    addresses.push("http://honorpole.local");

    // Try your current subnet (add more if needed)
    for (let i = 1; i <= 254; i++) {
      addresses.push(`http://192.168.0.${i}`);
    }

    for (const base of addresses) {

      try {

        const response = await CapacitorHttp.request({

          method: "GET",

          url: `${base}/status`,

          connectTimeout: 500,

          readTimeout: 500

        });

        if (response.status !== 200) {
          continue;
        }

        const data = response.data;

        if (data.device !== "HonorPole") {
          continue;
        }

        const ip = base.replace("http://", "");

        await Preferences.set({
          key: this.LAST_IP,
          value: ip
        });

        console.log("HonorPole Found:", ip);

        return {

          ip,

          firmware: data.firmware,

          device: data.device

        };

      } catch {
        // Ignore and continue searching
      }

    }

    return null;
  }
}

export const discovery = new DeviceDiscovery();

