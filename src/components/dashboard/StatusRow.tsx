/******************************************************************************
 *
 * HonorPole Mobile Application
 * File: StatusRow.tsx
 * Version: 3.0.0
 *
 * Reusable dashboard status row component.
 *
 ******************************************************************************/

import React from "react";

export interface StatusRowProps {
    label: string;
    value: React.ReactNode;
    icon?: React.ReactNode;
    valueColor?: string;
    className?: string;
    divider?: boolean;
}

const StatusRow: React.FC<StatusRowProps> = ({
    label,
    value,
    icon,
    valueColor = "text-white",
    className = "",
    divider = true,
}) => {
    return (
        <div
            className={[
                "flex items-center justify-between py-2",
                divider ? "border-b border-slate-700 last:border-b-0" : "",
                className,
            ].join(" ")}
        >
            <div className="flex items-center gap-2 min-w-0">
                {icon && (
                    <div className="flex-shrink-0 text-slate-400">
                        {icon}
                    </div>
                )}

                <span className="text-sm text-slate-400 truncate">
                    {label}
                </span>
            </div>

            <div
                className={[
                    "text-sm font-semibold text-right ml-4",
                    valueColor,
                ].join(" ")}
            >
                {value}
            </div>
        </div>
    );
};

export default React.memo(StatusRow);