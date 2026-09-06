/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Version 1.0
 * ----------------------------------------------------------------------------
 * File: HonorPole.ts
 *
 * Description:
 * Aggregate Root for the HonorPole domain.
 *
 * Every subsystem of the application belongs to an HonorPole instance.
 * This class intentionally contains no business logic. It composes the
 * domain model and provides a single point of access to the system.
 * ============================================================================
 */

import { Device } from './Device';

import { Identity } from "./device/Identity";
import { Status } from './Status';
import { Motion } from './Motion';
import { Configuration } from './Configuration';
import { Network } from './Network';
import { Firmware } from './Firmware';
import { Diagnostics } from "./diagnostics/Diagnostics";
import { Calibration } from './Calibration';
import { Telemetry } from './Telemetry';
import { Cloud } from './Cloud';
import { Security } from './Security';

export class HonorPole {
    /**
     * Device information.
     */
    public readonly device: Device;

    /**
     * Permanent identity.
     */
    public readonly identity: Identity;

    /**
     * Current operating status.
     */
    public readonly status: Status;

    /**
     * Motion subsystem.
     */
    public readonly motion: Motion;

    /**
     * User configurable settings.
     */
    public readonly configuration: Configuration;

    /**
     * Network information.
     */
    public readonly network: Network;

    /**
     * Firmware information.
     */
    public readonly firmware: Firmware;

    /**
     * Diagnostics and health.
     */
    public readonly diagnostics: Diagnostics;

    /**
     * Calibration data.
     */
    public readonly calibration: Calibration;

    /**
     * Runtime telemetry.
     */
    public readonly telemetry: Telemetry;

    /**
     * Cloud connectivity.
     */
    public readonly cloud: Cloud;

    /**
     * Security information.
     */
    public readonly security: Security;

    constructor() {
        this.device = new Device();

        this.identity = new Identity();

        this.status = new Status();

        this.motion = new Motion();

        this.configuration = new Configuration();

        this.network = new Network();

        this.firmware = new Firmware();

        this.diagnostics = new Diagnostics();

        this.calibration = new Calibration();

        this.telemetry = new Telemetry();

        this.cloud = new Cloud();

        this.security = new Security();
    }
}