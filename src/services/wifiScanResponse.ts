export type WiFiScanFailure = "unreachable" | "request" | "invalid";

export class WiFiScanError extends Error {
    constructor(public readonly code: WiFiScanFailure, message: string) {
        super(message);
        this.name = "WiFiScanError";
    }
}

// Only an explicit, successful array response can mean an empty scan.
export function readWiFiScanResponse(status: number, data: unknown) {
    if (status !== 200) {
        throw new WiFiScanError("request", status === 401 || status === 403
            ? "Wi-Fi scan access was refused. Reopen protected setup and check your local setup credentials, then press Refresh Networks."
            : "HonorPole could not complete the Wi-Fi scan. Press Refresh Networks to try again.");
    }
    if (typeof data === "string") {
        try { data = JSON.parse(data); } catch {
            throw new WiFiScanError("invalid", "HonorPole returned an unreadable Wi-Fi scan. Press Refresh Networks to try again.");
        }
    }
    const body = data as Record<string, unknown> | null;
    if (body && !Array.isArray(body) &&
        (body.success === false || body.ok === false || body.accepted === false || body.error ||
         ["failed", "error", "denied", "refused", "rejected"].includes(String(body.status).toLowerCase()))) {
        throw new WiFiScanError("request", "HonorPole reported a Wi-Fi scan failure. Press Refresh Networks to try again.");
    }
    const networks = Array.isArray(data) ? data : body?.networks;
    if (!Array.isArray(networks) || networks.some(n =>
        !n || typeof n !== "object" || typeof n.ssid !== "string" ||
        (n.rssi !== undefined && (typeof n.rssi !== "number" || !Number.isFinite(n.rssi))))) {
        throw new WiFiScanError("invalid", "HonorPole returned an invalid Wi-Fi network list. Press Refresh Networks to try again.");
    }
    return networks.filter(n => n.ssid.trim().length > 0).map(n => ({
        ssid: n.ssid,
        signal: Math.max(0, Math.min(100, Math.round(((n.rssi ?? -100) + 100) * 2))),
        secure: Boolean(n.secure)
    })).sort((a, b) => b.signal - a.signal);
}
