/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * File: Identity.ts
 *
 * Description:
 * Represents the permanent identity of a physical HonorPole device.
 *
 * The Identity model contains information that uniquely identifies a device
 * throughout its lifetime. These values are established during manufacturing
 * or provisioning and rarely change.
 *
 * This class intentionally contains no business logic and serves as a pure
 * domain model.
 * ============================================================================
 */

export class Identity {

    //--------------------------------------------------------------------------
    // Private Fields
    //--------------------------------------------------------------------------

    private _deviceId: string;
    private _serialNumber: string;
    private _model: string;
    private _manufacturer: string;
    private _hardwareRevision: string;
    private _firmwareFamily: string;
    private _macAddress: string;
    private _manufactureDate: Date | null;

    //--------------------------------------------------------------------------
    // Constructor
    //--------------------------------------------------------------------------

    constructor() {
        this._deviceId = '';
        this._serialNumber = '';
        this._model = 'HonorPole';
        this._manufacturer = 'Honor Pole Innovations';
        this._hardwareRevision = '';
        this._firmwareFamily = '1.x';
        this._macAddress = '';
        this._manufactureDate = null;
    }

    //--------------------------------------------------------------------------
    // Public Properties
    //--------------------------------------------------------------------------

    public get deviceId(): string {
        return this._deviceId;
    }

    public get serialNumber(): string {
        return this._serialNumber;
    }

    public get model(): string {
        return this._model;
    }

    public get manufacturer(): string {
        return this._manufacturer;
    }

    public get hardwareRevision(): string {
        return this._hardwareRevision;
    }

    public get firmwareFamily(): string {
        return this._firmwareFamily;
    }

    public get macAddress(): string {
        return this._macAddress;
    }

    public get manufactureDate(): Date | null {
        return this._manufactureDate;
    }

    /**
     * Returns true when this identity contains the minimum
     * information required to uniquely identify a device.
     */
    public get isValid(): boolean {
        return (
            this._deviceId.trim().length > 0 &&
            this._serialNumber.trim().length > 0
        );
    }

    //--------------------------------------------------------------------------
    // Public Methods
    //--------------------------------------------------------------------------

    /**
     * Updates the device identity.
     *
     * This method should normally be called only during
     * manufacturing, provisioning, or service replacement.
     */
    public update(
        deviceId: string,
        serialNumber: string,
        hardwareRevision: string,
        firmwareFamily: string,
        macAddress: string,
        manufactureDate: Date | null
    ): void {

        this._deviceId = deviceId.trim();
        this._serialNumber = serialNumber.trim();
        this._hardwareRevision = hardwareRevision.trim();
        this._firmwareFamily = firmwareFamily.trim();
        this._macAddress = macAddress.trim();
        this._manufactureDate = manufactureDate;
    }

    //--------------------------------------------------------------------------
    // Private Methods
    //--------------------------------------------------------------------------

}