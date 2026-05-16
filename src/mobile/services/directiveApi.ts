/**
 * Directive API Service
 * Fetches federal and state half-staff directives
 * These directives are sent to the Arduino for compliance decision-making
 */

export interface Directive {
  valid: boolean;
  requiresHalf: boolean;
  expiresAt: number; // Unix timestamp (seconds)
  authority: string;
  jurisdiction: string;
  reason: string;
}

export interface DirectivesResponse {
  success: boolean;
  federal: Directive | null;
  state: Directive | null;
  timestamp: string;
}

/**
 * Get current half-staff directives for a state
 * In production, this would call a real API that checks:
 * - Federal proclamations (whitehouse.gov, flags.gov)
 * - State proclamations (state government websites)
 */
export async function getDirectives(stateCode: string): Promise<DirectivesResponse> {
  // Mock implementation - replace with actual API calls in production
  // This would integrate with government APIs or web scraping services

  await new Promise(resolve => setTimeout(resolve, 500));

  // Check for active federal directives
  const federalDirective = await checkFederalDirectives();

  // Check for active state directives
  const stateDirective = await checkStateDirectives(stateCode);

  return {
    success: true,
    federal: federalDirective,
    state: stateDirective,
    timestamp: new Date().toISOString()
  };
}

/**
 * Check for active federal half-staff directives
 * In production, scrape whitehouse.gov/half-staff or use flags.gov API
 */
async function checkFederalDirectives(): Promise<Directive | null> {
  // Mock: No active federal directive
  // In production, check actual federal sources

  // Example of an active directive:
  // return {
  //   valid: true,
  //   requiresHalf: true,
  //   expiresAt: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days from now
  //   authority: "Federal",
  //   jurisdiction: "FEDERAL",
  //   reason: "In honor of former President [Name]"
  // };

  return null;
}

/**
 * Check for active state half-staff directives
 * In production, check state governor's office website
 */
async function checkStateDirectives(stateCode: string): Promise<Directive | null> {
  // Mock: No active state directive
  // In production, check actual state government sources

  // Example of an active directive:
  // return {
  //   valid: true,
  //   requiresHalf: true,
  //   expiresAt: Math.floor(Date.now() / 1000) + (3 * 24 * 60 * 60), // 3 days from now
  //   authority: "State",
  //   jurisdiction: `STATE:${stateCode}`,
  //   reason: `State memorial observance`
  // };

  return null;
}

/**
 * Format directive for Arduino consumption
 * Converts to the format expected by the Arduino firmware
 */
export function formatDirectiveForArduino(directive: Directive | null): {
  active: number;
  exp: number;
  reason: string;
} {
  if (!directive || !directive.valid) {
    return {
      active: 0,
      exp: 0,
      reason: ""
    };
  }

  return {
    active: directive.requiresHalf ? 1 : 0,
    exp: directive.expiresAt,
    reason: directive.reason
  };
}
