// Frontend deterministic recurring U.S. flag observances — same normalized
// directive structure as government-discovered directives, but computed
// locally from the installation's saved lat/long/timezone so they never
// depend on website availability OR on the audit having run.
//
//   Memorial Day            — HALF sunrise→noon, then FULL noon→sunset
//   Patriot Day (9/11)      — HALF sunrise→sunset
//   Pearl Harbor Day (12/7) — HALF sunrise→sunset
//
// Source attribution: official U.S. Code citations (Cornell Law).

import { getSunriseSunset } from "./sunTimes";

interface LocalYMD {
  year: number;
  month: number;
  day: number;
}

interface RecurringWindow {
  position: "HALF" | "FULL";
  start: Date;
  end: Date;
  note: string;
}

interface RecurringDefinition {
  key: string;
  name: string;
  reason: string;
  sourceUrl: string;
  match: (ymd: LocalYMD) => boolean;
  windows: (
    sun: Date,
    noon: Date,
    sunset: Date
  ) => RecurringWindow[];
}

export interface RecurringDirective {
  title: string;
  reason: string;
  position: "HALF" | "FULL";
  start_datetime: string;
  end_datetime: string;
  jurisdiction_type: "FEDERAL";
  jurisdiction_name: string;
  state: string;
  source_url: string;
  source_type: "recurring_observance";
  official_source: boolean;
  verified: boolean;
  verification_status: "verified";
  orders_flag_position: boolean;
  ordering_phrase: string;
  effective_phrase: string;
  ambiguous: boolean;
  _recurring: boolean;
  _note: string;
}

function localYMD(
  date: Date,
  timezone?: string | null
): LocalYMD {
  const dtf =
    new Intl.DateTimeFormat("en-US", {
      timeZone:
        timezone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  const parts: Record<
    string,
    string
  > = {};

  for (
    const p of
    dtf.formatToParts(date)
  ) {
    parts[p.type] = p.value;
  }

  return {
    year: Number(parts.year),
    month:
      Number(parts.month) - 1,
    day: Number(parts.day),
  };
}

function tzOffsetMinutes(
  date: Date,
  timezone?: string | null
): number {
  if (!timezone) {
    return -date.getTimezoneOffset();
  }

  const dtf =
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

  const parts: Record<
    string,
    string
  > = {};

  for (
    const p of
    dtf.formatToParts(date)
  ) {
    parts[p.type] = p.value;
  }

  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );

  return Math.round(
    (asUTC - date.getTime()) /
      60000
  );
}

function lastMondayOfMonth(
  year: number,
  month: number
): number {
  const lastDay =
    new Date(
      year,
      month + 1,
      0
    ).getDate();

  const dow =
    new Date(
      year,
      month + 1,
      0
    ).getDay();

  const back =
    (dow - 1 + 7) % 7;

  return lastDay - back;
}

const RECURRING: RecurringDefinition[] =
  [
    {
      key: "memorial_day",

      name: "Memorial Day",

      reason:
        "In memory of those who died while serving in the United States military.",

      sourceUrl:
        "https://www.law.cornell.edu/uscode/text/36/116",

      match: (ymd) =>
        ymd.month === 4 &&
        ymd.day ===
          lastMondayOfMonth(
            ymd.year,
            4
          ),

      windows: (
        sun,
        noon,
        sunset
      ) => [
        {
          position: "HALF",
          start: sun,
          end: noon,
          note:
            "Half-staff from sunrise until noon",
        },
        {
          position: "FULL",
          start: noon,
          end: sunset,
          note:
            "Raised briskly to full staff at noon",
        },
      ],
    },

    {
      key: "patriot_day",

      name:
        "Patriot Day (September 11)",

      reason:
        "In memory of the lives lost in the September 11, 2001 attacks.",

      sourceUrl:
        "https://www.law.cornell.edu/uscode/text/36/144",

      match: (ymd) =>
        ymd.month === 8 &&
        ymd.day === 11,

      windows: (
        sun,
        _noon,
        sunset
      ) => [
        {
          position: "HALF",
          start: sun,
          end: sunset,
          note:
            "Half-staff from sunrise to sunset",
        },
      ],
    },

    {
      key: "pearl_harbor",

      name:
        "Pearl Harbor Remembrance Day (December 7)",

      reason:
        "In memory of those who died in the attack on Pearl Harbor, December 7, 1941.",

      sourceUrl:
        "https://www.law.cornell.edu/uscode/text/36/129",

      match: (ymd) =>
        ymd.month === 11 &&
        ymd.day === 7,

      windows: (
        sun,
        _noon,
        sunset
      ) => [
        {
          position: "HALF",
          start: sun,
          end: sunset,
          note:
            "Half-staff from sunrise to sunset",
        },
      ],
    },
  ];

// Sunrise / sunset / local-noon (UTC instants) for the installation-local
// calendar day that contains `now`.
export function getTodaySunTimes(
  lat: number | string | null | undefined,
  lng: number | string | null | undefined,
  timezone?: string | null,
  now: Date = new Date()
): {
  sunrise: Date | null;
  sunset: Date | null;
  noon: Date | null;
} {
  if (
    lat == null ||
    lng == null
  ) {
    return {
      sunrise: null,
      sunset: null,
      noon: null,
    };
  }

  const latitude = Number(lat);
  const longitude = Number(lng);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return {
      sunrise: null,
      sunset: null,
      noon: null,
    };
  }

  const ymd =
    localYMD(
      now,
      timezone
    );

  const localToday =
    new Date(
      ymd.year,
      ymd.month,
      ymd.day
    );

  const sun =
    getSunriseSunset(
      latitude,
      longitude,
      localToday
    );

  if (
    !sun.sunrise ||
    !sun.sunset
  ) {
    return {
      sunrise: null,
      sunset: null,
      noon: null,
    };
  }

  const offset =
    tzOffsetMinutes(
      now,
      timezone
    );

  const noonUtc =
    Date.UTC(
      ymd.year,
      ymd.month,
      ymd.day,
      12,
      0,
      0
    ) -
    offset * 60000;

  return {
    sunrise: sun.sunrise,
    sunset: sun.sunset,
    noon: new Date(noonUtc),
  };
}

