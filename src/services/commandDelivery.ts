export interface DeliveryRequest {
    deviceId: string;
    commandId: string;
    command: string;
}

// Server delivery is not firmware acceptance or completed movement.
export function hasMatchingDelivery(payload: unknown, request: DeliveryRequest): boolean {
    if (!payload || typeof payload !== "object") return false;
    const body = payload as Record<string, unknown>;
    if (body.serialNumber !== request.deviceId) return false;
    const record = body.command;
    if (!record || typeof record !== "object") return false;
    const delivery = record as Record<string, unknown>;
    return delivery.id === request.commandId && delivery.pending === false &&
        typeof delivery.deliveredAt === "number" && Number.isFinite(delivery.deliveredAt) &&
        delivery.deliveredAt > 0 &&
        (typeof delivery.createdAt !== "number" || delivery.deliveredAt >= delivery.createdAt);
}

export interface FirmwareReceipt {
    commandId: string;
    command: string;
    accepted: boolean;
    stage: "accepted" | "rejected";
    code: string;
    message: string;
    receivedAt: number;
}

export function matchingFirmwareReceipt(payload: unknown, request: DeliveryRequest): FirmwareReceipt | null {
    if (!hasMatchingDelivery(payload, request)) return null;
    const delivery = (payload as { command: Record<string, unknown> }).command;
    const raw = delivery.result;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    if (r.commandId !== request.commandId || typeof r.command !== "string" ||
        r.command.toUpperCase() !== request.command.toUpperCase() ||
        typeof r.accepted !== "boolean" ||
        r.stage !== (r.accepted ? "accepted" : "rejected") ||
        typeof r.code !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(r.code) ||
        typeof r.message !== "string" || !r.message.trim() || r.message.length > 240 ||
        /[\x00-\x1F\x7F]/.test(r.message) ||
        typeof r.receivedAt !== "number" || !Number.isFinite(r.receivedAt) ||
        r.receivedAt < (delivery.deliveredAt as number)) return null;
    return r as unknown as FirmwareReceipt;
}

export interface DeliveryWatchOptions {
    intervalMs?: number;
    timeoutMs?: number;
    // Total read-only observation window, including the initial timeout.
    recoveryTimeoutMs?: number;
    recoveryIntervalMs?: number;
    onRejected?: (message: string) => void;
}

export function watchCommandDelivery(
    request: DeliveryRequest,
    read: () => Promise<unknown>,
    notify: (message: string) => void,
    isCurrent: () => boolean,
    options: DeliveryWatchOptions = {}
): () => void {
    let active = true;
    let deliveryReported = false;
    let recovering = false;
    let next: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let recoveryDeadline: ReturnType<typeof setTimeout> | undefined;
    const timeoutMs = options.timeoutMs ?? 30000;
    const totalMs = Math.max(timeoutMs, options.recoveryTimeoutMs ?? timeoutMs);
    const canRecover = totalMs > timeoutMs;
    const expiresAt = Date.now() + totalMs;
    const label = request.command.toUpperCase();
    const cancel = () => {
        active = false;
        clearTimeout(deadline);
        clearTimeout(recoveryDeadline);
        clearTimeout(next);
    };
    const uncertainty = () => deliveryReported
        ? `Server reports ${label} delivered to ${request.deviceId}. Board acceptance is still not confirmed.`
        : `${label} delivery to ${request.deviceId} is not confirmed.`;
    const finishUnconfirmed = () => {
        if (active && isCurrent()) notify(`${uncertainty()} Receipt checking has ended. Check device status before retrying.`);
        cancel();
    };
    // Check wall time as well as timers: Android can suspend timers in background.
    const current = () => {
        if (!active) return false;
        if (!isCurrent()) { cancel(); return false; }
        if (Date.now() >= expiresAt) { finishUnconfirmed(); return false; }
        return true;
    };
    deadline = setTimeout(() => {
        if (!current()) return;
        if (!canRecover) { finishUnconfirmed(); return; }
        recovering = true;
        notify(`${uncertainty()} Checking for its receipt; no new command will be sent.`);
        // Keep the one existing read chain alive; never start overlapping polls.
    }, timeoutMs);
    if (canRecover) recoveryDeadline = setTimeout(finishUnconfirmed, totalMs);

    async function poll() {
        if (!current()) return;
        try {
            // This callback reads status only. It must never dispatch a command.
            const payload = await read();
            if (!current()) return;
            const receipt = matchingFirmwareReceipt(payload, request);
            if (receipt) {
                if (receipt.accepted) {
                    notify(`Board accepted ${label} for ${request.deviceId}. ${receipt.message} Check device status for the motion outcome.`);
                } else {
                    (options.onRejected ?? notify)(`${label} refused by ${request.deviceId}: ${receipt.message}`);
                }
                cancel();
                return;
            }
            if (!deliveryReported && hasMatchingDelivery(payload, request)) {
                deliveryReported = true;
                notify(`Server reports ${label} delivered to ${request.deviceId}. Board acceptance is not confirmed.` +
                    (recovering ? " Checking for its receipt; no new command will be sent." : ""));
            }
        } catch {
            // A failed read proves nothing. Keep the original ID, without resending.
        }
        if (current()) next = setTimeout(() => void poll(), recovering
            ? options.recoveryIntervalMs ?? 5000
            : options.intervalMs ?? 2000);
    }
    void poll();
    return cancel;
}
