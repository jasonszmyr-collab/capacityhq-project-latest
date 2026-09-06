//=========================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// IFirmwareProvider.ts
//
// Location:
// src/application/firmware/IFirmwareProvider.ts
//=========================================================

import { Firmware } from "../../domain/Firmware";

/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * IFirmwareProvider
 *
 * Defines the contract for obtaining firmware metadata from any source.
 *
 * Supported sources may include:
 *
 * • HonorPole OTA Server
 * • HonorPole Cloud
 * • Local Network Server
 * • Development Test Server
 * • Future firmware distribution services
 *
 * This interface only retrieves firmware information.
 * It performs no installation, storage, networking configuration,
 * or user interface operations.
 * ============================================================================
 */

export interface IFirmwareProvider {

    /**
     * Retrieves the most recent firmware
     * available from the provider.
     *
     * Throws an error if the firmware
     * metadata cannot be retrieved.
     */
    getLatestFirmware(): Promise<Firmware>;

    /**
     * Returns true when the provider
     * is currently reachable.
     */
    isAvailable(): Promise<boolean>;

}