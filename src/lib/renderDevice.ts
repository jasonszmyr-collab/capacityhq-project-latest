export interface DeviceStatus {
  online?: boolean;
  position?: number | string | null;
  full?: number | string | null;
  half?: number | string | null;
  target?: number | string | null;
  motor?: string | null;
  status?: string | null;
  lastSeen?: number | string | null;
  [key: string]: unknown;
}

export interface DeviceCommandResult {
  status: number;
  body: string;
}

export interface TargetOptions {
  fullFraction?: number;
  downFraction?: number;
  maxTelemetryAgeMs?: number;
  timeoutMs?: number;
  pollMs?: number;
  isAborted?: () => boolean;
}

export type DeviceTarget = "FULL" | "HALF" | "BOTTOM";

// ==========================================================
// FETCH STATUS
// ==========================================================

// GET /status telemetry. Throws on non-2xx.
export async function fetchDeviceStatus(
  deviceApiUrl: string
): Promise<DeviceStatus> {
  const res = await fetch(`${deviceApiUrl}/status`);

  if (!res.ok) {
    throw new Error(
      `Render ${res.status}: ${res.statusText}`
    );
  }

  return (await res.json()) as DeviceStatus;
}

// ==========================================================
// POSITION NEAR TARGET
// ==========================================================
//
// IMPORTANT:
// This is ONLY a numeric position comparison.
//
// A true result does NOT mean physical arrival has been
// confirmed.
//
// Use confirmedAtTarget() when physical arrival matters.
//

export function positionNearTarget(
  status: DeviceStatus | null | undefined,
  targetName: DeviceTarget,
  opts: TargetOptions = {}
): boolean {
  const pos = Number(status?.position);
  const full = Number(status?.full);
  const half = Number(status?.half);

  if (!Number.isFinite(pos)) {
    return false;
  }

  const fullTol =
    full > 0
      ? Math.max(
          Math.round(
            full * (opts.fullFraction ?? 0.05)
          ),
          10
        )
      : 10;

  const downTol =
    full > 0
      ? Math.max(
          Math.round(
            full * (opts.downFraction ?? 0.03)
          ),
          10
        )
      : 10;

  switch (targetName) {
    case "FULL":
      return (
        full > 0 &&
        Math.abs(pos - full) <= fullTol
      );

    case "HALF":
      return (
        half > 0 &&
        Math.abs(pos - half) <= fullTol
      );

    case "BOTTOM":
      return Math.abs(pos) <= downTol;

    default:
      return false;
  }
}

// ==========================================================
// TELEMETRY FRESHNESS
// ==========================================================
//
// Render supplies lastSeen as the timestamp of the most
// recent telemetry received from the ESP32.
//
// Fresh telemetry is required before physical arrival can
// be confirmed.
//

export function isTelemetryFresh(
  status: DeviceStatus | null | undefined,
  opts: TargetOptions = {}
): boolean {
  const maxAgeMs =
    opts.maxTelemetryAgeMs ?? 15000;

  const lastSeenRaw = status?.lastSeen;

  if (
    lastSeenRaw === null ||
    lastSeenRaw === undefined
  ) {
    return false;
  }

  let lastSeenMs: number;

  if (
    typeof lastSeenRaw === "number" ||
    (
      typeof lastSeenRaw === "string" &&
      /^\d+$/.test(lastSeenRaw.trim())
    )
  ) {
    lastSeenMs = Number(lastSeenRaw);

    // Support epoch seconds if ever returned.
    if (
      Number.isFinite(lastSeenMs) &&
      lastSeenMs > 0 &&
      lastSeenMs < 100000000000
    ) {
      lastSeenMs *= 1000;
    }
  } else {
    lastSeenMs =
      new Date(String(lastSeenRaw)).getTime();
  }

  if (!Number.isFinite(lastSeenMs)) {
    return false;
  }

  const ageMs =
    Date.now() - lastSeenMs;

  return (
    ageMs >= 0 &&
    ageMs <= maxAgeMs
  );
}

// ==========================================================
// MOTOR STOPPED / IDLE
// ==========================================================
//
// This intentionally does NOT treat "delivered" as stopped.
//
// delivered = command accepted/delivered
// delivered != physical movement complete
//

export function motorIndicatesStopped(
  status: DeviceStatus | null | undefined
): boolean {
  const motor =
    String(status?.motor ?? "")
      .trim()
      .toUpperCase();

  const deviceStatus =
    String(status?.status ?? "")
      .trim()
      .toUpperCase();

  const stoppedMotorStates =
    new Set([
      "STOP",
      "STOPPED",
      "IDLE",
      "OFF",
    ]);

  const stoppedStatusStates =
    new Set([
      "STOP",
      "STOPPED",
      "IDLE",
      "READY",
    ]);

  if (stoppedMotorStates.has(motor)) {
    return true;
  }

  if (stoppedStatusStates.has(deviceStatus)) {
    return true;
  }

  return false;
}

// ==========================================================
// CONFIRMED PHYSICAL ARRIVAL
// ==========================================================
//
// This is the function to use whenever code needs to know
// whether the pole has PHYSICALLY reached FULL, HALF, or
// BOTTOM.
//
// Position alone is not enough.
//

export function confirmedAtTarget(
  status: DeviceStatus | null | undefined,
  targetName: DeviceTarget,
  opts: TargetOptions = {}
): boolean {
  if (status?.online !== true) {
    return false;
  }

  if (!isTelemetryFresh(status, opts)) {
    return false;
  }

  if (
    !positionNearTarget(
      status,
      targetName,
      opts
    )
  ) {
    return false;
  }

  if (!motorIndicatesStopped(status)) {
    return false;
  }

  return true;
}

// ==========================================================
// WAIT FOR PHYSICAL TARGET
// ==========================================================
//
// Poll /status until physical arrival is confirmed.
//
// This intentionally does NOT return merely because
// position == target.
//
// That prevents Test Mode from advancing to the next command
// while the previous physical movement may still be underway.
//

export async function waitForTarget(
  deviceApiUrl: string,
  targetName: DeviceTarget,
  opts: TargetOptions = {}
): Promise<DeviceStatus> {
  const timeoutMs =
    opts.timeoutMs ?? 120000;

  const pollMs =
    opts.pollMs ?? 1000;

  const isAborted =
    opts.isAborted ?? (() => false);

  const start = Date.now();

  while (
    Date.now() - start <
    timeoutMs
  ) {
    if (isAborted()) {
      throw new Error("aborted");
    }

    const status =
      await fetchDeviceStatus(
        deviceApiUrl
      );

    if (
      confirmedAtTarget(
        status,
        targetName,
        opts
      )
    ) {
      return status;
    }

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          pollMs
        )
    );
  }

  throw new Error(
    `timeout waiting for confirmed physical arrival at ${targetName}`
  );
}
