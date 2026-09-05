
//=============================================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// capacityService.ts
//
// PART 1 OF 3
//
// Location:
// src/services/capacityService.ts
//
// Description:
// Capacity AI Service for Natural Language Device Control.
//
// Provides communication with the Capacity AI API and converts
// natural language requests into HonorPole device commands.
//
//=============================================================================

/**
 * ============================================================================
 * Capacity AI Response
 * ============================================================================
 */

export interface CapacityResponse {

    answer?: string;

    intent?: string;

    confidence?: number;

    metadata?: Record<string, unknown>;

    error?: string;

}

/**
 * ============================================================================
 * Device Metadata
 * ============================================================================
 */

export interface CapacityCommandMetadata {

    device_id?: string;

    device_name?: string;

    current_position?: string;

    online?: boolean;

    firmware_version?: string;

    hardware_revision?: string;

    battery_level?: number;

    signal_strength?: number;

    [key: string]: unknown;

}

/**
 * ============================================================================
 * Parsed Device Commands
 * ============================================================================
 */

export type CapacityIntent =

    | "full"

    | "half"

    | "down"

    | "stop"

    | "auto"

    | null;

/**
 * ============================================================================
 * Capacity Service
 * ============================================================================
 */

class CapacityService {

    //---------------------------------------------------------------------
    // Constants
    //---------------------------------------------------------------------

    private static readonly DEFAULT_TIMEOUT = 10000;

    private static readonly MAX_RETRIES = 2;

    //---------------------------------------------------------------------
    // Private Members
    //---------------------------------------------------------------------

    private readonly apiEndpoint =
        "https://api.capacity.com/api/v3/ai/query";

    private readonly apiKey: string | null;

    private readonly timeout: number;

    //---------------------------------------------------------------------
    // Constructor
    //---------------------------------------------------------------------

    public constructor() {

        this.apiKey =
            import.meta.env.VITE_CAPACITY_API_KEY ?? null;

        this.timeout =
            Number(import.meta.env.VITE_CAPACITY_TIMEOUT)
            || CapacityService.DEFAULT_TIMEOUT;

    }

    //---------------------------------------------------------------------
    // Configuration
    //---------------------------------------------------------------------

    /**
     * Returns true if the Capacity API
     * has been configured.
     */
    public isConfigured(): boolean {

        return (

            this.apiKey !== null

            &&

            this.apiKey.trim().length > 0

        );

    }

    /**
     * Returns the configured endpoint.
     */
    public getEndpoint(): string {

        return this.apiEndpoint;

    }

    /**
     * Returns the configured timeout.
     */
    public getTimeout(): number {

        return this.timeout;

    }

    //---------------------------------------------------------------------
    // Validation
    //---------------------------------------------------------------------

    /**
     * Validates a natural language command.
     */
    private validateCommand(
        command: string
    ): void {

        if (!this.isConfigured()) {

            throw new Error(
                "Capacity API key is not configured."
            );

        }

        if (!command) {

            throw new Error(
                "Command cannot be empty."
            );

        }

        if (!command.trim().length) {

            throw new Error(
                "Command cannot be blank."
            );

        }

    }

    /**
     * Validates an API response.
     */
    private validateResponse(
        response: CapacityResponse
    ): void {

        if (!response) {

            throw new Error(
                "Capacity API returned an empty response."
            );

        }

    }

    //---------------------------------------------------------------------
    // Helper Methods
    //---------------------------------------------------------------------

    /**
     * Creates the Authorization header.
     */
    private createHeaders(): HeadersInit {

        return {

            Authorization: `Bearer ${this.apiKey}`,

            "Content-Type": "application/json",

            Accept: "application/json"

        };

    }

    /**
     * Creates the request body.
     */
    private createRequestBody(

        command: string,

        metadata: CapacityCommandMetadata

    ): string {

        return JSON.stringify({

            query: command.trim(),

            metadata,

            userId:

                metadata.device_id

                ??

                metadata.device_name

                ??

                "HonorPole"

        });

    }

    /**
     * Simple async delay helper used
     * during retry operations.
     */
    private delay(
        milliseconds: number
    ): Promise<void> {

        return new Promise(

            resolve =>

                setTimeout(resolve, milliseconds)

        );

    }

//=============================================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// capacityService.ts
//
// PART 2 OF 3
//
// Location:
// src/services/capacityService.ts
//
//=============================================================================

    //---------------------------------------------------------------------
    // Capacity API Communication
    //---------------------------------------------------------------------

