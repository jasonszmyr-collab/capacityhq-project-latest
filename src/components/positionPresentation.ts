// A calibrated count remains a step estimate, not a measured flag height.
export interface PositionStatus {
    online: boolean;
    calibrated: boolean;
    currentPosition: number;
    targetPosition: number;
    learnedTopPosition: number;
    movement: string;
}

export function getPositionPresentation(status: PositionStatus | null | undefined) {
    let reason = "Waiting for device status";
    if (status) {
        if (status.online !== true) reason = "Device offline";
        else if (status.calibrated !== true) reason = "Calibration required";
        else if (status.movement === "ERROR") reason = "Device fault";
        else if (!Number.isFinite(status.currentPosition) || status.currentPosition < 0 ||
                 !Number.isFinite(status.targetPosition) || status.targetPosition < 0 ||
                 !Number.isFinite(status.learnedTopPosition) || status.learnedTopPosition <= 0)
            reason = "Invalid position status";
        else return {
            canMove: true,
            percent: Math.round(Math.max(0, Math.min(100,
                status.currentPosition / status.learnedTopPosition * 100))),
            reason: "Step estimate"
        };
    }
    return { canMove: false, percent: null, reason };
}