// Normalized recurring directives active on the installation-local day that
// contains `now`. Empty if today is not a recurring observance.
export function getRecurringObservations(
  now: Date,
  lat: number | string | null | undefined,
  lng: number | string | null | undefined,
  timezone?: string | null
): RecurringDirective[] {
  if (
    lat == null ||
    lng == null
  ) {
    return [];
  }

  const ymd =
    localYMD(
      now,
      timezone
    );

  const {
    sunrise: sun,
    noon,
    sunset,
  } = getTodaySunTimes(
    lat,
    lng,
    timezone,
    now
  );

  if (
    !sun ||
    !sunset ||
    !noon
  ) {
    return [];
  }

  const directives:
    RecurringDirective[] = [];

  for (const r of RECURRING) {
    if (!r.match(ymd)) {
      continue;
    }

    for (
      const w of
      r.windows(
        sun,
        noon,
        sunset
      )
    ) {
      directives.push({
        title: r.name,
        reason: r.reason,

        position:
          w.position,

        start_datetime:
          w.start.toISOString(),

        end_datetime:
          w.end.toISOString(),

        jurisdiction_type:
          "FEDERAL",

        jurisdiction_name: "",
        state: "",

        source_url:
          r.sourceUrl,

        source_type:
          "recurring_observance",

        official_source: true,
        verified: true,

        verification_status:
          "verified",

        orders_flag_position:
          true,

        ordering_phrase:
          w.note,

        effective_phrase:
          `${w.start.toISOString()} to ${w.end.toISOString()}`,

        ambiguous: false,

        _recurring: true,
        _note: w.note,
      });
    }
  }

  return directives;
}