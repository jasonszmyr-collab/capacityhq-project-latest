import type { SupabaseClient } from "@supabase/supabase-js";

// Query results are records, not a generated database schema. Consumers must
// narrow individual values before using them as numbers, strings or statuses.
export type DevicePanelRow = Record<string, unknown>;
// Use the SDK's own query signatures. This is a client capability type, not
// generated schema validation or a new runtime authorization boundary.
export type DevicePanelReadClient = Pick<SupabaseClient, "from">;

export type DevicePanelSubscriptionClient = Pick<SupabaseClient, "channel" | "removeChannel">;
export type DeviceRealtimeClient = DevicePanelReadClient & DevicePanelSubscriptionClient;

export interface LoadedDevicePanels {
  device: DevicePanelRow | null;
  directive: DevicePanelRow | null;
  calibration: DevicePanelRow | null;
  heartbeat: DevicePanelRow | null;
  commands: DevicePanelRow[];
  results: DevicePanelRow[];
}

// A targeted reload can run while the aggregate state is still null. Preserve
// that existing partial-update behavior in the state type instead of inventing
// defaults or pretending every panel has already loaded.
export type DevicePanels = Partial<LoadedDevicePanels>;
export type SetDevicePanels = (
  updater: (previous: DevicePanels | null) => DevicePanels
) => void;
