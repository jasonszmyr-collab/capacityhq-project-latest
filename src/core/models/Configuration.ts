/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * File: Configuration.ts
 *
 * Description:
 * Represents the configurable operating parameters of a HonorPole device.
 *
 * Configuration values persist across power cycles and define how the device
 * behaves. Runtime values such as motor position and WiFi status are stored in
 * their respective domain models.
 * ============================================================================
 */

export class Configuration {

    //--------------------------------------------------------------------------
    // Private Fields
    //--------------------------------------------------------------------------

    private _deviceName: string;

    private _fullPosition: number;
    private _halfPosition: number;

    private _maximumSpeed: number;
    private _acceleration: number;

    private _heartbeatIntervalSeconds: number;
    private _cloudPollingIntervalSeconds: number;

    private _autoReconnect: boolean;
    private _autoHalfStaff: boolean;

    //--------------------------------------------------------------------------
    // Constructor
    //--------------------------------------------------------------------------

    constructor() {

        this._deviceName = "HonorPole";

        this._fullPosition = 8000;
        this._halfPosition = 4000;

        this._maximumSpeed = 2500;
        this._acceleration = 1200;

        this._heartbeatIntervalSeconds = 60;
        this._cloudPollingIntervalSeconds = 30;

        this._autoReconnect = true;
        this._autoHalfStaff = true;

    }

    //--------------------------------------------------------------------------
    // Public Properties
    //--------------------------------------------------------------------------

    public get deviceName(): string {
        return this._deviceName;
    }

    public get fullPosition(): number {
        return this._fullPosition;
    }

    public get halfPosition(): number {
        return this._halfPosition;
    }

    public get maximumSpeed(): number {
        return this._maximumSpeed;
    }

    public get acceleration(): number {
        return this._acceleration;
    }

    public get heartbeatIntervalSeconds(): number {
        return this._heartbeatIntervalSeconds;
    }

    public get cloudPollingIntervalSeconds(): number {
        return this._cloudPollingIntervalSeconds;
    }

    public get autoReconnect(): boolean {
        return this._autoReconnect;
    }

    public get autoHalfStaff(): boolean {
        return this._autoHalfStaff;
    }

    //--------------------------------------------------------------------------
    // Public Methods
    //--------------------------------------------------------------------------

    public setDeviceName(name: string): void {

        this._deviceName = name.trim();

    }

    public setTravelLimits(fullPosition: number, halfPosition: number): void {

        this._fullPosition = Math.max(1, fullPosition);
        this._halfPosition = Math.max(0, halfPosition);

    }

    public setMotionParameters(
        maximumSpeed: number,
        acceleration: number
    ): void {

        this._maximumSpeed = Math.max(1, maximumSpeed);
        this._acceleration = Math.max(1, acceleration);

    }

    public setHeartbeatInterval(seconds: number): void {

        this._heartbeatIntervalSeconds = Math.max(5, seconds);

    }

    public setCloudPollingInterval(seconds: number): void {

        this._cloudPollingIntervalSeconds = Math.max(5, seconds);

    }

    public enableAutoReconnect(enabled: boolean): void {

        this._autoReconnect = enabled;

    }

    public enableAutoHalfStaff(enabled: boolean): void {

        this._autoHalfStaff = enabled;

    }

    public toJSON() {

        return {

            deviceName: this._deviceName,

            fullPosition: this._fullPosition,
            halfPosition: this._halfPosition,

            maximumSpeed: this._maximumSpeed,
            acceleration: this._acceleration,

            heartbeatIntervalSeconds: this._heartbeatIntervalSeconds,
            cloudPollingIntervalSeconds: this._cloudPollingIntervalSeconds,

            autoReconnect: this._autoReconnect,
            autoHalfStaff: this._autoHalfStaff

        };

    }

}