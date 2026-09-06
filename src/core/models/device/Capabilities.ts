/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * File: Capabilities.ts
 *
 * Description:
 * Defines the hardware and software capabilities supported by a specific
 * HonorPole device.
 *
 * Capabilities describe what a device is capable of doing—not whether those
 * features are currently enabled or in use.
 *
 * This class contains no business logic and serves as a pure domain model.
 * ============================================================================
 */

export class Capabilities {

    //--------------------------------------------------------------------------
    // Private Fields
    //--------------------------------------------------------------------------

    private _supportsCloud: boolean;
    private _supportsOTA: boolean;
    private _supportsWiFi: boolean;
    private _supportsAccessPoint: boolean;
    private _supportsDiagnostics: boolean;
    private _supportsTelemetry: boolean;
    private _supportsCalibration: boolean;
    private _supportsScheduling: boolean;
    private _supportsHalfStaffAutomation: boolean;
    private _supportsMotionControl: boolean;
    private _supportsRemoteCommands: boolean;

    //--------------------------------------------------------------------------
    // Constructor
    //--------------------------------------------------------------------------

    constructor() {

        // Current HonorPole hardware supports all Version 1 features.

        this._supportsCloud = true;
        this._supportsOTA = true;
        this._supportsWiFi = true;
        this._supportsAccessPoint = true;
        this._supportsDiagnostics = true;
        this._supportsTelemetry = true;
        this._supportsCalibration = true;
        this._supportsScheduling = true;
        this._supportsHalfStaffAutomation = true;
        this._supportsMotionControl = true;
        this._supportsRemoteCommands = true;
    }

    //--------------------------------------------------------------------------
    // Public Properties
    //--------------------------------------------------------------------------

    public get supportsCloud(): boolean {
        return this._supportsCloud;
    }

    public get supportsOTA(): boolean {
        return this._supportsOTA;
    }

    public get supportsWiFi(): boolean {
        return this._supportsWiFi;
    }

    public get supportsAccessPoint(): boolean {
        return this._supportsAccessPoint;
    }

    public get supportsDiagnostics(): boolean {
        return this._supportsDiagnostics;
    }

    public get supportsTelemetry(): boolean {
        return this._supportsTelemetry;
    }

    public get supportsCalibration(): boolean {
        return this._supportsCalibration;
    }

    public get supportsScheduling(): boolean {
        return this._supportsScheduling;
    }

    public get supportsHalfStaffAutomation(): boolean {
        return this._supportsHalfStaffAutomation;
    }

    public get supportsMotionControl(): boolean {
        return this._supportsMotionControl;
    }

    public get supportsRemoteCommands(): boolean {
        return this._supportsRemoteCommands;
    }

    //--------------------------------------------------------------------------
    // Public Methods
    //--------------------------------------------------------------------------

    /**
     * Enables or disables a capability.
     *
     * Intended for manufacturing, testing, or future hardware variants.
     */
    public configure(options: Partial<{
        supportsCloud: boolean;
        supportsOTA: boolean;
        supportsWiFi: boolean;
        supportsAccessPoint: boolean;
        supportsDiagnostics: boolean;
        supportsTelemetry: boolean;
        supportsCalibration: boolean;
        supportsScheduling: boolean;
        supportsHalfStaffAutomation: boolean;
        supportsMotionControl: boolean;
        supportsRemoteCommands: boolean;
    }>): void {

        if (options.supportsCloud !== undefined)
            this._supportsCloud = options.supportsCloud;

        if (options.supportsOTA !== undefined)
            this._supportsOTA = options.supportsOTA;

        if (options.supportsWiFi !== undefined)
            this._supportsWiFi = options.supportsWiFi;

        if (options.supportsAccessPoint !== undefined)
            this._supportsAccessPoint = options.supportsAccessPoint;

        if (options.supportsDiagnostics !== undefined)
            this._supportsDiagnostics = options.supportsDiagnostics;

        if (options.supportsTelemetry !== undefined)
            this._supportsTelemetry = options.supportsTelemetry;

        if (options.supportsCalibration !== undefined)
            this._supportsCalibration = options.supportsCalibration;

        if (options.supportsScheduling !== undefined)
            this._supportsScheduling = options.supportsScheduling;

        if (options.supportsHalfStaffAutomation !== undefined)
            this._supportsHalfStaffAutomation = options.supportsHalfStaffAutomation;

        if (options.supportsMotionControl !== undefined)
            this._supportsMotionControl = options.supportsMotionControl;

        if (options.supportsRemoteCommands !== undefined)
            this._supportsRemoteCommands = options.supportsRemoteCommands;
    }

    //--------------------------------------------------------------------------
    // Private Methods
    //--------------------------------------------------------------------------

}