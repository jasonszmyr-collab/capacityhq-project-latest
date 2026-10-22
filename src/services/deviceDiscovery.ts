import { CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { requireLocalIdentity } from "./localDeviceIdentity";

export interface DeviceInfo { ip: string; firmware: string; device: string; deviceId: string; }
class DeviceDiscovery {
    private async probe(base: string, expectedDeviceId: string): Promise<DeviceInfo | null> {
        try {
            const response = await CapacitorHttp.request({ method: "GET", url: `${base}/status`, connectTimeout: 500, readTimeout: 500 });
            if (response.status !== 200) return null;
            const data = requireLocalIdentity(response.data, expectedDeviceId);
            return { ip: base.replace(/^http:\/\//, ""), firmware: data.firmware, device: "HonorPole", deviceId: expectedDeviceId };
        } catch { return null; }
    }
    async discoverSaved(expectedDeviceId?: string): Promise<DeviceInfo | null> {
        if (!expectedDeviceId || !/^HP-[0-9]{3,6}$/.test(expectedDeviceId)) return null;
        const saved = await Preferences.get({ key: `honorpole_last_ip_${expectedDeviceId}` });
        if (!saved.value) return null;
        return this.probe(saved.value.startsWith("http://") ? saved.value : `http://${saved.value}`, expectedDeviceId);
    }
    async discover(expectedDeviceId?: string): Promise<DeviceInfo | null> {
        if (!expectedDeviceId || !/^HP-[0-9]{3,6}$/.test(expectedDeviceId)) return null;
        const saved = await Preferences.get({ key: `honorpole_last_ip_${expectedDeviceId}` });
        const addresses = saved.value ? [saved.value.startsWith("http://") ? saved.value : `http://${saved.value}`] : [];
        addresses.push("http://192.168.4.1", "http://honorpole.local");
        for (let i = 1; i <= 254; i++) addresses.push(`http://192.168.0.${i}`);
        for (const base of new Set(addresses)) {
            const found = await this.probe(base, expectedDeviceId);
            if (!found) continue;
            await Preferences.set({ key: `honorpole_last_ip_${expectedDeviceId}`, value: found.ip });
            return found;
        }
        return null;
    }
}
export const discovery = new DeviceDiscovery();
