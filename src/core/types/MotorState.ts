/**
 * HonorPole Version 1.0
 * ------------------------------------------------------------------
 * File: MotorState.ts
 *
 * Purpose:
 * Defines every operational state of the HonorPole motor.
 *
 * This enum is shared across the firmware interface,
 * SDK, cloud services, diagnostics, telemetry,
 * and user interface.
 *
 * Copyright © Honor Pole Innovations
 */

export enum MotorState {
    UNKNOWN = 'Unknown',

    STOPPED = 'Stopped',

    RAISING = 'Raising',

    LOWERING = 'Lowering',

    MOVING_TO_HALF = 'MovingToHalf',

    CALIBRATING = 'Calibrating',

    HOMING = 'Homing',

    ERROR = 'Error',
}