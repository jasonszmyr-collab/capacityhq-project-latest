/**
 * HonorPole Version 1.0
 * ------------------------------------------------------------------
 * File: CommandType.ts
 *
 * Purpose:
 * Defines every command that can be issued to an HonorPole device.
 *
 * These commands are shared by the mobile application,
 * firmware, cloud platform, diagnostics,
 * and automated scheduling systems.
 *
 * Copyright © Honor Pole Innovations
 */

export enum CommandType {
    NONE = 'None',

    STOP = 'Stop',

    RAISE_FULL = 'RaiseFull',

    LOWER_FULL = 'LowerFull',

    MOVE_HALF = 'MoveHalf',

    CALIBRATE = 'Calibrate',

    HOME = 'Home',

    REBOOT = 'Reboot',

    OTA_UPDATE = 'OTAUpdate',
}