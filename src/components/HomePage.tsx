/******************************************************************************
 *
 * HonorPole Mobile Application
 * File: HomePage.tsx
 * Version: 2.3.3
 *
 * Main dashboard for the HonorPole Smart Flag Control System.
 *
 * Version 2.3.7:
 * - Makes the HonorPole selector text fit on phone screens while preserving
 *   the full desktop layout and native dropdown control.
 *
 * Version 2.3.6:
 * - Matches the Setup page background: the original waving flag video fills
 *   the viewport in its natural orientation with the stars on the left.
 *
 * Version 2.3.5:
 * - Expands the waving flag video to cover the entire Home background.
 * - Mirrors the video so the stars appear in the upper-right corner.
 *
 * Version 2.3.4:
 * - Restores the original waving flag video on Home.
 * - Rotates the complete video frame vertically so the stars remain in the
 *   upper-right corner and the flag ripples downward without being cropped.
 *
 * Version 2.3.3:
 * - Uses a recognizable photographic flag-and-pole background while keeping
 *   the dashboard readable and leaving Setup's video background unchanged.
 *
 * Version 2.3.2:
 * - Replaces the nearly invisible CSS silhouette with a responsive vector
 *   flagpole watermark that remains recognizable on desktop and mobile.
 *
 * Version 2.3.1:
 * - Replaces the distracting flag-photo background with a static navy gradient.
 * - Adds a subtle, decorative flagpole silhouette with no animation.
 *
 * Version 2.3.0:
 * - Adds live flag-on-pole visualization driven only by device telemetry.
 * - Flag height tracks currentPosition / learnedTopPosition continuously.
 * - Visualization is display-only and sends no commands.
 *
 * Version 2.2.0:
 * - Adds persistent AUTO / FULL / HALF / DOWN operating mode.
 * - Reads override mode from Base44 honorPoleOverrideMode.
 * - Persists manual override before sending motor command.
 * - AUTO returns authority to the persistent server-side evaluator.
 * - STOP remains an immediate motor stop and does not change override mode.
 *
 ******************************************************************************/

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

import cloudService, { type DeviceInfo } from "../services/cloudService";

import {
    getHonorPoleMode,
    setHonorPoleMode,
    type HonorPoleOverrideMode
} from "../services/honorPoleModeService";

import {
    getHonorPoleDirectiveStatus,
    type HonorPoleDirectiveStatus
} from "../services/honorPoleDirectiveService";

import type { DeviceTelemetry } from "../types/telemetry";
import { DefaultTelemetry } from "../types/telemetry";
import DevicePairing from "./DevicePairing";

//======================================================================
// Configuration
//======================================================================

function getActiveDeviceId(): string
{
    return (
        cloudService.getCurrentDeviceId()
        ?? ""
    );
}

//======================================================================
// Helpers
//======================================================================

function StatusRow({
    label,
    value
}: {
    label: string;
    value: string;
})
{
    return (
        <div className="flex justify-between gap-4 py-2 border-b border-white/10">

            <span className="text-gray-400">
                {label}
            </span>

            <span className="font-medium text-white text-right">
                {value}
            </span>

        </div>
    );
}

//----------------------------------------------------------------------

function formatUptime(totalSeconds: number): string
{
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0)
    {
        return "Waiting for telemetry";
    }

    const seconds = Math.floor(totalSeconds);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (days > 0)
    {
        return `${days} day ${hours} hr ${minutes} min`;
    }

    if (hours > 0)
    {
        return `${hours} hr ${minutes} min`;
    }

    if (minutes > 0)
    {
        return `${minutes} min ${remainingSeconds} sec`;
    }

    return `${remainingSeconds} sec`;
}

//----------------------------------------------------------------------

function InfoCard({
    title,
    children
}: {
    title: string;
    children: React.ReactNode;
})
{
    return (
        <div
            className="
                rounded-2xl
                bg-white/10
                backdrop-blur-lg
                border
                border-white/10
                p-5
                shadow-xl
            "
        >

            <h2
                className="
                    text-lg
                    font-semibold
                    text-white
                    mb-4
                "
            >
                {title}
            </h2>

            {children}

        </div>
    );
}

//----------------------------------------------------------------------

function formatPosition(
    position: number,
    learnedTopPosition: number
): string
{
    if (!Number.isFinite(position))
    {
        return "--";
    }

    if (
        Number.isFinite(learnedTopPosition) &&
        learnedTopPosition > 0
    )
    {
        const half =
            learnedTopPosition / 2;

        const tolerance =
            Math.max(
                10,
                learnedTopPosition * 0.02
            );

        if (
            Math.abs(position) <=
            tolerance
        )
        {
            return `BOTTOM (${Math.round(position)})`;
        }

        if (
            Math.abs(
                position - half
            ) <= tolerance
        )
        {
            return `HALF (${Math.round(position)})`;
        }

        if (
            Math.abs(
                position -
                learnedTopPosition
            ) <= tolerance
        )
        {
            return `FULL (${Math.round(position)})`;
        }
    }

    return String(
        Math.round(position)
    );
}

//----------------------------------------------------------------------

