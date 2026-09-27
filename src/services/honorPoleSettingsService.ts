import cloudService from "./cloudService";

const SETTINGS_API =
  "https://honor-pole-copy-07acad67.base44.app/functions/honorPoleSettings";

export interface HonorPoleSettings {
  device_id: string;
  installation_zip: string;
  installation_city: string;
  installation_county: string;
  installation_state: string;
  installation_state_code: string;
  installation_county_fips: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  sun_schedule_enabled: boolean;
  raise_at_sunrise: boolean;
  lower_at_sunset: boolean;
  illuminated_at_night: boolean;
  auto_half_staff: boolean;
  enable_federal_alerts: boolean;
  enable_state_alerts: boolean;
  enable_local_alerts: boolean;
  auto_apply_verified_directives: boolean;
}

export type SettingsUpdate = Omit<HonorPoleSettings, "device_id">;

async function requestSettings(url: string, init: RequestInit = {}): Promise<HonorPoleSettings> {
  const token = cloudService.getAuthToken();
  if (!token) throw new Error("Sign in to update this HonorPole.");
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error :
      `Unable to load HonorPole settings (${response.status}).`);
  }
  return result as HonorPoleSettings;
}

export function getHonorPoleSettings(deviceId: string): Promise<HonorPoleSettings> {
  return requestSettings(`${SETTINGS_API}?device_id=${encodeURIComponent(deviceId)}`);
}

export function saveHonorPoleSettings(deviceId: string, settings: SettingsUpdate): Promise<HonorPoleSettings> {
  return requestSettings(SETTINGS_API, {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, settings }),
  });
}
