import { useEffect, useCallback, useRef, useState } from "react";
import { subscribeDevicePageRealtime } from "../services/subscribeDevicePageRealtime";
import {
  reloadDeviceOnly,
  reloadDirectiveOnly,
  reloadCalibrationOnly,
  reloadHeartbeatOnly,
  reloadCommandsOnly,
  reloadResultsOnly,
} from "../services/devicePanelReloaders";

export interface DevicePanels {
  device: any;
  directive: any;
  calibration: any;
  heartbeat: any;
  commands: any[];
  results: any[];
}

export async function loadDevicePanels(supabase: any, deviceId: string): Promise<DevicePanels> {
  const [device, directive, calibration, heartbeat, commands, results] = await Promise.all([
    supabase.from("devices").select("*").eq("device_id", deviceId).maybeSingle(),
    supabase.from("device_directives").select("*").eq("device_id", deviceId).maybeSingle(),
    supabase.from("device_calibration").select("*").eq("device_id", deviceId).maybeSingle(),
    supabase
      .from("device_heartbeats")
      .select("*")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("device_commands")
      .select("*")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("device_command_results")
      .select("*")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    device: device.data,
    directive: directive.data,
    calibration: calibration.data,
    heartbeat: heartbeat.data,
    commands: commands.data || [],
    results: results.data || [],
  };
}

export function useDeviceRealtimePage(supabase: any, deviceId: string) {
  const [data, setData] = useState<DevicePanels | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track ongoing requests to prevent race conditions
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Memoized reload function that prevents race conditions
  const reloadAll = useCallback(async () => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const panels = await loadDevicePanels(supabase, deviceId);

      // Only update state if component is still mounted and request wasn't aborted
      if (mountedRef.current && !controller.signal.aborted) {
        setData(panels);
      }
    } catch (err) {
      if (mountedRef.current && !controller.signal.aborted) {
        setError(err instanceof Error ? err : new Error("Failed to load device data"));
      }
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [supabase, deviceId]);

  // Optimized reload functions for specific panels
  const reloadDevice = useCallback(async () => {
    if (!deviceId || !mountedRef.current) return;
    try {
      await reloadDeviceOnly(supabase, deviceId, setData);
    } catch (err) {
      console.error("Failed to reload device:", err);
    }
  }, [supabase, deviceId]);

  const reloadDirective = useCallback(async () => {
    if (!deviceId || !mountedRef.current) return;
    try {
      await reloadDirectiveOnly(supabase, deviceId, setData);
    } catch (err) {
      console.error("Failed to reload directive:", err);
    }
  }, [supabase, deviceId]);

  const reloadCalibration = useCallback(async () => {
    if (!deviceId || !mountedRef.current) return;
    try {
      await reloadCalibrationOnly(supabase, deviceId, setData);
    } catch (err) {
      console.error("Failed to reload calibration:", err);
    }
  }, [supabase, deviceId]);

  const reloadHeartbeat = useCallback(async () => {
    if (!deviceId || !mountedRef.current) return;
    try {
      await reloadHeartbeatOnly(supabase, deviceId, setData);
    } catch (err) {
      console.error("Failed to reload heartbeat:", err);
    }
  }, [supabase, deviceId]);

  const reloadCommands = useCallback(async () => {
    if (!deviceId || !mountedRef.current) return;
    try {
      await reloadCommandsOnly(supabase, deviceId, setData);
    } catch (err) {
      console.error("Failed to reload commands:", err);
    }
  }, [supabase, deviceId]);

  const reloadResults = useCallback(async () => {
    if (!deviceId || !mountedRef.current) return;
    try {
      await reloadResultsOnly(supabase, deviceId, setData);
    } catch (err) {
      console.error("Failed to reload results:", err);
    }
  }, [supabase, deviceId]);

  useEffect(() => {
    if (!deviceId) return;

    // Mark component as mounted
    mountedRef.current = true;

    // Initial load
    reloadAll();

    // Subscribe to real-time updates with optimized reloading
    const sub = subscribeDevicePageRealtime({
      supabase,
      deviceId,
      onDevices: reloadDevice,        // Only reload device table
      onDirective: reloadDirective,   // Only reload directive table
      onCalibration: reloadCalibration, // Only reload calibration table
      onHeartbeat: reloadHeartbeat,   // Only reload heartbeat
      onCommands: reloadCommands,     // Only reload commands
      onResults: reloadResults,       // Only reload results
    });

    return () => {
      mountedRef.current = false;

      // Cancel any ongoing requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Unsubscribe from real-time updates
      sub.unsubscribe();
    };
  }, [
    deviceId,
    supabase,
    reloadAll,
    reloadDevice,
    reloadDirective,
    reloadCalibration,
    reloadHeartbeat,
    reloadCommands,
    reloadResults,
  ]);

  return {
    data,
    isLoading,
    error,
    reloadAll,
    // Expose individual reload functions for manual control
    reloadDevice,
    reloadDirective,
    reloadCalibration,
    reloadHeartbeat,
    reloadCommands,
    reloadResults,
  };
}
