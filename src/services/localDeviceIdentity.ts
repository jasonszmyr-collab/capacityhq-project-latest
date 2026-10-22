export class LocalIdentityError extends Error {
    constructor(message: string) { super(message); this.name = "LocalIdentityError"; }
}

export function parseLocalStatus(value: unknown): Record<string, any> {
    if (typeof value === "string") {
        try { value = JSON.parse(value); } catch { value = null; }
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new LocalIdentityError("HonorPole identity could not be confirmed. No local command sent.");
    }
    return value as Record<string, any>;
}

export function requireLocalIdentity(value: unknown, expectedDeviceId: string | null): Record<string, any> {
    if (!expectedDeviceId || !/^HP-[0-9]{3,6}$/.test(expectedDeviceId)) {
        throw new LocalIdentityError("Select an HonorPole before using local controls.");
    }
    const status = parseLocalStatus(value);
    // A name, cached address or HTTP 200 alone cannot identify a physical pole.
    if (status.device !== "HonorPole" || status.deviceId !== expectedDeviceId ||
        (status.device_id !== undefined && status.device_id !== expectedDeviceId)) {
        throw new LocalIdentityError(`Local device does not confirm ${expectedDeviceId}. No local command sent.`);
    }
    return status;
}
