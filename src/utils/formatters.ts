/******************************************************************************
 *
 * HonorPole Mobile Application
 * File: formatters.ts
 * Version: 3.0.0
 *
 * Shared formatting utilities.
 *
 ******************************************************************************/

//======================================================
// Voltage
//======================================================

export function formatVoltage(
    voltage:number
):string
{
    if(voltage <= 0)
        return "--";

    return `${voltage.toFixed(2)} V`;
}

//======================================================
// Current
//======================================================

export function formatCurrent(
    current:number
):string
{
    if(current <= 0)
        return "--";

    return `${current.toFixed(2)} A`;
}

//======================================================
// Temperature
//======================================================

export function formatTemperature(
    temperature:number
):string
{
    if(temperature <= 0)
        return "--";

    return `${temperature.toFixed(1)} °C`;
}

//======================================================
// Memory
//======================================================

export function formatMemory(
    kb:number
):string
{
    if(kb <= 0)
        return "--";

    if(kb >= 1024)
    {
        return `${(kb / 1024).toFixed(2)} MB`;
    }

    return `${kb} KB`;
}

//======================================================
// Percent
//======================================================

export function formatPercent(
    value:number
):string
{
    return `${Math.round(value)}%`;
}

//======================================================
// RSSI
//======================================================

export function formatRSSI(
    rssi:number
):string
{
    if(rssi === 0)
        return "--";

    return `${rssi} dBm`;
}

//======================================================
// IP Address
//======================================================

export function formatIPAddress(
    ip:string
):string
{
    if(!ip || ip === "")
        return "--";

    return ip;
}

//======================================================
// Device Status
//======================================================

export function formatOnlineStatus(
    online:boolean
):string
{
    return online
        ? "ONLINE"
        : "OFFLINE";
}

//======================================================
// Connection Status
//======================================================

export function formatConnectionStatus(
    connected:boolean
):string
{
    return connected
        ? "Connected"
        : "Disconnected";
}

//======================================================
// Uptime
//======================================================

export function formatUptime(
    seconds:number
):string
{
    if(seconds <= 0)
        return "--";

    const days =
        Math.floor(seconds / 86400);

    const hours =
        Math.floor(
            (seconds % 86400) / 3600
        );

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

    if(days > 0)
    {
        return `${days}d ${hours}h ${minutes}m`;
    }

    if(hours > 0)
    {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
}

//======================================================
// Date / Time
//======================================================

export function formatDateTime(
    value:string | Date
):string
{
    try
    {
        const date =
            value instanceof Date
                ? value
                : new Date(value);

        return date.toLocaleString();
    }
    catch
    {
        return "--";
    }
}

//======================================================
// Last Seen
//======================================================

export function formatLastSeen(
    value:string
):string
{
    if(!value)
        return "--";

    return value;
}

//======================================================
// SSID
//======================================================

export function formatSSID(
    ssid:string
):string
{
    if(!ssid)
        return "--";

    return ssid;
}