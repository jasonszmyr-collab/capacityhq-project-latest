import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Flag,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";

interface FlagData {
  live_position?: string | null;
  testmode?: boolean | null;
  override_mode?: string | null;

  last_arduino_poll?: string | null;

  half_staff_active?: boolean | null;
  half_staff_reason?: string | null;
  half_staff_source?: string | null;
  half_staff_expiration?: string | null;

  arduino_status?: string | null;
}

interface StatusCardProps {
  flagData?: FlagData | null;
}

export default function StatusCard({
  flagData,
}: StatusCardProps) {
  const livePosition = flagData?.live_position;

  const getPositionLabel = () => {
    switch (livePosition) {
      case "full":
        return "Full Staff";

      case "half":
        return "Half Staff";

      case "down":
        return "Lowered";

      case "moving":
        return "Moving";

      case "stopped":
        return "Stopped";

      default:
        return "Unknown";
    }
  };

  const getPositionColor = () => {
    switch (livePosition) {
      case "full":
        return "bg-emerald-500";

      case "half":
        return "bg-amber-500";

      case "down":
        return "bg-zinc-500";

      case "moving":
        return "bg-blue-500";

      case "stopped":
        return "bg-zinc-400";

      default:
        return "bg-zinc-400";
    }
  };

  const getModeStatus = () => {
    if (flagData?.testmode) {
      return {
        label: "Test Mode",
        color: "bg-purple-500",
        icon: Zap,
      };
    }

    if (flagData?.override_mode !== "AUTO") {
      return {
        label: `Override: ${flagData?.override_mode ?? "Unknown"}`,
        color: "bg-blue-500",
        icon: AlertTriangle,
      };
    }

    return {
      label: "Automatic",
      color: "bg-emerald-500",
      icon: CheckCircle2,
    };
  };

  const modeStatus = getModeStatus();
  const ModeIcon = modeStatus.icon;

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">
              Current Status
            </p>

            <div className="flex items-center gap-3">
              <motion.div
                className={`w-3 h-3 rounded-full ${getPositionColor()}`}
                animate={{
                  scale: [1, 1.2, 1],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 2,
                }}
              />

              <h2 className="text-2xl font-bold text-zinc-800">
                {getPositionLabel()}
              </h2>
            </div>
          </div>

          <Badge
            className={`${modeStatus.color} text-white border-0 px-3 py-1`}
          >
            <ModeIcon className="w-3 h-3 mr-1.5" />
            {modeStatus.label}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Flag className="w-4 h-4 text-zinc-400" />

              <span className="text-xs font-medium text-zinc-500 uppercase">
                Position
              </span>
            </div>

            <p className="text-lg font-semibold text-zinc-800 capitalize">
              {getPositionLabel()}
            </p>
          </div>

          <div className="bg-zinc-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-zinc-400" />

              <span className="text-xs font-medium text-zinc-500 uppercase">
                Last Poll
              </span>
            </div>

            <p className="text-lg font-semibold text-zinc-800">
              {flagData?.last_arduino_poll
                ? format(
                    new Date(flagData.last_arduino_poll),
                    "HH:mm:ss"
                  )
                : "Never"}
            </p>
          </div>
        </div>

        {flagData?.half_staff_active && (
          <motion.div
            initial={{
              opacity: 0,
              y: 10,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Flag className="w-4 h-4 text-amber-600" />
              </div>

              <div>
                <p className="font-semibold text-amber-800">
                  {flagData.half_staff_reason ||
                    "Half-Staff Observance"}
                </p>

                {flagData.half_staff_source && (
                  <p className="text-sm text-amber-600 mt-0.5">
                    Source: {flagData.half_staff_source}
                  </p>
                )}

                {flagData.half_staff_expiration && (
                  <p className="text-xs text-amber-500 mt-1">
                    Until:{" "}
                    {format(
                      new Date(flagData.half_staff_expiration),
                      "MMM d, yyyy h:mm a"
                    )}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {flagData?.arduino_status && (
          <div className="mt-4 pt-4 border-t border-zinc-100">
            <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
              Device Status
            </p>

            <p className="text-sm text-zinc-600">
              {flagData.arduino_status}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}