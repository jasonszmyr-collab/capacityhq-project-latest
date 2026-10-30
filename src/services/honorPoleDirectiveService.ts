export interface DirectiveTierStatus
{
    active: boolean;
    title: string | null;
    position: string | null;
    verified: boolean;
    verification_status: string | null;
    source_url: string | null;
    start: string | null;
    end: string | null;
}

export interface EffectiveDirectiveStatus
{
    position: string | null;
    authority: string | null;
    title: string | null;
}

export interface HonorPoleDirectiveStatus
{
    device_id: string;

    federal: DirectiveTierStatus;
    state: DirectiveTierStatus;
    local?: DirectiveTierStatus;

    effective: EffectiveDirectiveStatus;

    auto_recommendation?: {
        warning?: string | null;
        local_warning?: string | null;
    };

    updated: string;

    meta?: {
        records_examined?: number;

        installation?: {
            state_code?: string;
            state?: string;
            county?: string;
            city?: string;
            timezone?: string;
        };

        alerts_enabled?: {
            federal?: boolean;
            state?: boolean;
            local?: boolean;
        };

        evaluated_at?: string;
    };
}

const DIRECTIVE_STATUS_API =
    "https://honor-pole-copy-07acad67.base44.app/functions/honorPoleDirectiveStatus";

//----------------------------------------------------------
// Read Current Government Directive Status
//----------------------------------------------------------

export async function getHonorPoleDirectiveStatus(
    deviceId: string
):
    Promise<HonorPoleDirectiveStatus>
{
    const response =
        await fetch(
            `${DIRECTIVE_STATUS_API}?device_id=${encodeURIComponent(deviceId)}`,
            {
                method: "GET",

                headers:
                {
                    Accept: "application/json"
                }
            }
        );

    if (!response.ok)
    {
        throw new Error(
            `Failed to read HonorPole directive status (${response.status})`
        );
    }

    return parseDirectiveStatus(await response.json(), deviceId);
}

function directiveObject(value: unknown): value is Record<string, unknown>
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableDirectiveText(value: unknown): boolean
{
    return value === null || typeof value === "string";
}

function validDirectiveTier(value: unknown): boolean
{
    if (!directiveObject(value)) return false;
    return typeof value.active === "boolean" &&
        typeof value.verified === "boolean" &&
        ["title", "position", "verification_status", "source_url", "start", "end"]
            .every(field => nullableDirectiveText(value[field]));
}

function parseDirectiveStatus(
    value: unknown,
    expectedDeviceId: string
): HonorPoleDirectiveStatus
{
    if (!directiveObject(value) ||
        (value.auto_recommendation !== undefined &&
            (!directiveObject(value.auto_recommendation) ||
                ["warning", "local_warning"].some(field =>
                    value.auto_recommendation &&
                    (value.auto_recommendation as Record<string, unknown>)[field] !== undefined &&
                    !nullableDirectiveText(
                        (value.auto_recommendation as Record<string, unknown>)[field]
                    )
                ))) ||
        value.success === false ||
        value.error !== undefined ||
        value.device_id !== expectedDeviceId ||
        !validDirectiveTier(value.federal) ||
        !validDirectiveTier(value.state) ||
        (value.local !== undefined && !validDirectiveTier(value.local)) ||
        !directiveObject(value.effective) ||
        !["position", "authority", "title"].every(
            field => nullableDirectiveText(value.effective &&
                (value.effective as Record<string, unknown>)[field])
        ) ||
        typeof value.updated !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value.updated) ||
        !Number.isFinite(Date.parse(value.updated)))
    {
        throw new Error("Directive status could not be validated for the selected HonorPole.");
    }
    // Shape and identity validation only. Evaluation time is not source freshness.
    return value as unknown as HonorPoleDirectiveStatus;
}
export function getDirectiveCoverageWarning(
    status: HonorPoleDirectiveStatus | null
): string | null
{
    if (!status) return null;
    if (!status.auto_recommendation)
        return "Directive-source coverage information is unavailable.";
    const warnings = [
        status.auto_recommendation.warning,
        status.auto_recommendation.local_warning
    ].filter((value): value is string =>
        typeof value === "string" && value.trim().length > 0
    ).map(value => value.trim());
    return warnings.length ? [...new Set(warnings)].join(" ") : null;
}