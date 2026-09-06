/**
 * HonorPole Platform
 * Security Model
 */

export class Security
{
    private _authenticated = false;

    private _encrypted = true;

    private _token = "";

    public get authenticated(): boolean
    {
        return this._authenticated;
    }

    public get encrypted(): boolean
    {
        return this._encrypted;
    }

    public get token(): string
    {
        return this._token;
    }

    public update(
        authenticated: boolean,
        encrypted: boolean,
        token: string
    ): void
    {
        this._authenticated = authenticated;
        this._encrypted = encrypted;
        this._token = token;
    }
}