import React, { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sunrise,
  Sunset,
  Clock,
  Lightbulb,
  Activity,
} from "lucide-react";
import {
  getSunriseSunset,
} from "@/lib/sunTimes";

interface FlagData {
  latitude?: number | string | null;
  longitude?: number | string | null;
  timezone?: string | null;

  override_mode?: string | null;
  half_staff_active?: boolean | null;

  sun_schedule_enabled?: boolean | null;
  raise_at_sunrise?: boolean | null;
  lower_at_sunset?: boolean | null;
  illuminated_at_night?: boolean | null;

  [key: string]: unknown;
}

interface AutoScheduleStatusProps {
  flagData?: FlagData | null;
}

interface RowProps {
  label: string;
  value: string;
  icon?: React.ComponentType<{
    className?: string;
  }>;
}

function formatInTz(
  date: Date | null,
  timeZone: string
): string {
  if (!date) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "en-US",
      {
        hour: "numeric",
        minute: "2-digit",
        timeZone:
          timeZone || undefined,
      }
    ).format(date);
  } catch {
    return new Intl.DateTimeFormat(
      "en-US",
      {
        hour: "numeric",
        minute: "2-digit",
      }
    ).format(date);
  }
}

function Row({
  label,
  value,
  icon: Icon,
}: RowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-100 gap-2">
      <span className="text-sm text-zinc-500 flex items-center gap-1 shrink-0">
        {Icon ? (
          <Icon className="w-3 h-3" />
        ) : null}

        {label}
      </span>

      <span className="text-sm font-medium text-zinc-800 text-right">
        {value}
      </span>
    </div>
  );
}

export default function AutoScheduleStatus({
  flagData,
}: AutoScheduleStatusProps) {
  const lat =
    Number(flagData?.latitude);

  const lng =
    Number(flagData?.longitude);

  const tz =
    flagData?.timezone || "";

  const hasLocation =
    Number.isFinite(lat) &&
    Number.isFinite(lng);

  const {
    sunrise,
    sunset,
    tomorrowSunrise,
  } = useMemo(() => {
    if (!hasLocation) {
      return {
        sunrise: null,
        sunset: null,
        tomorrowSunrise: null,
      };
    }

    const today =
      new Date();

    const tmr =
      new Date();

    tmr.setDate(
      tmr.getDate() + 1
    );

    const t =
      getSunriseSunset(
        lat,
        lng,
        today
      );

    const tm =
      getSunriseSunset(
        lat,
        lng,
        tmr
      );

    return {
      sunrise:
        t?.sunrise ?? null,

      sunset:
        t?.sunset ?? null,

      tomorrowSunrise:
        tm?.sunrise ?? null,
    };
  }, [
    hasLocation,
    lat,
    lng,
  ]);

  const now =
    new Date();

  const override =
    flagData?.override_mode ||
    "AUTO";

  const autoActive =
    override === "AUTO";

  const desired =
    flagData?.half_staff_active
      ? "HALF"
      : "FULL";

  let nextAction =
    "Automatic scheduling disabled";

  if (
    flagData?.sun_schedule_enabled
  ) {
    if (
      flagData?.raise_at_sunrise &&
      sunrise &&
      now < sunrise
    ) {
      nextAction =
        `Raise at sunrise (${formatInTz(
          sunrise,
          tz
        )})`;
    } else if (
      flagData?.lower_at_sunset &&
      sunset &&
      now < sunset &&
      !flagData?.illuminated_at_night
    ) {
      nextAction =
        `Lower at sunset (${formatInTz(
          sunset,
          tz
        )})`;
    } else if (
      flagData?.raise_at_sunrise &&
      tomorrowSunrise
    ) {
      nextAction =
        `Raise at sunrise tomorrow (${formatInTz(
          tomorrowSunrise,
          tz
        )})`;
    } else if (
      flagData?.illuminated_at_night
    ) {
      nextAction =
        "Flag remains illuminated overnight";
    } else {
      nextAction =
        "No upcoming scheduled action";
    }
  }

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-zinc-800">
          <Activity className="w-5 h-5" />
          AUTO Schedule Status
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-1">
        <Row
          label="Current AUTO State"
          value={
            autoActive
              ? `AUTO → ${
                  desired === "HALF"
                    ? "Half Staff"
                    : "Full Staff"
                }`
              : `Manual: ${override}`
          }
        />

        <Row
          label="Today's Sunrise"
          icon={Sunrise}
          value={
            hasLocation
              ? formatInTz(
                  sunrise,
                  tz
                )
              : "Location not set"
          }
        />

        <Row
          label="Today's Sunset"
          icon={Sunset}
          value={
            hasLocation
              ? formatInTz(
                  sunset,
                  tz
                )
              : "Location not set"
          }
        />

        <Row
          label="Next Scheduled Action"
          icon={Clock}
          value={nextAction}
        />

        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-zinc-500 flex items-center gap-1">
            <Lightbulb className="w-3 h-3" />
            Night Illumination
          </span>

          <Badge
            className={
              flagData?.illuminated_at_night
                ? "bg-amber-500 text-white border-0"
                : "bg-zinc-200 text-zinc-600 border-0"
            }
          >
            {flagData?.illuminated_at_night
              ? "Enabled"
              : "Disabled"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}