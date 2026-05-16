import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Determines if a device is online based on its last heartbeat timestamp.
 *
 * @param lastHeartbeatIso - ISO 8601 timestamp string of the last heartbeat
 * @param staleSeconds - Number of seconds after which a heartbeat is considered stale (default: 90)
 * @returns Object with online status and age in seconds
 *
 * @example
 * const { online, ageSec } = heartbeatOnline('2024-01-01T12:00:00Z', 90);
 * // online: true/false, ageSec: number of seconds since last heartbeat
 */
export function heartbeatOnline(
  lastHeartbeatIso?: string | null,
  staleSeconds: number = 90
): { online: boolean; ageSec: number | null } {
  // Handle missing or invalid timestamp
  if (!lastHeartbeatIso) {
    return { online: false, ageSec: null };
  }

  // Parse timestamp
  const heartbeatTime = new Date(lastHeartbeatIso).getTime();

  // Handle invalid date
  if (isNaN(heartbeatTime)) {
    console.warn(`Invalid heartbeat timestamp: ${lastHeartbeatIso}`);
    return { online: false, ageSec: null };
  }

  // Calculate age in seconds
  const ageSec = Math.floor((Date.now() - heartbeatTime) / 1000);

  // Handle future timestamps (clock skew)
  if (ageSec < 0) {
    console.warn(`Heartbeat timestamp is in the future: ${lastHeartbeatIso}`);
    // Consider it online if it's within reasonable clock skew (e.g., 5 seconds)
    return { online: ageSec > -5, ageSec: 0 };
  }

  return {
    online: ageSec <= staleSeconds,
    ageSec,
  };
}
