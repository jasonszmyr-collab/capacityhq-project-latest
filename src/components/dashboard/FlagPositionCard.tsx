/******************************************************************************
 *
 * HonorPole Mobile Application
 * File: FlagPositionCard.tsx
 * Version: 3.0.0
 *
 * Displays current flag position and movement.
 *
 ******************************************************************************/

import React from "react";
import {
    Flag,
    ArrowUp,
    ArrowDown,
    Pause,
} from "lucide-react";

import InfoCard from "./InfoCard";
import StatusRow from "./StatusRow";

import type { DeviceTelemetry } from "../../types/telemetry";
import { getPositionPercent } from "../../utils/helpers";

export interface FlagPositionCardProps {
    telemetry: DeviceTelemetry;
}

const FlagPositionCard: React.FC<FlagPositionCardProps> = ({
    telemetry,
}) => {
    const percent = getPositionPercent(
        telemetry.currentPosition,
        telemetry.learnedTopPosition
    );

    let movementText = "STOPPED";
    let movementColor = "text-green-400";
    let movementIcon = <Pause size={16} />;

    switch (telemetry.movement) {
        case "RAISING":
            movementText = "RAISING";
            movementColor = "text-blue-400";
            movementIcon = <ArrowUp size={16} />;
            break;

        case "LOWERING":
            movementText = "LOWERING";
            movementColor = "text-yellow-400";
            movementIcon = <ArrowDown size={16} />;
            break;

        case "HALF":
            movementText = "HALF STAFF";
            movementColor = "text-purple-400";
            movementIcon = <Pause size={16} />;
            break;

        case "CALIBRATING":
            movementText = "CALIBRATING";
            movementColor = "text-orange-400";
            movementIcon = <ArrowUp size={16} />;
            break;

        case "ERROR":
            movementText = "ERROR";
            movementColor = "text-red-500";
            movementIcon = <Pause size={16} />;
            break;
    }

    return (
        <InfoCard
            title="Flag Position"
            subtitle="Live Position Tracking"
            icon={<Flag size={22} />}
        >
            <StatusRow
                label="Current Position"
                value={telemetry.currentPosition}
            />

            <StatusRow
                label="Target Position"
                value={telemetry.targetPosition}
            />

            <StatusRow
                label="Full Position"
                value={telemetry.learnedTopPosition}
            />

            <StatusRow
                label="Movement"
                value={movementText}
                valueColor={movementColor}
                icon={movementIcon}
                divider={false}
            />

            <div className="mt-6">

                <div className="flex justify-between text-sm text-slate-400 mb-2">
                    <span>Bottom</span>
                    <span>{percent}%</span>
                    <span>Top</span>
                </div>

                <div className="h-4 w-full rounded-full bg-slate-700 overflow-hidden">

                    <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
                        style={{
                            width: `${percent}%`,
                        }}
                    />

                </div>

            </div>

        </InfoCard>
    );
};

export default React.memo(FlagPositionCard);