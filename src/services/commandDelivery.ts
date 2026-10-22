export interface DeliveryRequest {
    deviceId: string;
    commandId: string;
    command: string;
}

// The server's delivery record is not a firmware acceptance acknowledgement.
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

export function watchCommandDelivery(
    request: DeliveryRequest,
    read: () => Promise<unknown>,
    notify: (message: string) => void,
    isCurrent: () => boolean,
    options: { intervalMs?: number; timeoutMs?: number } = {}
): () => void {
    let active = true;
    let next: ReturnType<typeof setTimeout> | undefined;
    const label = request.command.toUpperCase();
    const cancel = () => {
        active = false;
        clearTimeout(deadline);
        clearTimeout(next);
    };
    const deadline = setTimeout(() => {
        if (active && isCurrent()) {
            notify(`${label} delivery to ${request.deviceId} is not confirmed. Check device status before retrying.`);
        }
        cancel();
    }, options.timeoutMs ?? 30000);

    async function poll() {
        if (!active || !isCurrent()) { cancel(); return; }
        try {
            const payload = await read();
            if (!active || !isCurrent()) { cancel(); return; }
            if (hasMatchingDelivery(payload, request)) {
                notify(`Server reports ${label} delivered to ${request.deviceId}. Board acceptance is not confirmed.`);
                cancel();
                return;
            }
        } catch {
            // A failed read cannot establish delivery; the deadline still applies.
        }
        if (active && isCurrent()) next = setTimeout(() => void poll(), options.intervalMs ?? 2000);
        else cancel();
    }
    void poll();
    return cancel;
}
