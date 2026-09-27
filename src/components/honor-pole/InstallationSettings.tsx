import { useEffect, useState } from "react";
import cloudService, { type DeviceInfo } from "../../services/cloudService";
import { resolveZipLocation, isZipValid } from "../../lib/locationResolve";
import {
  getHonorPoleSettings, saveHonorPoleSettings,
  type HonorPoleSettings, type SettingsUpdate,
} from "../../services/honorPoleSettingsService";

const CHECKBOXES: { key: keyof SettingsUpdate; title: string }[] = [
  { key: "sun_schedule_enabled", title: "Use sunrise and sunset schedule" },
  { key: "raise_at_sunrise", title: "Raise at sunrise" },
  { key: "lower_at_sunset", title: "Lower at sunset" },
  { key: "illuminated_at_night", title: "Pole is illuminated at night" },
  { key: "auto_half_staff", title: "Automatic half-staff" },
  { key: "enable_federal_alerts", title: "Federal alerts" },
  { key: "enable_state_alerts", title: "Alerts for this pole's state" },
  { key: "enable_local_alerts", title: "County and city alerts" },
  { key: "auto_apply_verified_directives", title: "Apply verified directives automatically" },
];

export default function InstallationSettings() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState(cloudService.getCurrentDeviceId() || "");
  const [settings, setSettings] = useState<HonorPoleSettings | null>(null);
  const [zip, setZip] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    cloudService.getDevices().then((list) => {
      if (!active) return;
      setDevices(list);
      setDeviceId((current) =>
        list.some((device) => device.deviceId === current)
          ? current : (list[0]?.deviceId ?? ""));
      if (!list.length) setLoading(false);
    }).catch((cause) => {
      if (!active) return;
      setLoading(false);
      setError(cause instanceof Error ? cause.message : "Unable to load your HonorPoles.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!deviceId || !devices.some((device) => device.deviceId === deviceId)) return;
    let active = true;
    setSettings(null);
    setZip("");
    setNotice("");
    setError("");
    setLoading(true);
    getHonorPoleSettings(deviceId).then((value) => {
      if (!active) return;
      setSettings(value);
      setZip(value.installation_zip);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to load pole settings.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [deviceId, devices]);

  const save = async () => {
    if (!settings || saving) return;
    if (!isZipValid(zip)) {
      setError("Enter the five-digit ZIP code where this pole is installed.");
      return;
    }
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const { device_id: currentDeviceId, ...editable } = settings;
      if (currentDeviceId !== deviceId) throw new Error("Pole selection changed. Reload settings.");
      let update: SettingsUpdate = editable;
      if (zip.trim() !== settings.installation_zip ||
          settings.latitude == null || settings.longitude == null ||
          !settings.timezone || !settings.installation_state_code) {
        const location = await resolveZipLocation(zip.trim());
        if (!location.stateCode || !location.timezone ||
            !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
          throw new Error("Could not resolve this pole's ZIP and time zone. Try again.");
        }
        update = {
          ...update,
          installation_zip: location.zip,
          installation_city: location.city || "",
          installation_county: location.county || "",
          installation_state: location.state || "",
          installation_state_code: location.stateCode.toUpperCase(),
          installation_county_fips: location.countyFips || "",
          latitude: location.latitude,
          longitude: location.longitude,
          timezone: location.timezone,
        };
      }
      const saved = await saveHonorPoleSettings(deviceId, update);
      setSettings(saved);
      setZip(saved.installation_zip);
      setNotice(`Saved installation and AUTO settings for ${deviceId}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save pole settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-blue-500/30 bg-white/5 p-5 mb-4">
      <h2 className="text-lg font-semibold mb-2">Installation and AUTO schedule</h2>
      <p className="text-sm text-white/70 mb-4">
        Enter the ZIP code at the physical pole. Each HonorPole saves its own
        state, time zone, sunrise and sunset settings.
      </p>
      <label htmlFor="installation-device" className="block text-sm mb-2">HonorPole</label>
      <select id="installation-device" value={deviceId} disabled={saving}
        onChange={(event) => {
          const chosen = devices.find((device) => device.deviceId === event.target.value);
          if (chosen) { cloudService.setDevice(chosen); setDeviceId(chosen.deviceId); }
        }}
        className="w-full rounded-lg bg-gray-900 border border-white/30 px-3 py-3 mb-4 text-white">
        {!deviceId && <option value="">Select HonorPole</option>}
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.deviceName || device.deviceId} ({device.deviceId})
          </option>
        ))}
      </select>
      {loading && <p className="text-sm text-white/70">Loading settings...</p>}
      {!loading && !devices.length && !error &&
        <p className="text-sm text-white/70">Pair an HonorPole to set its location.</p>}
      {settings && !loading && (
        <>
          <label htmlFor="installation-zip" className="block text-sm mb-2">Installation ZIP code</label>
          <input id="installation-zip" inputMode="numeric" maxLength={5}
            value={zip} disabled={saving} onChange={(event) => setZip(event.target.value)}
            placeholder="Five-digit ZIP" className="w-full rounded-lg bg-gray-900 border border-white/30 px-3 py-3 mb-2" />
          <p className="text-sm text-white/70 mb-4">
            {zip === settings.installation_zip && settings.installation_state_code
              ? `${settings.installation_city}, ${settings.installation_state_code} · ${settings.timezone}`
              : "Save to look up this ZIP and set this pole's state and time zone."}
          </p>
          <div className="space-y-3 mb-5">
            {CHECKBOXES.map(({ key, title }) => (
              <label key={key} className="flex items-center gap-3 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={settings[key] as boolean}
                  disabled={saving}
                  onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })} />
                <span>{title}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-white/60 mb-4">
            ZIP coordinates are approximate. Change the ZIP if this pole moves.
          </p>
          <button type="button" disabled={saving} onClick={() => { void save(); }}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold disabled:opacity-50">
            {saving ? "Saving..." : `Save settings for ${deviceId}`}
          </button>
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-400 mt-3">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-300 mt-3">{notice}</p>}
    </section>
  );
}
