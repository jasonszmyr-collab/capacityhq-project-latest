export interface CommandDispatchResult {
    success: boolean;
    stage: "queued" | "submitted" | "rejected" | "unknown";
    message: string;
    commandId?: string;
}

export class CommandHttpError extends Error {
    constructor(public status: number, public body: unknown, text: string) {
        super(`${status} ${text}`);
        this.name = "CommandHttpError";
    }
}

function objectValue(value: unknown): Record<string, unknown> | null {
    if (typeof value === "string") {
        try { value = JSON.parse(value); } catch { return null; }
    }
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown> : null;
}

function reason(body: Record<string, unknown> | null): string | null {
    if (!body) return null;
    for (const key of ["reason", "error", "message"]) {
        const value = body[key];
        if (typeof value === "string" && value.trim()) return value.trim().slice(0, 240);
    }
    return null;
}

export function commandReply(
    payload: unknown, route: "cloud" | "local", deviceId: string, command: string
): CommandDispatchResult {
    const body = objectValue(payload);
    const label = command.toUpperCase();
    const status = typeof body?.status === "string" ? body.status.toLowerCase() : "";
    if (body && (body.success === false || body.ok === false || body.accepted === false ||
        body.error || ["rejected", "refused", "denied", "failed", "error"].includes(status))) {
        return { success: false, stage: "rejected", message: reason(body) ?? `${label} was rejected.` };
    }
    if (body && typeof body.deviceId === "string" && body.deviceId !== deviceId) {
        return { success: false, stage: "unknown", message: `${label} response was for another HonorPole. Check device status before retrying.` };
    }
    if (body && typeof body.command === "string" && body.command.toLowerCase() !== command.toLowerCase()) {
        return { success: false, stage: "unknown", message: `${label} response did not match the requested command. Check device status before retrying.` };
    }
    if (body?.success === true && status === "queued") {
        return {
            success: true, stage: "queued",
            message: `${label} queued for ${deviceId}. Waiting for board confirmation.`,
            ...(typeof body.commandId === "string" ? { commandId: body.commandId } : {})
        };
    }
    if (body?.success === true || (route === "local" && body !== null)) {
        return { success: true, stage: "submitted", message: route === "local"
            ? `${label} sent to ${deviceId} locally. Board acceptance is not confirmed.`
            : `${label} submitted for ${deviceId}. Board acceptance is not confirmed.` };
    }
    return { success: false, stage: "unknown", message: `${label} response did not confirm submission. Check device status before retrying.` };
}

export function commandFailure(error: unknown, command: string): CommandDispatchResult {
    const label = command.toUpperCase();
    if (error instanceof CommandHttpError) {
        const detail = reason(objectValue(error.body));
        if (error.status >= 400 && error.status < 500 && error.status !== 408) {
            return { success: false, stage: "rejected", message: detail ??
                (error.status === 401 ? "Sign in again to send this command." :
                 error.status === 403 ? "You do not have permission to control this HonorPole." :
                 `${label} was rejected (HTTP ${error.status}).`) };
        }
        return { success: false, stage: "unknown", message: `${label} submission could not be confirmed${detail ? `: ${detail}` : ` (HTTP ${error.status})`}. Check device status before retrying.` };
    }
    return { success: false, stage: "unknown", message: `${label} submission could not be confirmed. Check the connection and device status before retrying.` };
}
