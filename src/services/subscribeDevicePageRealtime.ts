import type { RealtimeChannel } from "@supabase/supabase-js";

type Unsubscribe = () => void;

export function subscribeDevicePageRealtime(opts: {
  supabase: any;
  deviceId: string;
  onDevices?: () => void;
  onDirective?: () => void;
  onCalibration?: () => void;
  onHeartbeat?: () => void;
  onCommands?: () => void;
  onResults?: () => void;
}): { channel: RealtimeChannel; unsubscribe: Unsubscribe } {
  const {
    supabase,
    deviceId,
    onDevices,
    onDirective,
    onCalibration,
    onHeartbeat,
    onCommands,
    onResults,
  } = opts;

  // IMPORTANT: keep one channel per page to avoid leaks / duplicates
  const channel = supabase.channel(`device:${deviceId}:page`);

  // devices row changes (status, updated_at, state, etc.)
  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "devices", filter: `device_id=eq.${deviceId}` },
    () => onDevices?.()
  );

  // effective directive snapshot (what device should do now)
  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "device_directives", filter: `device_id=eq.${deviceId}` },
    () => onDirective?.()
  );

  // calibration updates (travel_ms_full, last_calibrated_at)
  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "device_calibration", filter: `device_id=eq.${deviceId}` },
    () => onCalibration?.()
  );

  // heartbeats (new row per beat)
  channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "device_heartbeats", filter: `device_id=eq.${deviceId}` },
    () => onHeartbeat?.()
  );

  // command queue changes (queued -> sent -> done/failed)
  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "device_commands", filter: `device_id=eq.${deviceId}` },
    () => onCommands?.()
  );

  // command results (upserted by command_id)
  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "device_command_results", filter: `device_id=eq.${deviceId}` },
    () => onResults?.()
  );

  channel.subscribe((status: string) => {
    // optional: console.log("realtime status", status);
  });

  return {
    channel,
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}
