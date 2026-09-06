/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * File: DeviceStatus.ts
 *
 * Description:
 * Represents the overall operational status of a physical HonorPole device.
 *
 * This model provides a high-level summary of the device's current operating
 * condition. Detailed subsystem information is intentionally stored in the
 * corresponding domain models (Motion, Network, Diagnostics, etc.).
 *
 * ============================================================================
 */

export enum DeviceOperatingState {
    Offline = "Offline",
    Booting = "Booting",
    Ready = "Ready",
    Idle = "Idle",
    Moving = "Moving",
    Calibrating = "Calibrating",
    UpdatingFirmware = "UpdatingFirmware",
    Maintenance = "Maintenance",
    Error = "Error"
}

export class DeviceStatus {

    //--------------------------------------------------------------------------
    // Private Fields
    //--------------------------------------------------------------------------

    private _state: DeviceOperatingState;
    private _online: boolean;
    private _healthy: boolean;
    private _calibrated: boolean;
    private _faulted: boolean;
    private _lastSeen: Date;
    private _uptimeSeconds: number;

    //--------------------------------------------------------------------------
    // Constructor
    //--------------------------------------------------------------------------

    constructor() {

        this._state = DeviceOperatingState.Offline;
        this._online = false;
        this._healthy = true;
        this._calibrated = false;
        this._faulted = false;
        this._lastSeen = new Date();
        this._uptimeSeconds = 0;

    }

    //--------------------------------------------------------------------------
    // Public Properties
    //--------------------------------------------------------------------------

    public get state(): DeviceOperatingState {
        return this._state;
    }

    public get online(): boolean {
        return this._online;
    }

    public get healthy(): boolean {
        return this._healthy;
    }

    public get calibrated(): boolean {
        return this._calibrated;
    }

    public get faulted(): boolean {
        return this._faulted;
    }

    public get lastSeen(): Date {
        return this._lastSeen;
    }

    public get uptimeSeconds(): number {
        return this._uptimeSeconds;
    }

    /**
     * Returns true when the device is fully operational.
     */
    public get isReady(): boolean {

        return (
            this._online &&
            this._healthy &&
            this._calibrated &&
            this._state === DeviceOperatingState.Ready
        );

    }

    //--------------------------------------------------------------------------
    // Public Methods
    //--------------------------------------------------------------------------

    public setState(state: DeviceOperatingState): void {

        this._state = state;
        this.touch();

    }

    public setOnline(online: boolean): void {

        this._online = online;
        this.touch();

    }

    public setHealthy(healthy: boolean): void {

        this._healthy = healthy;
        this.touch();

    }

    public setCalibrated(calibrated: boolean): void {

        this._calibrated = calibrated;
        this.touch();

    }

    public setFaulted(faulted: boolean): void {

        this._faulted = faulted;
        this.touch();

    }

    public setUptime(seconds: number): void {

        this._uptimeSeconds = Math.max(0, seconds);
        this.touch();

    }

    /**
     * Called whenever a heartbeat is received from the device.
     */
    public heartbeat(): void {

        this._lastSeen = new Date();

    }

    /**
     * Returns a serializable representation of the device status.
     */
    public toJSON() {

        return {

            state: this._state,
            online: this._online,
            healthy: this._healthy,
            calibrated: this._calibrated,
            faulted: this._faulted,
            uptimeSeconds: this._uptimeSeconds,
            lastSeen: this._lastSeen,
            ready: this.isReady

        };

    }

    //--------------------------------------------------------------------------
    // Private Methods
    //--------------------------------------------------------------------------

    private touch(): void {

        this._lastSeen = new Date();

    }

}