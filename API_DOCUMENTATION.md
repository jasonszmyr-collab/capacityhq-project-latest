# Honor Pole API Documentation

This document describes the API endpoints that need to be implemented on the backend server to support the Arduino firmware and mobile app integration.

## Overview

The mobile app fetches federal and state half-staff directives from external sources, then sends this directive data to the backend API. The backend API stores these directives and makes them available to the Arduino device, which makes the final decision on flag position.

## Base URL

```
VITE_BASE44_API_ENDPOINT=https://your-app.base44.app/api
```

## Endpoints

### 1. Configure Device State

**Endpoint:** `POST /device/config`

**Description:** Sets the state location for the Arduino device. This tells the Arduino which state's directives to apply.

**Request Body:**
```json
{
  "stateCode": "DC"
}
```

**Request Fields:**
- `stateCode` (string, required): 2-letter state code (e.g., "DC", "CA", "TX")

**Response:**
```json
{
  "success": true,
  "message": "Device state configured successfully",
  "receivedAt": "2025-12-23T18:00:00.000Z"
}
```

**Backend Actions:**
- Store the state code in the Arduino's KVStore under key `loc_state`
- This can be done via HTTP request to Arduino or by updating a database that the Arduino polls

---

### 2. Submit Directives

**Endpoint:** `POST /directives`

**Description:** Sends federal and state half-staff directives to the Arduino. The Arduino will store these directives and use them to determine flag position.

**Request Body:**
```json
{
  "federal": {
    "active": 1,
    "exp": 1735689600,
    "reason": "In honor of former President [Name]"
  },
  "state": {
    "active": 0,
    "exp": 0,
    "reason": ""
  }
}
```

**Request Fields:**

Federal Directive:
- `federal.active` (number, required): 1 if half-staff required, 0 if not
- `federal.exp` (number, required): Unix timestamp (seconds) when directive expires, 0 for no expiration
- `federal.reason` (string, required): Reason for the directive

State Directive:
- `state.active` (number, required): 1 if half-staff required, 0 if not
- `state.exp` (number, required): Unix timestamp (seconds) when directive expires, 0 for no expiration
- `state.reason` (string, required): Reason for the directive

**Response:**
```json
{
  "success": true,
  "message": "Directives submitted successfully",
  "receivedAt": "2025-12-23T18:00:00.000Z"
}
```

**Backend Actions:**

Store federal directive in Arduino's KVStore:
- Key `fed_active` = `federal.active`
- Key `fed_exp` = `federal.exp`
- Key `fed_reason` = `federal.reason`

Store state directive in Arduino's KVStore:
- Key `st_active` = `state.active`
- Key `st_exp` = `state.exp`
- Key `st_reason` = `state.reason`

This can be done by:
1. Making HTTP requests directly to the Arduino (if it exposes an HTTP endpoint)
2. Storing in a database that the Arduino polls periodically
3. Pushing to the Arduino via MQTT or another IoT protocol

---

### 3. Get Device Status

**Endpoint:** `GET /status`

**Description:** Returns the current status of the Arduino device, including configured state, active directives, and current flag position.

**Response:**
```json
{
  "success": true,
  "status": {
    "deviceState": "DC",
    "lastUpdateAt": "2025-12-23T18:00:00.000Z",
    "arduinoStatus": "ENFORCED",
    "currentPosition": "HALF",
    "federalDirective": {
      "active": true,
      "expiresAt": 1735689600,
      "reason": "In honor of former President [Name]"
    },
    "stateDirective": {
      "active": false,
      "expiresAt": null,
      "reason": null
    },
    "explanation": "Federal half-staff directive active until Jan 1, 2026"
  }
}
```

**Response Fields:**
- `deviceState` (string|null): 2-letter state code configured on the device
- `lastUpdateAt` (string|null): ISO 8601 timestamp of last directive update
- `arduinoStatus` (string): Current Arduino status ("ENFORCED", "IDLE", "DENIED_REQUEST", etc.)
- `currentPosition` (string|null): Current flag position ("FULL", "HALF", "DOWN", "UNKNOWN")
- `federalDirective` (object|null): Current federal directive status
  - `active` (boolean): Whether federal directive is active
  - `expiresAt` (number|null): Unix timestamp when it expires
  - `reason` (string|null): Reason for the directive
- `stateDirective` (object|null): Current state directive status
  - `active` (boolean): Whether state directive is active
  - `expiresAt` (number|null): Unix timestamp when it expires
  - `reason` (string|null): Reason for the directive
- `explanation` (string|null): Human-readable explanation of current status

