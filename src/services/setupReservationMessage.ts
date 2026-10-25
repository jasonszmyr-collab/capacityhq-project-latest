export function setupReservationMessage(body: unknown): string | null {
    if (!body || typeof body !== "object") return null;
    const data = body as { error?: unknown; setupState?: unknown; remainingMs?: unknown };
    if (data.error !== "A setup request already exists; wait for it to expire") return null;
    const fallback = "A previous setup request or window is still reserved. An opened session can remain reserved for up to 10 minutes from opening, even after setup Wi-Fi closes. Reuse its current password if available; otherwise wait for the reservation to expire.";
    const limits: Record<string, number> = { PENDING: 45000, REFUSED: 15000, OPEN: 600000 };
    if (typeof data.setupState !== "string" || !Object.prototype.hasOwnProperty.call(limits, data.setupState) ||
        typeof data.remainingMs !== "number" || !Number.isFinite(data.remainingMs) ||
        data.remainingMs <= 0 || data.remainingMs > limits[data.setupState]) return fallback;
    const seconds = Math.ceil(data.remainingMs / 1000);
    const remaining = seconds >= 60 ? `about ${Math.ceil(seconds / 60)} minutes` : `about ${seconds} seconds`;
    if (data.setupState === "PENDING") return `The previous setup opening request is still pending. At this check, its server reservation had ${remaining} remaining. Wait before opening setup again.`;
    if (data.setupState === "REFUSED") return `The previous setup opening was refused. At this check, its server reservation had ${remaining} remaining. Check the refusal reason before another attempt.`;
    return `A previously opened setup session is still reserved. At this check, its server reservation had ${remaining} remaining. Closing setup Wi-Fi does not clear this reservation. Reuse its current password if available; otherwise wait for the reservation to expire.`;
}
