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
 *  Ã¢â‚¬Â¢ Authentication
 *  Ã¢â‚¬Â¢ Device Discovery
 *  Ã¢â‚¬Â¢ Cloud API
 *  Ã¢â‚¬Â¢ Local ESP32 API
 *  Ã¢â‚¬Â¢ WebSocket Telemetry
 *  Ã¢â‚¬Â¢ Offline Queue
 *  Ã¢â‚¬Â¢ OTA
 *  Ã¢â‚¬Â¢ Legacy Compatibility Layer
 *
 ******************************************************************************/

//======================================================================
// Imports
//======================================================================

import type { DeviceTelemetry } from "../types/telemetry";
import { DefaultTelemetry } from "../types/telemetry";

import { discovery } from "./deviceDiscovery";
import { requireLocalIdentity, LocalIdentityError } from "./localDeviceIdentity";
import { setupReservationMessage } from "./setupReservationMessage";
import { CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { commandReply, commandFailure, CommandHttpError, type CommandDispatchResult } from "./commandResponse";

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
    role?: string | null;
    deviceId: string;

    deviceName: string;

    firmware: string;

    serialNumber: string;

    ipAddress?: string;

    macAddress?: string;

    online: boolean;

    lastSeen: string;

    signalStrength?: number;

    city?: string;
    state?: string;
    zipCode?: string;
    county?: string;
    timezone?: string;
    latitude?: number | null;
    longitude?: number | null;
    country?: string;
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
    private authRevision = 0;
    // Local setup credentials follow login identity, not access-token rotation.
    private setupAuthRevision = 0;
    private connectionRequested = false;
    private authBlocked = false;
    private sessionRecovery: (() => Promise<boolean>) | null = null;
    private recoveryPending: Promise<boolean> | null = null;
    private transportStartTimer: number | null = null;

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
private telemetry: DeviceTelemetry = structuredClone(DefaultTelemetry);

//--------------------------------------------------
// Connection State
//--------------------------------------------------

private connected = false;

private localConnected = false;

private localIP: string | null = null;
private selectionRevision = 0;

private connectionMode: ConnectionMode = "offline";

// Then the polling methods
private startTelemetryPolling(): void
{
    this.stopTelemetryPolling();

    const poll =
        async () =>
        {
            if (!this.authToken || !this.userId || this.authBlocked || !this.connectionRequested) return;
            const selectedId = this.currentDeviceId;
            const revision = this.selectionRevision;
            const authRevision = this.authRevision;
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

                const deviceId =
    this.currentDeviceId;

if (!deviceId)
{
    this.connected = false;
    this.connectionMode = "offline";

    this.notifyConnectionSubscribers(false);
    return;
}

const telemetry =
    await this.getDeviceStatus(deviceId);

                this.requireSelection(selectedId, revision);
                if (authRevision !== this.authRevision || !this.connectionRequested) return;
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
                if (selectedId !== this.currentDeviceId || revision !== this.selectionRevision ||
                    authRevision !== this.authRevision || !this.connectionRequested || this.authBlocked) return;
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
    private commandReplayPaused = false;

    //--------------------------------------------------
    // Constructor
    //--------------------------------------------------

    constructor()
    {
        this.selectionRevision++;
        this.clearLocalConnection();
        this.authToken = null;

        this.refreshToken =
            localStorage.getItem(
                "cloud_refresh_token"
            );

        this.userId =
    localStorage.getItem(
        "cloud_user_id"
    );

this.currentDeviceId =
    localStorage.getItem(
        "honorpole_selected_device_id"
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

    public setSessionRecoveryHandler(handler: (() => Promise<boolean>) | null): void
    {
        this.sessionRecovery = handler;
    }

    // Apply identity and token together so another account cannot inherit a pole.
    public setAuthentication(token: string, userId: string): void
    {
        if (!token || !userId) { this.clearAuthentication(); return; }
        if (this.userId && this.userId !== userId) this.clearAuthentication();
        const changed = this.authToken !== token || this.userId !== userId;
        if (this.userId !== userId) this.setupAuthRevision++;
        this.authToken = token;
        this.userId = userId;
        localStorage.setItem("cloud_auth_token", token);
        localStorage.setItem("cloud_user_id", userId);
        if (!changed) return;
        this.authRevision++;
        this.authBlocked = false;
        this.stopCloudTransport();
        this.resumeCloudTransport();
    }

    public setAuthToken(token: string): void
    {
        if (this.userId) this.setAuthentication(token, this.userId);
        else { this.authToken = token; localStorage.setItem("cloud_auth_token", token); }
    }

    public getRefreshToken(): string | null { return this.refreshToken; }
    public setRefreshToken(token: string): void
    {
        this.refreshToken = token;
        localStorage.setItem("cloud_refresh_token", token);
    }
    public getUserId(): string | null { return this.userId; }
    public setUserId(userId: string): void
    {
        if (this.authToken) this.setAuthentication(this.authToken, userId);
        else {
            if (this.userId !== userId) this.setupAuthRevision++;
            this.userId = userId; localStorage.setItem("cloud_user_id", userId);
        }
    }

    public clearAuthentication(): void
    {
        this.setupAuthRevision++;
        this.authRevision++;
        this.authToken = null;
        this.refreshToken = null;
        this.userId = null;
        this.connectionRequested = false;
        this.authBlocked = false;
        this.recoveryPending = null;
        this.disconnect();
        this.clearCurrentDevice();
        this.devices.clear();
        this.commandQueue = [];
        this.commandReplayPaused = true;
        this.telemetry = structuredClone(DefaultTelemetry);
        for (const key of ["cloud_auth_token", "cloud_refresh_token", "cloud_user_id",
            "honorpole_selected_device_id"]) localStorage.removeItem(key);
        this.notifyTelemetrySubscribers();
    }

    private stopCloudTransport(): void
    {
        if (this.transportStartTimer !== null) clearTimeout(this.transportStartTimer);
        this.transportStartTimer = null;
        this.stopTelemetryPolling();
        if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.stopWebSocket();
        this.connected = false;
        this.connectionMode = "offline";
        this.telemetry.online = false;
        this.telemetry.network.websocketConnected = false;
        this.notifyConnectionSubscribers(false);
        this.notifyTelemetrySubscribers();
    }

    private resumeCloudTransport(): void
    {
        if (!this.connectionRequested || !this.isAuthenticated() ||
            !this.currentDeviceId || this.authBlocked) return;
        if (this.transportStartTimer !== null) clearTimeout(this.transportStartTimer);
        // Run after Supabase's synchronous auth callback has returned.
        this.transportStartTimer = window.setTimeout(() => {
            this.transportStartTimer = null;
            if (!this.connectionRequested || !this.isAuthenticated() ||
                !this.currentDeviceId || this.authBlocked) return;
            this.startWebSocket();
            this.startTelemetryPolling();
            // Token renewal never replays pending movement commands.
        }, 0);
    }

    private async recoverAuthentication(failedToken: string, revision: number): Promise<boolean>
    {
        if (revision !== this.authRevision) return this.isAuthenticated() && !this.authBlocked;
        if (this.recoveryPending) return this.recoveryPending;
        const userId = this.userId;
        this.authBlocked = true;
        this.stopCloudTransport();
        const pending = (async () => {
            let recovered = false;
            try { recovered = await this.sessionRecovery?.() === true; } catch { /* Stay paused. */ }
            // Ignore completions after sign-out or an account switch.
            if (!this.authToken || this.userId !== userId) return false;
            if (revision !== this.authRevision) return !this.authBlocked;
            if (recovered && this.authToken !== failedToken) {
                this.authBlocked = false;
                this.resumeCloudTransport();
                return true;
            }
            this.notifyEventSubscribers("Cloud login needs attention. Sign out and sign in again.");
            return false;
        })();
        this.recoveryPending = pending;
        try { return await pending; }
        finally { if (this.recoveryPending === pending) this.recoveryPending = null; }
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
        options: RequestInit = {},
        allowAuthRetry = true
    ): Promise<T>
    {
        if (!this.isAuthenticated() || this.authBlocked) {
            throw new CommandHttpError(401, {error: "Sign in to use cloud control."}, "");
        }
        const token = this.authToken!;
        const revision = this.authRevision;
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

                let body: unknown = null;
                try { body = JSON.parse(text); } catch { /* Non-JSON error body. */ }
                if (response.status === 401 && revision === this.authRevision) {
                    if (allowAuthRetry) {
                        const recovery = this.recoverAuthentication(token, revision);
                        const method = (options.method || "GET").toUpperCase();
                        if (method === "GET" || method === "HEAD") {
                            if (await recovery && this.userId && this.authToken) {
                                return this.request<T>(endpoint, options, false);
                            }
                        } else {
                            void recovery; // The refused write is never resubmitted.
                        }
                    } else {
                        this.authBlocked = true;
                        this.stopCloudTransport();
                    }
                }
                const failure = new CommandHttpError(response.status, body, text);
                if (response.status === 409 &&
                    /^\/api\/device\/HP-\d{3,6}\/setup$/.test(endpoint)) {
                    const reason = (body as { error?: unknown } | null)?.error;
                    const knownReasons = [
                        "Phone setup firmware is not available on this pole",
                        "Pole must be online and idle with no pending command",
                        "A setup request already exists; wait for it to expire"
                    ];
                    if (typeof reason === "string" && knownReasons.includes(reason)) {
                        Object.assign(failure, { setupReason: setupReservationMessage(body) ?? reason });
                    }
                }
                throw failure;
            }

            const result = await response.json();
            if (revision !== this.authRevision || !this.isAuthenticated()) {
                throw new CommandHttpError(401, {error: "Login changed while reading cloud data."}, "");
            }
            return result;
        }

        finally
        {
            clearTimeout(timeout);
        }
    }

    //======================================================
    // Device Management
    //======================================================

    private getLocalIpPreferenceKey(
        deviceId: string
    ): string
    {
        return `honorpole_last_ip_${deviceId}`;
    }

    //------------------------------------------------------

    public setDevice(
    device: DeviceInfo
): void
{
    const deviceChanged =
        this.currentDeviceId !== device.deviceId;

    this.currentDevice = device;
    this.currentDeviceId = device.deviceId;

    this.devices.set(
        device.deviceId,
        device
    );

    localStorage.setItem(
        "honorpole_selected_device_id",
        device.deviceId
    );

    if (deviceChanged)
    {
        this.selectionRevision++;
        // A LAN address belongs to one physical pole only. Never carry
        // the previous pole's local connection across a selection change.
        this.localConnected = false;
        this.localIP = null;

        this.telemetry =
        {
            ...structuredClone(DefaultTelemetry),
            deviceName: device.deviceName,
            firmware: device.firmware,
            serialNumber: device.serialNumber
        };

        this.notifyTelemetrySubscribers();

        this.stopCloudTransport();
        this.resumeCloudTransport();
    }
}

    //------------------------------------------------------

    public getCurrentDevice():
        DeviceInfo | null
    {
        return this.currentDevice;
    }

    //------------------------------------------------------

    public getProtectedSetupScope(): string {
        return `${this.userId ?? ""}:${this.setupAuthRevision}:${this.selectionRevision}:${this.currentDeviceId ?? ""}`;
    }

    public async requestProtectedSetup(deviceId: string, requestId?: string): Promise<unknown> {
        const scope = this.getProtectedSetupScope();
        if (!this.isAuthenticated() || deviceId !== this.currentDeviceId) throw new Error("Select a pole and sign in first.");
        const endpoint = `/api/device/${encodeURIComponent(deviceId)}/setup` +
            (requestId ? `/${encodeURIComponent(requestId)}` : "");
        const result = await this.request<unknown>(endpoint, { method: requestId ? "GET" : "POST" }, false);
        if (scope !== this.getProtectedSetupScope()) throw new Error("Pole or login changed during setup.");
        return result;
    }

    public getCurrentDeviceId():
        string | null
    {
        return this.currentDeviceId;
    }

    //------------------------------------------------------

    public clearCurrentDevice(): void
    {
        this.selectionRevision++;
        this.currentDevice = null;
        this.currentDeviceId = null;
        this.localConnected = false;
        this.localIP = null;
        this.stopCloudTransport();
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

    public async createShareCode(deviceId: string): Promise<{ deviceId: string; code: string; expiresAt: string }> {
        return this.request(`/api/device/${encodeURIComponent(deviceId)}/share`, { method: "POST" });
    }

    public async joinSharedDevice(code: string): Promise<string> {
        const result = await this.request<{ deviceId: string }>("/api/device/share/claim", {
            method: "POST",
            body: JSON.stringify({ code: code.trim().toUpperCase() })
        });
        this.devices.clear();
        const devices = await this.getDevices();
        const device = devices.find(item => item.deviceId === result.deviceId);
        if (device) this.setDevice(device);
        return result.deviceId;
    }

    //------------------------------------------------------

    public registerDevice(
        device: DeviceInfo
    ): Promise<void>;

    public registerDevice(
        pairingCode: string,
        deviceName: string,
        deviceId?: string
    ): Promise<DeviceInfo>;

    public async registerDevice(
        value1: DeviceInfo | string,
        value2?: string,
        deviceId?: string
    ): Promise<DeviceInfo | void>
    {
        //--------------------------------------------------
        // Existing Device
        //--------------------------------------------------

        if (typeof value1 !== "string")
        {
            this.setDevice(value1);

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
                        deviceName: value2,
                        deviceId
                    })
                }
            );

        this.setDevice(device);

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
        ip: string, deviceId: string
    ): void
    {
        if (deviceId !== this.currentDeviceId) throw new LocalIdentityError("Selected HonorPole changed. Retry for the current device.");
        this.localConnected = true;
        this.localIP = ip;
        this.connectionMode = "local";

        if (this.currentDeviceId)
        {
            void Preferences.set({
                key: this.getLocalIpPreferenceKey(
                    this.currentDeviceId
                ),
                value: ip
            });
        }

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

    public async sendCommand(value1: string, value2?: CommandType): Promise<boolean>
    {
        // Legacy callers receive submission status, never proof of motion.
        return (await this.sendCommandResult(value1, value2)).success;
    }

    public async sendCommandResult(
        value1: string, value2?: CommandType
    ): Promise<CommandDispatchResult>
    {
        const deviceId = value2 === undefined ? this.currentDeviceId : value1;
        const command = value2 === undefined ? value1 as CommandType : value2;
        if (!deviceId) {
            return { success: false, stage: "rejected", message: "Select an HonorPole before sending a command." };
        }

        if (command === "stop" && deviceId === this.currentDeviceId &&
            (!this.localConnected || !this.localIP)) {
            try {
                const saved = await Preferences.get({ key: this.getLocalIpPreferenceKey(deviceId) });
                if (saved.value && deviceId === this.currentDeviceId) {
                    this.localIP = saved.value.replace("http://", "");
                    this.localConnected = true;
                }
            } catch {
                // A preferences failure must not block the cloud STOP.
            }
        }

        const useLocal = deviceId === this.currentDeviceId && this.localConnected && this.localIP;
        if (command === "stop" && useLocal) {
            // Start BOTH routes before awaiting either. A stale LAN IP cannot delay cloud STOP.
            const local = this.sendLocalCommandResult(deviceId, command);
            const cloud = this.sendCloudCommandResult(deviceId, command);
            return new Promise<CommandDispatchResult>(resolve => {
                let failedRoutes = 0;
                let localResult: CommandDispatchResult | null = null;
                let cloudResult: CommandDispatchResult | null = null;
                const finish = () => {
                    if (++failedRoutes !== 2 || !cloudResult) return;
                    resolve(localResult?.stage === "rejected" && cloudResult.stage === "rejected"
                        ? { ...cloudResult, message: `STOP rejected. Cloud: ${cloudResult.message} Local: ${localResult.message}` }
                        : cloudResult);
                };
                void local.then(result => {
                    localResult = result;
                    if (result?.success) resolve(result); else finish();
                });
                void cloud.then(result => {
                    cloudResult = result;
                    if (result.success) resolve(result); else finish();
                });
            });
        }

        if (useLocal) {
            const localResult = await this.sendLocalCommandResult(deviceId, command);
            // A definitive local refusal or ambiguous success must NOT be resubmitted in the cloud.
            if (localResult) return localResult;
        }
        return this.sendCloudCommandResult(deviceId, command);
    }

    public async getCommandDeliveryStatus(deviceId: string): Promise<unknown>
    {
        if (!/^HP-[0-9]{3,6}$/.test(deviceId)) throw new Error("Invalid HonorPole ID.");
        return this.request<unknown>(`/api/device/${encodeURIComponent(deviceId)}/status`);
    }

    private async sendCloudCommandResult(
        deviceId: string, command: CommandType
    ): Promise<CommandDispatchResult>
    {
        try {
            const payload = await this.request<unknown>(
                `/api/device/${encodeURIComponent(deviceId)}/command`,
                { method: "POST", body: JSON.stringify({ command }) }
            );
            return commandReply(payload, "cloud", deviceId, command);
        } catch (error) {
            return commandFailure(error, command);
        }
    }

    private async sendLocalCommandResult(
        deviceId: string, command: CommandType
    ): Promise<CommandDispatchResult | null>
    {
        const localIP = this.localIP;
        if (!localIP) return null;
        const revision = this.selectionRevision;
        try {
            await this.checkedLocalStatus(localIP, deviceId, revision);
            this.requireSelection(deviceId, revision);
            const response = await CapacitorHttp.request({
                method: "POST", url: `http://${localIP}/api/command`,
                headers: { "Content-Type": "application/json" },
                data: { command }, connectTimeout: 1000, readTimeout: 1000
            });
            // Unsupported local endpoint: preserve the existing cloud fallback.
            if (response.status === 404 || response.status === 405) return null;
            if (response.status < 200 || response.status >= 300) {
                return commandFailure(new CommandHttpError(response.status, response.data, ""), command);
            }
            return commandReply(response.data, "local", deviceId, command);
        } catch (error) {
            if (error instanceof LocalIdentityError) return { success: false, stage: "rejected", message: error.message };
            // Preserve transport fallback. A lost local response can still mean execution;
            // neither route is described as accepted or completed.
            return null;
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
        const deviceId = this.currentDeviceId;
        const revision = this.selectionRevision;
        if (!deviceId) return false;
        try
        {
            const found =
                await discovery.discover(deviceId);

            if (!found)
            {
                console.warn(
                    "[Cloud] No HonorPole Found."
                );

                return false;
            }

            this.requireSelection(deviceId, revision);
            requireLocalIdentity(found, deviceId);
            this.setLocalConnection(found.ip, deviceId);

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
        if (!this.isAuthenticated() || !this.currentDeviceId || this.authBlocked) return false;
        if (this.connectionRequested) return this.connected;
        this.connectionRequested = true;
        this.resumeCloudTransport();
        return false; // A request to connect is not confirmation of device connectivity.
    }

    //------------------------------------------------------
    // Disconnect
    //------------------------------------------------------

    public disconnect(): void
    {
        this.connectionRequested = false;
        this.localConnected = false;
        this.localIP = null;
        this.stopCloudTransport();
    }

    //------------------------------------------------------
    // Refresh Device Status
    //------------------------------------------------------

    public async refreshStatus():
        Promise<void>
    {
        const deviceId = this.currentDeviceId;
        const revision = this.selectionRevision;
        if (!this.localIP || !deviceId) return;
        try
        {
            const status = await this.localRequest<any>("/status");
            this.requireSelection(deviceId, revision);
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
            if (deviceId !== this.currentDeviceId || revision !== this.selectionRevision) return;
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
        try { await this.localRequest("/status"); return true; }
        catch { return false; }
    }
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
        this.stopWebSocket();
        if (!this.connectionRequested || !this.isAuthenticated() ||
            !this.currentDeviceId || this.authBlocked) return;
        const token = this.authToken!;
        const revision = this.authRevision;
        const deviceId = this.currentDeviceId;
        try {
            const socket = new WebSocket(`${WS_ENDPOINT}?token=${encodeURIComponent(token)}` +
                `&deviceId=${encodeURIComponent(deviceId)}`);
            this.socket = socket;
            const current = () => this.socket === socket && this.connectionRequested &&
                revision === this.authRevision && deviceId === this.currentDeviceId && !this.authBlocked;
            socket.onopen = () => {
                if (!current()) return;
                this.reconnectDelay = RECONNECT_DELAY;
                this.telemetry.network.websocketConnected = true;
                this.notifyTelemetrySubscribers();
                this.startHeartbeat();
                // Telemetry determines device Online; socket OPEN alone does not.
            };
            socket.onmessage = event => {
                if (current()) this.handleSocketMessage(event.data);
            };
            socket.onerror = () => {
                if (current()) console.warn("[Cloud] WebSocket transport unavailable.");
            };
            socket.onclose = event => {
                if (!current()) return;
                this.socket = null;
                this.telemetry.network.websocketConnected = false;
                this.stopHeartbeat();
                this.connected = false;
                this.connectionMode = "offline";
                this.notifyConnectionSubscribers(false);
                this.notifyTelemetrySubscribers();
                // 1008 can also mean revoked membership. Never renew/replay commands here.
                // The authenticated status read supplies the HTTP 401 vs 403 distinction.
                this.scheduleReconnect(event.code === 1008 ? 10000 : undefined);
            };
        } catch {
            console.warn("[Cloud] WebSocket could not start.");
            this.scheduleReconnect();
        }
    }

    private stopWebSocket(): void
    {
        this.stopHeartbeat();
        const socket = this.socket;
        this.socket = null;
        if (socket) {
            socket.onopen = null;
            socket.onmessage = null;
            socket.onerror = null;
            socket.onclose = null;
            socket.close();
        }
    }

    private scheduleReconnect(delay?: number): void
    {
        if (!this.connectionRequested || !this.isAuthenticated() ||
            !this.currentDeviceId || this.authBlocked) return;
        if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.startWebSocket();
        }, delay ?? this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
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
{
    const messageDeviceId =
        typeof message.deviceId === "string"
            ? message.deviceId
            : typeof message.data?.deviceId === "string"
                ? message.data.deviceId
                : null;

    if (
        !this.currentDeviceId ||
        messageDeviceId !== this.currentDeviceId ||
        (typeof message.data?.deviceId === "string" && message.data.deviceId !== this.currentDeviceId)
    )
    {
        break;
    }

    this.telemetry =
    {
        ...this.telemetry,
        ...message.data
    };

    this.connected = this.telemetry.online === true;
    this.connectionMode = this.connected ? "cloud" : "offline";
    this.notifyConnectionSubscribers(this.connected);
    this.notifyTelemetrySubscribers();

    break;
}

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

    public async resetDeviceWiFi(): Promise<void>
    {
        const deviceId = this.currentDeviceId;
        const revision = this.selectionRevision;
        if (!deviceId) throw new LocalIdentityError("No HonorPole selected.");
        let deviceIP = this.localIP;
        if (!deviceIP) {
            const saved = await Preferences.get({ key: this.getLocalIpPreferenceKey(deviceId) });
            deviceIP = saved.value?.replace(/^https?:\/\//, "") ?? null;
        }
        if (!deviceIP) {
            try {
                const status = await this.getDeviceStatus(deviceId);
                const ip = status.network?.ipAddress;
                if (ip && ip !== "--") deviceIP = ip.replace(/^https?:\/\//, "");
            } catch { /* A failed cloud read does not authorize a local write. */ }
        }
        this.requireSelection(deviceId, revision);
        if (!deviceIP) deviceIP = (await discovery.discover(deviceId))?.ip ?? null;
        if (!deviceIP) throw new Error("Selected HonorPole could not be found on the local WiFi network.");
        await this.checkedLocalStatus(deviceIP, deviceId, revision);
        this.requireSelection(deviceId, revision);
        const response = await CapacitorHttp.request({
            method: "POST", url: `http://${deviceIP}/resetwifi`,
            headers: { "Content-Type": "application/json" },
            connectTimeout: 3000, readTimeout: 3000
        });
        if (response.status < 200 || response.status >= 300 || response.data?.success === false) {
            throw new Error(`HonorPole rejected the WiFi reset (${response.status}).`);
        }
        await Preferences.remove({ key: this.getLocalIpPreferenceKey(deviceId) });
        // A request already sent cannot be recalled; never clear a newly selected pole.
        if (deviceId === this.currentDeviceId && revision === this.selectionRevision) {
            this.clearLocalConnection();
        }
    }

    private requireSelection(deviceId: string | null, revision: number): void {
        if (!deviceId || deviceId !== this.currentDeviceId || revision !== this.selectionRevision) {
            throw new LocalIdentityError("Selected HonorPole changed. Retry for the current device.");
        }
    }

    private async checkedLocalStatus(ip: string, deviceId: string | null, revision: number): Promise<any> {
        this.requireSelection(deviceId, revision);
        const response = await CapacitorHttp.request({
            method: "GET", url: `http://${ip}/status`, connectTimeout: 1000, readTimeout: 1000
        });
        this.requireSelection(deviceId, revision);
        if (response.status !== 200) throw new Error("Unable to read selected HonorPole identity.");
        return requireLocalIdentity(response.data, deviceId);
    }

    //------------------------------------------------------
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

        const ip = this.localIP;
        const deviceId = this.currentDeviceId;
        const revision = this.selectionRevision;
        const status = await this.checkedLocalStatus(ip, deviceId, revision);
        this.requireSelection(deviceId, revision);
        if (endpoint === "/status") return status as T;
        if (this.localIP !== ip) throw new LocalIdentityError("Local connection changed. Retry for the current device.");
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
                    `http://${ip}${endpoint}`,
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

            const result = await response.json();
            this.requireSelection(deviceId, revision);
            if ((options.method ?? "GET").toUpperCase() !== "GET" &&
                (result?.success === false || result?.ok === false || result?.error)) {
                throw new Error(typeof result.error === "string" ? result.error : "Local request was refused.");
            }
            return result;
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
        this.commandReplayPaused = false;
    }

    //------------------------------------------------------

    public async processQueue():
        Promise<void>
    {
        if (this.processingQueue || this.commandReplayPaused)
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

                const result = await this.sendCommandResult(item.deviceId, item.command);
                if (!result.success) {
                    item.status = "failed";
                    this.commandQueue.shift();
                    // Stop replay on uncertainty. Never automatically retry an ambiguous submission.
                    if (result.stage === "unknown") {
                        this.commandReplayPaused = true;
                        break;
                    }
                    continue;
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
            const result = await this.sendCommandResult(command);
            return result.success;
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
        const deviceId = this.currentDeviceId;
        const revision = this.selectionRevision;
        const telemetry =
            await this.localRequest<DeviceTelemetry>(
                "/status"
            );

        this.requireSelection(deviceId, revision);
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
        const deviceId = this.currentDeviceId;
        const revision = this.selectionRevision;
        await this.localRequest(
            "/resetwifi",
            {
                method: "POST"
            }
        );

        this.requireSelection(deviceId, revision);
        this.clearLocalConnection();

        return true;
    }

}

    export const cloudService =
    new CloudService();

export default cloudService;   











