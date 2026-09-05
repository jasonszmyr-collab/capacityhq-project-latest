/******************************************************************************
 *
 * HonorPole Mobile Application
 * File: telemetry.ts
 * Version: 3.0.0
 *
 * Shared telemetry models used throughout the HonorPole application.
 *
 ******************************************************************************/

//======================================================
// Device Movement
//======================================================

export type MovementState =
    | "STOPPED"
    | "RAISING"
    | "LOWERING"
    | "HALF"
    | "CALIBRATING"
    | "ERROR";

//======================================================
// Network
//======================================================

export interface NetworkStatus
{
    wifiConnected: boolean;

    cloudConnected: boolean;

    websocketConnected: boolean;

    ssid: string;

    ipAddress: string;

    signalStrength: number;
}

//======================================================
// Device Health
//======================================================

export interface DeviceHealth
{
    batteryVoltage: number;

    motorCurrent: number;

    cpuTemperature: number;

    freeMemory: number;

    uptime: number;

    lastHeartbeat: string;
}

//======================================================
// Honor Directives
//======================================================

export interface DirectiveStatus
{
    federal: string;

    state: string;

    source: string;

    updated: string;
}

//======================================================
// Event Log
//======================================================

export type EventLevel =
    | "INFO"
    | "WARNING"
    | "ERROR";

export interface EventItem
{
    id: number;

    time: string;

    level: EventLevel;

    message: string;
}

//======================================================
// Main Telemetry
//======================================================

export interface DeviceTelemetry
{
    //--------------------------------------------------
    // Device
    //--------------------------------------------------

    online: boolean;

    firmware: string;

    hardware: string;

    serialNumber: string;

    deviceName: string;

    //--------------------------------------------------
    // Position
    //--------------------------------------------------

    currentPosition: number;

    targetPosition: number;

    learnedTopPosition: number;

    movement: MovementState;

    moving: boolean;

    automaticMode: boolean;

    calibrated: boolean;

    //--------------------------------------------------
    // Commands
    //--------------------------------------------------

    commandStatus: string;

    //--------------------------------------------------
    // Network
    //--------------------------------------------------

    network: NetworkStatus;

    //--------------------------------------------------
    // Health
    //--------------------------------------------------

    health: DeviceHealth;

    //--------------------------------------------------
    // Directives
    //--------------------------------------------------

    directives: DirectiveStatus;

    //--------------------------------------------------
    // Events
    //--------------------------------------------------

    events: EventItem[];
}

//======================================================
// Default Telemetry
//======================================================

export const DefaultTelemetry: DeviceTelemetry =
{
    online: false,

    firmware: "--",

    hardware: "ESP32-S3",

    serialNumber: "HP-001",

    deviceName: "HonorPole",

    currentPosition: 0,

    targetPosition: 0,

    learnedTopPosition: 8000,

    movement: "STOPPED",

    moving: false,

    automaticMode: true,

    calibrated: false,

    commandStatus: "Idle",

    network:
    {
        wifiConnected: false,

        cloudConnected: false,

        websocketConnected: false,

        ssid: "--",

        ipAddress: "--",

        signalStrength: 0
    },

    health:
    {
        batteryVoltage: 0,

        motorCurrent: 0,

        cpuTemperature: 0,

        freeMemory: 0,

        uptime: 0,

        lastHeartbeat: "--"
    },

    directives:
    {
        federal: "None",

        state: "None",

        source: "halfstaff.org",

        updated: "--"
    },

    events: []
};