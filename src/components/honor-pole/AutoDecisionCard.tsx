import React, { useMemo } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flag,
  Landmark,
  MapPin,
  ShieldCheck,
} from "lucide-react";

import {
  computeAutoDecision,
  type AutoFlagSettings,
} from "@/lib/autoDecision";

import type {
  GovernmentDirective,
} from "@/lib/governmentDirectives";

interface AutoDecisionCardProps {
  flagData?: AutoFlagSettings | null;
  directives?: GovernmentDirective[] | null;
}

function formatDateTime(
  value: string | null | undefined,
  timezone?: string | null
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat(
      "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone:
          timezone ||
          undefined,
      }
    ).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function auditLabel(
  state:
    | string
    | null
    | undefined
): string {
  switch (state) {
    case "VERIFIED_HALF":
      return "Verified Half-Staff";

    case "VERIFIED_FULL":
      return "Verified Full Staff";

    case "NO_CURRENT_DIRECTIVE":
      return "No Current Directive";

    case "SOURCE_UNAVAILABLE":
      return "Source Unavailable";

    case "PENDING_VERIFICATION":
      return "Pending Verification";

    default:
      return state || "Not Audited";
  }
}

function auditBadgeClass(
  state:
    | string
    | null
    | undefined
): string {
  switch (state) {
    case "VERIFIED_HALF":
      return (
        "bg-amber-500 " +
        "text-white border-0"
      );

    case "VERIFIED_FULL":
    case "NO_CURRENT_DIRECTIVE":
      return (
        "bg-emerald-500 " +
        "text-white border-0"
      );

    case "SOURCE_UNAVAILABLE":
      return (
        "bg-red-500 " +
        "text-white border-0"
      );

    case "PENDING_VERIFICATION":
      return (
        "bg-blue-500 " +
        "text-white border-0"
      );

    default:
      return (
        "bg-zinc-200 " +
        "text-zinc-600 border-0"
      );
  }
}

function positionBadgeClass(
  position: string
): string {
  switch (position) {
    case "HALF":
      return (
        "bg-amber-500 " +
        "text-white border-0"
      );

    case "BOTTOM":
      return (
        "bg-zinc-600 " +
        "text-white border-0"
      );

    case "FULL":
    default:
      return (
        "bg-emerald-500 " +
        "text-white border-0"
      );
  }
}

