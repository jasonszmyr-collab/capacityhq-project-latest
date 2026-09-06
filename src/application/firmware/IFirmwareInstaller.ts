//=========================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// IFirmwareInstaller.ts
//
// Location:
// src/application/firmware/IFirmwareInstaller.ts
//=========================================================

import { Firmware } from "../../domain/Firmware";

/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * IFirmwareInstaller
 *
 * Defines the contract for installing firmware onto an HonorPole device.
 *
 * Implementations may support:
 *
 * • ESP32 OTA
 * • USB
 * • Bluetooth
 * • Local Wi-Fi
 * • Cloud deployment
 *
 * This interface intentionally contains no UI,
 * networking, or storage responsibilities.
 * ============================================================================
 */

export interface IFirmwareInstaller {

    /**
     * Installs the supplied firmware.
     *
     * Resolves only when the installation
     * has completed successfully.
     */
    install(
        firmware: Firmware
    ): Promise<void>;

    /**
     * Cancels an active installation.
     *
     * Implementations should safely abort
     * any in-progress transfer.
     */
    cancel(): Promise<void>;

    /**
     * Returns the current installation
     * progress as a percentage (0–100).
     */
    getProgress(): Promise<number>;

    /**
     * Returns true while an installation
     * is currently running.
     */
    isInstalling(): Promise<boolean>;

}