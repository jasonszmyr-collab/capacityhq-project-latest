import { Network } from "@capacitor/network";
import { Preferences } from "@capacitor/preferences";

/* --------------------------------------------------
   TYPES
-------------------------------------------------- */

export interface WiFiNetwork {
  ssid: string;
  signal: number;
  secure: boolean;
}

export interface WiFiCredentials {
  ssid: string;
  password: string;
}

export interface NetworkStatus {
  connected: boolean;
  connectionType: string;
  ssid?: string;
  rssi?: number;
}

export interface HonorPoleDevice {
  ip: string;
  hostname: string;
  reachable: boolean;
}

/* --------------------------------------------------
   WIFI SERVICE
-------------------------------------------------- */

class WiFiService {

  private readonly STORAGE_KEY = "wifi_credentials";

  /* HonorPole discovery targets */

  private readonly HONORPOLE_AP = "HonorPole-Setup";
  private readonly HONORPOLE_LOCAL = "http://honorpole.local";
  private readonly HONORPOLE_FALLBACK = "http://192.168.4.1";

  private deviceUrl: string | null = null;

  /* --------------------------------------------------
     NETWORK STATUS
  -------------------------------------------------- */

  async getNetworkStatus(): Promise<NetworkStatus> {

    try {

      const status = await Network.getStatus();

      return {
        connected: status.connected,
        connectionType: status.connectionType,
        ssid: "Unknown",
        rssi: -60
      };

    } catch (error) {

      console.error("Network status error:", error);

      return {
        connected: false,
        connectionType: "unknown"
      };

    }

  }

  /* --------------------------------------------------
     NETWORK LISTENER
  -------------------------------------------------- */

  addNetworkListener(callback: (status: NetworkStatus) => void) {

    return Network.addListener("networkStatusChange", async () => {

      const status = await this.getNetworkStatus();
      callback(status);

    });

  }

  /* --------------------------------------------------
     AUTO DISCOVER HONORPOLE DEVICE
  -------------------------------------------------- */

  async discoverHonorPole(): Promise<HonorPoleDevice | null> {

    /* 1️⃣ Try mDNS first */

    try {

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(this.HONORPOLE_LOCAL, {
        method: "GET",
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (res.ok) {

        this.deviceUrl = this.HONORPOLE_LOCAL;

        return {
          ip: "honorpole.local",
          hostname: "HonorPole",
          reachable: true
        };

      }

    } catch {}

    /* 2️⃣ Try fallback IP */

    try {

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(this.HONORPOLE_FALLBACK, {
        method: "GET",
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (res.ok) {

        this.deviceUrl = this.HONORPOLE_FALLBACK;

        return {
          ip: "192.168.4.1",
          hostname: "HonorPole",
          reachable: true
        };

      }

    } catch {}

    return null;

  }

  /* --------------------------------------------------
     CHECK IF CONNECTED TO HONORPOLE AP
  -------------------------------------------------- */

  async isConnectedToHonorPole(): Promise<boolean> {

    try {

      const status = await this.getNetworkStatus();

      if (status.ssid?.includes(this.HONORPOLE_AP)) {
        return true;
      }

      const device = await this.discoverHonorPole();

      return device !== null;

    } catch {

      return false;

    }

  }

  /* --------------------------------------------------
     TEST DEVICE CONNECTION
  -------------------------------------------------- */

  async testHonorPoleConnection(): Promise<boolean> {

    try {

      const device = await this.discoverHonorPole();

      if (!device) return false;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(this.deviceUrl!, {
        method: "GET",
        signal: controller.signal
      });

      clearTimeout(timeout);

      return res.ok;

    } catch {

      return false;

    }

  }

  /* --------------------------------------------------
     SEND WIFI CREDENTIALS
  -------------------------------------------------- */

  async sendCredentials(credentials: WiFiCredentials) {

    try {

      const device = await this.discoverHonorPole();

      if (!device) {

        return {
          success: false,
          message: "HonorPole device not found"
        };

      }

      const res = await fetch(`${this.deviceUrl}/wifi`, {

        method: "POST",

        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },

        body: new URLSearchParams({
          ssid: credentials.ssid,
          password: credentials.password
        }).toString()

      });

      if (!res.ok) {
        throw new Error("Device rejected credentials");
      }

      await this.saveCredentials(credentials);

      return {
        success: true,
        message: "Credentials sent successfully"
      };

    } catch (error) {

      console.error("Provisioning error:", error);

      return {
        success: false,
        message: "Provisioning failed"
      };

    }

  }

  /* --------------------------------------------------
     DEVICE STATUS POLL
  -------------------------------------------------- */

  async getDeviceStatus() {

    try {

      const device = await this.discoverHonorPole();

      if (!device) return null;

      const res = await fetch(`${this.deviceUrl}/status`);

      if (!res.ok) return null;

      return await res.json();

    } catch {

      return null;

    }

  }

  /* --------------------------------------------------
     WIFI SCAN (placeholder)
  -------------------------------------------------- */

  async scanNetworks(): Promise<WiFiNetwork[]> {

    return [

      { ssid: "HonorPole-Setup", signal: 85, secure: false },
      { ssid: "Home-Network", signal: 72, secure: true },
      { ssid: "Office-WiFi", signal: 60, secure: true }

    ];

  }

  /* --------------------------------------------------
     STORAGE
  -------------------------------------------------- */

  async saveCredentials(credentials: WiFiCredentials) {

    await Preferences.set({
      key: this.STORAGE_KEY,
      value: JSON.stringify(credentials)
    });

  }

  async loadCredentials(): Promise<WiFiCredentials | null> {

    const { value } = await Preferences.get({
      key: this.STORAGE_KEY
    });

    if (!value) return null;

    return JSON.parse(value);

  }

  async clearCredentials() {

    await Preferences.remove({
      key: this.STORAGE_KEY
    });

  }

}

export const wifiService = new WiFiService();
