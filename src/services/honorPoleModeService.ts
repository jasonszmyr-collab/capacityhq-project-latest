export type HonorPoleOverrideMode =
    | "AUTO"
    | "FULL"
    | "HALF"
    | "DOWN";

export interface HonorPoleModeState
{
    device_id: string;
    override_mode: HonorPoleOverrideMode;
    testmode: boolean;
}

const MODE_API =
    "https://honor-pole-copy-07acad67.base44.app/functions/honorPoleOverrideMode";

//----------------------------------------------------------
// Read Persistent Operating Mode
//----------------------------------------------------------

export async function getHonorPoleMode(
    device_id: string
): Promise<HonorPoleModeState>
{
    const url =
        `${MODE_API}?device_id=${encodeURIComponent(device_id)}`;

    const response = await fetch(
        url,
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
            `Failed to read HonorPole mode (${response.status})`
        );
    }

    return response.json();
}

//----------------------------------------------------------
// Set Persistent Operating Mode
//----------------------------------------------------------

export async function setHonorPoleMode(
    device_id: string,
    override_mode: HonorPoleOverrideMode
): Promise<HonorPoleModeState>
{
    const response = await fetch(
        MODE_API,
        {
            method: "POST",

            headers:
            {
                "Content-Type": "application/json",
                Accept: "application/json"
            },

            body: JSON.stringify({
                device_id,
                override_mode
            })
        }
    );

    if (!response.ok)
    {
        throw new Error(
            `Failed to set HonorPole mode (${response.status})`
        );
    }

    return response.json();
}
