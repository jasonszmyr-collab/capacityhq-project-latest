/******************************************************************************
 *
 * HonorPole Mobile Application
 * File: DeviceCard.tsx
 * Version: 3.0.0
 *
 * Device Information Dashboard Card
 *
 ******************************************************************************/

import React from "react";
import {
    Cpu,
    CheckCircle,
    XCircle,
    ShieldCheck,
} from "lucide-react";

import InfoCard from "./InfoCard";
import StatusRow from "./StatusRow";

import type { DeviceTelemetry } from "../../types/telemetry";

export interface DeviceCardProps {
    telemetry: DeviceTelemetry;
}

const DeviceCard: React.FC<DeviceCardProps> = ({
    telemetry,
}) => {
    const onlineColor =
        telemetry.online
            ? "text-green-400"
            : "text-red-500";

    const calibrationColor =
        telemetry.calibrated
            ? "text-green-400"
            : "text-yellow-400";

    return (
        <InfoCard
            title="Device"
            subtitle="HonorPole Controller"
            icon={<Cpu size={22} />}
        >
            <StatusRow
                label="Status"
                value={
                    telemetry.online
                        ? "ONLINE"
                        : "OFFLINE"
                }
                valueColor={onlineColor}
                icon={
                    telemetry.online
                        ? (
                            <CheckCircle
                                size={16}
                            />
                        )
                        : (
                            <XCircle
                                size={16}
                            />
                        )
                }
            />

            <StatusRow
                label="Device Name"
                value={telemetry.deviceName}
            />

            <StatusRow
                label="Firmware"
                value={telemetry.firmware}
            />

            <StatusRow
                label="Hardware"
                value={telemetry.hardware}
            />

            <StatusRow
                label="Serial Number"
                value={telemetry.serialNumber}
            />

            <StatusRow
                label="Calibration"
                value={
                    telemetry.calibrated
                        ? "COMPLETE"
                        : "REQUIRED"
                }
                valueColor={calibrationColor}
                icon={
                    <ShieldCheck
                        size={16}
                    />
                }
            />

            <StatusRow
                label="Mode"
                value={
                    telemetry.automaticMode
                        ? "AUTOMATIC"
                        : "MANUAL"
                }
            />

            <StatusRow
                label="Current Command"
                value={telemetry.commandStatus}
                divider={false}
            />
        </InfoCard>
    );
};

export default React.memo(DeviceCard);