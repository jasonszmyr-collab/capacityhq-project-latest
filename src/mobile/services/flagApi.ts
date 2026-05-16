/**
 * API service for directive submission to Arduino
 * Sends federal and state half-staff directives to Arduino
 * The Arduino makes all flag position decisions based on these directives
 */

import type { LocationData } from './locationService';
import type { Directive } from './directiveApi';

// @ts-ignore - Vite env variable
const API_BASE_URL = import.meta.env.VITE_BASE44_API_ENDPOINT || 'https://your-app.base44.app/api';

export type ArduinoStatus = 'ENFORCED' | 'DENIED_REQUEST' | 'IDLE' | string;

export interface DirectiveSubmissionResponse {
  success: boolean;
  message: string;
  receivedAt: string;
}

export interface DeviceStatusResponse {
  success: boolean;
  status: {
    deviceState: string | null;
    lastUpdateAt: string | null;
    arduinoStatus: ArduinoStatus;
    currentPosition: string | null;
    federalDirective: {
      active: boolean;
      expiresAt: number | null;
      reason: string | null;
    } | null;
    stateDirective: {
      active: boolean;
      expiresAt: number | null;
      reason: string | null;
    } | null;
    explanation: string | null;
  };
}

export interface DeviceConfigRequest {
  stateCode: string;
}

/**
 * Configure device state (required before sending directives)
 * Tells the Arduino what state it's operating in
 */
export async function configureDeviceState(
  stateCode: string
): Promise<DirectiveSubmissionResponse> {
  const response = await fetch(`${API_BASE_URL}/device/config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      stateCode: stateCode.toUpperCase()
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to configure device: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Submit directives to Arduino
 * Sends federal and state half-staff orders for Arduino to process
 */
export async function submitDirectives(
  federalDirective: Directive | null,
  stateDirective: Directive | null
): Promise<DirectiveSubmissionResponse> {
  const response = await fetch(`${API_BASE_URL}/directives`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      federal: federalDirective ? {
        active: federalDirective.requiresHalf ? 1 : 0,
        exp: federalDirective.expiresAt,
        reason: federalDirective.reason
      } : {
        active: 0,
        exp: 0,
        reason: ""
      },
      state: stateDirective ? {
        active: stateDirective.requiresHalf ? 1 : 0,
        exp: stateDirective.expiresAt,
        reason: stateDirective.reason
      } : {
        active: 0,
        exp: 0,
        reason: ""
      }
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to submit directives: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get current device status from backend
 * Shows what the Arduino is doing with the location data
 */
export async function getDeviceStatus(): Promise<DeviceStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch device status: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Generate a unique submission ID for tracking
 */
export function generateSubmissionId(): string {
  return `loc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