    /**
     * Sends a natural language command
     * to the Capacity AI service.
     */
    public async sendCommand(

        command: string,

        metadata: CapacityCommandMetadata = {}

    ): Promise<CapacityResponse> {

        this.validateCommand(command);

        let lastError: Error | null = null;

        for (

            let attempt = 1;

            attempt <= CapacityService.MAX_RETRIES;

            attempt++

        ) {

            const controller = new AbortController();

            const timeoutId = window.setTimeout(

                () => controller.abort(),

                this.timeout

            );

            try {

                const response = await fetch(

                    this.apiEndpoint,

                    {

                        method: "POST",

                        headers: this.createHeaders(),

                        body: this.createRequestBody(

                            command,

                            metadata

                        ),

                        signal: controller.signal

                    }

                );

                clearTimeout(timeoutId);

                //---------------------------------------------------------
                // HTTP Errors
                //---------------------------------------------------------

                if (!response.ok) {

                    const message =
                        await response.text();

                    throw new Error(

                        `Capacity API ${response.status}: ${message}`

                    );

                }

                //---------------------------------------------------------
                // Validate Content-Type
                //---------------------------------------------------------

                const contentType =

                    response.headers.get(

                        "content-type"

                    ) ?? "";

                if (

                    !contentType

                        .toLowerCase()

                        .includes("application/json")

                ) {

                    throw new Error(

                        "Capacity API returned an invalid response."

                    );

                }

                //---------------------------------------------------------
                // Parse JSON
                //---------------------------------------------------------

                const result = (await response.json()) as CapacityResponse;

                this.validateResponse(result);

                return result;

            }

            catch (error) {

                clearTimeout(timeoutId);

                if (

                    error instanceof DOMException

                    &&

                    error.name === "AbortError"

                ) {

                    lastError = new Error(

                        "Capacity AI request timed out."

                    );

                }

                else if (

                    error instanceof Error

                ) {

                    lastError = error;

                }

                else {

                    lastError = new Error(

                        "Unknown Capacity API error."

                    );

                }

                //---------------------------------------------------------
                // Retry
                //---------------------------------------------------------

                if (

                    attempt <

                    CapacityService.MAX_RETRIES

                ) {

                    await this.delay(

                        500 * attempt

                    );

                    continue;

                }

            }

        }

        throw (

            lastError

            ??

            new Error(

                "Capacity API request failed."

            )

        );

    }

    //---------------------------------------------------------------------
    // Connectivity
    //---------------------------------------------------------------------

    /**
     * Tests connectivity with
     * the Capacity AI service.
     */
    public async isAvailable(): Promise<boolean> {

        if (!this.isConfigured()) {

            return false;

        }

        try {

            await this.sendCommand(

                "ping"

            );

            return true;

        }

        catch {

            return false;

        }

    }

    //---------------------------------------------------------------------
    // Diagnostics
    //---------------------------------------------------------------------

    /**
     * Returns basic service
     * configuration information.
     */
    public getStatus() {

        return {

            configured:

                this.isConfigured(),

            endpoint:

                this.apiEndpoint,

            timeout:

                this.timeout

        };

    }

//=============================================================================
// Honor Pole Innovations
// HonorPole Platform
//
// File:
// capacityService.ts
//
// PART 3 OF 3
//
// Location:
// src/services/capacityService.ts
//
//=============================================================================

    //---------------------------------------------------------------------
    // Intent Parsing
    //---------------------------------------------------------------------

    /**
     * Converts a Capacity AI response
     * into an HonorPole command.
     */
    public parseCommandIntent(
        response: CapacityResponse
    ): CapacityIntent {

        const answer =
            response.answer?.toLowerCase() ?? "";

        const intent =
            response.intent?.toLowerCase() ?? "";

        const combined =
            `${answer} ${intent}`.trim();

        //-------------------------------------------------------------
        // STOP
        //-------------------------------------------------------------

        if (

            combined.includes("stop")

            ||

            combined.includes("halt")

            ||

            combined.includes("cancel")

        ) {

            return "stop";

        }

        //-------------------------------------------------------------
        // FULL
        //-------------------------------------------------------------

        if (

            combined.includes("full")

            ||

            combined.includes("raise")

            ||

            combined.includes("top")

            ||

            combined.includes("up")

        ) {

            return "full";

        }

        //-------------------------------------------------------------
        // HALF
        //-------------------------------------------------------------

        if (

            combined.includes("half")

            ||

            combined.includes("half staff")

            ||

            combined.includes("half-staff")

            ||

            combined.includes("middle")

            ||

            combined.includes("mid")

        ) {

            return "half";

        }

        //-------------------------------------------------------------
        // DOWN
        //-------------------------------------------------------------

        if (

            combined.includes("down")

            ||

            combined.includes("lower")

            ||

            combined.includes("bottom")

        ) {

            return "down";

        }

        //-------------------------------------------------------------
        // AUTO
        //-------------------------------------------------------------

        if (

            combined.includes("auto")

            ||

            combined.includes("automatic")

            ||

            combined.includes("directive")

            ||

            combined.includes("schedule")

        ) {

            return "auto";

        }

        return null;

    }

    //---------------------------------------------------------------------
    // High-Level Operations
    //---------------------------------------------------------------------

    /**
     * Sends a natural language command
     * and returns both the parsed
     * HonorPole intent and the
     * raw Capacity response.
     */
    public async interpretCommand(

        command: string,

        metadata: CapacityCommandMetadata = {}

    ): Promise<{

        intent: CapacityIntent;

        response: CapacityResponse;

    }> {

        const response =
            await this.sendCommand(

                command,

                metadata

            );

        const intent =
            this.parseCommandIntent(

                response

            );

        return {

            intent,

            response

        };

    }

    //---------------------------------------------------------------------
    // Utility Methods
    //---------------------------------------------------------------------

    /**
     * Returns the configured
     * API endpoint.
     */
    public toString(): string {

        return this.apiEndpoint;

    }

    /**
     * Returns the service state
     * as a plain object.
     */
    public toJSON() {

        return {

            configured:

                this.isConfigured(),

            endpoint:

                this.apiEndpoint,

            timeout:

                this.timeout

        };

    }

}

//---------------------------------------------------------------------
// Singleton Export
//---------------------------------------------------------------------

export const capacityService =
    new CapacityService();