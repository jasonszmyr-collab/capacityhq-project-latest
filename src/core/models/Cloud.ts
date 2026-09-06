/**
 * HonorPole Platform
 * Cloud Model
 */

export class Cloud
{
    private _connected = false;

    private _endpoint = "";

    private _lastSync: Date | null = null;

    public get connected(): boolean
    {
        return this._connected;
    }

    public get endpoint(): string
    {
        return this._endpoint;
    }

    public get lastSync(): Date | null
    {
        return this._lastSync;
    }

    public update(
        connected: boolean,
        endpoint: string,
        lastSync: Date | null
    ): void
    {
        this._connected = connected;
        this._endpoint = endpoint;
        this._lastSync = lastSync;
    }
}