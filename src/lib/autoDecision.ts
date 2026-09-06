// AUTO decision engine for the Honor Pole.
//
// Computes the desired flag position from:
//   - verified, applicable GovernmentDirective records
//   - deterministic recurring federal observances
//   - sunrise/sunset schedule settings
//
// Priority:
//   1. Active verified FEDERAL HALF directive -> HALF
//   2. Active verified STATE HALF directive   -> HALF
//   3. Active verified LOCAL HALF directive   -> HALF
//   4. Active recurring federal observance    -> HALF
//   5. Otherwise                              -> FULL
//
// Sunset scheduling:
//   - enabled + nighttime + lower_at_sunset + not illuminated -> BOTTOM
//   - illuminated_at_night -> do not lower merely because of sunset
//   - schedule disabled -> directives may change FULL/HALF, never BOTTOM

import {
  getRecurringObservations,
  getTodaySunTimes,
  type RecurringDirective,
} from "./recurringObservances";

import {
  isDirectiveApplicable,
  type GovernmentDirective,
} from "./governmentDirectives";

export const AUTO_AUTHORITY = {
  FEDERAL: "FEDERAL",
  STATE: "STATE",
  LOCAL: "LOCAL",
  SCHEDULE: "SCHEDULE",
} as const;

export type AutoAuthority =
  (typeof AUTO_AUTHORITY)[keyof typeof AUTO_AUTHORITY];

export type DesiredPosition =
  | "FULL"
  | "HALF"
  | "BOTTOM";

export interface AutoFlagSettings {
  latitude?: number | string | null;
  longitude?: number | string | null;
  timezone?: string | null;

  sun_schedule_enabled?: boolean | null;
  lower_at_sunset?: boolean | null;
  illuminated_at_night?: boolean | null;

  auto_half_staff?: boolean | null;
  auto_apply_verified_directives?: boolean | null;

  enable_federal_alerts?: boolean | null;
  enable_state_alerts?: boolean | null;
  enable_local_alerts?: boolean | null;

  federal_audit_state?: string | null;
  state_audit_state?: string | null;

  installation_state_code?: string | null;
  installation_state?: string | null;
  installation_county?: string | null;
  installation_city?: string | null;

  [key: string]: unknown;
}

export interface AutoDecision {
  desired_position: DesiredPosition;
  reason: string;
  authority: AutoAuthority | string;
  effective_until: string | null;
  source: string | null;
  source_type: string;

  federal_audit_state: string | null;
  state_audit_state: string | null;
  warning: string | null;
}

interface DecisionInput {
  directives?: GovernmentDirective[] | null;
  flagSettings?: AutoFlagSettings | null;
  now?: Date;
}

type Candidate =
  | (GovernmentDirective & {
      _priority: number;
      _kind: "government";
    })
  | (RecurringDirective & {
      _priority: number;
      _kind: "recurring";
    });

function isActive(
  d: {
    start_datetime?: string | null;
    end_datetime?: string | null;
  },
  nowMs: number
): boolean {
  const s = d.start_datetime
    ? new Date(d.start_datetime).getTime()
    : NaN;

  const e = d.end_datetime
    ? new Date(d.end_datetime).getTime()
    : NaN;

  return (
    Number.isFinite(s) &&
    Number.isFinite(e) &&
    nowMs >= s &&
    nowMs <= e
  );
}

// Lower number = higher priority.
function priorityOf(
  jurisdictionType:
    | string
    | null
    | undefined,
  isRecurring: boolean
): number {
  if (isRecurring) {
    return 4;
  }

  if (
    jurisdictionType ===
    "FEDERAL"
  ) {
    return 1;
  }

  if (
    jurisdictionType ===
    "STATE"
  ) {
    return 2;
  }

  if (
    jurisdictionType ===
      "COUNTY" ||
    jurisdictionType ===
      "CITY"
  ) {
    return 3;
  }

  return 5;
}

function tierEnabled(
  jt: string | null | undefined,
  flagSettings:
    | AutoFlagSettings
    | null
    | undefined
): boolean {
  if (jt === "FEDERAL") {
    return (
      flagSettings
        ?.enable_federal_alerts ??
      true
    );
  }

  if (jt === "STATE") {
    return (
      flagSettings
        ?.enable_state_alerts ??
      true
    );
  }

  return (
    flagSettings
      ?.enable_local_alerts ??
    false
  );
}

