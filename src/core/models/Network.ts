/**
 * ============================================================================
 * Honor Pole Innovations
 * HonorPole Platform
 * ----------------------------------------------------------------------------
 * File: Network.ts
 *
 * Description:
 * Represents the network state of an HonorPole device.
 *
 * This class contains runtime network information only and intentionally
 * contains no business logic.
 * ============================================================================
 */

export class Network
{
    //--------------------------------------------------------------------------
    // Private Fields
    //--------------------------------------------------------------------------

    private _connected: boolean;

    private _wifiEnabled: boolean;

    private _ssid: string;

    private _ipAddress: string;

    private _macAddress: string;

    private _hostname: string;

    private _rssi: number;

    private _channel: number;

    private _apMode: boolean;

    private _internetAvailable: boolean;

    //--------------------------------------------------------------------------
    // Constructor
    //--------------------------------------------------------------------------

    constructor()
    {
        this._connected = false;

        this._wifiEnabled = false;

        this._ssid = "";

        this._ipAddress = "";

        this._macAddress = "";

        this._hostname = "honorpole";

        this._rssi = 0;

        this._channel = 0;

        this._apMode = false;

        this._internetAvailable = false;
    }

    //--------------------------------------------------------------------------
    // Public Properties
    //--------------------------------------------------------------------------

    public get connected(): boolean
    {
        return this._connected;
    }

    public get wifiEnabled(): boolean
    {
        return this._wifiEnabled;
    }

    public get ssid(): string
    {
        return this._ssid;
    }

    public get ipAddress(): string
    {
        return this._ipAddress;
    }

    public get macAddress(): string
    {
        return this._macAddress;
    }

    public get hostname(): string
    {
        return this._hostname;
    }

    public get rssi(): number
    {
        return this._rssi;
    }

    public get channel(): number
    {
        return this._channel;
    }

        public get apMode(): boolean
    {
        return this._apMode;
    }

    public get internetAvailable(): boolean
    {
        return this._internetAvailable;
    }

    /**
     * Returns a simplified WiFi signal quality percentage.
     */
    public get signalQuality(): number
    {
        if (this._rssi >= -50)
        {
            return 100;
        }

        if (this._rssi <= -100)
        {
            return 0;
        }

        return Math.round(
            2 * (this._rssi + 100)
        );
    }

    //--------------------------------------------------------------------------
    // Public Methods
    //--------------------------------------------------------------------------

    public update(
        connected: boolean,
        wifiEnabled: boolean,
        ssid: string,
        ipAddress: string,
        macAddress: string,
        hostname: string,
        rssi: number,
        channel: number,
        apMode: boolean,
        internetAvailable: boolean
    ): void
    {
        this._connected = connected;

        this._wifiEnabled = wifiEnabled;

        this._ssid = ssid.trim();

        this._ipAddress = ipAddress.trim();

        this._macAddress = macAddress.trim();

        this._hostname = hostname.trim();

        this._rssi = rssi;

        this._channel = channel;

        this._apMode = apMode;

        this._internetAvailable = internetAvailable;
    }

    public reset(): void
    {
        this._connected = false;

        this._wifiEnabled = false;

        this._ssid = "";

        this._ipAddress = "";

        this._macAddress = "";

        this._hostname = "honorpole";

        this._rssi = 0;

        this._channel = 0;

        this._apMode = false;

        this._internetAvailable = false;
    }

    //--------------------------------------------------------------------------
    // Private Methods
    //--------------------------------------------------------------------------

}