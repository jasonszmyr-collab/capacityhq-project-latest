/******************************************************************************
 *
 * HonorPole Mobile Application
 * File: useHonorPole.ts
 * Version: 3.0.0
 *
 * Central HonorPole state manager.
 *
 ******************************************************************************/

import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceTelemetry } from "../types/telemetry";

export type HonorPoleCommand =
    | "FULL"
    | "HALF"
    | "BOTTOM"
    | "STOP";

export interface HonorPoleApi {
    telemetry: DeviceTelemetry | null;

    loading: boolean;
    connected: boolean;
    sendingCommand: boolean;
    error: string | null;

    refresh(): Promise<void>;

    sendCommand(
        command: HonorPoleCommand
    ): Promise<boolean>;
}

const API_BASE =
    import.meta.env.VITE_API_BASE ??
    "https://capacityhq-project-latest.onrender.com";

export default function useHonorPole(): HonorPoleApi {

    const [telemetry, setTelemetry] =
        useState<DeviceTelemetry | null>(null);

    const [loading, setLoading] =
        useState(true);

    const [connected, setConnected] =
        useState(false);

    const [sendingCommand, setSendingCommand] =
        useState(false);

    const [error, setError] =
        useState<string | null>(null);

    const timer =
        useRef<number>();

    const refresh = useCallback(async () => {

        try {

            const response =
                await fetch(`${API_BASE}/status`);

            if (!response.ok)
                throw new Error("Unable to fetch status");

            const data =
                await response.json();

            setTelemetry(data);

            setConnected(true);

            setError(null);

        }
        catch (err) {

            console.error(err);

            setConnected(false);

            setError("Unable to contact HonorPole");

        }
        finally {

            setLoading(false);

        }

    }, []);

    const sendCommand = useCallback(
        async (
            command: HonorPoleCommand
        ): Promise<boolean> => {

            try {

                setSendingCommand(true);

                const response =
                    await fetch(
                        `${API_BASE}/control`,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json",
                            },

                            body: JSON.stringify({
                                command,
                            }),
                        }
                    );

                if (!response.ok)
                    throw new Error(
                        "Command failed"
                    );

                await refresh();

                return true;

            }
            catch (err) {

                console.error(err);

                setError(
                    "Unable to send command"
                );

                return false;

            }
            finally {

                setSendingCommand(false);

            }
        },
        [refresh]
    );

    useEffect(() => {

        refresh();

        timer.current = window.setInterval(
            refresh,
            3000
        );

        return () => {

            if (timer.current) {

                clearInterval(timer.current);

            }

        };

    }, [refresh]);

    return {

        telemetry,

        loading,

        connected,

        sendingCommand,

        error,

        refresh,

        sendCommand,

    };
}