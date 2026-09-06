/******************************************************************************
 *
 * HonorPole Mobile Application
 * File: InfoCard.tsx
 * Version: 3.0.0
 *
 * Reusable dashboard card.
 *
 ******************************************************************************/

import React from "react";

export interface InfoCardProps {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    headerRight?: React.ReactNode;
    footer?: React.ReactNode;
}

const InfoCard: React.FC<InfoCardProps> = ({
    title,
    subtitle,
    icon,
    children,
    className = "",
    headerRight,
    footer,
}) => {
    return (
        <div
            className={[
                "bg-slate-900",
                "border",
                "border-slate-700",
                "rounded-xl",
                "shadow-lg",
                "overflow-hidden",
                className,
            ].join(" ")}
        >
            {/* Header */}

            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">

                <div className="flex items-center gap-3">

                    {icon && (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-blue-400">
                            {icon}
                        </div>
                    )}

                    <div>

                        <h2 className="text-lg font-semibold text-white">
                            {title}
                        </h2>

                        {subtitle && (
                            <p className="text-sm text-slate-400">
                                {subtitle}
                            </p>
                        )}

                    </div>

                </div>

                {headerRight && (
                    <div>
                        {headerRight}
                    </div>
                )}

            </div>

            {/* Body */}

            <div className="p-5">
                {children}
            </div>

            {/* Footer */}

            {footer && (
                <div className="border-t border-slate-700 bg-slate-950 px-5 py-3">
                    {footer}
                </div>
            )}

        </div>
    );
};

export default React.memo(InfoCard);