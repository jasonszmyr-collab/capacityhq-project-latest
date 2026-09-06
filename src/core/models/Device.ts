/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * File: Device.ts
 *
 * Description:
 * Represents the physical HonorPole controller.
 *
 * A Device owns the permanent identity and capability information for a
 * physical controller. Runtime state such as motion, network status,
 * calibration, and diagnostics are intentionally modeled elsewhere.
 *
 * ============================================================================
 */

import { Identity } from "./device/Identity";
import { Capabilities } from "./device/Capabilities";

export class Device {

    //--------------------------------------------------------------------------
    // Private Fields
    //--------------------------------------------------------------------------

    private readonly _identity: Identity;
    private readonly _capabilities: Capabilities;

    //--------------------------------------------------------------------------
    // Constructor
    //--------------------------------------------------------------------------

    constructor(
        identity?: Identity,
        capabilities?: Capabilities
    ) {
        this._identity = identity ?? new Identity();
        this._capabilities = capabilities ?? new Capabilities();
    }

    //--------------------------------------------------------------------------
    // Public Properties
    //--------------------------------------------------------------------------

    /**
     * Permanent identity of this physical controller.
     */
    public get identity(): Identity {
        return this._identity;
    }

    /**
     * Hardware and software capabilities supported by this controller.
     */
    public get capabilities(): Capabilities {
        return this._capabilities;
    }

    /**
     * Indicates whether the device has been provisioned with the minimum
     * identity information required for operation.
     */
    public get isProvisioned(): boolean {
        return this._identity.isValid;
    }

    //--------------------------------------------------------------------------
    // Public Methods
    //--------------------------------------------------------------------------

    /**
     * Returns a simplified object suitable for logging or diagnostics.
     */
    public toJSON() {
        return {
            deviceId: this._identity.deviceId,
            serialNumber: this._identity.serialNumber,
            model: this._identity.model,
            manufacturer: this._identity.manufacturer,
            hardwareRevision: this._identity.hardwareRevision,
            firmwareFamily: this._identity.firmwareFamily,
            macAddress: this._identity.macAddress,
            manufactureDate: this._identity.manufactureDate,
            provisioned: this.isProvisioned
        };
    }

    //--------------------------------------------------------------------------
    // Private Methods
    //--------------------------------------------------------------------------

}