export function computeAutoDecision({
  directives,
  flagSettings,
  now = new Date(),
}: DecisionInput): AutoDecision {
  const nowMs =
    now.getTime();

  const lat =
    flagSettings?.latitude;

  const lng =
    flagSettings?.longitude;

  const tz =
    flagSettings?.timezone ||
    null;

  const sunEnabled =
    !!flagSettings
      ?.sun_schedule_enabled;

  const lowerAtSunset =
    flagSettings
      ?.lower_at_sunset ??
    true;

  const illuminated =
    !!flagSettings
      ?.illuminated_at_night;

  const autoHalfStaff =
    flagSettings
      ?.auto_half_staff ??
    true;

  const autoApplyVerified =
    flagSettings
      ?.auto_apply_verified_directives ??
    false;

  const federalAudit =
    flagSettings
      ?.federal_audit_state ||
    null;

  const stateAudit =
    flagSettings
      ?.state_audit_state ||
    null;

  const {
    sunrise,
    sunset,
  } = getTodaySunTimes(
    lat,
    lng,
    tz,
    now
  );

  const isDaytime =
    sunrise && sunset
      ? now >= sunrise &&
        now < sunset
      : true;

  const nighttime =
    sunrise && sunset
      ? !isDaytime
      : false;

  // Source failure never causes movement.
  // Existing verified directives remain active until
  // their stored end_datetime.
  let warning:
    | string
    | null = null;

  if (
    stateAudit ===
    "SOURCE_UNAVAILABLE"
  ) {
    const hasActiveStateDirective =
      (directives || []).some(
        (d) =>
          d.jurisdiction_type ===
            "STATE" &&
          d.verified === true &&
          d.position ===
            "HALF" &&
          isActive(
            d,
            nowMs
          ) &&
          isDirectiveApplicable(
            d,
            flagSettings
          )
      );

    warning =
      hasActiveStateDirective
        ? "Colorado source currently unavailable — last verified directive retained"
        : "Colorado source currently unavailable — last verified state retained";
  }

  const base = {
    federal_audit_state:
      federalAudit,

    state_audit_state:
      stateAudit,

    warning,
  };

  // BOTTOM is allowed only through the solar schedule.
  const wantBottom =
    sunEnabled &&
    nighttime &&
    lowerAtSunset &&
    !illuminated;

  if (wantBottom) {
    return {
      ...base,

      desired_position:
        "BOTTOM",

      reason:
        "Sunset schedule",

      authority:
        AUTO_AUTHORITY.SCHEDULE,

      effective_until:
        sunrise
          ? sunrise.toISOString()
          : null,

      source: null,

      source_type:
        "schedule",
    };
  }

  const candidates:
    Candidate[] = [];

  // Government-discovered directives require BOTH:
  // automatic half-staff enabled and automatic application
  // of verified directives enabled.
  if (
    autoHalfStaff &&
    autoApplyVerified
  ) {
    for (
      const d of
      directives || []
    ) {
      if (
        d.source_type ===
        "recurring_observance"
      ) {
        continue;
      }

      if (
        d.position !==
        "HALF"
      ) {
        continue;
      }

      if (
        d.verified !== true
      ) {
        continue;
      }

      if (
        !isActive(
          d,
          nowMs
        )
      ) {
        continue;
      }

      if (
        !tierEnabled(
          d.jurisdiction_type,
          flagSettings
        )
      ) {
        continue;
      }

      if (
        !isDirectiveApplicable(
          d,
          flagSettings
        )
      ) {
        continue;
      }

      candidates.push({
        ...d,

        _priority:
          priorityOf(
            d.jurisdiction_type,
            false
          ),

        _kind:
          "government",
      });
    }
  }

  // Deterministic recurring federal observances are
  // computed locally.
  if (
    autoHalfStaff &&
    (
      flagSettings
        ?.enable_federal_alerts ??
      true
    )
  ) {
    const recurring =
      getRecurringObservations(
        now,
        lat,
        lng,
        tz
      );

    for (
      const r of
      recurring
    ) {
      if (
        r.position !==
        "HALF"
      ) {
        continue;
      }

      if (
        !isActive(
          r,
          nowMs
        )
      ) {
        continue;
      }

      candidates.push({
        ...r,

        _priority:
          priorityOf(
            r.jurisdiction_type,
            true
          ),

        _kind:
          "recurring",
      });
    }
  }

  if (
    candidates.length > 0
  ) {
    candidates.sort(
      (a, b) =>
        a._priority -
        b._priority
    );

    const gov =
      candidates[0];

    // Preserve Base44 behavior:
    // HALF remains effective until the latest end time
    // among all overlapping applicable candidates.
    const latestEnd =
      candidates.reduce<
        string | null
      >(
        (max, c) => {
          const e =
            c.end_datetime;

          if (!e) {
            return max;
          }

          return (
            !max ||
            e > max
              ? e
              : max
          );
        },
        null
      );

    const reason =
      gov._kind ===
      "recurring"
        ? gov.title
        : gov.reason ||
          gov.title ||
          "Active half-staff directive";

    let authority:
      | AutoAuthority
      | string;

    if (
      gov.jurisdiction_type ===
        "COUNTY" ||
      gov.jurisdiction_type ===
        "CITY"
    ) {
      authority =
        AUTO_AUTHORITY.LOCAL;
    } else if (
      gov.jurisdiction_type ===
      "FEDERAL"
    ) {
      authority =
        AUTO_AUTHORITY.FEDERAL;
    } else if (
      gov.jurisdiction_type ===
      "STATE"
    ) {
      authority =
        AUTO_AUTHORITY.STATE;
    } else {
      authority =
        String(
          gov.jurisdiction_type ||
            AUTO_AUTHORITY.SCHEDULE
        );
    }

    return {
      ...base,

      desired_position:
        "HALF",

      reason,

      authority,

      effective_until:
        latestEnd,

      source:
        gov.source_url ||
        null,

      source_type:
        gov.source_type ||
        (
          gov._kind ===
          "recurring"
            ? "recurring_observance"
            : "government"
        ),
    };
  }

  return {
    ...base,

    desired_position:
      "FULL",

    reason:
      "No active half-staff directive",

    authority:
      AUTO_AUTHORITY.SCHEDULE,

    effective_until:
      null,

    source: null,

    source_type:
      "schedule",
  };
}