/******************************************************************************
 *
 * HonorPole Mobile Application
 * File: HomePage.tsx
 * Version: 2.3.0
 *
 * Main dashboard for the HonorPole Smart Flag Control System.
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

import cloudService from "../services/cloudService";

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

//======================================================================
// Configuration
//======================================================================

const DEVICE_ID = "HP-001";

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
        // Start cloud/local connection
        //------------------------------------------------------------------

        void cloudService
            .connect()
            .then(
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
            )
            .catch(
                (error) =>
                {
                    console.error(
                        "[HomePage] Connection failed",
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
            );

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
        let mounted = true;

        async function loadDirectiveStatus()
        {
            try
            {
                const status =
                    await getHonorPoleDirectiveStatus();

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

        loadDirectiveStatus();

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
    }, []);


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
                    await getHonorPoleMode();

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

    }, []);

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
                `[HomePage] Sending ${command.toUpperCase()} to ${DEVICE_ID}`
            );

            const success =
                await cloudService.sendCommand(
                    DEVICE_ID,
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
                    DEVICE_ID,
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
                        Device {DEVICE_ID}
                    </p>

                </div>

            </div>
        );
    }

    //------------------------------------------------------------------
    // Main Dashboard
    //------------------------------------------------------------------

    return (
        <div className="relative min-h-screen overflow-hidden">

            {/* Background */}

            <div
                className="
                    absolute
                    inset-0
                    bg-cover
                    bg-center
                    opacity-25
                "
                style={{
                    backgroundImage:
                        "url('/flag.jpg')"
                }}
            />

            <div
                className="
                    absolute
                    inset-0
                    bg-slate-950/70
                "
            />

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
                        space-y-6
                    "
                >

                    {/* ================================================== */}
                    {/* DEVICE SUMMARY */}
                    {/* ================================================== */}

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
                                    value={DEVICE_ID}
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
                                for {DEVICE_ID}...
                            </div>
                        )}

                    </InfoCard>

                    {/* ================================================== */}
                    {/* DEVICE HEALTH */}
                    {/* ================================================== */}

                    <InfoCard title="Device Health">

                        <StatusRow
                            label="Battery Voltage"
                            value={
                                `${device.health?.batteryVoltage ?? 0} V`
                            }
                        />

                        <StatusRow
                            label="Motor Current"
                            value={
                                `${device.health?.motorCurrent ?? 0} A`
                            }
                        />

                        <StatusRow
                            label="CPU Temperature"
                            value={
                                `${device.health?.cpuTemperature ?? 0} deg`
                            }
                        />

                        <StatusRow
                            label="Free Memory"
                            value={
                                String(
                                    device.health?.freeMemory ??
                                    0
                                )
                            }
                        />

                    </InfoCard>

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


