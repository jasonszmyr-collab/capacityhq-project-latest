//=============================================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// Firmware.ts
//
// PART 1 OF 3
//
// Location:
// src/domain/Firmware.ts
//
// Description:
// Represents the firmware installed on an HonorPole device.
// This is a pure domain model and contains no networking,
// OTA, storage, UI, or ESP32-specific logic.
//
//=============================================================================

import { Version } from "./valueObjects/Version";

/**
 * ============================================================================
 * Firmware
 * ============================================================================
 *
 * Represents the firmware currently installed on an HonorPole device
 * together with the latest firmware available from an update provider.
 *
 * Responsibilities:
 *
 * • Store installed firmware information
 * • Store latest firmware information
 * • Compare firmware versions
 * • Determine update availability
 * • Serialize firmware metadata
 *
 * This class intentionally contains NO:
 *
 * • HTTP
 * • OTA
 * • Wi-Fi
 * • ESP32 communication
 * • Local Storage
 * • React
 * • UI
 *
 * ============================================================================
 */

export class Firmware {

    //-------------------------------------------------------------------------
    // Private Fields
    //-------------------------------------------------------------------------

    private _version: Version;

    private _buildNumber: string;

    private _releaseDate: Date;

    private _hardwareRevision: string;

    private _bootloaderVersion: string;

    private _latestVersion: Version;

    //-------------------------------------------------------------------------
    // Constructor
    //-------------------------------------------------------------------------

    public constructor(
        version: Version = new Version("1.0.0"),
        buildNumber: string = "1",
        releaseDate: Date = new Date(),
        hardwareRevision: string = "",
        bootloaderVersion: string = "",
        latestVersion: Version = new Version("1.0.0")
    ) {

        this._version = version;

        this._buildNumber = buildNumber.trim();

        this._releaseDate = new Date(releaseDate);

        this._hardwareRevision = hardwareRevision.trim();

        this._bootloaderVersion = bootloaderVersion.trim();

        this._latestVersion = latestVersion;

        this.validate();

    }

    //-------------------------------------------------------------------------
    // Validation
    //-------------------------------------------------------------------------

    /**
     * Validates the current firmware state.
     */
    private validate(): void {

        if (!this._version) {
            throw new Error("Firmware version is required.");
        }

        if (!this._latestVersion) {
            throw new Error("Latest firmware version is required.");
        }

        if (!this._buildNumber.length) {
            throw new Error("Build number cannot be empty.");
        }

        if (!(this._releaseDate instanceof Date)) {
            throw new Error("Release date is invalid.");
        }

        if (Number.isNaN(this._releaseDate.getTime())) {
            throw new Error("Release date is invalid.");
        }

    }

    //-------------------------------------------------------------------------
    // Public Properties
    //-------------------------------------------------------------------------

    /**
     * Currently installed firmware version.
     */
    public get version(): Version {

        return this._version;

    }

    /**
     * Firmware build number.
     */
    public get buildNumber(): string {

        return this._buildNumber;

    }

    /**
     * Firmware release date.
     */
    public get releaseDate(): Date {

        return new Date(this._releaseDate);

    }

    /**
     * Hardware revision supported by this firmware.
     */
    public get hardwareRevision(): string {

        return this._hardwareRevision;

    }

    /**
     * Firmware bootloader version.
     */
    public get bootloaderVersion(): string {

        return this._bootloaderVersion;

    }

    /**
     * Latest firmware version available.
     */
    public get latestVersion(): Version {

        return this._latestVersion;

    }

    /**
     * Returns true if a newer firmware is available.
     */
    public get updateAvailable(): boolean {

        return !this._version.equals(this._latestVersion);

    }

    //-------------------------------------------------------------------------
    // Update Methods
    //-------------------------------------------------------------------------

    /**
     * Replaces the installed firmware information.
     */
    public update(
        version: Version,
        buildNumber: string,
        releaseDate: Date,
        hardwareRevision: string,
        bootloaderVersion: string
    ): void {

        this._version = version;

        this._buildNumber = buildNumber.trim();

        this._releaseDate = new Date(releaseDate);

        this._hardwareRevision = hardwareRevision.trim();

        this._bootloaderVersion = bootloaderVersion.trim();

        this.validate();

    }

    /**
     * Updates the newest firmware version available.
     */
    public setLatestVersion(
        version: Version
    ): void {

        this._latestVersion = version;

    }
//=============================================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// Firmware.ts
//
// PART 2 OF 3
//
// Location:
// src/domain/Firmware.ts
//
//=============================================================================

    //-------------------------------------------------------------------------
    // Version Comparison Methods
    //-------------------------------------------------------------------------

    /**
     * Returns true if the installed firmware
     * exactly matches the supplied version.
     */
    public isVersion(
        version: Version
    ): boolean {

        return this._version.equals(version);

    }

    /**
     * Returns true if the installed firmware
     * is newer than the supplied version.
     */
    public isNewerThan(
        version: Version
    ): boolean {

        return this._version.isGreaterThan(version);

    }

    /**
     * Returns true if the installed firmware
     * is older than the supplied version.
     */
    public isOlderThan(
        version: Version
    ): boolean {

        return this._version.isLessThan(version);

    }

    /**
     * Returns true if a firmware update
     * is currently available.
     */
    public needsUpdate(): boolean {

        return this.updateAvailable;

    }

    /**
     * Marks the installed firmware
     * as matching the latest firmware.
     */
    public markUpdated(): void {

        this._version = this._latestVersion;

    }

    //-------------------------------------------------------------------------
    // Utility Methods
    //-------------------------------------------------------------------------

