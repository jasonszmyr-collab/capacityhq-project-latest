import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Cpu,
  Wifi,
  MapPin,
  Calendar,
  Copy,
  WifiOff,
  Gauge,
  Activity,
  Network,
  Code,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";

interface FlagData {
  id?: string | null;
  device_id?: string | null;
  device_online?: boolean | null;
  last_arduino_poll?: string | number | null;
  arduino_status?: string | null;

  motor?: string | null;
  motor_position?: number | string | null;
  motor_target?: number | string | null;
  motor_percent?: number | string | null;

  firmware?: string | null;
  wifi_connected?: boolean | null;
  ip_address?: string | null;

  state?: string | null;

  [key: string]: unknown;
}

interface DeviceInfoProps {
  flagData?: FlagData | null;
}

export default function DeviceInfo({
  flagData,
}: DeviceInfoProps) {
  const isOnline =
    flagData?.device_online ?? false;

  const lastSeen =
    flagData?.last_arduino_poll;

  const copyEntityId = async () => {
    if (!flagData?.id) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        flagData.id
      );

      toast.success(
        "Entity ID copied!"
      );
    } catch (error) {
      console.error(
        "Unable to copy Entity ID:",
        error
      );

      toast.error(
        "Unable to copy Entity ID"
      );
    }
  };

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-zinc-800">
            <Cpu className="w-5 h-5" />
            Device Information
          </CardTitle>

          <Badge
            className={`${
              isOnline
                ? "bg-emerald-500"
                : "bg-zinc-400"
            } text-white border-0`}
          >
            {isOnline ? (
              <Wifi className="w-3 h-3 mr-1" />
            ) : (
              <WifiOff className="w-3 h-3 mr-1" />
            )}

            {isOnline
              ? "Online"
              : "Offline"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {flagData?.id && (
            <div className="bg-blue-50 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-blue-700 uppercase tracking-wider">
                  Entity ID
                </span>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void copyEntityId()
                  }
                  className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copy
                </Button>
              </div>

              <code className="text-xs bg-white px-2 py-1 rounded font-mono text-blue-900 block">
                {flagData.id}
              </code>
            </div>
          )}

          <div className="flex items-center justify-between py-2 border-b border-zinc-100">
            <span className="text-sm text-zinc-500">
              Device ID
            </span>

            <span className="text-sm font-mono font-medium text-zinc-800">
              {flagData?.device_id ||
                "HP-001"}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-zinc-100">
            <span className="text-sm text-zinc-500">
              Controller
            </span>

            <span className="text-sm font-medium text-zinc-800">
              ESP32-S3
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-zinc-100">
            <span className="text-sm text-zinc-500">
              Motor Driver
            </span>

            <span className="text-sm font-medium text-zinc-800">
              TB6600
            </span>
          </div>

          {flagData?.arduino_status && (
            <div className="flex items-center justify-between py-2 border-b border-zinc-100">
              <span className="text-sm text-zinc-500 flex items-center gap-1">
                <Activity className="w-3 h-3" />
                Device Status
              </span>

              <span className="text-sm font-medium text-zinc-800">
                {flagData.arduino_status}
              </span>
            </div>
          )}

          {flagData?.motor && (
            <div className="flex items-center justify-between py-2 border-b border-zinc-100">
              <span className="text-sm text-zinc-500 flex items-center gap-1">
                <Gauge className="w-3 h-3" />
                Motor State
              </span>

              <span className="text-sm font-medium text-zinc-800">
                {flagData.motor}
              </span>
            </div>
          )}

          {flagData?.motor_position != null && (
            <div className="flex items-center justify-between py-2 border-b border-zinc-100">
              <span className="text-sm text-zinc-500">
                Motor Position
              </span>

              <span className="text-sm font-mono font-medium text-zinc-800">
                {flagData.motor_position}
              </span>
            </div>
          )}

          {flagData?.motor_target != null && (
            <div className="flex items-center justify-between py-2 border-b border-zinc-100">
              <span className="text-sm text-zinc-500">
                Motor Target
              </span>

              <span className="text-sm font-mono font-medium text-zinc-800">
                {flagData.motor_target}
              </span>
            </div>
          )}

          {flagData?.motor_percent != null && (
            <div className="flex items-center justify-between py-2 border-b border-zinc-100">
              <span className="text-sm text-zinc-500">
                Motor %
              </span>

              <span className="text-sm font-mono font-medium text-zinc-800">
                {flagData.motor_percent}%
              </span>
            </div>
          )}

          {flagData?.firmware && (
            <div className="flex items-center justify-between py-2 border-b border-zinc-100">
              <span className="text-sm text-zinc-500 flex items-center gap-1">
                <Code className="w-3 h-3" />
                Firmware
              </span>

              <span className="text-sm font-mono font-medium text-zinc-800">
                {flagData.firmware}
              </span>
            </div>
          )}

          {flagData?.wifi_connected != null && (
            <div className="flex items-center justify-between py-2 border-b border-zinc-100">
              <span className="text-sm text-zinc-500 flex items-center gap-1">
                {flagData.wifi_connected ? (
                  <Wifi className="w-3 h-3" />
                ) : (
                  <WifiOff className="w-3 h-3" />
                )}
                WiFi
              </span>

              <span className="text-sm font-medium text-zinc-800">
                {flagData.wifi_connected
                  ? "Connected"
                  : "Disconnected"}
              </span>
            </div>
          )}

          {flagData?.ip_address && (
            <div className="flex items-center justify-between py-2 border-b border-zinc-100">
              <span className="text-sm text-zinc-500 flex items-center gap-1">
                <Network className="w-3 h-3" />
                IP Address
              </span>

              <span className="text-sm font-mono font-medium text-zinc-800">
                {flagData.ip_address}
              </span>
            </div>
          )}

          {flagData?.state && (
            <div className="flex items-center justify-between py-2 border-b border-zinc-100">
              <span className="text-sm text-zinc-500 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                State
              </span>

              <span className="text-sm font-medium text-zinc-800">
                {flagData.state}
              </span>
            </div>
          )}

          {lastSeen && (
            <div className="flex items-center justify-between py-2 border-b border-zinc-100">
              <span className="text-sm text-zinc-500 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Last Seen
              </span>

              <span className="text-sm font-medium text-zinc-800">
                {format(
                  new Date(lastSeen),
                  "MMM d, yyyy h:mm:ss a"
                )}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-zinc-500 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Last Updated
            </span>

            <span className="text-sm font-medium text-zinc-800">
              {lastSeen
                ? format(
                    new Date(lastSeen),
                    "MMM d, yyyy h:mm:ss a"
                  )
                : "N/A"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}