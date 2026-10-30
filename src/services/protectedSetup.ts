import { CapacitorHttp } from "@capacitor/core";
import cloudService from "./cloudService";
import { ProtectedSetupSession } from "./protectedSetupSession";

// An offline setup target never changes cloud selection or grants account access.
// Bind it to the original login/selection scope so account changes invalidate it.
let localTarget: { deviceId: string; scope: string } | null = null;
function setupContext() {
    const scope = cloudService.getProtectedSetupScope();
    if (localTarget && localTarget.scope !== scope) localTarget = null;
    return { deviceId: localTarget?.deviceId ?? cloudService.getCurrentDeviceId(), scope };
}
export function getSetupDeviceId() { return setupContext().deviceId; }
export function clearLocalSetup() {
    localTarget = null;
    protectedSetup.clear();
}
export function useLocalSetup(deviceId: string, password: string) {
    clearLocalSetup();
    if (!/^HP-\d{3,6}$/.test(deviceId)) throw new Error("Enter the pole ID printed on its setup card, such as HP-002.");
    localTarget = { deviceId, scope: cloudService.getProtectedSetupScope() };
    try { protectedSetup.useUsb(password); }
    catch (error) { clearLocalSetup(); throw error; }
}

export const protectedSetup = new ProtectedSetupSession({
    context: setupContext,
    cloud: async (deviceId, requestId) => {
        try { return await cloudService.requestProtectedSetup(deviceId, requestId); }
        catch (error) {
            const status = (error as { status?: number })?.status;
            throw new Error(status === 403 ? "Only this pole's administrator can open setup online. Offline setup with the private setup card is also available."
                : status === 401 ? "Sign in again before opening phone setup."
                : status === 409 ? ((error as { setupReason?: string })?.setupReason === "Phone setup firmware is not available on this pole"
                    ? "Online setup support could not be confirmed. For a pole without its old Wi-Fi, use offline setup with its private setup card."
                    : (error as { setupReason?: string })?.setupReason ?? "Setup is unavailable. Keep the pole online and idle, close existing setup, and wait for any pending request to expire.")
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