**Backend Actions:**
- Read current directive data from Arduino's KVStore or database
- Read current flag position from Arduino
- Return consolidated status

---

## Arduino Firmware Integration

The Arduino firmware expects the following data structure in its KVStore:

### Configuration Keys
- `wifi_ssid`: WiFi network name
- `wifi_pass`: WiFi password
- `loc_state`: 2-letter state code (e.g., "DC")

### Federal Directive Keys
- `fed_active`: Integer (0 or 1) - whether federal directive requires half-staff
- `fed_exp`: Unix timestamp (seconds) - when directive expires (0 for no expiration)
- `fed_reason`: String - reason for the directive

### State Directive Keys
- `st_active`: Integer (0 or 1) - whether state directive requires half-staff
- `st_exp`: Unix timestamp (seconds) - when directive expires (0 for no expiration)
- `st_reason`: String - reason for the directive

## Directive Resolution Logic (Arduino)

The Arduino uses this logic to determine flag position:

1. **Time Check:** If NTP time is invalid, default to half-staff (failsafe)
2. **Check Active Directives:**
   - Federal directive is active if `fed_active == 1` AND current time <= `fed_exp` (or `fed_exp == 0`)
   - State directive is active if `st_active == 1` AND current time <= `st_exp` (or `st_exp == 0`)
3. **Resolution:**
   - If either federal OR state directive is active → **HALF-STAFF**
   - If both are inactive → **FULL-STAFF**
4. **Priority:** Federal and state directives have equal priority; if either requires half-staff, the flag goes to half-staff

## Implementation Notes

### For Backend Developers:

1. **Storage Options:**
   - Option A: Store directives in a database and provide HTTP endpoints for Arduino to poll
   - Option B: If Arduino is on local network, make direct HTTP requests to Arduino's IP
   - Option C: Use MQTT broker for real-time updates

2. **Security:**
   - Implement authentication for all endpoints
   - Validate state codes against a whitelist
   - Validate timestamp ranges (exp should be in the future or 0)
   - Rate limit directive submissions

3. **Directive Sources:**
   - Fetch federal directives from whitehouse.gov or halfstaff.org
   - Fetch state directives from state government websites
   - Consider implementing a caching layer to avoid repeated scraping
   - Schedule periodic jobs to check for new directives

### For Mobile App Developers:

The mobile app workflow:

1. **Initial Setup:**
   - Get device location
   - Configure device state via `POST /device/config`

2. **Ongoing Operation:**
   - Fetch current directives from external sources (implemented in `directiveApi.ts`)
   - Send directives to backend via `POST /directives`
   - Poll `GET /status` to show current device state

3. **User Actions:**
   - User taps "Configure Device" to set state
   - User taps "Fetch & Send Directives" to update Arduino with latest data

## Example Flow

```
1. User opens mobile app
   ↓
2. App detects location: Washington, DC
   ↓
3. User taps "Configure Device"
   ↓
4. App sends: POST /device/config { stateCode: "DC" }
   ↓
5. Backend stores state code in Arduino
   ↓
6. User taps "Fetch & Send Directives"
   ↓
7. App checks whitehouse.gov for federal directives
   ↓
8. App checks dc.gov for DC state directives
   ↓
9. App sends: POST /directives with federal + state data
   ↓
10. Backend stores directives in Arduino KVStore
    ↓
11. Arduino reads directives from KVStore
    ↓
12. Arduino applies compliance logic
    ↓
13. Arduino sets flag position to HALF or FULL
    ↓
14. App polls: GET /status to show current state
```

## Testing

### Mock Directive Examples

**Active Federal Directive:**
```json
{
  "active": 1,
  "exp": 1735689600,
  "reason": "In honor of former President Jimmy Carter"
}
```

**Active State Directive:**
```json
{
  "active": 1,
  "exp": 1735603200,
  "reason": "State memorial observance"
}
```

**Inactive Directive:**
```json
{
  "active": 0,
  "exp": 0,
  "reason": ""
}
```

### Test Cases

1. **No Active Directives:** Flag should be FULL
2. **Federal Directive Only:** Flag should be HALF
3. **State Directive Only:** Flag should be HALF
4. **Both Active:** Flag should be HALF
5. **Expired Directive:** Flag should be FULL (if other directive is not active)
6. **Invalid Time:** Flag should be HALF (failsafe)

## Environment Variables

Add to `.env` file:

```bash
VITE_BASE44_API_ENDPOINT=https://your-app.base44.app/api
```

This variable is already configured in the project.
