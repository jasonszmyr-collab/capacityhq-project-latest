/** Shared SDK model declarations. Active transports live in the service modules. */

//======================================================
// Types
//======================================================

export type HonorPoleConnectionState =
    | "disconnected"
    | "connecting"
    | "local"
    | "cloud"
    | "both";

export type HonorPolePosition =
    | "BOTTOM"
    | "HALF"
    | "FULL"
    | "MOVING_UP"
    | "MOVING_DOWN"
    | "STOPPED"
    | "UNKNOWN";

export type HonorPoleCommand =
    | "FULL"
    | "HALF"
    | "BOTTOM"
    | "STOP"
    | "CALIBRATE"
    | "SCAN_WIFI"
    | "SAVE_WIFI"
    | "OTA_UPDATE";

//======================================================
// Device
//======================================================

export interface HonorPoleDevice {

    id: string;

    name: string;

    firmware: string;

    serialNumber: string;

    ipAddress: string;

    macAddress: string;

    online: boolean;

    lastSeen: number;

}

//======================================================
// WiFi
//======================================================

export interface WiFiNetwork {

    ssid: string;

    rssi: number;

    security: string;

    connected: boolean;

}

//======================================================
// Telemetry
//======================================================

export interface HonorPoleTelemetry {

    connected: boolean;

    position: HonorPolePosition;

    currentPosition: number;

    targetPosition: number;

    fullPosition: number;

    moving: boolean;

    motorState: string;

    firmware: string;

    wifiSSID: string;

    wifiRSSI: number;

    uptime: number;

    freeHeap: number;

    ipAddress: string;

}

//======================================================
// Firmware
//======================================================

export interface FirmwareInformation {

    currentVersion: string;

    latestVersion: string;

    updateAvailable: boolean;

}

//======================================================
// Event Subscribers
//======================================================

export type TelemetryCallback =
    (telemetry: HonorPoleTelemetry) => void;

export type ConnectionCallback =
    (connected: boolean) => void;

export type DeviceCallback =
    (device: HonorPoleDevice | null) => void;
