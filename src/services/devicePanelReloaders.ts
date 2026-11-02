import type { DevicePanelReadClient, SetDevicePanels } from "./devicePanelTypes";

/**
 * Optimized reload functions for individual device data panels.
 * These functions reload only specific parts of the device data,
 * avoiding unnecessary database queries for unchanged data.
 */

export async function reloadDeviceOnly(
  supabase: DevicePanelReadClient,
  deviceId: string,
  set: SetDevicePanels
) {
  const { data } = await supabase
    .from("devices")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();
  set((prev) => ({ ...prev, device: data }));
}

export async function reloadDirectiveOnly(
  supabase: DevicePanelReadClient,
  deviceId: string,
  set: SetDevicePanels
) {
  const { data } = await supabase
    .from("device_directives")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();
  set((prev) => ({ ...prev, directive: data }));
}

export async function reloadCalibrationOnly(
  supabase: DevicePanelReadClient,
  deviceId: string,
  set: SetDevicePanels
) {
  const { data } = await supabase
    .from("device_calibration")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();
  set((prev) => ({ ...prev, calibration: data }));
}

export async function reloadHeartbeatOnly(
  supabase: DevicePanelReadClient,
  deviceId: string,
  set: SetDevicePanels
) {
  const { data } = await supabase
    .from("device_heartbeats")
    .select("*")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  set((prev) => ({ ...prev, heartbeat: data }));
}

export async function reloadCommandsOnly(
  supabase: DevicePanelReadClient,
  deviceId: string,
  set: SetDevicePanels
) {
  const { data } = await supabase
    .from("device_commands")
    .select("*")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(50);
  set((prev) => ({ ...prev, commands: data || [] }));
}

export async function reloadResultsOnly(
  supabase: DevicePanelReadClient,
  deviceId: string,
  set: SetDevicePanels
) {
  const { data } = await supabase
    .from("device_command_results")
    .select("*")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(50);
  set((prev) => ({ ...prev, results: data || [] }));
}
