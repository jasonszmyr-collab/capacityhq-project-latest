import { useEffect, useState } from "react";
import DevicePairing from "./DevicePairing";
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
import {
    getHonorPoleMode,
    setHonorPoleMode,
    type HonorPoleOverrideMode
} from "../services/honorPoleModeService";

export default function CloudDeviceControl()
{
    const [devices, setDevices] = useState<DeviceInfo[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<string | null>(
        cloudService.getCurrentDeviceId()
    );
    const [telemetry, setTelemetry] = useState<DeviceTelemetry | null>(null);
    const [operatingMode, setOperatingMode] =
        useState<HonorPoleOverrideMode | null>(null);
    const [loading, setLoading] = useState(false);
    const [switching, setSwitching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showPairing, setShowPairing] = useState(false);

    const selectedDeviceInfo =
        devices.find(device => device.deviceId === selectedDevice) ?? null;

    function selectDevice(device: DeviceInfo)
    {
        if (device.deviceId === selectedDevice)
        {
            return;
        }

        setSwitching(true);
        setTelemetry(null);
        setOperatingMode(null);
        setError(null);
        setSuccess(null);

        // This persisted selection is shared with the Home page.
        cloudService.setDevice(device);
        setSelectedDevice(device.deviceId);
    }

    useEffect(() =>
    {
        let mounted = true;

        async function loadDevices()
        {
            try
            {
                const list = await cloudService.getDevices();

                if (!mounted)
                {
                    return;
                }

                setDevices(list);

                if (list.length === 0)
                {
                    setSelectedDevice(null);
                    return;
                }

                const currentDeviceId = cloudService.getCurrentDeviceId();
                const activeDevice =
                    list.find(device => device.deviceId === currentDeviceId)
                    ?? list[0];

                cloudService.setDevice(activeDevice);
                setSelectedDevice(activeDevice.deviceId);
            }
            catch (err)
            {
                if (mounted)
                {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Unable to load HonorPoles."
                    );
                }
            }
        }

        void loadDevices();

        return () =>
        {
            mounted = false;
        };
    }, []);

    useEffect(() =>
    {
        if (!selectedDevice)
        {
            setTelemetry(null);
            setOperatingMode(null);
            return;
        }

        let mounted = true;

        const unsubscribeTelemetry =
            cloudService.subscribeTelemetry(
                (liveTelemetry: DeviceTelemetry) =>
                {
                    if (!mounted)
                    {
                        return;
                    }

                    setTelemetry(liveTelemetry);
                    setSwitching(false);
                    setError(null);
                }
            );

        async function connectAndLoadMode(deviceId: string)
        {
            try
            {
                setSwitching(true);

                await cloudService.connect();

                if (!mounted)
                {
                    return;
                }

                const mode =
                    await getHonorPoleMode(deviceId);

                if (mounted)
                {
                    setOperatingMode(mode.override_mode);
                    setSwitching(false);
                }
            }
            catch (err)
            {
                if (mounted)
                {
                    setSwitching(false);
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Unable to load the selected HonorPole."
                    );
                }
            }
        }

        void connectAndLoadMode(selectedDevice);

        const modeInterval = window.setInterval(() =>
        {
            void getHonorPoleMode(selectedDevice)
                .then(mode =>
                {
                    if (mounted)
                    {
                        setOperatingMode(mode.override_mode);
                    }
                })
                .catch(error =>
                {
                    console.error(
                        "Unable to refresh HonorPole operating mode:",
                        error
                    );
                });
        }, 5000);

        return () =>
        {
            mounted = false;
            unsubscribeTelemetry();
            window.clearInterval(modeInterval);
        };
    }, [selectedDevice]);

    async function handleCommand(command: CommandType)
    {
        if (!selectedDevice || switching)
        {
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);

        try
        {
            if (command === "auto")
            {
                const mode = await setHonorPoleMode(selectedDevice, "AUTO");
                setOperatingMode(mode.override_mode);
                setSuccess(
                    `Automatic mode enabled for ${selectedDeviceInfo?.deviceName ?? selectedDevice}.`
                );
                return;
            }

            if (command !== "stop")
            {
                const modeByCommand: Partial<
                    Record<CommandType, HonorPoleOverrideMode>
                > = {
                    full: "FULL",
                    half: "HALF",
                    down: "DOWN"
                };
                const nextMode = modeByCommand[command];

                if (nextMode)
                {
                    const mode = await setHonorPoleMode(
                        selectedDevice,
                        nextMode
                    );
                    setOperatingMode(mode.override_mode);
                }
            }

            const deviceCommand: CommandType =
                command === "down"
                    ? "bottom"
                    : command;

            const sent = await cloudService.sendCommand(
                selectedDevice,
                deviceCommand
            );

            if (!sent)
            {
                throw new Error("Command could not be delivered.");
            }

            setSuccess(
                `${command.toUpperCase()} sent to ${selectedDeviceInfo?.deviceName ?? selectedDevice}.`
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

    function handleLogout()
    {
        cloudService.clearAuth();
        window.location.reload();
    }

    const controlsDisabled =
        loading || switching || !telemetry?.online;

    const positionPercent =
        telemetry && telemetry.learnedTopPosition > 0
            ? Math.max(
                0,
                Math.min(
                    100,
                    Math.round(
                        telemetry.currentPosition /
                        telemetry.learnedTopPosition * 100
                    )
                )
            )
            : null;

    return (
        <div className="min-h-screen bg-gray-50 p-4 pb-28 sm:p-6 sm:pb-28">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            HonorPole Control
                        </h1>
                        <p className="mt-1 text-gray-600">
                            Select the pole you want to operate.
                        </p>
                    </div>

                    <Button
                        onClick={handleLogout}
                        variant="outline"
                    >
                        Logout
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Select HonorPole</CardTitle>
                        <CardDescription>
                            This selection is shared with the Home page.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <select
                            id="control-honorpole-selector"
                            value={selectedDevice ?? ""}
                            disabled={devices.length === 0 || switching}
                            onChange={(event) =>
                            {
                                const device = devices.find(
                                    item => item.deviceId === event.target.value
                                );

                                if (device)
                                {
                                    selectDevice(device);
                                }
                            }}
                            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                        >
                            {devices.length === 0 && (
                                <option value="">No HonorPoles found</option>
                            )}

                            {devices.map(device => (
                                <option
                                    key={device.deviceId}
                                    value={device.deviceId}
                                >
                                    {device.deviceName} - {device.deviceId}
                                </option>
                            ))}
                        </select>

                        <Button
                            type="button"
                            onClick={() => setShowPairing(true)}
                            className="mt-4 w-full"
                        >
                            Add HonorPole
                        </Button>

                        {showPairing && (
                            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                                <div className="mb-4 flex items-center justify-between gap-4">
                                    <h3 className="text-lg font-semibold text-gray-900">
                                        Add HonorPole
                                    </h3>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setShowPairing(false)}
                                    >
                                        Cancel
                                    </Button>
                                </div>

                                <DevicePairing
                                    onPairingSuccess={(deviceId) =>
                                    {
                                        setSelectedDevice(deviceId);
                                        setShowPairing(false);
                                        window.location.reload();
                                    }}
                                />
                            </div>
                        )}

                        {switching && (
                            <p className="mt-3 text-sm text-blue-700">
                                Loading the selected HonorPole...
                            </p>
                        )}
                    </CardContent>
                </Card>

                {error && (
                    <Alert className="bg-red-50 border-red-200">
                        <AlertDescription className="text-red-800">
                            {error}
                        </AlertDescription>
                    </Alert>
                )}

                {success && (
                    <Alert className="bg-green-50 border-green-200">
                        <AlertDescription className="text-green-800">
                            {success}
                        </AlertDescription>
                    </Alert>
                )}

                <Card>
                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <CardTitle>
                                    {selectedDeviceInfo?.deviceName ?? "No HonorPole selected"}
                                </CardTitle>
                                <CardDescription>
                                    {selectedDevice ?? "Select an HonorPole to begin"}
                                </CardDescription>
                            </div>

                            {selectedDevice && (
                                <Badge
                                    className={
                                        telemetry?.online
                                            ? "bg-green-600"
                                            : "bg-gray-500"
                                    }
                                >
                                    {telemetry?.online ? "Online" : "Offline"}
                                </Badge>
                            )}
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-6">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                            <h3 className="mb-4 text-center text-xl font-bold text-gray-900">
                                HonorPole Status
                            </h3>

                            <div className="divide-y divide-gray-200">
                                <div className="flex justify-between gap-4 py-3">
                                    <span className="text-gray-500">Device ID</span>
                                    <span className="font-semibold text-gray-900">
                                        {selectedDevice ?? "--"}
                                    </span>
                                </div>

                                <div className="flex justify-between gap-4 py-3">
                                    <span className="text-gray-500">Device</span>
                                    <span className="font-semibold text-gray-900">
                                        {telemetry?.deviceName ?? selectedDeviceInfo?.deviceName ?? "HonorPole"}
                                    </span>
                                </div>

                                <div className="flex justify-between gap-4 py-3">
                                    <span className="text-gray-500">Firmware</span>
                                    <span className="font-semibold text-gray-900">
                                        {telemetry?.firmware ?? selectedDeviceInfo?.firmware ?? "--"}
                                    </span>
                                </div>

                                <div className="flex justify-between gap-4 py-3">
                                    <span className="text-gray-500">Connection</span>
                                    <span className="font-semibold text-gray-900">
                                        {telemetry?.online ? "Online" : "Offline"}
                                    </span>
                                </div>

                                <div className="flex justify-between gap-4 py-3">
                                    <span className="text-gray-500">Cloud</span>
                                    <span className="font-semibold text-gray-900">
                                        {telemetry?.network?.cloudConnected ? "Connected" : "Disconnected"}
                                    </span>
                                </div>

                                <div className="flex justify-between gap-4 py-3">
                                    <span className="text-gray-500">WiFi</span>
                                    <span className="font-semibold text-gray-900">
                                        {telemetry?.network?.wifiConnected ? "Connected" : "Disconnected"}
                                    </span>
                                </div>

                                <div className="flex justify-between gap-4 py-3">
                                    <span className="text-gray-500">IP Address</span>
                                    <span className="font-semibold text-gray-900">
                                        {telemetry?.network?.ipAddress || "--"}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div className="rounded-lg bg-gray-100 p-4">
                                <div className="text-sm text-gray-500">Flag Position</div>
                                <div className="mt-1 font-semibold text-gray-900">
                                    {positionPercent === null
                                        ? "Waiting for status"
                                        : `${positionPercent}%`}
                                </div>
                            </div>

                            <div className="rounded-lg bg-gray-100 p-4">
                                <div className="text-sm text-gray-500">Operating Mode</div>
                                <div className="mt-1 font-semibold text-gray-900">
                                    {operatingMode ?? "Loading"}
                                </div>
                            </div>

                            <div className="rounded-lg bg-gray-100 p-4">
                                <div className="text-sm text-gray-500">Movement</div>
                                <div className="mt-1 font-semibold text-gray-900">
                                    {telemetry?.movement ?? "Waiting for status"}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4 text-center">
                            <div className="text-sm text-blue-700">Controlling</div>
                            <div className="mt-1 text-lg font-bold text-blue-950">
                                {selectedDeviceInfo?.deviceName ?? selectedDevice ?? "No HonorPole selected"}
                            </div>
                            {selectedDeviceInfo && (
                                <div className="text-sm text-blue-800">
                                    {selectedDeviceInfo.deviceId}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Button
                                onClick={() => void handleCommand("full")}
                                disabled={controlsDisabled}
                                className="h-20 text-lg bg-green-600 hover:bg-green-700"
                            >
                                USA Full
                            </Button>

                            <Button
                                onClick={() => void handleCommand("half")}
                                disabled={controlsDisabled}
                                className="h-20 text-lg bg-yellow-600 hover:bg-yellow-700"
                            >
                                HALF STAFF
                            </Button>

                            <Button
                                onClick={() => void handleCommand("down")}
                                disabled={controlsDisabled}
                                className="h-20 text-lg bg-red-600 hover:bg-red-700"
                            >
                                DOWN
                            </Button>

                            <Button
                                onClick={() => void handleCommand("auto")}
                                disabled={controlsDisabled}
                                className="h-20 text-lg bg-blue-600 hover:bg-blue-700"
                            >
                                AUTO
                            </Button>

                            <Button
                                onClick={() => void handleCommand("stop")}
                                disabled={switching || !telemetry?.online}
                                className="col-span-2 h-20 text-xl font-bold bg-red-700 hover:bg-red-800"
                            >
                                STOP MOTOR
                            </Button>
                        </div>

                        {!telemetry?.online && selectedDevice && !switching && (
                            <Alert className="bg-yellow-50 border-yellow-200">
                                <AlertDescription className="text-yellow-800">
                                    This HonorPole is offline. Controls are disabled until it reconnects.
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="text-center text-sm text-gray-500">
                            Status updates every 5 seconds
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}









