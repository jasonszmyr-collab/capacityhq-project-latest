/**
 * HonorPole Platform
 * Telemetry Model
 */

export class Telemetry
{
    private _lastSeen: Date | null = null;

    private _uptime = 0;

    private _freeHeap = 0;

    public get lastSeen(): Date | null
    {
        return this._lastSeen;
    }

    public get uptime(): number
    {
        return this._uptime;
    }

    public get freeHeap(): number
    {
        return this._freeHeap;
    }

    public update(
        lastSeen: Date | null,
        uptime: number,
        freeHeap: number
    ): void
    {
        this._lastSeen = lastSeen;
        this._uptime = uptime;
        this._freeHeap = freeHeap;
    }
}