//=========================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// OTAFirmwareInstaller.ts
//
// Location:
// src/infrastructure/firmware/OTAFirmwareInstaller.ts
//=========================================================

import { Firmware } from "../../domain/Firmware";
import type { IFirmwareInstaller } from "../../application/firmware/IFirmwareInstaller";

export class OTAFirmwareInstaller implements IFirmwareInstaller {

    //-----------------------------------------------------
    // Constants
    //-----------------------------------------------------

    private static readonly REQUEST_TIMEOUT = 30000;
    private static readonly MAX_RETRIES = 1;

    //-----------------------------------------------------
    // Private Fields
    //-----------------------------------------------------

    private readonly _baseUrl: string;

    private _installing = false;
    private _progress = 0;

    private _abortController: AbortController | null = null;

    //-----------------------------------------------------
    // Constructor
    //-----------------------------------------------------

    constructor(baseUrl: string) {

        this._baseUrl = baseUrl.replace(/\/+$/, "");

    }

    //-----------------------------------------------------
    // Public Methods
    //-----------------------------------------------------

    /**
     * Begins installing firmware.
     */
    public async install(firmware: Firmware): Promise<void> {

        if (this._installing) {

            throw new Error(
                "A firmware installation is already in progress."
            );

        }

        this._installing = true;
        this._progress = 0;

        let lastError: unknown;

        try {

            for (
                let attempt = 0;
                attempt <= OTAFirmwareInstaller.MAX_RETRIES;
                attempt++
            ) {

                try {

                    this._abortController = new AbortController();

                    const timeout = setTimeout(() => {

                        this._abortController?.abort();

                    }, OTAFirmwareInstaller.REQUEST_TIMEOUT);

                    try {

                        this._progress = 10;

                        const response = await fetch(

                            `${this._baseUrl}/firmware/install`,

                            {

                                method: "POST",

                                headers: {

                                    "Content-Type": "application/json"

                                },

                                body: JSON.stringify(
                                    firmware.toJSON()
                                ),

                                signal: this._abortController.signal

                            }

                        );

                        clearTimeout(timeout);

                        if (!response.ok) {

                            throw new Error(
                                `Firmware installation failed (HTTP ${response.status})`
                            );

                        }

                        const contentType =
                            response.headers.get("content-type") ?? "";

                        if (
                            contentType.includes("application/json")
                        ) {

                            const json = await response.json();

                            if (
                                json.success === false
                            ) {

                                throw new Error(
                                    json.message ??
                                    "Firmware installation failed."
                                );

                            }

                        }

                        this._progress = 100;

                        return;

                    }
                    finally {

                        clearTimeout(timeout);

                    }

                }
                catch (error) {

                    lastError = error;

                    if (
                        attempt <
                        OTAFirmwareInstaller.MAX_RETRIES
                    ) {

                        await this.delay(1000);
                        continue;

                    }

                }

            }

            throw lastError;

        }
        finally {

            this._installing = false;
            this._abortController = null;

        }

    }

    //-----------------------------------------------------

    /**
     * Cancels the current installation.
     */
    public async cancel(): Promise<void> {

        if (this._abortController) {

            this._abortController.abort();

        }

        this.reset();

    }

    //-----------------------------------------------------

    /**
     * Returns the installation progress.
     */
    public async getProgress(): Promise<number> {

        return this._progress;

    }

    //-----------------------------------------------------

    /**
     * Returns true if an installation is running.
     */
    public async isInstalling(): Promise<boolean> {

        return this._installing;

    }

    //-----------------------------------------------------

    /**
     * Resets the installer state.
     */
    public reset(): void {

        this._installing = false;
        this._progress = 0;
        this._abortController = null;

    }

    //-----------------------------------------------------
    // Public Properties
    //-----------------------------------------------------

    public get baseUrl(): string {

        return this._baseUrl;

    }

    //-----------------------------------------------------

    public toString(): string {

        return this._baseUrl;

    }

    //-----------------------------------------------------
    // Private Methods
    //-----------------------------------------------------

    private delay(
        milliseconds: number
    ): Promise<void> {

        return new Promise(resolve => {

            setTimeout(resolve, milliseconds);

        });

    }

}