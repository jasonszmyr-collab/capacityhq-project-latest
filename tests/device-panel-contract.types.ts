import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dispatch, SetStateAction } from "react";
import type {
  DevicePanelReadClient, DevicePanelRow, DevicePanels, DeviceRealtimeClient, LoadedDevicePanels,
} from "../src/services/devicePanelTypes";
import { reloadDeviceOnly } from "../src/services/devicePanelReloaders";
import { loadDevicePanels } from "../src/hooks/useDeviceRealtime";

// Compile-time fixtures only. This function is never called and sends nothing.
function checkContracts(client: SupabaseClient, setState: Dispatch<SetStateAction<DevicePanels | null>>, row: DevicePanelRow) {
  const reads: DevicePanelReadClient = client;
  const realtime: DeviceRealtimeClient = client;
  const partial: DevicePanels = { device: { device_id: "HP-999001" } };
  const loaded: LoadedDevicePanels = {
    device: null, directive: null, calibration: null, heartbeat: null, commands: [], results: [],
  };
  setState(previous => ({ ...previous, ...partial }));
  void reloadDeviceOnly(reads, "HP-999001", setState);
  const aggregate: Promise<LoadedDevicePanels> = loadDevicePanels(reads, "HP-999001");
  // @ts-expect-error Row values require narrowing before numeric use.
  const position: number = row.position;
  // @ts-expect-error An aggregate load must include every panel.
  const incomplete: LoadedDevicePanels = {};
  // @ts-expect-error Command collections contain records rather than scalars.
  const scalarCommands: DevicePanels = { commands: [42] };
  void [realtime, loaded, aggregate, position, incomplete, scalarCommands];
}
void checkContracts;
