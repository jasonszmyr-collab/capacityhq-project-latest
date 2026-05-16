/**
 * Capacity AI Service for Natural Language Device Control
 * Enables users to control devices using natural language commands via Capacity.com API
 */

export interface CapacityResponse {
  answer?: string;
  intent?: string;
  confidence?: number;
  metadata?: Record<string, any>;
  error?: string;
}

export interface CapacityCommandMetadata {
  device_id?: string;
  device_name?: string;
  current_position?: string;
  online?: boolean;
  [key: string]: any;
}

class CapacityService {
  private readonly apiEndpoint = 'https://api.capacity.com/api/v3/ai/query';
  private apiKey: string | null = null;

  constructor() {
    this.apiKey = import.meta.env.VITE_CAPACITY_API_KEY || null;
  }

  /**
   * Check if Capacity API is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Send a natural language command to Capacity AI
   *
   * @param command - Natural language command from user
   * @param metadata - Optional context about the device and current state
   * @returns Capacity API response with interpreted command
   *
   * @example
   * const response = await capacityService.sendCommand('raise the flag to full staff', {
   *   device_id: 'device-123',
   *   device_name: 'Main Flagpole',
   *   current_position: 'half'
   * });
   */
  async sendCommand(
    command: string,
    metadata: CapacityCommandMetadata = {}
  ): Promise<CapacityResponse> {
    if (!this.isConfigured()) {
      throw new Error('Capacity API key is not configured. Please set VITE_CAPACITY_API_KEY in your environment variables.');
    }

    if (!command || command.trim().length === 0) {
      throw new Error('Command cannot be empty');
    }

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: command.trim(),
          metadata,
          userId: metadata.device_id || 'unknown',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Capacity API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      return data as CapacityResponse;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to communicate with Capacity API');
    }
  }

  /**
   * Parse Capacity response to extract action intent
   * This is a helper to interpret the AI response
   *
   * @param response - Response from Capacity API
   * @returns Parsed command action or null if not recognized
   */
  parseCommandIntent(response: CapacityResponse): 'full' | 'half' | 'down' | 'auto' | null {
    const answer = response.answer?.toLowerCase() || '';
    const intent = response.intent?.toLowerCase() || '';
    const combined = `${answer} ${intent}`;

    // Map natural language to device commands
    if (combined.includes('full') || combined.includes('raise') || combined.includes('up')) {
      return 'full';
    }
    if (combined.includes('half') || combined.includes('middle')) {
      return 'half';
    }
    if (combined.includes('down') || combined.includes('lower')) {
      return 'down';
    }
    if (combined.includes('auto') || combined.includes('automatic')) {
      return 'auto';
    }

    return null;
  }

  /**
   * Send command and parse the intent in one call
   *
   * @param command - Natural language command
   * @param metadata - Device context
   * @returns Object with parsed intent and raw response
   */
  async interpretCommand(
    command: string,
    metadata: CapacityCommandMetadata = {}
  ): Promise<{ intent: 'full' | 'half' | 'down' | 'auto' | null; response: CapacityResponse }> {
    const response = await this.sendCommand(command, metadata);
    const intent = this.parseCommandIntent(response);
    return { intent, response };
  }
}

export const capacityService = new CapacityService();
