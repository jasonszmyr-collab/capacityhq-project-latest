/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * File: Status.ts
 *
 * Description:
 * Represents the current operating status of an HonorPole device.
 *
 * This class contains runtime state only. It intentionally contains no
 * business logic.
 * ============================================================================
 */

export class Status
{
    //--------------------------------------------------------------------------
    // Private Fields
    //--------------------------------------------------------------------------

    private _online: boolean;

    private _enabled: boolean;

    private _moving: boolean;

    private _homed: boolean;

    private _calibrated: boolean;

    private _faulted: boolean;

    private _currentPosition: number;

    private _targetPosition: number;

    private _movementState: string;

    private _lastHeartbeat: Date | null;

    //--------------------------------------------------------------------------
    // Constructor
    //--------------------------------------------------------------------------

    constructor()
    {
        this._online = false;

        this._enabled = false;

        this._moving = false;

        this._homed = false;

        this._calibrated = false;

        this._faulted = false;

        this._currentPosition = 0;

        this._targetPosition = 0;

        this._movementState = "IDLE";

        this._lastHeartbeat = null;
    }

    //--------------------------------------------------------------------------
    // Public Properties
    //--------------------------------------------------------------------------

    public get online(): boolean
    {
        return this._online;
    }

    public get enabled(): boolean
    {
        return this._enabled;
    }

    public get moving(): boolean
    {
        return this._moving;
    }

    public get homed(): boolean
    {
        return this._homed;
    }

    public get calibrated(): boolean
    {
        return this._calibrated;
    }

    public get faulted(): boolean
    {
        return this._faulted;
    }

    public get currentPosition(): number
    {
        return this._currentPosition;
    }

    public get targetPosition(): number
    {
        return this._targetPosition;
    }

        public get movementState(): string
    {
        return this._movementState;
    }

    public get lastHeartbeat(): Date | null
    {
        return this._lastHeartbeat;
    }

    /**
     * Returns true when the HonorPole is ready
     * for normal operation.
     */
    public get isReady(): boolean
    {
        return (
            this._online &&
            this._enabled &&
            this._calibrated &&
            !this._faulted
        );
    }

    /**
     * Returns true when the HonorPole is not moving.
     */
    public get isIdle(): boolean
    {
        return !this._moving;
    }

    //--------------------------------------------------------------------------
    // Public Methods
    //--------------------------------------------------------------------------

    public update(
        online: boolean,
        enabled: boolean,
        moving: boolean,
        homed: boolean,
        calibrated: boolean,
        faulted: boolean,
        currentPosition: number,
        targetPosition: number,
        movementState: string
    ): void
    {
        this._online = online;

        this._enabled = enabled;

        this._moving = moving;

        this._homed = homed;

        this._calibrated = calibrated;

        this._faulted = faulted;

        this._currentPosition = currentPosition;

        this._targetPosition = targetPosition;

        this._movementState = movementState;
    }

    public setHeartbeat(
        heartbeat: Date | null
    ): void
    {
        this._lastHeartbeat = heartbeat;
    }

    public reset(): void
    {
        this._online = false;

        this._enabled = false;

        this._moving = false;

        this._homed = false;

        this._calibrated = false;

        this._faulted = false;

        this._currentPosition = 0;

        this._targetPosition = 0;

        this._movementState = "IDLE";

        this._lastHeartbeat = null;
    }

    //--------------------------------------------------------------------------
    // Private Methods
    //--------------------------------------------------------------------------

}

