/**
 * Cloud Service for Remote Flag Control
 * Enables worldwide control of flag position through cloud infrastructure
 */

const CLOUD_API_BASE = import.meta.env.VITE_CLOUD_API_ENDPOINT || 'https://api.honorpole.cloud';
console.log("CLOUD_API_BASE =", CLOUD_API_BASE);

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  lastSeen: string;
  online: boolean;
  firmware: string;
}

export interface CloudCommand {
  commandId: string;
  deviceId: string;
  command: 'full' | 'half' | 'down' | 'auto';
  timestamp: string;
  status: 'pending' | 'delivered' | 'executed' | 'failed';
  userId: string;
}

export interface DeviceStatus {
  deviceId: string;
  currentPosition: string;
  arduinoStatus: string;
  lastUpdate: string;
  online: boolean;
  federalDirective?: {
    active: boolean;
    expiresAt: number | null;
    reason: string | null;
  };
  stateDirective?: {
    active: boolean;
    expiresAt: number | null;
    reason: string | null;
  };
}

export interface DeviceRegistration {
  deviceId: string;
  pairingCode: string;
  userId: string;
  deviceName: string;
}

class CloudService {
  private authToken: string | null = null;
  private userId: string | null = null;

  /**
   * Set authentication token for cloud API
   */
  setAuthToken(token: string) {
    this.authToken = token;
    localStorage.setItem('cloud_auth_token', token);
  }

  /**
   * Get authentication token
   */
  getAuthToken(): string | null {
    if (!this.authToken) {
      this.authToken = localStorage.getItem('cloud_auth_token');
    }
    return this.authToken;
  }

  /**
   * Set user ID
   */
  setUserId(userId: string) {
    this.userId = userId;
    localStorage.setItem('cloud_user_id', userId);
  }

  /**
   * Get user ID
   */
  getUserId(): string | null {
    if (!this.userId) {
      this.userId = localStorage.getItem('cloud_user_id');
    }
    return this.userId;
  }

  /**
   * Clear authentication
   */
  clearAuth() {
    this.authToken = null;
    this.userId = null;
    localStorage.removeItem('cloud_auth_token');
    localStorage.removeItem('cloud_user_id');
  }

  /**
   * Make authenticated API request
   */
  private async apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getAuthToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${CLOUD_API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cloud API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Register a new user account
   */
  async registerUser(email: string, password: string): Promise<{ userId: string; token: string }> {
    const result = await this.apiRequest<{ userId: string; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.setAuthToken(result.token);
    this.setUserId(result.userId);

    return result;
  }

  /**
   * Login existing user
   */
  async loginUser(email: string, password: string): Promise<{ userId: string; token: string }> {
    const result = await this.apiRequest<{ userId: string; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.setAuthToken(result.token);
    this.setUserId(result.userId);

    return result;
  }

  /**
   * Register a new device with pairing code
   */
  async registerDevice(
    pairingCode: string,
    deviceName: string
  ): Promise<DeviceRegistration> {
    const userId = this.getUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }

    return this.apiRequest<DeviceRegistration>('/devices/register', {
      method: 'POST',
      body: JSON.stringify({ pairingCode, deviceName, userId }),
    });
  }

  /**
   * Get list of user's devices
   */
  async getDevices(): Promise<DeviceInfo[]> {
    const userId = this.getUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }

    return this.apiRequest<DeviceInfo[]>(`/devices?userId=${userId}`);
  }

  /**
   * Get device status
   */
  async getDeviceStatus(deviceId: string): Promise<DeviceStatus> {
    return this.apiRequest<DeviceStatus>(`/devices/${deviceId}/status`);
  }

  /**
   * Send command to device
   */
  async sendCommand(
    deviceId: string,
    command: 'full' | 'half' | 'down' | 'auto'
  ): Promise<CloudCommand> {
    const userId = this.getUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }

    return this.apiRequest<CloudCommand>(`/devices/${deviceId}/command`, {
      method: 'POST',
      body: JSON.stringify({ command, userId }),
    });
  }

  /**
   * Submit directives to device via cloud
   */
  async submitDirectives(
    deviceId: string,
    federalDirective: any | null,
    stateDirective: any | null
  ): Promise<{ success: boolean; message: string }> {
    const userId = this.getUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }

    return this.apiRequest<{ success: boolean; message: string }>(
      `/devices/${deviceId}/directives`,
      {
        method: 'POST',
        body: JSON.stringify({
          userId,
          federal: federalDirective,
          state: stateDirective,
        }),
      }
    );
  }

  /**
   * Configure device state
   */
  async configureDevice(
    deviceId: string,
    stateCode: string
  ): Promise<{ success: boolean; message: string }> {
    return this.apiRequest<{ success: boolean; message: string }>(
      `/devices/${deviceId}/config`,
      {
        method: 'POST',
        body: JSON.stringify({ stateCode }),
      }
    );
  }

  /**
   * Remove device from user account
   */
  async removeDevice(deviceId: string): Promise<{ success: boolean }> {
    const userId = this.getUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }

    return this.apiRequest<{ success: boolean }>(
      `/devices/${deviceId}?userId=${userId}`,
      {
        method: 'DELETE',
      }
    );
  }

  /**
   * Get command history for device
   */
  async getCommandHistory(deviceId: string, limit = 50): Promise<CloudCommand[]> {
    return this.apiRequest<CloudCommand[]>(
      `/devices/${deviceId}/commands?limit=${limit}`
    );
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.getAuthToken() !== null && this.getUserId() !== null;
  }
}

export const cloudService = new CloudService();