export default function AutoDecisionCard({
  flagData,
  directives,
}: AutoDecisionCardProps) {
  const decision =
    useMemo(
      () =>
        computeAutoDecision({
          directives:
            directives || [],
          flagSettings:
            flagData || {},
          now: new Date(),
        }),
      [
        directives,
        flagData,
      ]
    );

  const timezone =
    flagData?.timezone ||
    null;

  const authority =
    decision.authority ||
    "SCHEDULE";

  const isGovernment =
    decision.source_type ===
      "government" ||
    authority === "FEDERAL" ||
    authority === "STATE" ||
    authority === "LOCAL";

  const isRecurring =
    decision.source_type ===
    "recurring_observance";

  const federalState =
    decision
      .federal_audit_state;

  const stateState =
    decision
      .state_audit_state;

  const localState =
    typeof flagData
      ?.local_audit_state ===
    "string"
      ? flagData.local_audit_state
      : null;

  const installationState =
    typeof flagData
      ?.installation_state ===
    "string"
      ? flagData.installation_state
      : null;

  const installationCounty =
    typeof flagData
      ?.installation_county ===
    "string"
      ? flagData.installation_county
      : null;

  const installationCity =
    typeof flagData
      ?.installation_city ===
    "string"
      ? flagData.installation_city
      : null;

  const stateSourceUnavailable =
    stateState ===
    "SOURCE_UNAVAILABLE";

  const coloradoInstall =
    String(
      flagData
        ?.installation_state_code ||
        ""
    ).toUpperCase() === "CO" ||
    String(
      installationState ||
        ""
    ).toLowerCase() ===
      "colorado";

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-zinc-800">
            <ShieldCheck className="w-5 h-5" />
            AUTO Decision
          </CardTitle>

          <Badge
            className={positionBadgeClass(
              decision.desired_position
            )}
          >
            {decision.desired_position}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-xl bg-zinc-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-1">
            Current Decision
          </p>

          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-zinc-500 shrink-0" />

            <p className="text-lg font-semibold text-zinc-800">
              {decision.desired_position ===
              "HALF"
                ? "Half Staff"
                : decision.desired_position ===
                  "BOTTOM"
                ? "Lowered"
                : "Full Staff"}
            </p>
          </div>

          <p className="text-sm text-zinc-600 mt-2">
            {decision.reason}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-zinc-100 p-3">
            <p className="text-xs uppercase tracking-wider text-zinc-400 mb-1">
              Authority
            </p>

            <div className="flex items-center gap-2">
              {isGovernment ? (
                <Landmark className="w-4 h-4 text-blue-600" />
              ) : isRecurring ? (
                <Flag className="w-4 h-4 text-blue-600" />
              ) : (
                <Clock className="w-4 h-4 text-blue-600" />
              )}

              <span className="text-sm font-semibold text-zinc-800">
                {authority}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-100 p-3">
            <p className="text-xs uppercase tracking-wider text-zinc-400 mb-1">
              Effective Until
            </p>

            <p className="text-sm font-semibold text-zinc-800">
              {decision.effective_until
                ? formatDateTime(
                    decision.effective_until,
                    timezone
                  )
                : "Until decision changes"}
            </p>
          </div>
        </div>

        {decision.source && (
          <div className="rounded-lg border border-zinc-100 p-3">
            <p className="text-xs uppercase tracking-wider text-zinc-400 mb-1">
              Source
            </p>

            <a
              href={decision.source}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-600 hover:underline break-all"
            >
              {decision.source}
            </a>
          </div>
        )}

        {decision.warning && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />

              <div>
                <p className="font-semibold text-amber-800">
                  Verification Warning
                </p>

                <p className="text-sm text-amber-700 mt-1">
                  {decision.warning}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-zinc-100">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-3">
            Government Audit Status
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-zinc-500" />

                <span className="text-sm text-zinc-700">
                  Federal
                </span>
              </div>

              <Badge
                className={auditBadgeClass(
                  federalState
                )}
              >
                {auditLabel(
                  federalState
                )}
              </Badge>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-zinc-500" />

                <span className="text-sm text-zinc-700">
                  State
                  {installationState
                    ? ` — ${installationState}`
                    : ""}
                </span>
              </div>

              <Badge
                className={auditBadgeClass(
                  stateState
                )}
              >
                {auditLabel(
                  stateState
                )}
              </Badge>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="w-4 h-4 text-zinc-500 shrink-0" />

                <span className="text-sm text-zinc-700 truncate">
                  Local
                  {installationCounty
                    ? ` — ${installationCounty}`
                    : installationCity
                    ? ` — ${installationCity}`
                    : ""}
                </span>
              </div>

              <Badge
                className={auditBadgeClass(
                  localState
                )}
              >
                {auditLabel(
                  localState
                )}
              </Badge>
            </div>
          </div>
        </div>

        {coloradoInstall &&
          stateSourceUnavailable && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />

                <div>
                  <p className="font-semibold text-red-800">
                    Colorado Source Unavailable
                  </p>

                  <p className="text-sm text-red-700 mt-1">
                    The Colorado state source could not be
                    verified during the latest audit. A source
                    failure does not itself command the pole to
                    FULL or HALF.
                  </p>
                </div>
              </div>
            </div>
          )}

        {decision.desired_position ===
          "HALF" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />

              <div>
                <p className="font-semibold text-emerald-800">
                  HALF Decision Active
                </p>

                <p className="text-sm text-emerald-700 mt-1">
                  AUTO currently has an applicable half-staff
                  reason. Higher-priority verified directives
                  take precedence over lower-priority
                  directives.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}