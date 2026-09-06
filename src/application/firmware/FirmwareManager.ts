//=========================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// FirmwareManager.ts
//
// Location:
// src/application/firmware/FirmwareManager.ts
//=========================================================

import { Firmware } from "../../domain/Firmware";
import { Version } from "../../domain/valueObjects/Version";

/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * FirmwareManager
 *
 * Coordinates firmware workflow for the application layer.
 *
 * Responsibilities
 * ----------------
 * • Manage firmware state
 * • Track update checks
 * • Coordinate update workflow
 * • Expose firmware information to the application
 *
 * This class contains no networking, storage, UI,
 * or hardware-specific logic.
 * ============================================================================
 */

export class FirmwareManager {

    //-----------------------------------------------------
    // Private Fields
    //-----------------------------------------------------

    private _firmware: Firmware;

    private _checkingForUpdates = false;

    private _lastCheck: Date | null = null;

    //-----------------------------------------------------
    // Constructor
    //-----------------------------------------------------

    constructor(
        firmware: Firmware
    ) {

        this._firmware = firmware;

    }

    //-----------------------------------------------------
    // Public Properties
    //-----------------------------------------------------

    public get firmware(): Firmware {

        return this._firmware;

    }

    //-----------------------------------------------------

    public get currentVersion(): Version {

        return this._firmware.version;

    }

    //-----------------------------------------------------

    public get latestVersion(): Version {

        return this._firmware.latestVersion;

    }

    //-----------------------------------------------------

    public get checkingForUpdates(): boolean {

        return this._checkingForUpdates;

    }

    //-----------------------------------------------------

    public get updateAvailable(): boolean {

        return this._firmware.updateAvailable;

    }

    //-----------------------------------------------------

    public get lastCheck(): Date | null {

        return this._lastCheck;

    }

    //-----------------------------------------------------
    // Public Methods
    //-----------------------------------------------------

    /**
     * Begins a firmware update check.
     */
    public beginUpdateCheck(): void {

        if (this._checkingForUpdates) {

            return;

        }

        this._checkingForUpdates = true;

    }

    //-----------------------------------------------------

    /**
     * Completes the firmware update check.
     */
    public completeUpdateCheck(): void {

        this._checkingForUpdates = false;

        this._lastCheck = new Date();

    }

    //-----------------------------------------------------

    /**
     * Cancels a firmware update check.
     */
    public cancelUpdateCheck(): void {

        this._checkingForUpdates = false;

    }

    //-----------------------------------------------------

    /**
     * Updates the latest available firmware version.
     */
    public setLatestVersion(
        version: Version
    ): void {

        this._firmware.setLatestVersion(version);

    }

    //-----------------------------------------------------

    /**
     * Returns true if newer firmware exists.
     */
    public needsUpdate(): boolean {

        return this._firmware.needsUpdate();

    }

    //-----------------------------------------------------

    /**
     * Marks the firmware as successfully updated.
     */
    public markUpdated(): void {

        this._firmware.markUpdated();

        this._checkingForUpdates = false;

        this._lastCheck = new Date();

    }

    //-----------------------------------------------------

    /**
     * Replaces the managed firmware instance.
     */
    public replaceFirmware(
        firmware: Firmware
    ): void {

        this._firmware = firmware;

        this.reset();

    }

    //-----------------------------------------------------

    /**
     * Resets the manager state.
     */
    public reset(): void {

        this._checkingForUpdates = false;

        this._lastCheck = null;

    }

    //-----------------------------------------------------

    /**
     * Returns a serializable representation.
     */
    public toJSON(): {

        firmware: ReturnType<Firmware["toJSON"]>;
        currentVersion: string;
        latestVersion: string;
        checkingForUpdates: boolean;
        updateAvailable: boolean;
        lastCheck: Date | null;

    } {

        return Object.freeze({

            firmware: this._firmware.toJSON(),

            currentVersion: this.currentVersion.toString(),

            latestVersion: this.latestVersion.toString(),

            checkingForUpdates: this._checkingForUpdates,

            updateAvailable: this.updateAvailable,

            lastCheck: this._lastCheck

        });

    }

    //-----------------------------------------------------

    public toString(): string {

        return `FirmwareManager (${this.currentVersion})`;

    }

}