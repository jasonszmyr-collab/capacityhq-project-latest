import { CapacitorHttp } from "@capacitor/core";
import cloudService from "./cloudService";
import { ProtectedSetupSession } from "./protectedSetupSession";

export const protectedSetup = new ProtectedSetupSession({
    context: () => ({ deviceId: cloudService.getCurrentDeviceId(), scope: cloudService.getProtectedSetupScope() }),
    cloud: async (deviceId, requestId) => {
        try { return await cloudService.requestProtectedSetup(deviceId, requestId); }
        catch (error) {
            const status = (error as { status?: number })?.status;
            throw new Error(status === 403 ? "Only this pole's administrator can open phone setup. USB setup is also available."
                : status === 401 ? "Sign in again before opening phone setup."
                : status === 409 ? "Setup is unavailable. Keep the pole online and idle, close existing setup, and wait for any pending request to expire."
                : "Phone setup could not be confirmed. Check the connection and pole before trying again.");
        }
    },
    local: async (path, headers, data) => {
        try {
            return await CapacitorHttp.request({ method: path === "/save" ? "POST" : "GET",
                url: `http://192.168.4.1${path}`, headers, data, disableRedirects: true,
                connectTimeout: 5000, readTimeout: 10000 });
        } catch {
            throw new Error(path === "/save"
                ? "Wi-Fi submission could not be confirmed. Check the pole before trying again; it may have saved the settings."
                : "Cannot reach the setup address. Connect to this pole's setup Wi-Fi and stay connected without internet.");
        }
    },
    now: Date.now,
    pause: () => new Promise(resolve => setTimeout(resolve, 1500)),
    encode: value => btoa(value)
});
