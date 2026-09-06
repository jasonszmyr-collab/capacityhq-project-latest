//=========================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// IFirmwareRepository.ts
//
// Location:
// src/application/firmware/IFirmwareRepository.ts
//=========================================================

import { Firmware } from "../../domain/Firmware";

/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * IFirmwareRepository
 *
 * Defines the contract for persisting firmware metadata.
 *
 * Implementations may use:
 *
 * • Browser Local Storage
 * • IndexedDB
 * • SQLite
 * • Cloud Database
 * • Secure Device Storage
 *
 * This interface abstracts the storage mechanism so the
 * application layer remains independent of persistence.
 *
 * ============================================================================
 */

export interface IFirmwareRepository {

    /**
     * Loads the stored firmware metadata.
     *
     * Returns null if no firmware has been persisted.
     */
    load(): Promise<Firmware | null>;

    /**
     * Saves firmware metadata.
     *
     * Any existing firmware metadata should be replaced.
     */
    save(
        firmware: Firmware
    ): Promise<void>;

    /**
     * Deletes the stored firmware metadata.
     */
    delete(): Promise<void>;

}