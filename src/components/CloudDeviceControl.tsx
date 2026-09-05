import { useEffect, useState } from "react";

import { Button } from "./ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "./ui/card";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";


import {
    cloudService,
    type DeviceInfo,
    type CommandType
} from "../services/cloudService";

import type { DeviceTelemetry } from "../types/telemetry";


export default function CloudDeviceControl()
{
    //--------------------------------------------------
    // State
    //--------------------------------------------------

    const [devices, setDevices] =
        useState<DeviceInfo[]>([]);

    const [selectedDevice, setSelectedDevice] =
        useState<string | null>(null);

    const [telemetry, setTelemetry] =
        useState<DeviceTelemetry | null>(null);

    const [loading, setLoading] =
        useState(false);

    const [error, setError] =
        useState<string | null>(null);

    const [success, setSuccess] =
        useState<string | null>(null);

    //--------------------------------------------------
    // Initial Load
    //--------------------------------------------------

    useEffect(() =>
    {
        void loadDevices();
    }, []);

    //--------------------------------------------------
    // Selected Device Changed
    //--------------------------------------------------

    useEffect(() =>
    {
        if (!selectedDevice)
        {
            return;
        }

        void loadDeviceStatus(selectedDevice);

        const pollInterval = window.setInterval(() =>
        {
            void loadDeviceStatus(selectedDevice);
        }, 5000);

        return () =>
        {
            window.clearInterval(pollInterval);
        };

    }, [selectedDevice]);

    //--------------------------------------------------
    // Load Device List
    //--------------------------------------------------

    async function loadDevices()
    {
        try
        {
            const list =
                await cloudService.getDevices();

            setDevices(list);

            if (
                list.length > 0 &&
                !selectedDevice
            )
            {
                setSelectedDevice(
                    list[0].deviceId
                );
            }
        }
        catch (err)
        {
            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to load devices."
            );
        }
    }

    //--------------------------------------------------
    // Load Telemetry
    //--------------------------------------------------

    async function loadDeviceStatus(
        deviceId: string
    )
    {
        try
        {
            const status =
                await cloudService.getDeviceStatus(
                    deviceId
                );

            setTelemetry(status);
        }
        catch (err)
        {
            console.error(
                "Failed to load telemetry:",
                err
            );
        }
    }

    //--------------------------------------------------
    // Send Command
    //--------------------------------------------------

    async function handleCommand(
        command: CommandType
    )
    {
        if (!selectedDevice)
        {
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);

        try
        {
            const sent = await cloudService.sendCommand(
                selectedDevice,
                command
            );

            if (!sent) {
                throw new Error("Command could not be delivered.");
            }

            setSuccess(
                `Command "${command}" sent successfully.`
            );

            await loadDeviceStatus(
                selectedDevice
            );
        }
        catch (err)
        {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to send command."
            );
        }
        finally
        {
            setLoading(false);
        }
    }

    //--------------------------------------------------
    // Logout
    //--------------------------------------------------

    function handleLogout()
    {
        cloudService.clearAuth();

        window.location.reload();
    }
        //--------------------------------------------------
    // Render
    //--------------------------------------------------

    return (
        <div className="min-h-screen bg-gray-50 p-6">

            <div className="max-w-6xl mx-auto">

                {/*==================================================*/}
                {/* Header */}
                {/*==================================================*/}

                <div className="mb-8 flex justify-between items-center">

                    <div>

                        <h1 className="text-4xl font-bold text-gray-900 mb-2">
                            Cloud Control
                        </h1>

                        <p className="text-gray-600">
                            Control your HonorPole from anywhere.
                        </p>

                    </div>

                    <Button
                        onClick={handleLogout}
                        variant="outline"
                    >
                        Logout
                    </Button>

                </div>

                {/*==================================================*/}
                {/* Messages */}
                {/*==================================================*/}

                {error && (

                    <Alert className="mb-6 bg-red-50 border-red-200">

                        <AlertDescription className="text-red-800">
                            {error}
                        </AlertDescription>

                    </Alert>

                )}

                {success && (

                    <Alert className="mb-6 bg-green-50 border-green-200">

                        <AlertDescription className="text-green-800">
                            {success}
                        </AlertDescription>

                    </Alert>

                )}

                {/*==================================================*/}
                {/* Main Layout */}
                {/*==================================================*/}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/*==================================================*/}
                    {/* Device List */}
                    {/*==================================================*/}

                    <Card>

                        <CardHeader>

                            <CardTitle>
                                My Devices
                            </CardTitle>

                            <CardDescription>
                                Select a device to control
                            </CardDescription>

                        </CardHeader>

                        <CardContent>

                            {devices.length === 0 ? (

                                <p className="text-sm text-gray-500">
                                    No devices found.
                                </p>

                            ) : (

                                <div className="space-y-2">

                                    {devices.map((device) => (

                                        <button
                                            key={device.deviceId}
                                            onClick={() =>
                                                setSelectedDevice(device.deviceId)
                                            }
                                            className={`w-full p-3 rounded-lg border text-left transition-colors ${
                                                selectedDevice === device.deviceId
                                                    ? "bg-blue-50 border-blue-500"
                                                    : "bg-white border-gray-200 hover:bg-gray-50"
                                            }`}
                                        >

                                            <div className="flex items-center justify-between">

                                                <span className="font-medium">
                                                    {device.deviceName}
                                                </span>

                                                <Badge
                                                    className={
                                                        device.online
                                                            ? "bg-green-600"
                                                            : "bg-gray-500"
                                                    }
                                                >
                                                    {device.online
                                                        ? "Online"
                                                        : "Offline"}
                                                </Badge>

                                            </div>

                                            <div className="mt-2 text-xs text-gray-500">

                                                Last Seen:

                                                {" "}

                                    {device.lastSeen &&
                                    !Number.isNaN(new Date(device.lastSeen).getTime())
                                        ? new Date(device.lastSeen).toLocaleString()
                                        : "Not available"}

                                            </div>

                                        </button>

                                    ))}

                                </div>

                            )}

                        </CardContent>

                    </Card>

                    {/*==================================================*/}
                    {/* Control Panel */}
                    {/*==================================================*/}

                    <Card className="lg:col-span-2">

                        <CardHeader>

                            <CardTitle>
                                Device Control
                            </CardTitle>

                            <CardDescription>

                                {selectedDevice
                                    ? devices.find(
                                        d =>
                                            d.deviceId ===
                                            selectedDevice
                                    )?.deviceName
                                    : "Select a device"}

                            </CardDescription>

                        </CardHeader>

                        <CardContent>

                            {selectedDevice ? (

                                <div className="space-y-6">
                                                                     {/*==================================================*/}
                                    {/* Device Status */}
                                    {/*==================================================*/}

                                    {telemetry && (

                                        <Card>

                                            <CardHeader>

                                                <CardTitle>
                                                    Device Status
                                                </CardTitle>

                                                <CardDescription>
                                                    Live telemetry from the HonorPole
                                                </CardDescription>

                                            </CardHeader>

                                            <CardContent>

                                                <div className="grid grid-cols-2 gap-4">

                                                    <div>

                                                        <div className="text-sm text-gray-500">
                                                            Status
                                                        </div>

                                                        <Badge
                                                            className={
                                                                telemetry.online
                                                                    ? "bg-green-600"
                                                                    : "bg-gray-500"
                                                            }
                                                        >
                                                            {telemetry.online
                                                                ? "ONLINE"
                                                                : "OFFLINE"}
                                                        </Badge>

                                                    </div>

                                                    <div>

                                                        <div className="text-sm text-gray-500">
                                                            Firmware
                                                        </div>

                                                        <div className="font-semibold">
                                                            {telemetry.firmware}
                                                        </div>

                                                    </div>

                                                    <div>

                                                        <div className="text-sm text-gray-500">
                                                            Current Position
                                                        </div>

                                                        <div className="font-semibold">
                                                            {telemetry.currentPosition}
                                                        </div>

                                                    </div>

                                                    <div>

                                                        <div className="text-sm text-gray-500">
                                                            Target Position
                                                        </div>

                                                        <div className="font-semibold">
                                                            {telemetry.targetPosition}
                                                        </div>

                                                    </div>

                                                    <div>

                                                        <div className="text-sm text-gray-500">
                                                            Movement
                                                        </div>

                                                        <div className="font-semibold">
                                                            {telemetry.movement}
                                                        </div>

                                                    </div>

                                                    <div>

                                                        <div className="text-sm text-gray-500">
                                                            Calibrated
                                                        </div>

                                                        <div className="font-semibold">
                                                            {telemetry.calibrated
                                                                ? "YES"
                                                                : "NO"}
                                                        </div>

                                                    </div>

                                                    <div>

                                                        <div className="text-sm text-gray-500">
                                                            WiFi
                                                        </div>

                                                        <div className="font-semibold">
                                                            {telemetry.network.ssid}
                                                        </div>

                                                    </div>

                                                    <div>

                                                        <div className="text-sm text-gray-500">
                                                            IP Address
                                                        </div>

                                                        <div className="font-semibold">
                                                            {telemetry.network.ipAddress}
                                                        </div>

                                                    </div>

                                                    <div>

                                                        <div className="text-sm text-gray-500">
                                                            Signal
                                                        </div>

                                                        <div className="font-semibold">
                                                            {telemetry.network.signalStrength} dBm
                                                        </div>

                                                    </div>

                                                    <div>

                                                        <div className="text-sm text-gray-500">
                                                            Connection
                                                        </div>

                                                        <div className="font-semibold">
                                                            {telemetry.network.wifiConnected
                                                                ? "Connected"
                                                                : "Disconnected"}
                                                        </div>

                                                    </div>

                                                </div>

                                                <hr className="my-6" />

                                                <h3 className="font-semibold mb-3">
                                                    Half-Staff Directives
                                                </h3>

                                                <div className="space-y-2 text-sm">

                                                    <div>

                                                        <strong>Federal:</strong>{" "}
                                                        {telemetry.directives.federal}

                                                    </div>

                                                    <div>

                                                        <strong>State:</strong>{" "}
                                                        {telemetry.directives.state}

                                                    </div>

                                                    <div>

                                                        <strong>Source:</strong>{" "}
                                                        {telemetry.directives.source}

                                                    </div>

                                                    <div>

                                                        <strong>Updated:</strong>{" "}
                                                        {telemetry.directives.updated}

                                                    </div>

                                                </div>

                                            </CardContent>

                                        </Card>

                                    )}

                                    {/*==================================================*/}
                                    {/* Manual Controls */}
                                    {/*==================================================*/}

                                    <div className="grid grid-cols-2 gap-4">

                                        <Button
                                            onClick={() => void handleCommand("full")}
                                            disabled={loading || !telemetry?.online}
                                            className="h-20 text-lg bg-green-600 hover:bg-green-700"
                                        >
                                            Full Staff
                                        </Button>

                                        <Button
                                            onClick={() => void handleCommand("half")}
                                            disabled={loading || !telemetry?.online}
                                            className="h-20 text-lg bg-yellow-600 hover:bg-yellow-700"
                                        >
                                            Half Staff
                                        </Button>

                                        <Button
                                            onClick={() => void handleCommand("down")}
                                            disabled={loading || !telemetry?.online}
                                            className="h-20 text-lg bg-red-600 hover:bg-red-700"
                                        >
                                            Lower Flag
                                        </Button>

                                        <Button
                                            onClick={() => void handleCommand("auto")}
                                            disabled={loading || !telemetry?.online}
                                            className="h-20 text-lg bg-blue-600 hover:bg-blue-700"
                                        >
                                            Auto Mode
                                        </Button>

                                        <Button
                                            onClick={() => void handleCommand("stop")}
                                            disabled={!telemetry?.online}
                                            className="col-span-2 h-20 text-lg"
                                            variant="secondary"
                                        >
                                            STOP
                                        </Button>

                                    </div>

                                    {/*==================================================*/}
                                    {/* Offline Warning */}
                                    {/*==================================================*/}

                                    {!telemetry?.online && (

                                        <Alert className="bg-yellow-50 border-yellow-200">

                                            <AlertDescription className="text-yellow-800">
                                                Device is offline. Controls are disabled until the HonorPole reconnects.
                                            </AlertDescription>

                                        </Alert>

                                    )}

                                    <div className="text-center text-sm text-gray-500">
                                        Status updates every 5 seconds
                                    </div>

                                </div>

                            ) : (

                                <div className="text-center py-12 text-gray-500">

                                    <p>
                                        Select a device from the list to begin
                                        controlling it.
                                    </p>

                                </div>

                            )}

                        </CardContent>

                    </Card>

                </div>

            </div>

        </div>

    );

}






