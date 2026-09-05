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

export async function getHonorPoleDirectiveStatus():
    Promise<HonorPoleDirectiveStatus>
{
    const response =
        await fetch(
            DIRECTIVE_STATUS_API,
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

    return response.json();
}