function formatLastSeen(
    value: string | number
): string
{
    if (
        value === null ||
        value === undefined ||
        value === "" ||
        value === "--"
    )
    {
        return "--";
    }

    //--------------------------------------------------
    // Render may return lastSeen as epoch milliseconds.
    //--------------------------------------------------

    const numericValue =
        typeof value === "number"
            ? value
            : /^\d+$/.test(value)
                ? Number(value)
                : NaN;

    const date =
        Number.isFinite(numericValue)
            ? new Date(numericValue)
            : new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    )
    {
        return String(value);
    }

    return date.toLocaleString();
}

//----------------------------------------------------------------------

function modeLabel(
    mode: HonorPoleOverrideMode
): string
{
    switch (mode)
    {
        case "AUTO":
            return "Automatic";

        case "FULL":
            return "Manual - Full Staff";

        case "HALF":
            return "Manual - Half Staff";

        case "DOWN":
            return "Manual - Down";

        default:
            return mode;
    }
}

//----------------------------------------------------------------------

function LiveFlagVisualization({
    currentPosition,
    learnedTopPosition,
    moving,
    movement,
    online
}: {
    currentPosition: number;
    learnedTopPosition: number;
    moving: boolean;
    movement: string;
    online: boolean;
})
{
    const safeTop =
        Number.isFinite(learnedTopPosition) &&
        learnedTopPosition > 0
            ? learnedTopPosition
            : 1;

    const rawPercent =
        (currentPosition / safeTop) * 100;

    const percent =
        Math.max(
            0,
            Math.min(
                100,
                Number.isFinite(rawPercent)
                    ? rawPercent
                    : 0
            )
        );

    const positionLabel =
        percent >= 98
            ? "FULL STAFF"
            : percent >= 48 && percent <= 52
                ? "HALF STAFF"
                : percent <= 2
                    ? "DOWN"
                    : `${Math.round(percent)}%`;

    return (
        <div className="mb-6">
            <div
                className="
                    relative
                    h-80
                    overflow-hidden
                    rounded-2xl
                    border
                    border-white/10
                    bg-slate-900/70
                "
            >
                {/* Sky / ground */}
                <div className="absolute inset-x-0 top-0 h-3/4 bg-sky-950/30" />
                <div className="absolute inset-x-0 bottom-0 h-1/4 bg-slate-950/60" />

                {/* Pole */}
                <div
                    className="
                        absolute
                        bottom-5
                        left-1/2
                        top-5
                        w-1.5
                        -translate-x-1/2
                        rounded-full
                        bg-slate-300
                        shadow-lg
                    "
                />

                {/* Finial */}
                <div
                    className="
                        absolute
                        left-1/2
                        top-2
                        h-4
                        w-4
                        -translate-x-1/2
                        rounded-full
                        bg-amber-300
                        shadow
                    "
                />

                {/* Flag assembly - telemetry controls vertical position */}
                <div
                    className="absolute left-1/2 transition-all duration-700 ease-out"
                    style={{
                        bottom: `calc(20px + ${percent * 0.72}%)`
                    }}
                >
                    <div className="relative h-20 w-32 overflow-hidden rounded-sm shadow-xl">
                        {/* 13 red/white stripes */}
                        <div className="absolute inset-0 flex flex-col">
                            {Array.from({ length: 13 }).map((_, index) => (
                                <div
                                    key={index}
                                    className={
                                        index % 2 === 0
                                            ? "flex-1 bg-red-700"
                                            : "flex-1 bg-white"
                                    }
                                />
                            ))}
                        </div>

                        {/* Blue canton */}
                        <div
                            className="
                                absolute
                                left-0
                                top-0
                                h-[54%]
                                w-[42%]
                                bg-blue-900
                                p-1
                                text-[6px]
                                leading-[7px]
                                tracking-[1px]
                                text-white
                            "
                            aria-hidden="true"
                        >
                            * * * * *<br />
                            &nbsp;* * * *<br />
                            * * * * *<br />
                            &nbsp;* * * *
                        </div>
                    </div>
                </div>

                {/* Position markers */}
                <div className="absolute left-4 top-5 text-xs font-semibold text-gray-300">
                    FULL
                </div>
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-300">
                    HALF
                </div>
                <div className="absolute bottom-5 left-4 text-xs font-semibold text-gray-300">
                    DOWN
                </div>

                {/* Live badge */}
                <div
                    className="
                        absolute
                        bottom-3
                        right-3
                        rounded-full
                        bg-slate-950/80
                        px-3
                        py-1.5
                        text-xs
                        font-semibold
                        text-white
                    "
                >
                    {online ? "LIVE" : "OFFLINE"} - {positionLabel}
                    {moving ? ` - ${movement}` : ""}
                </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-4 text-sm">
                <span className="text-gray-400">
                    Live physical position
                </span>
                <span className="font-semibold text-white">
                    {Math.round(percent)}%
                </span>
            </div>
        </div>
    );
}

//======================================================================
// Home Page
//======================================================================

