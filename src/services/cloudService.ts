/******************************************************************************
 *
 * HonorPole Mobile Application
 * File: cloudService.ts
 *
 * VERSION : 5.0.0
 * BUILD   : Part 1A.1
 *
 * DESCRIPTION
 * ---------------------------------------------------------------------------
 * Cloud / Local communications layer
 *  • Authentication
 *  • Device Discovery
 *  • Cloud API
 *  • Local ESP32 API
 *  • WebSocket Telemetry
 *  • Offline Queue
 *  • OTA
 *  • Legacy Compatibility Layer
 *
 ******************************************************************************/

//======================================================================
// Imports
//======================================================================

import type { DeviceTelemetry } from "../types/telemetry";
import { DefaultTelemetry } from "../types/telemetry";

import { discovery } from "./deviceDiscovery";
import { CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

//======================================================================
// Configuration
//======================================================================

const CLOUD_API =
    import.meta.env.VITE_CLOUD_API_ENDPOINT ??
    "https://capacityhq-project-latest.onrender.com";

const WS_ENDPOINT =
    import.meta.env.VITE_WS_ENDPOINT ??
    "wss://capacityhq-project-latest.onrender.com/ws";

const LOCAL_PORT = 80;

const DEFAULT_DEVICE =
    "honorpole.local";

const AP_IP =
    "192.168.4.1";

const REQUEST_TIMEOUT = 10000;

const HEARTBEAT_INTERVAL = 30000;

const TELEMETRY_INTERVAL = 2000;

const RECONNECT_DELAY = 5000;

const MAX_RECONNECT_DELAY = 60000;

//======================================================================
// Command Types
//======================================================================

export type CommandType =
    | "full"
    | "half"
    | "bottom"
    | "down"
    | "auto"
    | "stop";

//======================================================================
// Connection Mode
//======================================================================

export type ConnectionMode =
    | "offline"
    | "cloud"
    | "local";

//======================================================================
// Device Status
//======================================================================

export interface DeviceStatus
{
    online: boolean;

    connected: boolean;

    firmware: string;

    ip: string;

    lastSeen: string;

    telemetry: DeviceTelemetry;
}

//======================================================================
// Device Information
//======================================================================

export interface DeviceInfo
{
    deviceId: string;

    deviceName: string;

    firmware: string;

    serialNumber: string;

    ipAddress?: string;

    macAddress?: string;

    online: boolean;

    lastSeen: string;

    signalStrength?: number;
}

//======================================================================
// Login Result
//======================================================================

export interface LoginResult
{
    userId: string;

    token: string;

    refreshToken?: string;

    expires?: string;
}

//======================================================================
// Cloud Command
//======================================================================

export interface CloudCommand
{
    commandId: string;

    deviceId: string;

    command: CommandType;

    timestamp: string;

    status:
        | "pending"
        | "queued"
        | "delivered"
        | "executed"
        | "failed";
}

//======================================================
// WiFi Network
//======================================================

export interface WifiNetwork
{
    ssid: string;

    rssi: number;

    secure: boolean;

    channel?: number;
}

//======================================================
// Diagnostics
//======================================================

export interface DiagnosticStatus
{
    firmware: string;

    uptime: number;

    freeHeap: number;

    wifiConnected: boolean;

    websocketConnected: boolean;

    ipAddress: string;

    signalStrength: number;

    calibrated: boolean;

    currentPosition: number;

    targetPosition: number;

    fullPosition: number;

    moving: boolean;
}

//======================================================
// Calibration
//======================================================

export interface CalibrationStatus
{
    running: boolean;

    state: string;

    currentPosition: number;

    learnedTop: number;

    complete: boolean;

    success: boolean;

    message: string;
}

//======================================================
// OTA Status
//======================================================

export interface OTAStatus
{
    available: boolean;

    currentVersion: string;

    latestVersion: string;

    progress: number;

    updating: boolean;
}

//======================================================================
// Subscribers
//======================================================================

export type TelemetrySubscriber =
(
    telemetry: DeviceTelemetry
) => void;

export type ConnectionSubscriber =
(
    connected: boolean
) => void;

export type EventSubscriber =
(
    message: string
) => void;

//======================================================================
// Cloud Service
//======================================================================

class CloudService
{
    //--------------------------------------------------
    // Authentication
    //--------------------------------------------------

    private authToken: string | null = null;

    private refreshToken: string | null = null;

    private userId: string | null = null;

    //--------------------------------------------------
    // Device
    //--------------------------------------------------

    private currentDevice: DeviceInfo | null = null;

    private currentDeviceId: string | null = null;

    private devices =
        new Map<string, DeviceInfo>();

    // Connection fields
private socket: WebSocket | null = null;
private reconnectTimer: number | null = null;
private heartbeatTimer: number | null = null;
private telemetryTimer: number | null = null;
private reconnectDelay = RECONNECT_DELAY;

// Telemetry field
private telemetry: DeviceTelemetry = DefaultTelemetry;

//--------------------------------------------------
// Connection State
//--------------------------------------------------

private connected = false;

private localConnected = false;

private localIP: string | null = null;

private connectionMode: ConnectionMode = "offline";

// Then the polling methods
private startTelemetryPolling(): void
{
    this.stopTelemetryPolling();

    const poll =
        async () =>
        {
            try
            {
                //--------------------------------------------------
                // Local telemetry when ESP32 is directly reachable
                //--------------------------------------------------

                if (this.localConnected)
                {
                    await this.getLocalStatus();
                    return;
                }

                //--------------------------------------------------
                // Cloud telemetry fallback
                //--------------------------------------------------

                const telemetry =
                    await this.getDeviceStatus("HP-001");

                this.updateTelemetry(telemetry);

                this.connected = telemetry.online === true;

                this.connectionMode =
                    this.connected
                        ? "cloud"
                        : "offline";

                this.notifyConnectionSubscribers(
                    this.connected
                );
            }
            catch (error)
            {
                console.warn(
                    "[Telemetry] Cloud poll failed",
                    error
                );

                this.connected = false;

                this.connectionMode =
                    "offline";

                this.notifyConnectionSubscribers(
                    false
                );
            }
        };

    // Poll immediately instead of waiting 2 seconds.
    void poll();

    this.telemetryTimer =
        window.setInterval(
            poll,
            TELEMETRY_INTERVAL
        );
}

//------------------------------------------------------

private stopTelemetryPolling(): void
{
    if (this.telemetryTimer)
    {
        clearInterval(
            this.telemetryTimer
        );

        this.telemetryTimer = null;
    }
}

    //--------------------------------------------------
    // Subscribers
    //--------------------------------------------------

    private telemetrySubscribers =
        new Set<TelemetrySubscriber>();

    private connectionSubscribers =
        new Set<ConnectionSubscriber>();

    private eventSubscribers =
        new Set<EventSubscriber>();

        //--------------------------------------------------
    // Offline Queue
    //--------------------------------------------------

    private commandQueue: CloudCommand[] = [];

    private processingQueue = false;

    //--------------------------------------------------
    // Constructor
    //--------------------------------------------------

    constructor()
    {
        this.authToken =
            localStorage.getItem(
                "cloud_auth_token"
            );

        this.refreshToken =
            localStorage.getItem(
                "cloud_refresh_token"
            );

        this.userId =
            localStorage.getItem(
                "cloud_user_id"
            );

        console.log("===================================");
        console.log(" HonorPole Cloud Service v5.0.0");
        console.log("===================================");
        console.log("Cloud:", CLOUD_API);
        console.log("WebSocket:", WS_ENDPOINT);
        console.log("Ready.");
    }
    
        //======================================================
    // Authentication
    //======================================================

    public isAuthenticated(): boolean
    {
        return (
            this.authToken !== null &&
            this.userId !== null
        );
    }

    //------------------------------------------------------

    public getAuthToken(): string | null
    {
        return this.authToken;
    }

    //------------------------------------------------------

    public setAuthToken(token: string): void
    {
        this.authToken = token;

        localStorage.setItem(
            "cloud_auth_token",
            token
        );
    }

    //------------------------------------------------------

    public getRefreshToken(): string |null
    {
        return this.refreshToken;
    }

    //------------------------------------------------------

    public setRefreshToken(token: string): void
    {
        this.refreshToken = token;

        localStorage.setItem(
            "cloud_refresh_token",
            token
        );
    }

    //------------------------------------------------------

    public getUserId(): string | null
    {
        return this.userId;
    }

    //------------------------------------------------------

    public setUserId(userId: string): void
    {
        this.userId = userId;

        localStorage.setItem(
            "cloud_user_id",
            userId
        );
    }

    //------------------------------------------------------

    public clearAuthentication(): void
    {
        this.authToken = null;
        this.refreshToken = null;
        this.userId = null;

        localStorage.removeItem(
            "cloud_auth_token"
        );

        localStorage.removeItem(
            "cloud_refresh_token"
        );

        localStorage.removeItem(
            "cloud_user_id"
        );
    }

    //------------------------------------------------------
    // Legacy Compatibility
    //------------------------------------------------------

    public clearAuth(): void
    {
        this.clearAuthentication();
    }

    //======================================================
    // REST Helper
    //======================================================

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T>
    {
        const headers: Record<string,string> =
        {
            "Content-Type":
                "application/json",

            ...(options.headers as
                Record<string,string> ?? {})
        };

        if (this.authToken)
        {
            headers.Authorization =
                `Bearer ${this.authToken}`;
        }

        const controller =
            new AbortController();

        const timeout =
            window.setTimeout(
                () => controller.abort(),
                REQUEST_TIMEOUT
            );

        try
        {
            const response =
                await fetch(
                    `${CLOUD_API}${endpoint}`,
                    {
                        ...options,

                        headers,

                        signal:
                            controller.signal
                    }
                );

            if (!response.ok)
            {
                const text =
                    await response.text();

                throw new Error(
                    `${response.status} ${text}`
                );
            }

            return await response.json();
        }

        finally
        {
            clearTimeout(timeout);
        }
    }

        //======================================================
    // Device Management
    //======================================================

    public setDevice(
        device: DeviceInfo
    ): void
    {
        this.currentDevice = device;
        this.currentDeviceId = device.deviceId;

        this.devices.set(
            device.deviceId,
            device
        );
    }

    //------------------------------------------------------

    public getCurrentDevice():
        DeviceInfo | null
    {
        return this.currentDevice;
    }

    //------------------------------------------------------

    public getCurrentDeviceId():
        string | null
    {
        return this.currentDeviceId;
    }

    //------------------------------------------------------

    public clearCurrentDevice(): void
    {
        this.currentDevice = null;
        this.currentDeviceId = null;
        this.localConnected = false;
        this.localIP = null;
    }

    //------------------------------------------------------

    public cacheDevice(
        device: DeviceInfo
    ): void
    {
        this.devices.set(
            device.deviceId,
            device
        );
    }

    //------------------------------------------------------

   public async getDevices():
    Promise<DeviceInfo[]>
{
    if (this.devices.size > 0)
    {
        return Array.from(
            this.devices.values()
        );
    }

    try
    {
        const devices =
            await this.request<DeviceInfo[]>(
                "/api/devices"
            );

        devices.forEach(device =>
        {
            this.devices.set(
                device.deviceId,
                device
            );
        });

        return devices;
    }
    catch (error)
    {
        console.error(
            "[Cloud] Failed to load devices:",
            error
        );

        throw error;
    }
}

    //------------------------------------------------------
    // registerDevice() Overloads
    //------------------------------------------------------

    public registerDevice(
        device: DeviceInfo
    ): Promise<void>;

    public registerDevice(
        pairingCode: string,
        deviceName: string
    ): Promise<DeviceInfo>;

    public async registerDevice(
        value1: DeviceInfo | string,
        value2?: string
    ): Promise<DeviceInfo | void>
    {
        //--------------------------------------------------
        // Existing Device
        //--------------------------------------------------

        if (typeof value1 !== "string")
        {
            this.devices.set(
                value1.deviceId,
                value1
            );

            this.currentDevice = value1;
            this.currentDeviceId =
                value1.deviceId;

            return;
        }

        //--------------------------------------------------
        // Pairing Registration
        //--------------------------------------------------

        const device =
            await this.request<DeviceInfo>(
                "/api/device/register",
                {
                    method: "POST",

                    body: JSON.stringify({
                        pairingCode: value1,
                        deviceName: value2
                    })
                }
            );

        this.devices.set(
            device.deviceId,
            device
        );

        this.currentDevice = device;
        this.currentDeviceId =
            device.deviceId;

        return device;
    }

    //------------------------------------------------------

    public unregisterDevice(
        deviceId: string
    ): void
    {
        this.devices.delete(deviceId);

        if (
            this.currentDeviceId ===
            deviceId
        )
        {
            this.clearCurrentDevice();
        }
    }

    //------------------------------------------------------

    public getDevice(
        deviceId: string
    ): DeviceInfo | null
    {
        return (
            this.devices.get(deviceId)
            ?? null
        );
    }

    //------------------------------------------------------

    public getDeviceCount():
        number
    {
        return this.devices.size;
    }

    //------------------------------------------------------

    public isDeviceSelected():
        boolean
    {
        return (
            this.currentDevice !== null
        );
    }

    //------------------------------------------------------
    // getDeviceStatus() Overloads
    //------------------------------------------------------

    public getDeviceStatus():
        Promise<DeviceTelemetry>;

    public getDeviceStatus(
        deviceId: string
    ): Promise<DeviceTelemetry>;

    public async getDeviceStatus(
        deviceId?: string
    ): Promise<DeviceTelemetry>
    {
        const endpoint =
            deviceId
                ? `/api/device/${deviceId}/status`
                : "/api/status";

        return await this.request<DeviceTelemetry>(
            endpoint
        );
    }

    //------------------------------------------------------
    // Connection Information
    //------------------------------------------------------

    public getConnectionType():
        ConnectionMode
    {
        return this.connectionMode;
    }

    //------------------------------------------------------

    public isConnected():
        boolean
    {
        return this.connected;
    }

    //------------------------------------------------------

    public isLocalConnected():
        boolean
    {
        return this.localConnected;
    }

    //------------------------------------------------------

    public getLocalIPAddress():
        string | null
    {
        return this.localIP;
    }

    //------------------------------------------------------

    public setLocalConnection(
        ip: string
    ): void
    {
        this.localConnected = true;
        this.localIP = ip;
        this.connectionMode = "local";

        console.log(
            `[Cloud] Local Device ${ip}`
        );
    }

    //------------------------------------------------------

    public clearLocalConnection():
        void
    {
        this.localConnected = false;
        this.localIP = null;

        if (!this.connected)
        {
            this.connectionMode =
                "offline";
        }
    }

        //======================================================
    // Command Engine
    //======================================================

    //------------------------------------------------------
    // Legacy Overloads
    //------------------------------------------------------

    public sendCommand(
        command: CommandType
    ): Promise<boolean>;

    public sendCommand(
        deviceId: string,
        command: CommandType
    ): Promise<boolean>;

    //------------------------------------------------------

    public async sendCommand(
        value1: string,
        value2?: CommandType
    ): Promise<boolean>
    {
        let deviceId: string | null = null;
        let command: CommandType;

        //--------------------------------------------------
        // Determine overload
        //--------------------------------------------------

        if (value2 === undefined)
        {
            command = value1 as CommandType;
            deviceId = this.currentDeviceId;
        }
        else
        {
            deviceId = value1;
            command = value2;
        }

        //--------------------------------------------------
        // Validate
        //--------------------------------------------------

        if (!deviceId)
        {
            console.error(
                "[Cloud] No device selected."
            );

            return false;
        }

        //--------------------------------------------------
        // Emergency STOP - Load Saved Local IP
        //--------------------------------------------------

        if (
            command === "stop" &&
            (!this.localConnected || !this.localIP)
        )
        {
            const saved = await Preferences.get({
                key: "honorpole_last_ip"
            });

            if (saved.value)
            {
                this.localIP =
                    saved.value.replace("http://", "");

                this.localConnected = true;

                console.log(
                    "[STOP] Loaded saved local IP:",
                    this.localIP
                );
            }
        }
        //--------------------------------------------------
        // Local Preferred
        //--------------------------------------------------

        if (
            this.localConnected &&
            this.localIP
        )
        {
            try
            {
                const ok =
                    await this.sendLocalCommand(
                        command
                    );

                if (ok)
                {
                    // Emergency STOP also continues to cloud
                    // so the server receives STOP as a backup.
                    if (command !== "stop")
                    {
                        return true;
                    }

                    console.log(
                        "[STOP] Local STOP sent; sending cloud backup."
                    );
                }
            }
            catch (error)
            {
                console.warn(
                    "[Cloud] Local command failed.",
                    error
                );
            }
        }

        //--------------------------------------------------
        // Cloud Fallback
        //--------------------------------------------------

        try
        {
            await this.request(
                `/api/device/${deviceId}/command`,
                {
                    method: "POST",

                    body: JSON.stringify({
                        command
                    })
                }
            );

            return true;
        }
        catch (error)
        {
            console.error(
                "[Cloud] Cloud command failed.",
                error
            );

            return false;
        }
    }

    //------------------------------------------------------
    // Local REST Command
    //------------------------------------------------------

    private async sendLocalCommand(
        command: CommandType
    ): Promise<boolean>
    {
        if (!this.localIP)
        {
            return false;
        }

        try
        {
            const response =
                await CapacitorHttp.request({
                    method: "POST",
                    url: `http://${this.localIP}/api/command`,
                    headers: {
                        "Content-Type": "application/json"
                    },
                    data: {
                        command
                    },
                    connectTimeout: 1000,
                    readTimeout: 1000
                });

            if (
                response.status < 200 ||
                response.status >= 300
            )
            {
                return false;
            }

            console.log(
                `[LOCAL] ${command}`
            );

            return true;
        }
        catch (error)
        {
            console.warn(
                `[LOCAL] ${command} failed.`,
                error
            );

            return false;
        }
    }
    //------------------------------------------------------
    // Convenience Commands
    //------------------------------------------------------

    public full()
{
    return this.sendOrQueue("full");
}

    //------------------------------------------------------

    public half()
    {
        return this.sendOrQueue(
            "half"
        );
    }

    //------------------------------------------------------

    public down()
    {
        return this.sendOrQueue(
            "down"
        );
    }

    //------------------------------------------------------

    public stop()
    {
        return this.sendOrQueue(
            "stop"
        );
    }

    //------------------------------------------------------

    public auto()
    {
        return this.sendOrQueue(
            "auto"
        );
    }

        //======================================================
    // Device Discovery & Connection
    //======================================================

    //------------------------------------------------------
    // Discover HonorPole
    //------------------------------------------------------

    public async discoverDevice(): Promise<boolean>
    {
        try
        {
            const found =
                await discovery.discover();

            if (!found)
            {
                console.warn(
                    "[Cloud] No HonorPole Found."
                );

                return false;
            }

            this.localIP = found.ip;

            this.localConnected = true;

            this.connectionMode = "local";

            this.telemetry.network.ipAddress =
                found.ip;

            this.telemetry.network.wifiConnected =
                true;

            this.telemetry.firmware =
                found.firmware;

            this.telemetry.deviceName =
                found.device;

            console.log(
                `[Cloud] Device Found ${found.ip}`
            );

            this.notifyConnectionSubscribers(
                true
            );

            return true;
        }
        catch (error)
        {
            console.error(
                "[Cloud] Discovery Failed",
                error
            );

            return false;
        }
    }

    //------------------------------------------------------
    // Connect
    //------------------------------------------------------

   public async connect(): Promise<boolean>
{
    //--------------------------------------------------
    // Already Connected
    //--------------------------------------------------

    if (this.connected)
    {
        return true;
    }

    //--------------------------------------------------
    // Normal Dashboard Connection
    //
    // Do NOT perform LAN discovery here.
    // The normal application communicates through
    // the cloud/Render service.
    //
    // discoverDevice() remains available separately
    // for setup and provisioning.
    //--------------------------------------------------

    console.log(
        "[Cloud] Starting cloud connection."
    );

    //--------------------------------------------------
    // Start WebSocket
    //--------------------------------------------------

    this.startWebSocket();

    //--------------------------------------------------
    // Enable Cloud Connection
    //--------------------------------------------------

    this.connected = true;

    this.connectionMode = "cloud";

    //--------------------------------------------------
    // Start Cloud Telemetry Polling
    //--------------------------------------------------

    this.startTelemetryPolling();

    //--------------------------------------------------
    // Process Pending Commands
    //--------------------------------------------------

    await this.processQueue();

    //--------------------------------------------------
    // Notify UI
    //--------------------------------------------------

    this.notifyConnectionSubscribers(
        true
    );

    console.log(
        "[Cloud] Cloud connection started."
    );

    return true;
}

    //------------------------------------------------------
    // Disconnect
    //------------------------------------------------------

    public disconnect(): void
    {
        this.connected = false;

        this.localConnected = false;

        this.connectionMode =
            "offline";

        if (this.socket)
        {
            this.socket.close();

            this.socket = null;
        }

        if (this.heartbeatTimer)
        {
            clearInterval(
                this.heartbeatTimer
            );

            this.heartbeatTimer = null;
        }

        if (this.reconnectTimer)
        {
            clearTimeout(
                this.reconnectTimer
            );

            this.reconnectTimer = null;
        }

        this.telemetry.network.websocketConnected = false;

this.notifyConnectionSubscribers(false);

this.stopTelemetryPolling();

console.log(
    "[Cloud] Disconnected"
);
    }

    //------------------------------------------------------
    // Refresh Device Status
    //------------------------------------------------------

    public async refreshStatus():
        Promise<void>
    {
        if (!this.localIP)
        {
            return;
        }

        try
        {
            const response =
                await fetch(
                    `http://${this.localIP}/status`
                );

            if (!response.ok)
            {
                return;
            }

            const status =
                await response.json();

            this.telemetry.online = true;

            this.telemetry.network.wifiConnected =
                true;

            if (status.firmware)
{
    this.telemetry.firmware =
        status.firmware;
}

// Keep live flag position synchronized with ESP32 telemetry.
const currentPosition =
    Number(status.position);

if (Number.isFinite(currentPosition))
{
    this.telemetry.currentPosition =
        currentPosition;
}

const targetPosition =
    Number(status.target);

if (Number.isFinite(targetPosition))
{
    this.telemetry.targetPosition =
        targetPosition;
}

const learnedTopPosition =
    Number(status.full);

if (
    Number.isFinite(learnedTopPosition) &&
    learnedTopPosition > 0
)
{
    this.telemetry.learnedTopPosition =
        learnedTopPosition;
}

if (typeof status.moving === "boolean")
{
    this.telemetry.moving =
        status.moving;
}

this.notifyTelemetrySubscribers();
        }
        catch
        {
            this.telemetry.online = false;

            this.notifyTelemetrySubscribers();
        }
    }

    //------------------------------------------------------
    // Local REST Ping
    //------------------------------------------------------

    public async ping():
        Promise<boolean>
    {
        if (!this.localIP)
        {
            return false;
        }

        try
        {
            const response =
                await fetch(
                    `http://${this.localIP}/status`
                );

            return response.ok;
        }
        catch
        {
            return false;
        }
    }

        //======================================================
    // Subscribers
    //======================================================

    //------------------------------------------------------
    // Telemetry
    //------------------------------------------------------

    public subscribeTelemetry(
        callback: TelemetrySubscriber
    ): () => void
    {
        this.telemetrySubscribers.add(
            callback
        );

        callback(
            structuredClone(
                this.telemetry
            )
        );

        return () =>
        {
            this.telemetrySubscribers.delete(
                callback
            );
        };
    }

    //------------------------------------------------------

    public unsubscribeTelemetry(
        callback: TelemetrySubscriber
    ): void
    {
        this.telemetrySubscribers.delete(
            callback
        );
    }

    //------------------------------------------------------

    private notifyTelemetrySubscribers():
        void
    {
        const telemetry =
            structuredClone(
                this.telemetry
            );

        this.telemetrySubscribers.forEach(
            subscriber =>
            {
                try
                {
                    subscriber(
                        telemetry
                    );
                }
                catch (error)
                {
                    console.error(
                        "[Cloud] Telemetry Subscriber Error",
                        error
                    );
                }
            }
        );
    }

    //------------------------------------------------------
    // Connection
    //------------------------------------------------------

    public subscribeConnection(
        callback: ConnectionSubscriber
    ): () => void
    {
        this.connectionSubscribers.add(
            callback
        );

        callback(
            this.connected
        );

        return () =>
        {
            this.connectionSubscribers.delete(
                callback
            );
        };
    }

    //------------------------------------------------------

    private notifyConnectionSubscribers(
        connected: boolean
    ): void
    {
        this.connectionSubscribers.forEach(
            subscriber =>
            {
                try
                {
                    subscriber(
                        connected
                    );
                }
                catch (error)
                {
                    console.error(
                        "[Cloud] Connection Subscriber Error",
                        error
                    );
                }
            }
        );
    }

    //------------------------------------------------------
    // Events
    //------------------------------------------------------

    public subscribeEvents(
        callback: EventSubscriber
    ): () => void
    {
        this.eventSubscribers.add(
            callback
        );

        return () =>
        {
            this.eventSubscribers.delete(
                callback
            );
        };
    }

    //------------------------------------------------------

    private notifyEventSubscribers(
        message: string
    ): void
    {
        this.eventSubscribers.forEach(
            subscriber =>
            {
                try
                {
                    subscriber(
                        message
                    );
                }
                catch (error)
                {
                    console.error(
                        "[Cloud] Event Subscriber Error",
                        error
                    );
                }
            }
        );
    }

    //------------------------------------------------------
    // Telemetry Access
    //------------------------------------------------------

    public getTelemetry():
        DeviceTelemetry
    {
        return structuredClone(
            this.telemetry
        );
    }

    //------------------------------------------------------

    private updateTelemetry(
        update:
            Partial<DeviceTelemetry>
    ): void
    {
        this.telemetry =
        {
            ...this.telemetry,
            ...update
        };

        this.notifyTelemetrySubscribers();
    }

        //======================================================
    // WebSocket Engine
    //======================================================

    //------------------------------------------------------
    // Start WebSocket
    //------------------------------------------------------

    private startWebSocket(): void
    {
        if (this.socket)
        {
            this.socket.close();
            this.socket = null;
        }

        if (!this.authToken)
        {
            console.warn(
                "[Cloud] Cannot start WebSocket without authentication."
            );

            return;
        }

        try
        {
            const url =
                `${WS_ENDPOINT}?token=${encodeURIComponent(this.authToken)}`;

            console.log(
                "[Cloud] Opening authenticated WebSocket"
            );

            this.socket = new WebSocket(url);

            this.socket.onopen =
                () =>
                {
                    console.log(
                        "[Cloud] WebSocket Connected"
                    );

                    this.connected = true;

                    this.connectionMode =
                        "cloud";

                    this.reconnectDelay =
                        RECONNECT_DELAY;

                    this.telemetry.network.websocketConnected =
                        true;

                    this.notifyConnectionSubscribers(
                        true
                    );

                    this.notifyTelemetrySubscribers();

                    this.startHeartbeat();
                };

            this.socket.onmessage =
                (event) =>
                {
                    this.handleSocketMessage(
                        event.data
                    );
                };

            this.socket.onerror =
                (event) =>
                {
                    console.error(
                        "[Cloud] WebSocket Error",
                        event
                    );
                };

            this.socket.onclose =
                () =>
                {
                    console.warn(
                        "[Cloud] WebSocket Closed"
                    );

                    this.connected = false;

                    this.telemetry.network.websocketConnected =
                        false;

                    this.notifyConnectionSubscribers(
                        false
                    );

                    this.notifyTelemetrySubscribers();

                    this.stopHeartbeat();

                    this.scheduleReconnect();
                };
        }
        catch (error)
        {
            console.error(
                "[Cloud] WebSocket Exception",
                error
            );

            this.scheduleReconnect();
        }
    }

    //------------------------------------------------------
    // Stop WebSocket
    //------------------------------------------------------

    private stopWebSocket(): void
    {
        this.stopHeartbeat();

        if (this.socket)
        {
            this.socket.close();

            this.socket = null;
        }
    }

    //------------------------------------------------------
    // Reconnect
    //------------------------------------------------------

    private scheduleReconnect(): void
    {
        if (this.reconnectTimer)
        {
            clearTimeout(
                this.reconnectTimer
            );
        }

        this.reconnectTimer =
            window.setTimeout(
                () =>
                {
                    console.log(
                        "[Cloud] Reconnecting..."
                    );

                    this.startWebSocket();
                },
                this.reconnectDelay
            );

        this.reconnectDelay =
            Math.min(
                this.reconnectDelay * 2,
                MAX_RECONNECT_DELAY
            );
    }

    //------------------------------------------------------
    // Heartbeat
    //------------------------------------------------------

    private startHeartbeat(): void
    {
        this.stopHeartbeat();

        this.heartbeatTimer =
            window.setInterval(
                () =>
                {
                    if (
                        this.socket &&
                        this.socket.readyState === WebSocket.OPEN
                    )
                    {
                        this.socket.send(
                            JSON.stringify({
                                type: "heartbeat",
                                timestamp: Date.now()
                            })
                        );
                    }
                },
                HEARTBEAT_INTERVAL
            );
    }

    //------------------------------------------------------

    private stopHeartbeat(): void
    {
        if (this.heartbeatTimer)
        {
            clearInterval(
                this.heartbeatTimer
            );

            this.heartbeatTimer = null;
        }
    }

    //------------------------------------------------------
    // Incoming Messages
    //------------------------------------------------------

    private handleSocketMessage(
        raw: string
    ): void
    {
        try
        {
            const message =
                JSON.parse(raw);

            switch (message.type)
            {
                case "telemetry":

                    this.telemetry =
                    {
                        ...this.telemetry,
                        ...message.data
                    };

                    this.notifyTelemetrySubscribers();

                    break;

                case "event":

                    this.notifyEventSubscribers(
                        message.message
                    );

                    break;

                case "connected":

                    console.log(
                        "[Cloud] Device Connected"
                    );

                    break;

                default:

                    console.log(
                        "[Cloud] WS",
                        message
                    );

                    break;
            }
        }
        catch (error)
        {
            console.error(
                "[Cloud] Invalid WebSocket Message",
                error
            );
        }
    }

         //======================================================
    // Local REST API
    //======================================================

    private async localRequest<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T>
    {
        if (!this.localIP)
        {
            throw new Error(
                "No local device connected."
            );
        }

        const controller =
            new AbortController();

        const timeout =
            window.setTimeout(
                () => controller.abort(),
                REQUEST_TIMEOUT
            );

        try
        {
            const response =
                await fetch(
                    `http://${this.localIP}${endpoint}`,
                    {
                        ...options,
                        signal: controller.signal,
                        headers:
                        {
                            "Content-Type":
                                "application/json",
                            ...(options.headers ?? {})
                        }
                    }
                );

            if (!response.ok)
            {
                throw new Error(
                    `${response.status} ${response.statusText}`
                );
            }

            return await response.json();
        }
        finally
        {
            clearTimeout(timeout);
        }
    }

        //======================================================
    // Offline Command Queue
    //======================================================

    private async queueCommand(
        command: CommandType
    ): Promise<void>
    {
        if (!this.currentDeviceId)
        {
            return;
        }

        this.commandQueue.push(
        {
            commandId:
                crypto.randomUUID(),

            deviceId:
                this.currentDeviceId,

            command,

            timestamp:
                new Date().toISOString(),

            status:
                "queued"
        });

        console.log(
            `[Queue] ${command} queued`
        );
    }

    //------------------------------------------------------

    public getQueuedCommands():
        readonly CloudCommand[]
    {
        return this.commandQueue;
    }

    //------------------------------------------------------

    public clearQueue(): void
    {
        this.commandQueue = [];
    }

    //------------------------------------------------------

    public async processQueue():
        Promise<void>
    {
        if (this.processingQueue)
        {
            return;
        }

        this.processingQueue = true;

        try
        {
            while (
                this.commandQueue.length > 0 &&
                (
                    this.connected ||
                    this.localConnected
                )
            )
            {
                const item =
                    this.commandQueue[0];

                const success =
                    await this.sendCommand(
                        item.deviceId,
                        item.command
                    );

                if (!success)
                {
                    break;
                }

                item.status =
                    "delivered";

                this.commandQueue.shift();

                console.log(
                    `[Queue] Sent ${item.command}`
                );
            }
        }
        finally
        {
            this.processingQueue = false;
        }
    }

    //------------------------------------------------------

    private async sendOrQueue(
        command: CommandType
    ): Promise<boolean>
    {
        if (
            this.connected ||
            this.localConnected
        )
        {
            const ok =
                await this.sendCommand(
                    command
                );

            if (ok)
            {
                return true;
            }
        }

        await this.queueCommand(
            command
        );

        return false;
    }

        //======================================================
    // OTA Update Manager
    //======================================================

    private updateAvailable = false;

    private updateInProgress = false;

    private updateProgress = 0;

    private availableVersion: string | null = null;

    //------------------------------------------------------

    public hasUpdate(): boolean
    {
        return this.updateAvailable;
    }

    //------------------------------------------------------

    public isUpdating(): boolean
    {
        return this.updateInProgress;
    }

    //------------------------------------------------------

    public getUpdateProgress(): number
    {
        return this.updateProgress;
    }

    //------------------------------------------------------

    public getAvailableVersion():
        string | null
    {
        return this.availableVersion;
    }

    //------------------------------------------------------

    public async checkForFirmwareUpdate():
        Promise<boolean>
    {
        if (!this.currentDevice)
        {
            return false;
        }

        try
        {
            const result =
                await this.request<{
                    available: boolean;
                    version: string;
                }>(
                    `/api/device/${this.currentDevice.deviceId}/firmware/check`
                );

            this.updateAvailable =
                result.available;

            this.availableVersion =
                result.version;

            return result.available;
        }
        catch (error)
        {
            console.error(
                "[OTA] Version check failed.",
                error
            );

            return false;
        }
    }

    //------------------------------------------------------

    public async startFirmwareUpdate():
        Promise<boolean>
    {
        if (!this.currentDevice)
        {
            return false;
        }

        this.updateInProgress = true;

        this.updateProgress = 0;

        try
        {
            await this.request(
                `/api/device/${this.currentDevice.deviceId}/firmware/update`,
                {
                    method: "POST"
                }
            );

            return true;
        }
        catch (error)
        {
            console.error(
                "[OTA] Update failed.",
                error
            );

            this.updateInProgress = false;

            return false;
        }
    }

    //------------------------------------------------------

    private updateFirmwareProgress(
        progress: number
    ): void
    {
        this.updateProgress =
            Math.max(
                0,
                Math.min(
                    progress,
                    100
                )
            );

        if (
            this.updateProgress >= 100
        )
        {
            this.updateInProgress = false;

            this.updateAvailable = false;
        }
    }

    //------------------------------------------------------

    public async waitForReconnect():
        Promise<boolean>
    {
        const timeout =
            Date.now() + 120000;

        while (
            Date.now() < timeout
        )
        {
            if (
                await this.ping()
            )
            {
                await this.refreshStatus();

                return true;
            }

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        2000
                    )
            );
        }

        return false;
    }

    //------------------------------------------------------
    // ESP32 Status
    //------------------------------------------------------

    public async getLocalStatus():
        Promise<DeviceTelemetry>
    {
        const telemetry =
            await this.localRequest<DeviceTelemetry>(
                "/status"
            );

        this.telemetry =
        {
            ...this.telemetry,
            ...telemetry
        };

        this.notifyTelemetrySubscribers();

        return this.telemetry;
    }

    //------------------------------------------------------
    // Diagnostics
    //------------------------------------------------------

    public async getDiagnostics():
    Promise<DiagnosticStatus>
{
    return await this.localRequest<DiagnosticStatus>(
        "/diagnostics"
    );
}

    //------------------------------------------------------
    // Calibration
    //------------------------------------------------------

    public async startCalibration():
        Promise<boolean>
    {
        await this.localRequest(
            "/api/calibration",
            {
                method: "POST"
            }
        );

        return true;
    }

    //------------------------------------------------------

    public async getCalibrationStatus():
    Promise<CalibrationStatus>
{
    return await this.localRequest<CalibrationStatus>(
        "/api/calibration/status"
    );
}

    //------------------------------------------------------
    // WiFi Scan
    //------------------------------------------------------

    public async scanWifiNetworks():
    Promise<WifiNetwork[]>
{
    return await this.localRequest<WifiNetwork[]>(
        "/scan"
    );
}

    //------------------------------------------------------
    // Save WiFi Credentials
    //------------------------------------------------------

    public async saveWifiCredentials(
        ssid: string,
        password: string
    ): Promise<boolean>
    {
        await this.localRequest(
            "/save",
            {
                method: "POST",

                body: JSON.stringify({
                    ssid,
                    password
                })
            }
        );

        return true;
    }

    //------------------------------------------------------
    // Reset WiFi
    //------------------------------------------------------

    public async resetWifi():
        Promise<boolean>
    {
        await this.localRequest(
            "/resetwifi",
            {
                method: "POST"
            }
        );

        this.localConnected = false;
        this.localIP = null;

        return true;
    }

}

    export const cloudService =
    new CloudService();

export default cloudService;   












