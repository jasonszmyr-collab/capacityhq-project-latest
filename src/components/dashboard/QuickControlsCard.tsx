/******************************************************************************
 *
 * HonorPole Mobile Application
 * File: QuickControlsCard.tsx
 * Version: 3.0.0
 *
 * Primary HonorPole control panel.
 *
 ******************************************************************************/

import React, { useState } from "react";
import {
    ArrowUp,
    ArrowDown,
    Pause,
    RotateCw,
    Loader2,
} from "lucide-react";

import InfoCard from "./InfoCard";

export type HonorPoleCommand =
    | "FULL"
    | "HALF"
    | "BOTTOM"
    | "STOP"
    | "REFRESH";

export interface QuickControlsCardProps {
    online: boolean;
    busy?: boolean;

    onCommand: (
        command: HonorPoleCommand
    ) => Promise<void> | void;
}

interface ButtonProps {
    title: string;
    icon: React.ReactNode;
    color: string;
    disabled: boolean;
    loading: boolean;
    onClick: () => void;
}

const ControlButton: React.FC<ButtonProps> = ({
    title,
    icon,
    color,
    disabled,
    loading,
    onClick,
}) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={[
            "flex items-center justify-center gap-2",
            "rounded-lg",
            "px-4 py-3",
            "font-semibold",
            "transition-all",
            "duration-200",
            color,
            disabled
                ? "opacity-50 cursor-not-allowed"
                : "hover:scale-[1.02] active:scale-95",
        ].join(" ")}
    >
        {loading ? (
            <Loader2
                size={18}
                className="animate-spin"
            />
        ) : (
            icon
        )}

        <span>{title}</span>
    </button>
);

const QuickControlsCard: React.FC<
    QuickControlsCardProps
> = ({
    online,
    busy = false,
    onCommand,
}) => {
    const [active, setActive] =
        useState<HonorPoleCommand | null>(null);

    const execute = async (
        command: HonorPoleCommand
    ) => {
        if (!online) return;
        if (busy) return;

        try {
            setActive(command);

            await onCommand(command);
        } finally {
            setActive(null);
        }
    };

    const disabled = !online || busy;

    return (
        <InfoCard
            title="Quick Controls"
            subtitle="HonorPole Commands"
        >
            <div className="grid grid-cols-2 gap-3">

                <ControlButton
                    title="Raise"
                    icon={<ArrowUp size={18} />}
                    color="bg-green-600 hover:bg-green-500 text-white"
                    disabled={disabled}
                    loading={active === "FULL"}
                    onClick={() =>
                        execute("FULL")
                    }
                />

                <ControlButton
                    title="Half Staff"
                    icon={<Pause size={18} />}
                    color="bg-yellow-600 hover:bg-yellow-500 text-white"
                    disabled={disabled}
                    loading={active === "HALF"}
                    onClick={() =>
                        execute("HALF")
                    }
                />

                <ControlButton
                    title="Lower"
                    icon={<ArrowDown size={18} />}
                    color="bg-blue-600 hover:bg-blue-500 text-white"
                    disabled={disabled}
                    loading={active === "BOTTOM"}
                    onClick={() =>
                        execute("BOTTOM")
                    }
                />

                <ControlButton
                    title="Refresh"
                    icon={<RotateCw size={18} />}
                    color="bg-slate-700 hover:bg-slate-600 text-white"
                    disabled={disabled}
                    loading={active === "REFRESH"}
                    onClick={() =>
                        execute("REFRESH")
                    }
                />

            </div>

            <div className="mt-4">

                <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                        execute("STOP")
                    }
                    className={[
                        "w-full",
                        "rounded-lg",
                        "bg-red-600",
                        "py-4",
                        "text-lg",
                        "font-bold",
                        "text-white",
                        "transition-all",
                        disabled
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:bg-red-500 active:scale-[0.98]",
                    ].join(" ")}
                >
                    {active === "STOP" ? (
                        <span className="flex justify-center">
                            <Loader2
                                size={22}
                                className="animate-spin"
                            />
                        </span>
                    ) : (
                        "EMERGENCY STOP"
                    )}
                </button>

            </div>

            {!online && (
                <div className="mt-4 rounded-lg border border-red-700 bg-red-950 p-3 text-center text-sm text-red-300">
                    Device is offline.
                    Controls are disabled.
                </div>
            )}
        </InfoCard>
    );
};

export default React.memo(QuickControlsCard);