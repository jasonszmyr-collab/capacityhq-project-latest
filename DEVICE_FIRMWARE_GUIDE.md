# Device Firmware Implementation Guide

## Overview

This guide explains how the Arduino/device firmware should implement compliance checking for flag position control. The device is the **enforcement authority** that applies compliance rules and reports the enforced position back to the backend.

## Architecture

```
User Request → Backend (stores request) → Device (enforces compliance) → Backend (stores enforced position)
                                              ↓
                                    Compliance Rules Engine
                                    (checks local/state/federal/half-mast)
```

## Compliance Rules Priority Hierarchy

The device firmware **must** enforce this priority order:

1. **Half-mast directives** (HIGHEST PRIORITY)
   - Presidential proclamations
   - Governor orders
   - Always override all other requirements

2. **Federal requirements**
   - National holidays
   - Federal regulations

3. **State requirements**
   - State holidays
   - State regulations

4. **Local requirements** (LOWEST PRIORITY)
   - Local ordinances
   - Municipal regulations

## Implementation Steps

### 1. Fetch Current Rules from Backend

The device should periodically fetch active compliance rules:

```cpp
// Pseudo-code for Arduino/C++
struct ComplianceRule {
    String id;
    String level;           // "half_mast", "federal", "state", "local"
    String position;        // "full", "half", "down", "auto"
    String action;          // "required", "recommended", "allowed"
    String reason;
    unsigned long startTime;
    unsigned long endTime;
    bool active;
};

// Fetch rules from backend API
ComplianceRule* fetchComplianceRules(int& ruleCount) {
    // HTTP GET to /api/compliance-rules
    // Parse JSON response
    // Return array of active rules
}
```

### 2. Check Compliance Before Position Change

```cpp
// Pseudo-code
struct ComplianceResult {
    bool allowed;
    String requiredPosition;
    String blockingRuleId;
    String reason;
};

ComplianceResult checkCompliance(String requestedPosition, ComplianceRule* rules, int ruleCount) {
    // Sort rules by priority (half_mast > federal > state > local)
    sortRulesByPriority(rules, ruleCount);

    // Find highest priority "required" rule
    for (int i = 0; i < ruleCount; i++) {
        if (rules[i].action == "required") {
            if (requestedPosition != rules[i].position && requestedPosition != "auto") {
                // Request conflicts with requirement
                return {
                    .allowed = false,
                    .requiredPosition = rules[i].position,
                    .blockingRuleId = rules[i].id,
                    .reason = rules[i].reason
                };
            }

            // Request complies
            return {
                .allowed = true,
                .requiredPosition = rules[i].position,
                .reason = rules[i].reason
            };
        }
    }

    // No required rules - allow request
    return {
        .allowed = true,
        .requiredPosition = "",
        .reason = "No active compliance requirements"
    };
}
```

### 3. Enforce Position and Report Status

```cpp
void enforcePosition() {
    // Fetch user's requested position from backend
    String requestedPosition = fetchRequestedPosition();

    // Fetch compliance rules
    int ruleCount = 0;
    ComplianceRule* rules = fetchComplianceRules(ruleCount);

    // Check compliance
    ComplianceResult result = checkCompliance(requestedPosition, rules, ruleCount);

    String enforcedPosition;
    String arduinoStatus;
    String explain;

    if (result.allowed) {
        // Apply the requested position or required position
        enforcedPosition = result.requiredPosition != ""
            ? result.requiredPosition
            : requestedPosition;

        // Move motor to position
        moveMotorToPosition(enforcedPosition);

        arduinoStatus = "ENFORCED";
        explain = result.reason;
    } else {
        // Deny request and enforce required position
        enforcedPosition = result.requiredPosition;
        moveMotorToPosition(enforcedPosition);

        arduinoStatus = "DENIED_REQUEST";
        explain = "Request denied: " + result.reason;
    }

    // Report back to backend
    reportEnforcedState(enforcedPosition, arduinoStatus, explain);
}
```

### 4. Report Enforced State to Backend

```cpp
void reportEnforcedState(String enforcedPosition, String status, String explain) {
    // HTTP POST to /api/flag-position
    // JSON body:
    // {
    //   "enforced_position": "half",
    //   "arduino_status": "ENFORCED" or "DENIED_REQUEST",
    //   "explain": "Human-readable reason",
    //   "half_staff_active": true/false,
    //   "last_arduino_poll": "2024-01-01T12:00:00Z"
    // }
}
```

## Example Scenarios

### Scenario 1: Normal Operation (No Requirements)

1. User requests: `full`
2. Device checks rules: No active requirements
3. Device enforces: `full`
4. Device reports: `ENFORCED`, "No active compliance requirements"

### Scenario 2: Half-mast Directive Active

1. User requests: `full`
2. Device checks rules: Half-mast directive requires `half`
3. Device enforces: `half` (overrides user request)
4. Device reports: `DENIED_REQUEST`, "Half-mast directive requires half position. Presidential proclamation for national day of mourning"

### Scenario 3: User Requests Auto During Half-mast

1. User requests: `auto`
2. Device checks rules: Half-mast directive requires `half`
3. Device enforces: `half`
4. Device reports: `ENFORCED`, "Half-mast directive requires half position. Presidential proclamation for national day of mourning"

### Scenario 4: State Requirement Conflicts with User Request

1. User requests: `down`
2. Device checks rules: State requirement for `full` (state holiday)
3. Device enforces: `full` (overrides user request)
4. Device reports: `DENIED_REQUEST`, "State requirement requires full position. State holiday observance"

## Backend API Integration

### Fetch Requested Position

```
GET /api/flag-position

Response:
{
  "success": true,
  "record": {
    "requested_position": "full",
    "requested_at": "2024-01-01T10:00:00Z",
    "testmode_request": false
  }
}
```

### Fetch Compliance Rules

```
GET /api/compliance-rules

Response:
{
  "success": true,
  "rules": [
    {
      "id": "federal-half-mast-2024",
      "level": "half_mast",
      "position": "half",
      "action": "required",
      "reason": "Presidential proclamation for national day of mourning",
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-01-03T23:59:59Z",
      "active": true
    }
  ]
}
```

### Report Enforced State

```
POST /api/flag-position/enforce

Body:
{
  "enforced_position": "half",
  "arduino_status": "ENFORCED",
  "explain": "Half-mast directive requires half position",
  "half_staff_active": true,
  "last_arduino_poll": "2024-01-01T12:00:00Z"
}
```

## Testing

The mobile app includes a test mode toggle. When test mode is enabled:

- Device can bypass certain rules for testing
- Device should still log all decisions
- Device should mark enforced state with `testmode_active: true`

## Important Notes

1. **Device is Authority**: The device is the single source of truth for enforced position
2. **Backend is Passive**: Backend only stores requests and visibility data
3. **No Retries**: Backend does not retry denied requests
4. **Poll Regularly**: Device should poll backend every 30-60 seconds for new requests and rules
5. **Half-mast Priority**: Half-mast directives ALWAYS override everything else
6. **Auto Mode**: When user requests "auto", device should enforce the highest priority required position, or use its own logic if no requirements exist

## Code Reference

The compliance checking logic is implemented in TypeScript (for mobile app preview):

- File: `src/mobile/services/complianceRules.ts`
- Class: `ComplianceRulesManager`
- Key method: `checkCompliance()`

This logic should be ported to C++ for Arduino firmware.
