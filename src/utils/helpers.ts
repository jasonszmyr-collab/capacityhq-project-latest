/******************************************************************************
 *
 * HonorPole Mobile Application
 * File: helpers.ts
 * Version: 3.0.0
 *
 * Shared helper functions.
 *
 ******************************************************************************/

import type {
    DeviceTelemetry,
    EventItem,
    EventLevel,
    MovementState
} from "../types/telemetry";

//======================================================
// Position
//======================================================

export function getPositionPercent(
    current:number,
    maximum:number
):number
{
    if(maximum <= 0)
        return 0;

    const percent =
        (current / maximum) * 100;

    return Math.max(
        0,
        Math.min(
            100,
            Math.round(percent)
        )
    );
}

//======================================================
// Movement
//======================================================

export function isMoving(
    movement:MovementState
):boolean
{
    return (
        movement === "RAISING" ||
        movement === "LOWERING" ||
        movement === "CALIBRATING"
    );
}

export function movementColor(
    movement:MovementState
):string
{
    switch(movement)
    {
        case "RAISING":
            return "text-blue-400";

        case "LOWERING":
            return "text-yellow-400";

        case "HALF":
            return "text-purple-400";

        case "CALIBRATING":
            return "text-orange-400";

        case "ERROR":
            return "text-red-500";

        default:
            return "text-green-400";
    }
}

//======================================================
// Network
//======================================================

export function signalQuality(
    signal:number
):string
{
    if(signal >= 80)
        return "Excellent";

    if(signal >= 60)
        return "Good";

    if(signal >= 40)
        return "Fair";

    if(signal >= 20)
        return "Weak";

    return "Poor";
}

export function signalBars(
    signal:number
):number
{
    if(signal >= 80)
        return 5;

    if(signal >= 60)
        return 4;

    if(signal >= 40)
        return 3;

    if(signal >= 20)
        return 2;

    if(signal > 0)
        return 1;

    return 0;
}

//======================================================
// Device
//======================================================

export function isOnline(
    telemetry:DeviceTelemetry
):boolean
{
    return (
        telemetry.online &&
        telemetry.network.cloudConnected &&
        telemetry.network.websocketConnected
    );
}

//======================================================
// Events
//======================================================

export function createEvent(
    level:EventLevel,
    message:string
):EventItem
{
    return {
        id:Date.now(),

        time:new Date().toLocaleTimeString(),

        level,

        message
    };
}

export function addEvent(
    events:EventItem[],
    level:EventLevel,
    message:string,
    maxItems:number = 100
):EventItem[]
{
    return [
        createEvent(level,message),
        ...events
    ].slice(0,maxItems);
}

//======================================================
// Alerts
//======================================================

export function getAlerts(
    telemetry:DeviceTelemetry
):string[]
{
    const alerts:string[] = [];

    if(!telemetry.online)
        alerts.push("Device Offline");

    if(!telemetry.network.cloudConnected)
        alerts.push("Cloud Disconnected");

    if(!telemetry.network.websocketConnected)
        alerts.push("WebSocket Disconnected");

    if(!telemetry.calibrated)
        alerts.push("Calibration Required");

    if(
        telemetry.health.cpuTemperature > 70
    )
        alerts.push("High Temperature");

    if(
        telemetry.health.batteryVoltage > 0 &&
        telemetry.health.batteryVoltage < 10
    )
        alerts.push("Low Battery Voltage");

    return alerts;
}

//======================================================
// Time
//======================================================

export function secondsToClock(
    seconds:number
):string
{
    const hrs =
        Math.floor(seconds / 3600);

    const mins =
        Math.floor(
            (seconds % 3600) / 60
        );

    const secs =
        seconds % 60;

    return [
        hrs.toString().padStart(2,"0"),
        mins.toString().padStart(2,"0"),
        secs.toString().padStart(2,"0")
    ].join(":");
}