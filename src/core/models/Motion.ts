/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * File: Motion.ts
 *
 * Description:
 * Represents the current and desired physical motion state of an HonorPole.
 *
 * This class is a pure domain model. It describes the current movement of the
 * flagpole but does not control motors or hardware directly.
 * ============================================================================
 */

export enum MotionState {
    Idle = "Idle",
    MovingUp = "MovingUp",
    MovingDown = "MovingDown",
    Stopped = "Stopped",
    Homing = "Homing",
    Calibrating = "Calibrating",
    Error = "Error"
}

export class Motion {

    //--------------------------------------------------------------------------
    // Private Fields
    //--------------------------------------------------------------------------

    private _state: MotionState;

    private _currentPosition: number;
    private _targetPosition: number;

    private _speed: number;

    private _moving: boolean;

    private _homed: boolean;

    private _lastMovement: Date;

    //--------------------------------------------------------------------------
    // Constructor
    //--------------------------------------------------------------------------

    constructor() {

        this._state = MotionState.Idle;

        this._currentPosition = 0;
        this._targetPosition = 0;

        this._speed = 0;

        this._moving = false;

        this._homed = false;

        this._lastMovement = new Date();

    }

    //--------------------------------------------------------------------------
    // Public Properties
    //--------------------------------------------------------------------------

    public get state(): MotionState {
        return this._state;
    }

    public get currentPosition(): number {
        return this._currentPosition;
    }

    public get targetPosition(): number {
        return this._targetPosition;
    }

    public get speed(): number {
        return this._speed;
    }

    public get moving(): boolean {
        return this._moving;
    }

    public get homed(): boolean {
        return this._homed;
    }

    public get lastMovement(): Date {
        return this._lastMovement;
    }

    /**
     * Percentage of travel completed.
     */
    public get progress(): number {

        if (this._targetPosition <= 0)
            return 0;

        return Math.min(
            100,
            Math.round(
                (this._currentPosition / this._targetPosition) * 100
            )
        );

    }

    //--------------------------------------------------------------------------
    // Public Methods
    //--------------------------------------------------------------------------

    public setCurrentPosition(position: number): void {

        this._currentPosition = Math.max(0, position);

        this.touch();

    }

    public setTargetPosition(position: number): void {

        this._targetPosition = Math.max(0, position);

        this.touch();

    }

    public setSpeed(speed: number): void {

        this._speed = Math.max(0, speed);

    }

    public setState(state: MotionState): void {

        this._state = state;

        this._moving =
            state === MotionState.MovingUp ||
            state === MotionState.MovingDown ||
            state === MotionState.Homing ||
            state === MotionState.Calibrating;

        this.touch();

    }

    public setHomed(homed: boolean): void {

        this._homed = homed;

    }

    /**
     * Immediately stops all motion.
     *
     * This updates only the domain state. It does not issue motor commands.
     */
    public stop(): void {

        this._state = MotionState.Stopped;

        this._moving = false;

        this._speed = 0;

        this.touch();

    }

    public toJSON() {

        return {

            state: this._state,

            currentPosition: this._currentPosition,

            targetPosition: this._targetPosition,

            speed: this._speed,

            moving: this._moving,

            homed: this._homed,

            progress: this.progress,

            lastMovement: this._lastMovement

        };

    }

    //--------------------------------------------------------------------------
    // Private Methods
    //--------------------------------------------------------------------------

    private touch(): void {

        this._lastMovement = new Date();

    }

}