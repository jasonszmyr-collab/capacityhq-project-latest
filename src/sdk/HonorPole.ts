/******************************************************************************
 *
 * HonorPole Innovations
 * HonorPole Mobile SDK
 *
 * File: HonorPole.ts
 *
 * Version: 1.0.0
 *
 * This file is the ONLY public interface used by the UI.
 *
 * Pages should NEVER communicate directly with:
 *
 *   • cloudService
 *   • wifiService
 *   • deviceService
 *   • deviceDirect
 *   • capacityService
 *   • Supabase
 *
 * Everything goes through this SDK.
 *
 ******************************************************************************/

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

//======================================================
// HonorPole SDK
//======================================================

class HonorPoleSDK {

    //--------------------------------------------------
    // State
    //--------------------------------------------------

    private device: HonorPoleDevice | null = null;

    private telemetry: HonorPoleTelemetry = {

        connected: false,

        position: "UNKNOWN",

        currentPosition: 0,

        targetPosition: 0,

        fullPosition: 0,

        moving: false,

        motorState: "STOP",

        firmware: "",

        wifiSSID: "",

        wifiRSSI: 0,

        uptime: 0,

        freeHeap: 0,

        ipAddress: ""

    };

    private firmware: FirmwareInformation = {

        currentVersion: "",

        latestVersion: "",

        updateAvailable: false

    };

    private connectionState: HonorPoleConnectionState =
        "disconnected";

    //--------------------------------------------------
    // Subscribers
    //--------------------------------------------------

    private telemetrySubscribers =
        new Set<TelemetryCallback>();

    private connectionSubscribers =
        new Set<ConnectionCallback>();

    private deviceSubscribers =
        new Set<DeviceCallback>();

    //--------------------------------------------------
    // Constructor
    //--------------------------------------------------

    constructor() {

        console.log("");

        console.log("========================================");

        console.log(" HonorPole SDK Started");

        console.log(" Version 1.0.0");

        console.log("========================================");

    }

    //--------------------------------------------------
    // Public Getters
    //--------------------------------------------------

    public getDevice() {

        return this.device;

    }

    public getTelemetry() {

        return this.telemetry;

    }

    public getFirmware() {

        return this.firmware;

    }

    public getConnectionState() {

        return this.connectionState;

    }

    //--------------------------------------------------
    // Section 1 Part A Ends Here
    //--------------------------------------------------
    //--------------------------------------------------
    // Subscription Management
    //--------------------------------------------------

    public subscribeTelemetry(
        callback: TelemetryCallback
    ): () => void {

        this.telemetrySubscribers.add(callback);

        callback(this.telemetry);

        return () => {

            this.telemetrySubscribers.delete(callback);

        };

    }

    //--------------------------------------------------

    public subscribeConnection(
        callback: ConnectionCallback
    ): () => void {

        this.connectionSubscribers.add(callback);

        callback(
            this.connectionState !== "disconnected"
        );

        return () => {

            this.connectionSubscribers.delete(callback);

        };

    }

    //--------------------------------------------------

    public subscribeDevice(
        callback: DeviceCallback
    ): () => void {

        this.deviceSubscribers.add(callback);

        callback(this.device);

        return () => {

            this.deviceSubscribers.delete(callback);

        };

    }

    //--------------------------------------------------
    // Notification Engine
    //--------------------------------------------------

    private notifyTelemetry(): void {

        this.telemetrySubscribers.forEach(callback => {

            callback({
                ...this.telemetry
            });

        });

    }

    //--------------------------------------------------

    private notifyConnection(): void {

        const connected =
            this.connectionState !== "disconnected";

        this.connectionSubscribers.forEach(callback => {

            callback(connected);

        });

    }

    //--------------------------------------------------

    private notifyDevice(): void {

        this.deviceSubscribers.forEach(callback => {

            callback(this.device);

        });

    }

    //--------------------------------------------------
    // Internal State Updates
    //--------------------------------------------------

    private setTelemetry(
        telemetry: Partial<HonorPoleTelemetry>
    ): void {

        this.telemetry = {

            ...this.telemetry,

            ...telemetry

        };

        this.notifyTelemetry();

    }

    //--------------------------------------------------

    private setDevice(
        device: HonorPoleDevice | null
    ): void {

        this.device = device;

        this.notifyDevice();

    }

    //--------------------------------------------------

    private setConnectionState(
        state: HonorPoleConnectionState
    ): void {

        if (this.connectionState === state)
            return;

        this.connectionState = state;

        this.notifyConnection();

    }

    //--------------------------------------------------

    private setFirmware(
        firmware: Partial<FirmwareInformation>
    ): void {

        this.firmware = {

            ...this.firmware,

            ...firmware

        };

    }

    //--------------------------------------------------
    // Health
    //--------------------------------------------------

    public isConnected(): boolean {

        return this.connectionState !==
            "disconnected";

    }

    //--------------------------------------------------

    public hasLocalConnection(): boolean {

        return (
            this.connectionState === "local" ||
            this.connectionState === "both"
        );

    }

    //--------------------------------------------------

    public hasCloudConnection(): boolean {

        return (
            this.connectionState === "cloud" ||
            this.connectionState === "both"
        );

    }

    //--------------------------------------------------
    // SDK Skeleton
    //--------------------------------------------------

    public async initialize(): Promise<void> {

        console.log(
            "[HonorPole] Initializing SDK..."
        );

    }

    //--------------------------------------------------

    public async shutdown(): Promise<void> {

        console.log(
            "[HonorPole] Shutdown"
        );

    }

    //--------------------------------------------------

    public async refresh(): Promise<void> {

        console.log(
            "[HonorPole] Refresh Requested"
        );

    }

    //--------------------------------------------------
    // Section 1 Part B Ends Here
    //--------------------------------------------------
}
