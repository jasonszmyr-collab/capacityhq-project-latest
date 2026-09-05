import { useEffect, useState } from "react";

import cloudService from "../services/cloudService";

//======================================================================
// Types
//======================================================================

export type PhysicalFlagPosition =
    | "FULL"
    | "HALF"
    | "DOWN"
    | "MOVING"
    | "UNKNOWN";

//======================================================================
// System Status Hook
//======================================================================

export function useSystemStatus()
{
    const [isOnline, setIsOnline] =
        useState(false);

    const [
        physicalPosition,
        setPhysicalPosition
    ] =
        useState<PhysicalFlagPosition>(
            "UNKNOWN"
        );

    useEffect(() =>
    {
        function updateStatus()
        {
            const telemetry =
                cloudService.getTelemetry();

            const connected =
                cloudService.getConnectionType() !==
                "offline";

            setIsOnline(
                connected &&
                telemetry.online === true
            );

            //--------------------------------------------------
            // Live Physical Flag Position
            //--------------------------------------------------

            const current =
                Number(
                    telemetry.currentPosition
                );

            const full =
                Number(
                    telemetry.learnedTopPosition
                );

            //--------------------------------------------------
            // Movement has priority over stationary position.
            //--------------------------------------------------

            if (telemetry.moving)
            {
                setPhysicalPosition(
                    "MOVING"
                );

                return;
            }

            //--------------------------------------------------
            // We need valid calibrated position information.
            //--------------------------------------------------

            if (
                !Number.isFinite(current) ||
                !Number.isFinite(full) ||
                full <= 0
            )
            {
                setPhysicalPosition(
                    "UNKNOWN"
                );

                return;
            }

            const half =
                full / 2;

            const tolerance =
                Math.max(
                    10,
                    full * 0.02
                );

            //--------------------------------------------------
            // Bottom
            //--------------------------------------------------

            if (
                Math.abs(current) <=
                tolerance
            )
            {
                setPhysicalPosition(
                    "DOWN"
                );

                return;
            }

            //--------------------------------------------------
            // Half Staff
            //--------------------------------------------------

            if (
                Math.abs(
                    current - half
                ) <= tolerance
            )
            {
                setPhysicalPosition(
                    "HALF"
                );

                return;
            }

            //--------------------------------------------------
            // Full Staff
            //--------------------------------------------------

            if (
                Math.abs(
                    current - full
                ) <= tolerance
            )
            {
                setPhysicalPosition(
                    "FULL"
                );

                return;
            }

            //--------------------------------------------------
            // Between known positions
            //--------------------------------------------------

            setPhysicalPosition(
                "UNKNOWN"
            );
        }

        updateStatus();

        const unsubscribeTelemetry =
            cloudService.subscribeTelemetry(
                () =>
                {
                    updateStatus();
                }
            );

        const unsubscribeConnection =
            cloudService.subscribeConnection(
                () =>
                {
                    updateStatus();
                }
            );

        return () =>
        {
            unsubscribeTelemetry();

            unsubscribeConnection();
        };

    }, []);

    return {
        isOnline,
        physicalPosition
    };
}