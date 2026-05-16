# Flag Position Compliance Implementation

## Overview

The flag position control system now includes comprehensive compliance checking that enforces local, state, federal, and half-mast requirements with proper priority hierarchy.

## Implementation Summary

### 1. Compliance Rules Service

**File**: `src/mobile/services/complianceRules.ts`

This service provides the core compliance checking logic:

- **ComplianceRulesManager**: Main class for managing and checking compliance rules
- **Priority Hierarchy**: Half-mast > Federal > State > Local
- **Rule Types**: Required, Recommended, Allowed
- **Date Range Support**: Rules can have start/end dates for automatic activation/deactivation

### 2. Mobile App Integration

**File**: `src/mobile/screens/FlagControlScreen.tsx`

The mobile app now:
- Checks compliance before submitting flag position requests
- Displays compliance status with color-coded indicators (green for allowed, red for denied)
- Shows active rules and their reasons
- Warns users when their request conflicts with requirements
- Allows users to see what position is required and why

### 3. Device Firmware Guide

**File**: `DEVICE_FIRMWARE_GUIDE.md`

Complete implementation guide for Arduino/device firmware including:
- Pseudo-code examples for compliance checking
- API integration instructions
- Example scenarios and expected behavior
- Priority enforcement logic

### 4. Test Suite

**File**: `src/mobile/services/__tests__/complianceRules.test.ts`

Comprehensive test cases covering:
- Priority hierarchy (half-mast overrides all)
- Auto mode handling
- Date range validation
- Compliance checking logic
- Rule management

## Priority Hierarchy

The system enforces this strict priority order:

1. **Half-mast Directives** (HIGHEST)
   - Presidential proclamations
   - Governor orders
   - Always override all other requirements

2. **Federal Requirements**
   - National holidays
   - Federal regulations

3. **State Requirements**
   - State holidays
   - State regulations

4. **Local Requirements** (LOWEST)
   - Local ordinances
   - Municipal regulations

## Usage Example

### Adding a Compliance Rule

```typescript
import { complianceManager } from './services/complianceRules';

// Add a half-mast directive
complianceManager.addRule({
  id: 'half-mast-2024-memorial',
  level: 'half_mast',
  position: 'half',
  action: 'required',
  reason: 'Presidential proclamation for Memorial Day',
  startDate: new Date('2024-05-27T00:00:00Z'),
  endDate: new Date('2024-05-27T23:59:59Z'),
  active: true,
  source: 'Presidential Proclamation'
});
```

### Checking Compliance

```typescript
// Check if a requested position complies with rules
const result = complianceManager.checkCompliance('full');

if (!result.allowed) {
  console.log(`Request denied: ${result.reason}`);
  console.log(`Required position: ${result.requiredPosition}`);
} else {
  console.log(`Request allowed: ${result.reason}`);
}
```

### Getting Enforced Position

```typescript
// Get the position that should be enforced based on current rules
const enforcedPosition = complianceManager.getEnforcedPosition();

if (enforcedPosition) {
  console.log(`Device must enforce: ${enforcedPosition}`);
} else {
  console.log('No enforcement required - user control allowed');
}
```

## User Experience Flow

### Scenario 1: Normal Operation (No Requirements)

1. User opens app and selects "Full Staff"
2. App checks compliance: No active requirements
3. App submits request to backend
4. Device enforces full staff position
5. App displays: "Request allowed: No active compliance requirements"

### Scenario 2: Half-mast Directive Active

1. User opens app and selects "Full Staff"
2. App checks compliance: Half-mast directive requires half position
3. App shows alert: "Request Not Allowed - Half-mast directive requires half position"
4. User can:
   - Cancel the request
   - Submit anyway (device will still enforce half position)
5. If submitted, device enforces half position regardless of request
6. App displays device explanation: "Request denied: Half-mast directive requires half position. Presidential proclamation for national day of mourning"

### Scenario 3: User Requests Auto Mode

1. User selects "Auto"
2. App checks compliance: State requirement for half position
3. App shows notice: "State requirement recommends half position"
4. User confirms
5. Device enforces required half position
6. App displays: "Request allowed: State requirement requires half position"

## Device Firmware Integration

The device firmware must implement the same compliance checking logic to be the enforcement authority. Key points:

1. **Poll Backend**: Device should poll every 30-60 seconds for:
   - New user requests
   - Updated compliance rules

2. **Check Compliance**: Before changing position, device must:
   - Fetch active compliance rules
   - Check if requested position complies
   - Enforce highest priority required position if conflict

3. **Report Status**: Device must report back:
   - `enforced_position`: Actual position enforced
   - `arduino_status`: "ENFORCED" or "DENIED_REQUEST"
   - `explain`: Human-readable reason for decision
   - `half_staff_active`: Boolean indicating if half-mast directive is active

## API Endpoints (Future)

To fully implement this system, the backend should provide:

### GET /api/compliance-rules

Returns active compliance rules for the device to check.

```json
{
  "success": true,
  "rules": [
    {
      "id": "federal-half-mast-2024",
      "level": "half_mast",
      "position": "half",
      "action": "required",
      "reason": "Presidential proclamation",
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-01-03T23:59:59Z",
      "active": true
    }
  ]
}
```

### POST /api/flag-position/enforce

Device reports enforced position and status.

```json
{
  "enforced_position": "half",
  "arduino_status": "DENIED_REQUEST",
  "explain": "Half-mast directive requires half position",
  "half_staff_active": true,
  "last_arduino_poll": "2024-01-01T12:00:00Z"
}
```

## Testing

Test cases are provided in `src/mobile/services/__tests__/complianceRules.test.ts` covering:

- ✓ Half-mast overrides federal requirement
- ✓ Federal overrides state requirement
- ✓ State overrides local requirement
- ✓ Auto mode complies with requirements
- ✓ Date range validation
- ✓ Request matching requirement is allowed
- ✓ Request conflicting with requirement is denied
- ✓ Enforced position returns highest priority

## Next Steps

1. **Backend Integration**: Implement `/api/compliance-rules` endpoint
2. **Device Firmware**: Port TypeScript logic to C++/Arduino
3. **Rule Management UI**: Create admin interface for managing compliance rules
4. **Automated Rule Updates**: Integrate with official sources for half-mast directives
5. **Notification System**: Alert users when new compliance requirements are active

## Important Notes

- **Half-mast ALWAYS overrides**: No exceptions to this rule
- **Device is authority**: Backend only stores requests, device enforces compliance
- **No retries**: Backend does not retry denied requests
- **Test mode**: Available for testing without affecting production compliance
- **Date-aware**: Rules automatically activate/deactivate based on date ranges