    /**
     * Creates a deep copy
     * of this Firmware object.
     */
    public clone(): Firmware {

        return new Firmware(

            new Version(this._version.toString()),

            this._buildNumber,

            new Date(this._releaseDate),

            this._hardwareRevision,

            this._bootloaderVersion,

            new Version(this._latestVersion.toString())

        );

    }

    /**
     * Compares this firmware
     * against another Firmware object.
     */
    public equals(
        firmware: Firmware
    ): boolean {

        return (

            this._version.equals(firmware.version)

            &&

            this._buildNumber === firmware.buildNumber

            &&

            this._releaseDate.getTime()
            === firmware.releaseDate.getTime()

            &&

            this._hardwareRevision
            === firmware.hardwareRevision

            &&

            this._bootloaderVersion
            === firmware.bootloaderVersion

            &&

            this._latestVersion.equals(
                firmware.latestVersion
            )

        );

    }

    /**
     * Returns a human-readable
     * firmware description.
     */
    public toString(): string {

        return [

            `Version ${this._version.toString()}`,

            `Build ${this._buildNumber}`,

            `Released ${this._releaseDate.toISOString()}`,

            `Hardware ${this._hardwareRevision}`,

            `Bootloader ${this._bootloaderVersion}`

        ].join(" | ");

    }

    //-------------------------------------------------------------------------
    // Serialization
    //-------------------------------------------------------------------------

    /**
     * Converts the firmware object
     * into a plain JSON object.
     */
    public toJSON(): {

        version: string;

        buildNumber: string;

        releaseDate: string;

        hardwareRevision: string;

        bootloaderVersion: string;

        latestVersion: string;

        updateAvailable: boolean;

    } {

        return {

            version: this._version.toString(),

            buildNumber: this._buildNumber,

            releaseDate: this._releaseDate.toISOString(),

            hardwareRevision: this._hardwareRevision,

            bootloaderVersion: this._bootloaderVersion,

            latestVersion: this._latestVersion.toString(),

            updateAvailable: this.updateAvailable

        };

    }

    /**
     * Creates a Firmware object
     * from serialized JSON.
     */
    public static fromJSON(data: {

        version: string;

        buildNumber: string;

        releaseDate: string;

        hardwareRevision: string;

        bootloaderVersion: string;

        latestVersion: string;

    }): Firmware {

        return new Firmware(

            new Version(data.version),

            data.buildNumber,

            new Date(data.releaseDate),

            data.hardwareRevision,

            data.bootloaderVersion,

            new Version(data.latestVersion)

        );

    }
//=============================================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// Firmware.ts
//
// PART 3 OF 3
//
// Location:
// src/domain/Firmware.ts
//
//=============================================================================

    //-------------------------------------------------------------------------
    // Factory Methods
    //-------------------------------------------------------------------------

    /**
     * Creates a Firmware instance using
     * the currently installed version as
     * both the installed and latest version.
     */
    public static create(
        version: Version,
        buildNumber: string,
        releaseDate: Date,
        hardwareRevision: string = "",
        bootloaderVersion: string = ""
    ): Firmware {

        return new Firmware(

            version,

            buildNumber,

            releaseDate,

            hardwareRevision,

            bootloaderVersion,

            version

        );

    }

    //-------------------------------------------------------------------------
    // Domain Operations
    //-------------------------------------------------------------------------

    /**
     * Returns the currently installed version
     * as a formatted string.
     */
    public getVersionString(): string {

        return this._version.toString();

    }

    /**
     * Returns the latest available version
     * as a formatted string.
     */
    public getLatestVersionString(): string {

        return this._latestVersion.toString();

    }

    /**
     * Returns true when the installed firmware
     * matches the latest firmware exactly.
     */
    public isCurrent(): boolean {

        return this._version.equals(this._latestVersion);

    }

    /**
     * Returns true when both firmware versions
     * are different.
     */
    public hasDifferentVersion(): boolean {

        return !this.isCurrent();

    }

    //-------------------------------------------------------------------------
    // Refresh Methods
    //-------------------------------------------------------------------------

    /**
     * Updates only the release date.
     */
    public setReleaseDate(
        releaseDate: Date
    ): void {

        this._releaseDate = new Date(releaseDate);

        this.validate();

    }

    /**
     * Updates only the build number.
     */
    public setBuildNumber(
        buildNumber: string
    ): void {

        this._buildNumber = buildNumber.trim();

        this.validate();

    }

    /**
     * Updates only the hardware revision.
     */
    public setHardwareRevision(
        hardwareRevision: string
    ): void {

        this._hardwareRevision = hardwareRevision.trim();

    }

    /**
     * Updates only the bootloader version.
     */
    public setBootloaderVersion(
        bootloaderVersion: string
    ): void {

        this._bootloaderVersion = bootloaderVersion.trim();

    }

    //-------------------------------------------------------------------------
    // Debug Helpers
    //-------------------------------------------------------------------------

    /**
     * Returns a detailed object useful for
     * logging and diagnostics.
     */
    public toDebugObject() {

        return {

            version: this._version.toString(),

            latestVersion: this._latestVersion.toString(),

            buildNumber: this._buildNumber,

            releaseDate: this._releaseDate.toISOString(),

            hardwareRevision: this._hardwareRevision,

            bootloaderVersion: this._bootloaderVersion,

            updateAvailable: this.updateAvailable

        };

    }

    //-------------------------------------------------------------------------
    // Object Overrides
    //-------------------------------------------------------------------------

    /**
     * Returns a plain object suitable
     * for inspection or logging.
     */
    public valueOf() {

        return this.toJSON();

    }

}