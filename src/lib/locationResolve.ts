// Client-side resolution of a physical flagpole installation location to the
// latitude / longitude / IANA-timezone / jurisdiction triple stored on
// FlagPosition.
//
// No API keys or secrets are required. Three public, CORS-enabled services are
// used so this runs entirely in the browser:
//
//   1. Zippopotam.us — US ZIP code -> latitude/longitude (+ city/state).
//   2. BigDataCloud — latitude/longitude -> city, county, state, state code,
//      county FIPS.
//   3. timeapi.io — latitude/longitude -> IANA timezone.
//
// "Use My Current Location" uses the browser Geolocation API for coordinates,
// BigDataCloud for the jurisdiction, and the browser's own IANA timezone.
//
// The State selected on the Observances page is intentionally NOT used here.
// The pole location is determined solely by ZIP code or device geolocation.

const ZIPPO_URL = (zip: string) =>
  `https://api.zippopotam.us/us/${zip}`;

const BDC_URL = (
  lat: number,
  lng: number
) =>
  `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;

const TIMEAPI_URL = (
  lat: number,
  lng: number
) =>
  `https://timeapi.io/api/Time/current/coordinate?latitude=${lat}&longitude=${lng}`;

export interface ZipResult {
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  stateCode: string | null;
}

export interface JurisdictionResult {
  city: string | null;
  county: string | null;
  state: string | null;
  stateCode: string | null;
  countyFips: string | null;
}

export interface ResolvedZipLocation
  extends JurisdictionResult {
  zip: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface ResolvedCurrentLocation
  extends JurisdictionResult {
  latitude: number;
  longitude: number;
  timezone: string | null;
}

interface AdministrativeEntry {
  adminLevel?: number;
  description?: string;
  name?: string;
}

interface BigDataCloudResponse {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  principalSubdivisionCode?: string;

  localityInfo?: {
    administrative?: AdministrativeEntry[];
  };

  fips?: {
    county?: string | number;
  };
}

export function isZipValid(
  zip: string | number
): boolean {
  return /^\d{5}$/.test(
    String(zip).trim()
  );
}

// ZIP -> latitude / longitude / city / state
export async function resolveZip(
  zip: string | number
): Promise<ZipResult> {
  const code =
    String(zip).trim();

  if (!isZipValid(code)) {
    throw new Error(
      "Enter a valid 5-digit US ZIP code."
    );
  }

  const res =
    await fetch(
      ZIPPO_URL(code)
    );

  if (res.status === 404) {
    throw new Error(
      "ZIP code not found. Please check and try again."
    );
  }

  if (!res.ok) {
    throw new Error(
      `Lookup failed (${res.status}).`
    );
  }

  const data =
    await res.json();

  const place =
    data?.places?.[0];

  if (!place) {
    throw new Error(
      "No location found for that ZIP code."
    );
  }

  return {
    latitude:
      Number(place.latitude),

    longitude:
      Number(place.longitude),

    city:
      place["place name"] ??
      null,

    state:
      place.state ??
      null,

    stateCode:
      place["state abbreviation"] ??
      null,
  };
}

// Coordinates -> jurisdiction
export async function resolveJurisdictionFromCoords(
  lat: number,
  lng: number
): Promise<JurisdictionResult> {
  const res =
    await fetch(
      BDC_URL(lat, lng)
    );

  if (!res.ok) {
    throw new Error(
      `Jurisdiction lookup failed (${res.status}).`
    );
  }

  const d =
    (await res.json()) as BigDataCloudResponse;

  const admin =
    d?.localityInfo?.administrative ??
    [];

  const countyEntry =
    admin.find(
      (a) =>
        a.adminLevel === 6
    ) ||
    admin.find((a) =>
      /county/i.test(
        a.description ||
          a.name ||
          ""
      )
    );

  return {
    city:
      d?.city ||
      d?.locality ||
      null,

    county:
      countyEntry?.name ||
      null,

    state:
      d?.principalSubdivision ||
      null,

    stateCode:
      (
        d?.principalSubdivisionCode ||
        ""
      ).replace(/^US-/, "") ||
      null,

    countyFips:
      d?.fips?.county != null
        ? String(
            d.fips.county
          ).padStart(3, "0")
        : null,
  };
}

// Coordinates -> IANA timezone
export async function resolveTimezoneFromCoords(
  lat: number,
  lng: number
): Promise<string> {
  const res =
    await fetch(
      TIMEAPI_URL(lat, lng)
    );

  if (!res.ok) {
    throw new Error(
      `Timezone lookup failed (${res.status}).`
    );
  }

  const data =
    await res.json();

  const tz =
    data?.timeZone;

  if (!tz) {
    throw new Error(
      "Could not determine the timezone for these coordinates."
    );
  }

  return String(tz);
}

// ZIP -> complete installation location
export async function resolveZipLocation(
  zip: string | number
): Promise<ResolvedZipLocation> {
  const geo =
    await resolveZip(zip);

  const [
    timezone,
    jur,
  ] = await Promise.all([
    resolveTimezoneFromCoords(
      geo.latitude,
      geo.longitude
    ),

    resolveJurisdictionFromCoords(
      geo.latitude,
      geo.longitude
    ),
  ]);

  return {
    zip:
      String(zip).trim(),

    latitude:
      geo.latitude,

    longitude:
      geo.longitude,

    timezone,

    city:
      jur.city ||
      geo.city ||
      null,

    county:
      jur.county,

    state:
      jur.state ||
      geo.state ||
      null,

    stateCode:
      jur.stateCode ||
      geo.stateCode ||
      null,

    countyFips:
      jur.countyFips,
  };
}

// Browser geolocation -> complete installation location
export function resolveCurrentLocation(): Promise<ResolvedCurrentLocation> {
  return new Promise(
    (resolve, reject) => {
      if (
        typeof navigator ===
          "undefined" ||
        !navigator.geolocation
      ) {
        reject(
          new Error(
            "Geolocation is not supported on this device."
          )
        );

        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const timezone =
            typeof Intl !==
            "undefined"
              ? Intl.DateTimeFormat()
                  .resolvedOptions()
                  .timeZone
              : null;

          let jur: JurisdictionResult =
            {
              city: null,
              county: null,
              state: null,
              stateCode: null,
              countyFips: null,
            };

          try {
            jur =
              await resolveJurisdictionFromCoords(
                pos.coords
                  .latitude,
                pos.coords
                  .longitude
              );
          } catch {
            // Jurisdiction lookup is best-effort.
            // Coordinates + timezone can still save.
          }

          resolve({
            latitude:
              pos.coords
                .latitude,

            longitude:
              pos.coords
                .longitude,

            timezone,

            city:
              jur.city,

            county:
              jur.county,

            state:
              jur.state,

            stateCode:
              jur.stateCode,

            countyFips:
              jur.countyFips,
          });
        },

        (err) => {
          reject(
            new Error(
              err?.message
                ? err.message
                : "Location permission denied or unavailable."
            )
          );
        },

        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    }
  );
}