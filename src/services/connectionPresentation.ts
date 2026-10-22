/** The pole's cloud link, independent of the phone's server connection. */
export function getPoleCloudStatus(telemetry?: {
    online?: boolean;
    network?: { cloudConnected?: boolean };
} | null): "Connected" | "Disconnected" | "Unknown" {
    // Ignore cached positive cloud telemetry once the pole is offline.
    if (telemetry?.online === false) return "Disconnected";
    if (telemetry?.online !== true) return "Unknown";
    if (telemetry.network?.cloudConnected === true) return "Connected";
    if (telemetry.network?.cloudConnected === false) return "Disconnected";
    return "Unknown";
}

/** Display a reported version only while the selected pole is online. */
export function getFirmwareDisplay(telemetry?: {
    online?: boolean;
    firmware?: unknown;
} | null): string {
    if (telemetry?.online !== true || typeof telemetry.firmware !== "string") {
        return "Unknown";
    }
    const version = telemetry.firmware.trim();
    if (!version || ["--", "unknown", "n/a"].includes(version.toLowerCase())) {
        return "Unknown";
    }
    return version;
}