const HomePage = () =>
{
        const [availableDevices, setAvailableDevices] =
        useState<DeviceInfo[]>([]);

    const [selectedDeviceId, setSelectedDeviceId] =
        useState<string>(
            getActiveDeviceId()
        );

    const [showPairing, setShowPairing] =
    useState(false);    
    const [shareCode, setShareCode] = useState<string | null>(null);
    const [shareError, setShareError] = useState<string | null>(null);
    const [sharing, setSharing] = useState(false);

    useEffect(() =>
    {
        if (!showPairing)
        {
            return;
        }

        window.requestAnimationFrame(() =>
        {
            document
                .getElementById("honorpole-pairing")
                ?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
        });
    }, [showPairing]);

    const [device, setDevice] =
        useState<DeviceTelemetry>(
            structuredClone(
                DefaultTelemetry
            )
        );

        const [
        directiveStatus,
        setDirectiveStatus
    ] =
        useState<HonorPoleDirectiveStatus | null>(
            null
        );    

    const [loading, setLoading] =
        useState(true);

    const [
        connectionStatus,
        setConnectionStatus
    ] =
        useState("Connecting...");

    const [
        sendingCommand,
        setSendingCommand
    ] =
        useState<string | null>(
            null
        );

    //------------------------------------------------------------------
    // Persistent HonorPole Operating Mode
    //------------------------------------------------------------------

    const [
        overrideMode,
        setOverrideModeState
    ] =
        useState<HonorPoleOverrideMode>(
            "AUTO"
        );

    const [
        modeLoading,
        setModeLoading
    ] =
        useState(true);

    const [
        modeError,
        setModeError
    ] =
        useState<string | null>(
            null
        );

    const [
        testMode,
        setTestMode
    ] =
        useState(false);

    //------------------------------------------------------------------
    // Connect to HonorPole
    //------------------------------------------------------------------

    useEffect(() =>
    {
        if (!selectedDeviceId)
        {
            setDirectiveStatus(null);
            return;
        }

        let mounted = true;

        let unsubscribeTelemetry =
            () => {};

        let unsubscribeConnection =
            () => {};

        setConnectionStatus(
            "Connecting..."
        );

        //------------------------------------------------------------------
        // Telemetry subscriber
        //------------------------------------------------------------------

        unsubscribeTelemetry =
            cloudService.subscribeTelemetry(
                (
                    telemetry:
                        DeviceTelemetry
                ) =>
                {
                    if (!mounted)
                    {
                        return;
                    }

                    setDevice(
                        telemetry
                    );

                    setLoading(false);
                }
            );

        //------------------------------------------------------------------
        // Connection subscriber
        //------------------------------------------------------------------

        unsubscribeConnection =
            cloudService.subscribeConnection(
                (connected) =>
                {
                    if (!mounted)
                    {
                        return;
                    }

                    setConnectionStatus(
                        connected
                            ? "Connected"
                            : "Disconnected"
                    );
                }
            );
        //------------------------------------------------------------------
        // Select active HonorPole, then connect
        //------------------------------------------------------------------

        void (async () =>
        {
            try
    {  
                        let authAttempts = 0;

        while (
            !cloudService.getAuthToken() &&
            authAttempts < 20
        )
        {
            await new Promise<void>(
                resolve =>
                    window.setTimeout(
                        resolve,
                        250
                    )
            );

            authAttempts++;

            if (!mounted)
            {
                return;
            }
        }

        if (!cloudService.getAuthToken())
        {
            console.warn(
                "[HomePage] Authentication unavailable. Device list not loaded."
            );

            return;
        }
        
                const devices =
            await cloudService.getDevices();

        if (!mounted)
        {
            return;
        }

        console.log(
    "[HomePage] Real devices loaded:",
    devices
);
        setAvailableDevices(devices);

if (devices.length > 0)
{
    const currentDeviceId =
        cloudService.getCurrentDeviceId();

    const activeDevice =
        devices.find(
            device =>
                device.deviceId === currentDeviceId
        ) ?? devices[0];

    cloudService.setDevice(activeDevice);

    setSelectedDeviceId(
        activeDevice.deviceId
    );
}

        if (!mounted)
        {
            return;
        }

        const connected =
            await cloudService.connect();

        if (!mounted)
        {
            return;
        }

        setConnectionStatus(
            connected
                ? "Connected"
                : "Disconnected"
        );
            }
            catch (error)
            {
                console.error(
                    "[HomePage] Startup connection failed",
                    error
                );

                if (mounted)
                {
                    setConnectionStatus(
                        "Disconnected"
            );

            setLoading(false);
        }
    }
})();

        //------------------------------------------------------------------
        // Cleanup
        //------------------------------------------------------------------

        return () =>
        {
            mounted = false;

            unsubscribeTelemetry();

            unsubscribeConnection();
        };

    }, []);

    //------------------------------------------------------------------
// Read Current Government Directive Status
//------------------------------------------------------------------

    useEffect(() =>
    {
        if (!selectedDeviceId)
        {
            setModeLoading(false);
            setModeError(null);
            return;
        }

        let mounted = true;

        async function loadDirectiveStatus()
        {
            try
            {
                const status =
                    await getHonorPoleDirectiveStatus(
                        selectedDeviceId
                    );

                if (!mounted)
                {
                    return;
                }

                setDirectiveStatus(status);
            }
            catch (error)
            {
                console.error(
                    "Failed to load HonorPole directive status:",
                    error
                );
            }
        }

        setDirectiveStatus(null);
        void loadDirectiveStatus();

        const interval =
            window.setInterval(
                loadDirectiveStatus,
                60000
            );

        return () =>
        {
            mounted = false;
            window.clearInterval(interval);
        };
    }, [selectedDeviceId]);


    //------------------------------------------------------------------
    // Read Persistent Operating Mode
    //------------------------------------------------------------------

    useEffect(() =>
    {
        let mounted = true;

        async function loadMode()
        {
            try
            {
                setModeLoading(true);
                setModeError(null);

                const state =
                    await getHonorPoleMode(
                        selectedDeviceId
                    );

                if (!mounted)
                {
                    return;
                }

                setOverrideModeState(
                    state.override_mode
                );

                setTestMode(
                    state.testmode === true
                );

                console.log(
                    "[HomePage] HonorPole mode:",
                    state.override_mode
                );
            }
            catch (error)
            {
                console.error(
                    "[HomePage] Failed to read HonorPole mode",
                    error
                );

                if (mounted)
                {
                    setModeError(
                        "Mode unavailable"
                    );
                }
            }
            finally
            {
                if (mounted)
                {
                    setModeLoading(false);
                }
            }
        }

        void loadMode();

        return () =>
        {
            mounted = false;
        };

    }, [selectedDeviceId]);

    //------------------------------------------------------------------
    // Derived Display Values
    //------------------------------------------------------------------

    const currentPosition =
        useMemo(
            () =>
                formatPosition(
                    device.currentPosition,
                    device.learnedTopPosition
                ),
            [
                device.currentPosition,
                device.learnedTopPosition
            ]
        );

    const targetPosition =
        useMemo(
            () =>
                formatPosition(
                    device.targetPosition,
                    device.learnedTopPosition
                ),
            [
                device.targetPosition,
                device.learnedTopPosition
            ]
        );

    const lastSeen =
        useMemo(
            () =>
                formatLastSeen(
                    device.health?.lastHeartbeat
                ),
            [
                device.health?.lastHeartbeat
            ]
        );

    //------------------------------------------------------------------
    // Set AUTO Mode
    //------------------------------------------------------------------

    async function enableAutoMode()
    {
        if (
            !selectedDeviceId ||
            sendingCommand ||
            modeLoading ||
            testMode
        )
        {
            return;
        }

        try
        {
            setSendingCommand(
                "auto"
            );

            setModeError(null);

            setConnectionStatus(
                "Enabling Automatic Mode..."
            );

            //----------------------------------------------------------
            // AUTO does NOT send a motor command.
            //
            // Persist AUTO in Base44. The scheduled server-side
            // evaluateAutoPosition function owns automatic movement.
            //----------------------------------------------------------

            const state =
                await setHonorPoleMode(
                    selectedDeviceId,
                    "AUTO"
                );

            setOverrideModeState(
                state.override_mode
            );

            setTestMode(
                state.testmode === true
            );

            setConnectionStatus(
                "Connected"
            );

            console.log(
                "[HomePage] Automatic mode enabled"
            );
        }
        catch (error)
        {
            console.error(
                "[HomePage] Failed to enable AUTO",
                error
            );

            setModeError(
                "Failed to enable AUTO"
            );

            setConnectionStatus(
                "Mode Change Failed"
            );
        }
        finally
        {
            setSendingCommand(
                null
            );
        }
    }

    //------------------------------------------------------------------
    // Manual Position Command
    //------------------------------------------------------------------

    async function sendPositionCommand(
        command:
            | "full"
            | "half"
            | "bottom"
    )
    {
        if (
            !selectedDeviceId ||
            sendingCommand ||
            modeLoading ||
            testMode
        )
        {
            return;
        }

        const persistentMode:
            HonorPoleOverrideMode =
                command === "full"
                    ? "FULL"
                    : command === "half"
                        ? "HALF"
                        : "DOWN";

        try
        {
            setSendingCommand(
                command
            );

            setModeError(null);

            setConnectionStatus(
                "Setting Manual Override..."
            );

            //----------------------------------------------------------
            // IMPORTANT:
            //
            // Persist the manual override BEFORE sending the motor
            // command. This prevents the scheduled AUTO evaluator from
            // fighting the user's manual command.
            //----------------------------------------------------------

            const state =
                await setHonorPoleMode(
                    selectedDeviceId,
                    persistentMode
                );

            setOverrideModeState(
                state.override_mode
            );

            setTestMode(
                state.testmode === true
            );

            //----------------------------------------------------------
            // Now send the physical motor command.
            //----------------------------------------------------------

            setConnectionStatus(
                "Sending Command..."
            );

            console.log(
                `[HomePage] Sending ${command.toUpperCase()} to ${selectedDeviceId}`
            );

            const success =
                await cloudService.sendCommand(
                    selectedDeviceId,
                    command
                );

            if (!success)
            {
                throw new Error(
                    `Command ${command.toUpperCase()} was not accepted.`
                );
            }

            setConnectionStatus(
                "Connected"
            );

            console.log(
                `[HomePage] ${command.toUpperCase()} accepted`
            );
        }
        catch (error)
        {
            console.error(
                "[HomePage] Manual command failed",
                error
            );

            setConnectionStatus(
                "Command Failed"
            );

            setModeError(
                "Manual command failed"
            );
        }
        finally
        {
            setSendingCommand(
                null
            );
        }
    }

    //------------------------------------------------------------------
    // STOP
    //------------------------------------------------------------------

    async function stopMotor()
    {
        if (!selectedDeviceId)
        {
            return;
        }
  
        try
        {
            setSendingCommand(
                "stop"
            );

            setConnectionStatus(
                "Stopping..."
            );

            //----------------------------------------------------------
            // STOP is immediate only.
            //
            // It does NOT alter override_mode.
            //----------------------------------------------------------

            const success =
                await cloudService.sendCommand(
                    selectedDeviceId,
                    "stop"
                );

            if (!success)
            {
                throw new Error(
                    "STOP command was not accepted."
                );
            }

            setConnectionStatus(
                "Connected"
            );

            console.log(
                "[HomePage] STOP accepted"
            );
        }
        catch (error)
        {
            console.error(
                "[HomePage] STOP failed",
                error
            );

            setConnectionStatus(
                "STOP Failed"
            );
        }
        finally
        {
            setSendingCommand(
                null
            );
        }
    }

    //------------------------------------------------------------------
    // Loading Screen
    //------------------------------------------------------------------

    if (loading)
    {
        return (
            <div
                className="
                    min-h-screen
                    bg-slate-950
                    flex
                    items-center
                    justify-center
                "
            >

                <div className="text-center">

                    <div className="text-5xl mb-4">
                        USA
                    </div>

                    <h2 className="text-white text-xl">
                        Connecting to HonorPole...
                    </h2>

                    <p className="text-gray-400 mt-2">
                        {selectedDeviceId
                            ? `Device ${selectedDeviceId}`
                            : "Loading authorized HonorPoles..."}
                    </p>

                </div>

            </div>
        );
    }

    //------------------------------------------------------------------
    // Main Dashboard
    //------------------------------------------------------------------

    return (
        <div className="relative min-h-screen overflow-x-hidden bg-slate-950">

            {/* Background */}

            <div
                className="absolute inset-0"
                style={{
                    background:
                        "radial-gradient(circle at 50% 18%, rgba(37, 99, 235, 0.14), transparent 38%), linear-gradient(180deg, #07101f 0%, #020617 58%, #030712 100%)"
                }}
            />

            {/* Home-page-only animated flag background matching Setup. */}
            <div
                className="fixed inset-0 pointer-events-none overflow-hidden"
                aria-hidden="true"
            >
                <video
                    className="absolute inset-0 h-full w-full object-cover opacity-60"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                >
                    <source src="/flag.mp4" type="video/mp4" />
                </video>
            </div>

            {/* Previous vector concept retained but intentionally hidden */}
            <div
                className="hidden"
                aria-hidden="true"
            >
                <svg
                    className="h-full w-full"
                    viewBox="0 0 500 900"
                    preserveAspectRatio="xMaxYMin meet"
                    role="presentation"
                >
                    <defs>
                        <linearGradient id="homePoleMetal" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0" stopColor="#64748b" />
                            <stop offset="0.5" stopColor="#f8fafc" />
                            <stop offset="1" stopColor="#94a3b8" />
                        </linearGradient>
                        <linearGradient id="homeFlagFade" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0" stopColor="#ffffff" stopOpacity="0.72" />
                            <stop offset="1" stopColor="#ffffff" stopOpacity="0.18" />
                        </linearGradient>
                        <radialGradient id="homePatrioticGlow" cx="72%" cy="23%" r="58%">
                            <stop offset="0" stopColor="#3b82f6" stopOpacity="0.24" />
                            <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
                        </radialGradient>
                        <filter id="homeSoftGlow" x="-30%" y="-30%" width="160%" height="160%">
                            <feGaussianBlur stdDeviation="8" />
                        </filter>
                    </defs>

                    <ellipse cx="360" cy="220" rx="205" ry="190" fill="url(#homePatrioticGlow)" />

                    <g opacity="0.78">
                        <rect x="398" y="91" width="10" height="744" rx="5" fill="#0f172a" opacity="0.7" />
                        <rect x="394" y="88" width="8" height="744" rx="4" fill="url(#homePoleMetal)" />
                        <circle cx="398" cy="74" r="14" fill="#fbbf24" opacity="0.36" filter="url(#homeSoftGlow)" />
                        <circle cx="398" cy="74" r="10" fill="#fbbf24" />
                        <circle cx="395" cy="71" r="3" fill="#fef3c7" />
                        <path d="M398 833 L372 865 H424 Z" fill="#94a3b8" />
                        <rect x="352" y="863" width="92" height="10" rx="5" fill="#64748b" />
                    </g>

                    <g opacity="0.62">
                        <path d="M394 106 C330 86 275 137 206 108 C161 89 119 91 72 113 L72 265 C119 242 161 241 206 260 C275 289 330 238 394 258 Z" fill="url(#homeFlagFade)" />
                        <path d="M394 106 C330 86 275 137 206 108 C161 89 119 91 72 113 L72 136 C119 114 161 112 206 132 C275 160 330 110 394 129 Z" fill="#b91c1c" />
                        <path d="M394 152 C330 132 275 183 206 154 C161 135 119 137 72 159 L72 182 C119 160 161 158 206 178 C275 206 330 156 394 175 Z" fill="#b91c1c" />
                        <path d="M394 198 C330 178 275 229 206 200 C161 181 119 183 72 205 L72 228 C119 206 161 204 206 224 C275 252 330 202 394 221 Z" fill="#b91c1c" />
                        <path d="M394 244 C330 224 275 275 206 246 C161 227 119 229 72 251 L72 265 C119 242 161 241 206 260 C275 289 330 238 394 258 Z" fill="#b91c1c" />
                        <path d="M72 113 C118 92 161 90 206 108 L206 188 C161 170 119 171 72 193 Z" fill="#1e3a8a" />
                        <g fill="#f8fafc" opacity="0.9">
                            <circle cx="95" cy="126" r="3" /><circle cx="121" cy="119" r="3" /><circle cx="147" cy="119" r="3" /><circle cx="176" cy="125" r="3" />
                            <circle cx="108" cy="145" r="3" /><circle cx="134" cy="140" r="3" /><circle cx="162" cy="143" r="3" /><circle cx="190" cy="150" r="3" />
                            <circle cx="95" cy="165" r="3" /><circle cx="121" cy="158" r="3" /><circle cx="147" cy="159" r="3" /><circle cx="176" cy="166" r="3" />
                        </g>
                    </g>
                </svg>
            </div>

            {/* Content */}

            <div className="relative z-10">

                <AppHeader
                    title="HonorPole Dashboard"
                />

                <main
                    className="
                        max-w-6xl
                        mx-auto
                        px-6
                        py-8
                        pb-32
                        space-y-6
                    "
                >                        {/* ================================================== */}
                    {/* HONORPOLE SELECTOR */}
                    {/* ================================================== */}

                    <div
                        className="
                            rounded-2xl
                            border
                            border-white/10
                            bg-slate-900/70
                            p-4
                        "
                    >
                        <label
    htmlFor="honorpole-selector"
    className="
        block
        text-sm
        font-semibold
        text-gray-300
        mb-2
    "
>
    Select HonorPole
</label>

<select
    id="honorpole-selector"
    value={selectedDeviceId}
    onChange={(event) =>
    {
        const selected =
            availableDevices.find(
                item =>
                    item.deviceId === event.target.value
            );

        if (!selected)
        {
            return;
        }

        cloudService.setDevice(selected);

        setConnectionStatus(
            `Switching to ${selected.deviceName}...`
        );

        setSelectedDeviceId(
            selected.deviceId
        );
    }}
    className="
        w-full
        min-w-0
        max-w-full
        rounded-xl
        border
        border-white/10
        bg-slate-950
        px-4
        pr-10
        py-3
        text-sm
        sm:text-base
        text-white
    "
>
    {availableDevices.length === 0 && (
        <option value={selectedDeviceId}>
            No HonorPole selected
        </option>
    )}

    {availableDevices.map(
        item => (
            <option
                key={item.deviceId}
                value={item.deviceId}
            >
                {item.deviceName} — {item.deviceId}
            </option>
        )
    )}
</select>

<button
    type="button"
    onClick={() => setShowPairing(true)}
    className="
        mt-3
        w-full
        rounded-xl
        border
        border-white/10
        bg-slate-800
        px-4
        py-3
        text-sm
        font-semibold
        text-white
    "
>
    Add HonorPole
</button>
{selectedDeviceId && (
    <button type="button" disabled={sharing} onClick={async () => {
        setSharing(true);
        setShareError(null);
        setShareCode(null);
        try {
            const result = await cloudService.createShareCode(selectedDeviceId);
            setShareCode(result.code);
        } catch (error) {
            setShareError(error instanceof Error ? error.message : "Unable to share this HonorPole");
        } finally {
            setSharing(false);
        }
    }} className="mt-3 w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
        {sharing ? "Creating code..." : "Share selected HonorPole"}
    </button>
)}
{shareCode && (
    <div className="mt-3 rounded-xl border border-blue-400 bg-slate-950 p-4 text-white" role="status">
        <p>Give this one-use code to the person you want to control {selectedDeviceId}. It expires in 15 minutes.</p>
        <p className="mt-2 select-all break-all font-mono text-lg font-bold">{shareCode}</p>
        <p className="mt-2 text-sm">They must sign in with their own account, tap Add HonorPole, then Join a shared HonorPole.</p>
    </div>
)}
{shareError && <p role="alert" className="mt-3 text-sm text-red-200">{shareError}</p>}
</div>

{showPairing && (
    <div
        id="honorpole-pairing"
        className="
            scroll-mt-28
            rounded-2xl
            border
            border-white/10
            bg-slate-900/90
            p-4
            shadow-xl
        "
    >
        <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-white">
                Add HonorPole
            </h2>

            <button
                type="button"
                onClick={() => setShowPairing(false)}
                className="
                    rounded-lg
                    border
                    border-slate-600
                    bg-slate-800
                    px-3
                    py-2
                    text-sm
                    font-semibold
                    text-white
                    hover:bg-slate-700
                "
            >
                Cancel
            </button>
        </div>

        <div className="flex justify-center">
            <DevicePairing
                onPairingSuccess={(deviceId) =>
                {
                    setSelectedDeviceId(deviceId);
                    setShowPairing(false);
                    window.location.reload();
                }}
            />
        </div>
    </div>
)}

                    <InfoCard title="HonorPole Status">

                        <div
                            className="
                                grid
                                grid-cols-1
                                md:grid-cols-2
                                gap-6
                            "
                        >

                            <div>

                                <StatusRow
                                    label="Device ID"
                                    value={selectedDeviceId}
                                />

                                <StatusRow
                                    label="Device"
                                    value={
                                        device.deviceName ||
                                        "HonorPole"
                                    }
                                />

                                <StatusRow
                                    label="Firmware"
                                    value={
                                        device.firmware ||
                                        "--"
                                    }
                                />

                                <StatusRow
                                    label="Connection"
                                    value={
                                        device.online
                                            ? "Online"
                                            : "Offline"
                                    }
                                />

                                <StatusRow
                                    label="Cloud"
                                    value={
                                        connectionStatus
                                    }
                                />

                            </div>

                            <div>

                                <StatusRow
                                    label="WiFi"
                                    value={
                                        device.network
                                            ?.wifiConnected
                                            ? "Connected"
                                            : "Disconnected"
                                    }
                                />

                                <StatusRow
                                    label="IP Address"
                                    value={
                                        device.network
                                            ?.ipAddress ||
                                        "--"
                                    }
                                />

                                <StatusRow
                                    label="Signal"
                                    value={
                                        `${device.network?.signalStrength ?? 0}%`
                                    }
                                />

                                <StatusRow
                                    label="Last Seen"
                                    value={
                                        lastSeen
                                    }
                                />

                            </div>

                        </div>

                    </InfoCard>

                    {/* ================================================== */}
                    {/* FLAG STATUS */}
                    {/* ================================================== */}

                    <InfoCard title="Flag Status">

                        <LiveFlagVisualization
                            currentPosition={device.currentPosition}
                            learnedTopPosition={device.learnedTopPosition}
                            moving={device.moving}
                            movement={device.movement}
                            online={device.online}
                        />

                        <StatusRow
                            label="Current Position"
                            value={
                                currentPosition
                            }
                        />

                        <StatusRow
                            label="Target Position"
                            value={
                                targetPosition
                            }
                        />

                        <StatusRow
                            label="Movement"
                            value={
                                device.moving
                                    ? device.movement
                                    : "Stopped"
                            }
                        />

                        <StatusRow
                            label="Operating Mode"
                            value={
                                modeLoading
                                    ? "Loading..."
                                    : modeError
                                        ? modeError
                                        : modeLabel(
                                            overrideMode
                                        )
                            }
                        />

                        <StatusRow
                            label="Automatic Mode"
                            value={
                                overrideMode ===
                                "AUTO"
                                    ? "Enabled"
                                    : "Disabled"
                            }
                        />

                        <StatusRow
                            label="Calibration"
                            value={
                                device.calibrated
                                    ? "Calibrated"
                                    : "Not Calibrated"
                            }
                        />

                        <StatusRow
                            label="Status"
                            value={
                                device.commandStatus ||
                                "Idle"
                            }
                        />

                    </InfoCard>

                    {/* ================================================== */}
                    {/* HONOR STATUS */}
                    {/* ================================================== */}

                                        <InfoCard title="Honor Status">

                        <StatusRow
                            label="Federal Directive"
                            value={
                                directiveStatus?.federal.active
                                    ? directiveStatus.federal.title ||
                                      "Active"
                                    : "None"
                            }
                        />

                        <StatusRow
                            label="State Directive"
                            value={
                                directiveStatus?.state.active
                                    ? directiveStatus.state.title ||
                                      "Active"
                                    : "None"
                            }
                        />

                        <StatusRow
                            label="Directive Authority"
                            value={
                                directiveStatus?.effective.authority ||
                                "--"
                            }
                        />

                        <StatusRow
                            label="Required Position"
                            value={
                                directiveStatus?.effective.position ||
                                "--"
                            }
                        />

                        <StatusRow
                            label="Verification"
                            value={
                                directiveStatus?.federal.active
                                    ? directiveStatus.federal.verified
                                        ? "Verified"
                                        : "Pending"
                                    : "--"
                            }
                        />

                        <StatusRow
                            label="Last Directive Update"
                            value={
                                directiveStatus?.updated
                                    ? formatLastSeen(
                                          directiveStatus.updated
                                      )
                                    : "--"
                            }
                        />

                    </InfoCard>

                    {/* ================================================== */}
                    {/* OPERATING MODE */}
                    {/* ================================================== */}

                    <InfoCard title="Operating Mode">

                        <div
                            className="
                                mb-4
                                text-center
                            "
                        >
                            <div
                                className="
                                    text-sm
                                    text-gray-400
                                "
                            >
                                Current Mode
                            </div>

                            <div
                                className="
                                    mt-1
                                    text-xl
                                    font-semibold
                                    text-white
                                "
                            >
                                {modeLoading
                                    ? "Loading..."
                                    : modeLabel(
                                        overrideMode
                                    )}
                            </div>

                            {testMode && (
                                <div
                                    className="
                                        mt-2
                                        text-sm
                                        font-semibold
                                        text-amber-300
                                    "
                                >
                                    TEST MODE ACTIVE
                                </div>
                            )}

                            {modeError && (
                                <div
                                    className="
                                        mt-2
                                        text-sm
                                        text-red-300
                                    "
                                >
                                    {modeError}
                                </div>
                            )}
                        </div>

                        <div
                            className="
                                grid
                                grid-cols-2
                                md:grid-cols-4
                                gap-4
                            "
                        >

                            <button
                                type="button"
                                className={
                                    overrideMode ===
                                    "AUTO"
                                        ? "btn bg-emerald-600 hover:bg-emerald-700"
                                        : "btn"
                                }
                                disabled={
                                    sendingCommand !==
                                        null ||
                                    modeLoading ||
                                    testMode
                                }
                                onClick={() =>
                                    void enableAutoMode()
                                }
                            >
                                {sendingCommand ===
"auto"
    ? "Enabling..."
    : "AUTO"}
                            </button>

                            <button
                                type="button"
                                className={
                                    overrideMode ===
                                    "FULL"
                                        ? "btn bg-blue-600 hover:bg-blue-700"
                                        : "btn"
                                }
                                disabled={
                                    sendingCommand !==
                                        null ||
                                    modeLoading ||
                                    testMode
                                }
                                onClick={() =>
                                    void sendPositionCommand(
                                        "full"
                                    )
                                }
                            >
                                USA
                                <br />
                                {sendingCommand ===
                                "full"
                                    ? "Sending..."
                                    : "Full"}
                            </button>

                            <button
                                type="button"
                                className={
                                    overrideMode ===
                                    "HALF"
                                        ? "btn bg-blue-600 hover:bg-blue-700"
                                        : "btn"
                                }
                                disabled={
                                    sendingCommand !==
                                        null ||
                                    modeLoading ||
                                    testMode
                                }
                                onClick={() =>
                                    void sendPositionCommand(
                                        "half"
                                    )
                                }
                            >
                                {sendingCommand ===
"half"
    ? "Sending..."
    : "HALF STAFF"}
                            </button>

                            <button
                                type="button"
                                className={
                                    overrideMode ===
                                    "DOWN"
                                        ? "btn bg-blue-600 hover:bg-blue-700"
                                        : "btn"
                                }
                                disabled={
                                    sendingCommand !==
                                        null ||
                                    modeLoading ||
                                    testMode
                                }
                                onClick={() =>
                                    void sendPositionCommand(
                                        "bottom"
                                    )
                                }
                            >
                                {sendingCommand ===
"bottom"
    ? "Sending..."
    : "DOWN"}
                            </button>

                        </div>

                    </InfoCard>

                    {/* ================================================== */}
                    {/* EMERGENCY STOP */}
                    {/* ================================================== */}

                    <InfoCard title="Motor Control">

                        <button
                            type="button"
                            className="
                                btn
                                w-full
                                bg-red-700
                                hover:bg-red-800
                                text-white
                            "
                            disabled={
                                sendingCommand ===
                                "stop"
                        }
                            onClick={() =>
                                void stopMotor()
                            }
                        >
                            {sendingCommand ===
"stop"
    ? "STOPPING..."
    : "STOP MOTOR"}
                        </button>

                        <p
                            className="
                                mt-3
                                text-center
                                text-xs
                                text-gray-400
                            "
                        >
                            STOP halts motor movement but does not
                            change the selected operating mode.
                        </p>

                        {sendingCommand && (
                            <div
                                className="
                                    mt-4
                                    text-center
                                    text-sm
                                    text-gray-300
                                "
                            >
                                Processing{" "}
                                {sendingCommand.toUpperCase()}{" "}
                                for {selectedDeviceId}...
                            </div>
                        )}

                    </InfoCard>

                    {/* ================================================== */}
                    {/* DEVICE HEALTH */}
{/* ================================================== */}

<InfoCard title="Device Health">

    <StatusRow
        label="Free Memory"
        value={
            device.health?.freeMemory
                ? `${device.health.freeMemory.toLocaleString()} bytes`
                : "Waiting for telemetry"
        }
    />

    <StatusRow
    label="Uptime"
    value={
        typeof device.health?.uptime === "number"
            ? formatUptime(device.health.uptime)
            : "Waiting for telemetry"
    }
/>

    <StatusRow
        label="Last Heartbeat"
        value={
            lastSeen || "Waiting for telemetry"
        }
    />

</InfoCard>

//----------------------------------------------------------------------

                    {/* ================================================== */}
                    {/* ADMINISTRATION */}
                    {/* ================================================== */}

                    <InfoCard title="Administration">

                        <div
                            className="
                                grid
                                grid-cols-1
                                md:grid-cols-2
                                gap-4
                            "
                        >

                            <Link
                                className="btn"
                                to="/cloud"
                            >
                                Cloud Control
                            </Link>

                            <Link
                                className="btn"
                                to="/setup"
                            >
                                Setup Wizard
                            </Link>

                            <Link
                                className="btn"
                                to="/diagnostics"
                            >
                                Diagnostics
                            </Link>

                            <Link
                                className="btn"
                                to="/settings"
                            >
                                Settings
                            </Link>

                        </div>

                    </InfoCard>

                </main>

                <BottomNav />

            </div>

        </div>
    );
};

export default HomePage;
