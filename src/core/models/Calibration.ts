/**
 * HonorPole Platform
 * Calibration Model
 */

export class Calibration
{
    private _calibrated = false;

    private _fullPosition = 0;

    private _halfPosition = 0;

    private _bottomPosition = 0;

    public get calibrated(): boolean
    {
        return this._calibrated;
    }

    public get fullPosition(): number
    {
        return this._fullPosition;
    }

    public get halfPosition(): number
    {
        return this._halfPosition;
    }

    public get bottomPosition(): number
    {
        return this._bottomPosition;
    }

    public update(
        calibrated: boolean,
        fullPosition: number,
        halfPosition: number,
        bottomPosition: number
    ): void
    {
        this._calibrated = calibrated;
        this._fullPosition = fullPosition;
        this._halfPosition = halfPosition;
        this._bottomPosition = bottomPosition;
    }
}