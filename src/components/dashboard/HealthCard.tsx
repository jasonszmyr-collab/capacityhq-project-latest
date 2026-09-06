/******************************************************************************
 *
 * HonorPole Mobile Application
 * File: HealthCard.tsx
 * Version: 3.0.0
 *
 * Displays device health information.
 *
 ******************************************************************************/

import React from "react";
import {
    Activity,
    Thermometer,
    Battery,
    Cpu,
    Clock,
    MemoryStick,
} from "lucide-react";

import InfoCard from "./InfoCard";
import StatusRow from "./StatusRow";

import type { DeviceTelemetry } from "../../types/telemetry";
import {
    formatVoltage,
    formatCurrent,
    formatTemperature,
    formatMemory,
    formatUptime,
} from "../../utils/formatters";

export interface HealthCardProps {
    telemetry: DeviceTelemetry;
}

const HealthCard: React.FC<HealthCardProps> = ({
    telemetry,
}) => {
    const {
        batteryVoltage,
        motorCurrent,
        cpuTemperature,
        freeMemory,
        uptime,
        lastHeartbeat,
    } = telemetry.health;

    const tempColor =
        cpuTemperature > 70
            ? "text-red-500"
            : cpuTemperature > 55
            ? "text-yellow-400"
            : "text-green-400";

    const batteryColor =
        batteryVoltage < 11
            ? "text-red-500"
            : batteryVoltage < 12
            ? "text-yellow-400"
            : "text-green-400";

    return (
        <InfoCard
            title="System Health"
            subtitle="ESP32 Controller"
            icon={<Activity size={22} />}
        >
            <StatusRow
                label="Battery Voltage"
                value={formatVoltage(batteryVoltage)}
                valueColor={batteryColor}
                icon={<Battery size={16} />}
            />

            <StatusRow
                label="Motor Current"
                value={formatCurrent(motorCurrent)}
                icon={<Cpu size={16} />}
            />

            <StatusRow
                label="CPU Temperature"
                value={formatTemperature(cpuTemperature)}
                valueColor={tempColor}
                icon={<Thermometer size={16} />}
            />

            <StatusRow
                label="Free Memory"
                value={formatMemory(freeMemory)}
                icon={<MemoryStick size={16} />}
            />

            <StatusRow
                label="Uptime"
                value={formatUptime(uptime)}
                icon={<Clock size={16} />}
            />

            <StatusRow
                label="Last Heartbeat"
                value={lastHeartbeat}
                divider={false}
            />
        </InfoCard>
    );
};

export default React.memo(HealthCard);