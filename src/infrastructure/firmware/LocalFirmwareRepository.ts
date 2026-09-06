//=========================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// OTAFirmwareProvider.ts
//
// Location:
// src/infrastructure/firmware/OTAFirmwareProvider.ts
//=========================================================

import { Firmware } from "../../domain/Firmware";
import type { IFirmwareProvider } from "../../application/firmware/IFirmwareProvider";

export class OTAFirmwareProvider implements IFirmwareProvider {

    //-----------------------------------------------------
    // Constants
    //-----------------------------------------------------

    private static readonly REQUEST_TIMEOUT = 10000;
    private static readonly MAX_RETRIES = 1;

    //-----------------------------------------------------
    // Private Fields
    //-----------------------------------------------------

    private readonly _baseUrl: string;

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
     * Returns true if the OTA service is reachable.
     */
    public async isAvailable(): Promise<boolean> {

        try {

            const response = await this.fetchWithTimeout(
                `${this._baseUrl}/firmware/ping`
            );

            return response.ok;

        }
        catch {

            return false;

        }

    }

    //-----------------------------------------------------

    /**
     * Retrieves the latest firmware metadata.
     */
    public async getLatestFirmware(): Promise<Firmware> {

        let lastError: unknown;

        for (let attempt = 0; attempt <= OTAFirmwareProvider.MAX_RETRIES; attempt++) {

            try {

                const response = await this.fetchWithTimeout(
                    `${this._baseUrl}/firmware/latest`
                );

                if (!response.ok) {

                    throw new Error(
                        `Firmware request failed (HTTP ${response.status})`
                    );

                }

                const contentType =
                    response.headers.get("content-type") ?? "";

                if (!contentType.includes("application/json")) {

                    throw new Error(
                        "OTA server returned an invalid response type."
                    );

                }

                const json = await response.json();

                this.validateFirmware(json);

                return new Firmware(

                    json.version,
                    json.buildNumber,
                    new Date(json.releaseDate),
                    json.hardwareRevision,
                    json.bootloaderVersion

                );

            }
            catch (error) {

                lastError = error;

                if (attempt < OTAFirmwareProvider.MAX_RETRIES) {

                    await this.delay(1000);
                    continue;

                }

            }

        }

        throw lastError instanceof Error
            ? lastError
            : new Error("Unable to retrieve firmware information.");

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

    private async fetchWithTimeout(
        url: string
    ): Promise<Response> {

        const controller = new AbortController();

        const timeout = setTimeout(() => {

            controller.abort();

        }, OTAFirmwareProvider.REQUEST_TIMEOUT);

        try {

            return await fetch(url, {

                signal: controller.signal

            });

        }
        finally {

            clearTimeout(timeout);

        }

    }

    //-----------------------------------------------------

    private validateFirmware(data: any): void {

        if (!data) {

            throw new Error(
                "Firmware metadata was not returned."
            );

        }

        if (typeof data.version !== "string") {

            throw new Error(
                "Firmware version missing."
            );

        }

        if (typeof data.buildNumber !== "number") {

            throw new Error(
                "Firmware build number missing."
            );

        }

        if (!data.releaseDate) {

            throw new Error(
                "Firmware release date missing."
            );

        }

    }

    //-----------------------------------------------------

    private delay(ms: number): Promise<void> {

        return new Promise(resolve => {

            setTimeout(resolve, ms);

        });

    }

}
