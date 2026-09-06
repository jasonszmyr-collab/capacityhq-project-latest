//=========================================================
// HonorPole Platform
// File: LocalFirmwareRepository.ts
// PART 1 OF 2
// Location: src/infrastructure/firmware/LocalFirmwareRepository.ts
//=========================================================

import { Firmware } from "../../domain/Firmware";
import type { IFirmwareRepository } from "../../application/firmware/IFirmwareRepository";

/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * LocalFirmwareRepository
 *
 * Stores firmware information locally.
 *
 * Responsibilities
 * ----------------
 * • Load firmware metadata
 * • Save firmware metadata
 * • Delete cached firmware metadata
 * • Abstract storage implementation
 *
 * NOTE:
 * This initial implementation uses browser localStorage.
 * It can later be replaced with IndexedDB, SQLite, or another
 * persistence mechanism without affecting the application layer.
 * ============================================================================
 */

export class LocalFirmwareRepository implements IFirmwareRepository {

    //--------------------------------------------------------------------------
    // Constants
    //--------------------------------------------------------------------------

    private static readonly STORAGE_KEY = "honorpole.firmware";

    //--------------------------------------------------------------------------
    // Public Methods
    //--------------------------------------------------------------------------

    /**
     * Loads firmware information from local storage.
     */
    public async load(): Promise<Firmware | null> {

        const json = localStorage.getItem(
            LocalFirmwareRepository.STORAGE_KEY
        );

        if (!json) {

            return null;

        }

        const data = JSON.parse(json);

        return new Firmware(

            data.version,

            data.buildNumber,

            new Date(data.releaseDate),

            data.hardwareRevision,

            data.bootloaderVersion

        );

    }

    /**
     * Saves firmware information.
     */
    public async save(firmware: Firmware): Promise<void> {

        localStorage.setItem(

            LocalFirmwareRepository.STORAGE_KEY,

            JSON.stringify(firmware.toJSON())

        );

    }
//=========================================================
// HonorPole Platform
// File: LocalFirmwareRepository.ts
// PART 2 OF 2
// Location: src/infrastructure/firmware/LocalFirmwareRepository.ts
//=========================================================

    /**
     * Removes cached firmware information.
     */
    public async delete(): Promise<void> {

        localStorage.removeItem(

            LocalFirmwareRepository.STORAGE_KEY

        );

    }

    /**
     * Returns true if firmware metadata exists in local storage.
     */
    public async exists(): Promise<boolean> {

        return localStorage.getItem(

            LocalFirmwareRepository.STORAGE_KEY

        ) !== null;

    }

    /**
     * Removes all cached firmware information.
     */
    public async clear(): Promise<void> {

        await this.delete();

    }

    /**
     * Returns the repository storage key.
     */
    public get storageKey(): string {

        return LocalFirmwareRepository.STORAGE_KEY;

    }

    /**
     * Returns a string representation of this repository.
     */
    public toString(): string {

        return this.storageKey;

    }

}