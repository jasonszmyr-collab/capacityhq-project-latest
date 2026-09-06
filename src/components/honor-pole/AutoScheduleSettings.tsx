import React, { useEffect, useRef, useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import {
  Settings2,
  Save,
  Sun,
  Moon,
  Lightbulb,
  Flag,
  MapPin,
  Crosshair,
  Landmark,
  Building2,
  ShieldCheck,
  Search,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import {
  resolveZipLocation,
  resolveCurrentLocation,
  isZipValid,
  type ResolvedCurrentLocation,
  type ResolvedZipLocation,
} from "@/lib/locationResolve";

interface FlagData {
  id?: string | null;

  sun_schedule_enabled?: boolean | null;
  raise_at_sunrise?: boolean | null;
  lower_at_sunset?: boolean | null;
  illuminated_at_night?: boolean | null;
  auto_half_staff?: boolean | null;

  enable_federal_alerts?: boolean | null;
  enable_state_alerts?: boolean | null;
  enable_local_alerts?: boolean | null;
  auto_apply_verified_directives?: boolean | null;

  latitude?: number | string | null;
  longitude?: number | string | null;
  timezone?: string | null;

  installation_zip?: string | null;
  installation_city?: string | null;
  installation_county?: string | null;
  installation_state?: string | null;
  installation_state_code?: string | null;
  installation_county_fips?: string | null;

  [key: string]: unknown;
}

interface UpdatePayload {
  sun_schedule_enabled?: boolean;
  raise_at_sunrise?: boolean;
  lower_at_sunset?: boolean;
  illuminated_at_night?: boolean;
  auto_half_staff?: boolean;

  enable_federal_alerts?: boolean;
  enable_state_alerts?: boolean;
  enable_local_alerts?: boolean;
  auto_apply_verified_directives?: boolean;

  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;

  installation_zip?: string | null;
  installation_city?: string | null;
  installation_county?: string | null;
  installation_state?: string | null;
  installation_state_code?: string | null;
  installation_county_fips?: string | null;
}

interface AutoScheduleSettingsProps {
  flagData?: FlagData | null;

  onUpdate: (
    updates: UpdatePayload
  ) => void | Promise<void>;

  isUpdating: boolean;
}

interface FormState {
  sun_schedule_enabled: boolean;
  raise_at_sunrise: boolean;
  lower_at_sunset: boolean;
  illuminated_at_night: boolean;
  auto_half_staff: boolean;

  enable_federal_alerts: boolean;
  enable_state_alerts: boolean;
  enable_local_alerts: boolean;
  auto_apply_verified_directives: boolean;

  latitude: number | string;
  longitude: number | string;
  timezone: string;
}

type SwitchKey =
  | "sun_schedule_enabled"
  | "raise_at_sunrise"
  | "lower_at_sunset"
  | "illuminated_at_night"
  | "auto_half_staff"
  | "enable_federal_alerts"
  | "enable_state_alerts"
  | "enable_local_alerts"
  | "auto_apply_verified_directives";

type LocationField =
  | "latitude"
  | "longitude"
  | "timezone";

interface SwitchDefinition {
  key: SwitchKey;
  label: string;
  icon: React.ComponentType<{
    className?: string;
  }>;
  help: string;
}

const SWITCH_FIELDS: SwitchDefinition[] = [
  {
    key: "sun_schedule_enabled",
    label: "Automatic Sunrise/Sunset",
    icon: Sun,
    help: "Controls scheduled daily operation for this Honor Pole.",
  },
  {
    key: "raise_at_sunrise",
    label: "Raise at Sunrise",
    icon: Sun,
    help: "Automatically raises the flag at local sunrise.",
  },
  {
    key: "lower_at_sunset",
    label: "Lower at Sunset",
    icon: Moon,
    help: "Automatically lowers the flag at local sunset.",
  },
  {
    key: "illuminated_at_night",
    label: "Flag Illuminated at Night",
    icon: Lightbulb,
    help:
      "Flag may remain raised overnight; prevents automatic sunset lowering.",
  },
  {
    key: "auto_half_staff",
    label: "Automatic Half-Staff Observances",
    icon: Flag,
    help:
      "Allows AUTO mode to select HALF when an active observance exists.",
  },
];

const GOV_ALERT_FIELDS: SwitchDefinition[] = [
  {
    key: "enable_federal_alerts",
    label: "Federal Flag Alerts",
    icon: Landmark,
    help: "Monitor applicable verified federal flag directives.",
  },
  {
    key: "enable_state_alerts",
    label: "State Flag Alerts",
    icon: Building2,
    help:
      "Monitor verified flag directives for the installation's state.",
  },
  {
    key: "enable_local_alerts",
    label: "Local Flag Alerts",
    icon: MapPin,
    help:
      "Monitor verified directives applicable to the installation's county/city.",
  },
  {
    key: "auto_apply_verified_directives",
    label: "Automatically Apply Verified Directives",
    icon: ShieldCheck,
    help:
      "Allows verified applicable government directives to physically change FULL ↔ HALF while the pole is in AUTO mode.",
  },
];

type PersistableLocation =
  | ResolvedZipLocation
  | ResolvedCurrentLocation;

export default function AutoScheduleSettings({
  flagData,
  onUpdate,
  isUpdating,
}: AutoScheduleSettingsProps) {
  const [form, setForm] = useState<FormState>({
    sun_schedule_enabled: false,
    raise_at_sunrise: false,
    lower_at_sunset: false,
    illuminated_at_night: false,
    auto_half_staff: true,

    enable_federal_alerts: true,
    enable_state_alerts: true,
    enable_local_alerts: false,
    auto_apply_verified_directives: false,

    latitude: "",
    longitude: "",
    timezone: "",
  });

  const [zip, setZip] = useState("");
  const [resolvingZip, setResolvingZip] = useState(false);
  const [resolvingGeo, setResolvingGeo] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const lastSyncedIdRef = useRef<string | null>(null);

  useEffect(() => {
    const id = flagData?.id;

    if (!id || id === lastSyncedIdRef.current) {
      return;
    }

    lastSyncedIdRef.current = id;

    setForm({
      sun_schedule_enabled:
        !!flagData?.sun_schedule_enabled,

      raise_at_sunrise:
        !!flagData?.raise_at_sunrise,

      lower_at_sunset:
        !!flagData?.lower_at_sunset,

      illuminated_at_night:
        !!flagData?.illuminated_at_night,

      auto_half_staff:
        flagData?.auto_half_staff ?? true,

      enable_federal_alerts:
        flagData?.enable_federal_alerts ?? true,

      enable_state_alerts:
        flagData?.enable_state_alerts ?? true,

      enable_local_alerts:
        flagData?.enable_local_alerts ?? false,

      auto_apply_verified_directives:
        flagData?.auto_apply_verified_directives ?? false,

      latitude:
        flagData?.latitude ?? "",

      longitude:
        flagData?.longitude ?? "",

      timezone:
        flagData?.timezone ?? "",
    });

    setZip(flagData?.installation_zip || "");
  }, [flagData]);

  const toggle = (
    key: SwitchKey,
    val: boolean
  ) => {
    setForm((f) => ({
      ...f,
      [key]: val,
    }));
  };

  const setField = (
    key: LocationField,
    val: string
  ) => {
    setForm((f) => ({
      ...f,
      [key]: val,
    }));
  };

  const persistLocation = (
    loc: PersistableLocation
  ) => {
    void onUpdate({
      latitude: loc.latitude,
      longitude: loc.longitude,
      timezone: loc.timezone || null,

      installation_zip:
        "zip" in loc
          ? loc.zip ?? null
          : null,

      installation_city:
        loc.city ?? null,

      installation_county:
        loc.county ?? null,

      installation_state:
        loc.state ?? null,

      installation_state_code:
        loc.stateCode ?? null,

      installation_county_fips:
        loc.countyFips ?? null,
    });
  };

  const handleZipResolve = async () => {
    if (!isZipValid(zip)) {
      toast.error(
        "Enter a valid 5-digit US ZIP code."
      );
      return;
    }

    setResolvingZip(true);

    try {
      const loc =
        await resolveZipLocation(zip);

      persistLocation(loc);

      toast.success(
        `Location set to ${
          loc.city ? loc.city + ", " : ""
        }${loc.stateCode || loc.state || ""} (${loc.timezone}).`
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not resolve ZIP code.";

      toast.error(message);
    } finally {
      setResolvingZip(false);
    }
  };

  const handleUseMyLocation = async () => {
    setResolvingGeo(true);

    try {
      const loc =
        await resolveCurrentLocation();

      persistLocation(loc);

      toast.success(
        "Location set to your current device location."
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not get your current location.";

      toast.error(message);
    } finally {
      setResolvingGeo(false);
    }
  };

  const handleSave = async () => {
    const payload: UpdatePayload = {
      sun_schedule_enabled:
        !!form.sun_schedule_enabled,

      raise_at_sunrise:
        !!form.raise_at_sunrise,

      lower_at_sunset:
        !!form.lower_at_sunset,

      illuminated_at_night:
        !!form.illuminated_at_night,

      auto_half_staff:
        !!form.auto_half_staff,

      enable_federal_alerts:
        !!form.enable_federal_alerts,

      enable_state_alerts:
        !!form.enable_state_alerts,

      enable_local_alerts:
        !!form.enable_local_alerts,

      auto_apply_verified_directives:
        !!form.auto_apply_verified_directives,

      latitude:
        form.latitude === ""
          ? null
          : Number(form.latitude),

      longitude:
        form.longitude === ""
          ? null
          : Number(form.longitude),

      timezone:
        form.timezone || null,
    };

    const savedZip =
      flagData?.installation_zip || "";

    const zipChanged =
      !!zip &&
      isZipValid(zip) &&
      zip !== savedZip;

    if (zipChanged) {
      setResolvingZip(true);

      try {
        const loc =
          await resolveZipLocation(zip);

        payload.latitude =
          loc.latitude;

        payload.longitude =
          loc.longitude;

        payload.timezone =
          loc.timezone || null;

        payload.installation_zip =
          loc.zip;

        payload.installation_city =
          loc.city ?? null;

        payload.installation_county =
          loc.county ?? null;

        payload.installation_state =
          loc.state ?? null;

        payload.installation_state_code =
          loc.stateCode ?? null;

        payload.installation_county_fips =
          loc.countyFips ?? null;

        toast.success(
          `Location set to ${
            loc.city ? loc.city + ", " : ""
          }${loc.stateCode || loc.state || ""} (${loc.timezone}).`
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not resolve ZIP code.";

        toast.error(
          `Location not updated: ${message}. Schedule settings were still saved.`
        );
      } finally {
        setResolvingZip(false);
      }
    }

    await onUpdate(payload);
  };

  const hasLocation =
    form.latitude !== "" &&
    form.longitude !== "";

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-zinc-800">
          <Settings2 className="w-5 h-5" />
          Automatic Schedule
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {SWITCH_FIELDS.map(
          ({
            key,
            label,
            icon: Icon,
            help,
          }) => (
            <div
              key={key}
              className="flex items-start justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-zinc-600" />
                </div>

                <div>
                  <Label className="text-sm font-medium text-zinc-800">
                    {label}
                  </Label>

                  <p className="text-xs text-zinc-500 mt-0.5">
                    {help}
                  </p>
                </div>
              </div>

              <Switch
                checked={!!form[key]}
                onCheckedChange={(value) =>
                  toggle(key, value)
                }
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
          )
        )}

        <div className="pt-4 border-t border-zinc-100">
          <div className="flex items-center gap-2 mb-3">
            <Flag className="w-4 h-4 text-zinc-600" />

            <Label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Government Flag Alerts
            </Label>
          </div>

          <div className="space-y-5">
            {GOV_ALERT_FIELDS.map(
              ({
                key,
                label,
                icon: Icon,
                help,
              }) => (
                <div
                  key={key}
                  className="flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-zinc-600" />
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-zinc-800">
                        {label}
                      </Label>

                      <p className="text-xs text-zinc-500 mt-0.5">
                        {help}
                      </p>
                    </div>
                  </div>

                  <Switch
                    checked={!!form[key]}
                    onCheckedChange={(value) =>
                      toggle(key, value)
                    }
                    className="data-[state=checked]:bg-blue-600"
                  />
                </div>
              )
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-100">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-zinc-600" />

            <Label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Installation Location
            </Label>
          </div>

          <p className="text-xs text-zinc-500 mb-3">
            Set where the flagpole is physically installed.
            This controls sunrise/sunset times — it's separate
            from the State used for half-staff observances.
          </p>

          <div className="flex gap-2">
            <Input
              value={zip}
              onChange={(e) =>
                setZip(
                  e.target.value
                    .replace(/\D/g, "")
                    .slice(0, 5)
                )
              }
              placeholder="Installation ZIP Code"
              inputMode="numeric"
              maxLength={5}
              className="flex-1"
            />

            <Button
              type="button"
              onClick={() =>
                void handleZipResolve()
              }
              disabled={
                resolvingZip ||
                isUpdating
              }
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {resolvingZip ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}

              Look Up
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void handleUseMyLocation()
            }
            disabled={
              resolvingGeo ||
              isUpdating
            }
            className="w-full mt-2"
          >
            {resolvingGeo ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Crosshair className="w-4 h-4 mr-2" />
            )}

            Use My Current Location
          </Button>

          {hasLocation && (
            <div className="mt-3 flex items-start gap-2 text-xs text-zinc-600 bg-emerald-50/60 border border-emerald-100 rounded-lg p-2.5">
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" />

              <div className="space-y-0.5">
                <div>
                  <span className="font-medium text-zinc-700">
                    Saved location:
                  </span>{" "}
                  {form.latitude},{" "}
                  {form.longitude}
                  {form.timezone
                    ? ` • ${form.timezone}`
                    : ""}
                </div>

                {(flagData?.installation_zip ||
                  flagData?.installation_city ||
                  flagData?.installation_county ||
                  flagData?.installation_state) && (
                  <div className="text-zinc-500">
                    {flagData?.installation_zip
                      ? `ZIP ${flagData.installation_zip} • `
                      : ""}

                    {[
                      flagData?.installation_city,
                      flagData?.installation_county,
                      flagData?.installation_state,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-3">
            <button
              type="button"
              onClick={() =>
                setShowAdvanced(
                  (state) => !state
                )
              }
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
            >
              {showAdvanced ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}

              Advanced Location
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-zinc-500 mb-1 block">
                      Latitude
                    </Label>

                    <Input
                      type="number"
                      step="any"
                      value={form.latitude}
                      onChange={(e) =>
                        setField(
                          "latitude",
                          e.target.value
                        )
                      }
                      placeholder="e.g. 39.7392"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-zinc-500 mb-1 block">
                      Longitude
                    </Label>

                    <Input
                      type="number"
                      step="any"
                      value={form.longitude}
                      onChange={(e) =>
                        setField(
                          "longitude",
                          e.target.value
                        )
                      }
                      placeholder="e.g. -104.9903"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-zinc-500 mb-1 block">
                    Timezone
                  </Label>

                  <Input
                    value={form.timezone}
                    onChange={(e) =>
                      setField(
                        "timezone",
                        e.target.value
                      )
                    }
                    placeholder="e.g. America/Denver"
                  />
                </div>

                <p className="text-xs text-zinc-400">
                  Manual entries here override the resolved
                  location when you press Save.
                </p>
              </div>
            )}
          </div>
        </div>

        <Button
          onClick={() =>
            void handleSave()
          }
          disabled={
            isUpdating ||
            resolvingZip
          }
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Schedule Settings
        </Button>
      </CardContent>
    </Card>
  );
}