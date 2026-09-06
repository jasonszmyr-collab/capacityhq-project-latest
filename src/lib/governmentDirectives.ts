// Matching logic for externally-discovered government half-staff directives.
//
// A directive applies to a device based on its jurisdiction_type and the
// device's installation location (stored on FlagPosition as installation_*):
//
//   FEDERAL -> applies to all devices
//   STATE   -> directive.state matches the installation state
//   COUNTY  -> directive.state matches AND jurisdiction_name matches installation_county
//   CITY    -> directive.state matches AND jurisdiction_name matches installation_city
//
// Only directives that are verified AND applicable may feed the existing
// half-staff scheduling logic. Alert settings (enable_*_alerts) gate which
// jurisdiction tiers the device opts into.

export type JurisdictionType =
  | "FEDERAL"
  | "STATE"
  | "COUNTY"
  | "CITY";

export interface GovernmentDirective {
  jurisdiction_type?: JurisdictionType | string | null;
  jurisdiction_name?: string | null;
  state?: string | null;

  verified?: boolean | null;

  start_datetime?: string | null;
  end_datetime?: string | null;

  position?: string | null;
  title?: string | null;
  reason?: string | null;

  source_url?: string | null;
  source_type?: string | null;

  [key: string]: unknown;
}

export interface InstallationLocation {
  installation_state_code?: string | null;
  installation_state?: string | null;
  installation_county?: string | null;
  installation_city?: string | null;

  [key: string]: unknown;
}

export interface AlertSettings {
  enable_federal_alerts?: boolean | null;
  enable_state_alerts?: boolean | null;
  enable_local_alerts?: boolean | null;

  [key: string]: unknown;
}

function norm(
  s: unknown
): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

export function isDirectiveApplicable(
  directive:
    | GovernmentDirective
    | null
    | undefined,

  installation:
    | InstallationLocation
    | null
    | undefined
): boolean {
  if (
    !directive ||
    !installation
  ) {
    return false;
  }

  const jt =
    directive.jurisdiction_type;

  if (jt === "FEDERAL") {
    return true;
  }

  const instStateCode =
    installation.installation_state_code;

  const instStateName =
    installation.installation_state;

  const stateMatches =
    !!directive.state &&
    (
      norm(directive.state) ===
        norm(instStateCode) ||
      norm(directive.state) ===
        norm(instStateName)
    );

  if (jt === "STATE") {
    return stateMatches;
  }

  if (jt === "COUNTY") {
    return (
      stateMatches &&
      norm(
        directive.jurisdiction_name
      ) ===
        norm(
          installation.installation_county
        )
    );
  }

  if (jt === "CITY") {
    return (
      stateMatches &&
      norm(
        directive.jurisdiction_name
      ) ===
        norm(
          installation.installation_city
        )
    );
  }

  return false;
}

// Returns directives that are applicable to the installation AND enabled by
// the device's alert settings. Defaults match the entity defaults when unset.
export function getApplicableDirectives(
  directives:
    | GovernmentDirective[]
    | null
    | undefined,

  installation:
    | InstallationLocation
    | null
    | undefined,

  alertSettings:
    | AlertSettings
    | null
    | undefined
): GovernmentDirective[] {
  if (!Array.isArray(directives)) {
    return [];
  }

  const fed =
    alertSettings
      ?.enable_federal_alerts ??
    true;

  const st =
    alertSettings
      ?.enable_state_alerts ??
    true;

  const loc =
    alertSettings
      ?.enable_local_alerts ??
    false;

  return directives.filter(
    (d) => {
      const jt =
        d.jurisdiction_type;

      if (jt === "FEDERAL") {
        return (
          fed &&
          isDirectiveApplicable(
            d,
            installation
          )
        );
      }

      if (jt === "STATE") {
        return (
          st &&
          isDirectiveApplicable(
            d,
            installation
          )
        );
      }

      if (
        jt === "COUNTY" ||
        jt === "CITY"
      ) {
        return (
          loc &&
          isDirectiveApplicable(
            d,
            installation
          )
        );
      }

      return false;
    }
  );
}

// Verified + applicable directives — the only ones permitted to feed the
// existing half-staff scheduling logic.
export function getEnforceableDirectives(
  directives:
    | GovernmentDirective[]
    | null
    | undefined,

  installation:
    | InstallationLocation
    | null
    | undefined,

  alertSettings:
    | AlertSettings
    | null
    | undefined
): GovernmentDirective[] {
  return getApplicableDirectives(
    directives,
    installation,
    alertSettings
  ).filter(
    (d) => d.verified === true
  );
}

export type DirectiveStatus =
  | "active"
  | "upcoming"
  | "ended"
  | "unknown";

export function getDirectiveStatus(
  d: GovernmentDirective,
  now: Date = new Date()
): DirectiveStatus {
  const start =
    d.start_datetime
      ? new Date(
          d.start_datetime
        )
      : null;

  const end =
    d.end_datetime
      ? new Date(
          d.end_datetime
        )
      : null;

  if (
    start &&
    end &&
    now >= start &&
    now <= end
  ) {
    return "active";
  }

  if (
    start &&
    now < start
  ) {
    return "upcoming";
  }

  if (
    end &&
    now > end
  ) {
    return "ended";
  }

  return "unknown";
}