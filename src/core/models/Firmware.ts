/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * File: Firmware.ts
 *
 * Description:
 * Represents the firmware information for an HonorPole device.
 *
 * This class contains firmware metadata only and intentionally contains
 * no business logic.
 * ============================================================================
 */

export class Firmware
{
    //--------------------------------------------------------------------------
    // Private Fields
    //--------------------------------------------------------------------------

    private _version: string;

    private _buildNumber: string;

    private _buildDate: Date | null;

    private _board: string;

    private _chip: string;

    private _flashSize: number;

    private _psramSize: number;

    private _otaSupported: boolean;

    private _updateAvailable: boolean;

    private _latestVersion: string;

    //--------------------------------------------------------------------------
    // Constructor
    //--------------------------------------------------------------------------

    constructor()
    {
        this._version = "";

        this._buildNumber = "";

        this._buildDate = null;

        this._board = "ESP32-S3";

        this._chip = "";

        this._flashSize = 0;

        this._psramSize = 0;

        this._otaSupported = true;

        this._updateAvailable = false;

        this._latestVersion = "";
    }

    //--------------------------------------------------------------------------
    // Public Properties
    //--------------------------------------------------------------------------

    public get version(): string
    {
        return this._version;
    }

    public get buildNumber(): string
    {
        return this._buildNumber;
    }

    public get buildDate(): Date | null
    {
        return this._buildDate;
    }

    public get board(): string
    {
        return this._board;
    }

    public get chip(): string
    {
        return this._chip;
    }

    public get flashSize(): number
    {
        return this._flashSize;
    }

    public get psramSize(): number
    {
        return this._psramSize;
    }

        public get otaSupported(): boolean
    {
        return this._otaSupported;
    }

    public get updateAvailable(): boolean
    {
        return this._updateAvailable;
    }

    public get latestVersion(): string
    {
        return this._latestVersion;
    }

    /**
     * Returns true when the firmware is current.
     */
    public get isCurrent(): boolean
    {
        return (
            !this._updateAvailable ||
            this._latestVersion === this._version
        );
    }

    //--------------------------------------------------------------------------
    // Public Methods
    //--------------------------------------------------------------------------

    public update(
        version: string,
        buildNumber: string,
        buildDate: Date | null,
        board: string,
        chip: string,
        flashSize: number,
        psramSize: number,
        otaSupported: boolean,
        updateAvailable: boolean,
        latestVersion: string
    ): void
    {
        this._version = version.trim();

        this._buildNumber = buildNumber.trim();

        this._buildDate = buildDate;

        this._board = board.trim();

        this._chip = chip.trim();

        this._flashSize = flashSize;

        this._psramSize = psramSize;

        this._otaSupported = otaSupported;

        this._updateAvailable = updateAvailable;

        this._latestVersion = latestVersion.trim();
    }

    public reset(): void
    {
        this._version = "";

        this._buildNumber = "";

        this._buildDate = null;

        this._board = "ESP32-S3";

        this._chip = "";

        this._flashSize = 0;

        this._psramSize = 0;

        this._otaSupported = true;

        this._updateAvailable = false;

        this._latestVersion = "";
    }

    //--------------------------------------------------------------------------
    // Private Methods
    //--------------------------------------------------------------------------

}