# Flag Position Control - Mobile App

A React Native mobile application for Android and iOS that controls flag position through the Base44 backend API.

## Overview

This app allows operators to:
- Request flag positions (Full Staff, Half Staff, Down, Auto)
- View current enforced position from the Arduino device
- Monitor Arduino compliance status
- See real-time explanations from the device
- Toggle test mode for testing

## Architecture (Patent-Safe Model)

The app follows a **request + visibility only** model:

1. **App submits requests** to Base44 backend (requested_position, testmode)
2. **Device (Arduino) enforces** compliance rules and reports back
3. **App displays** the enforced state and device explanations

The app does NOT:
- Compute or enforce final positions
- Apply half-staff rules
- Manage directive expiration
- Run centralized control logic

The Arduino device is the authority and publishes:
- `enforced_position` (what was actually set)
- `arduino_status` (ENFORCED, DENIED_REQUEST, etc.)
- `explain` (human-readable rationale)

## Setup

### Prerequisites

- Node.js 18+ and Yarn
- Expo CLI
- iOS Simulator (Mac) or Android Emulator
- Base44 account with API endpoint

### Installation

1. Install dependencies:
```bash
yarn install
```

2. Configure environment variables:

Create a `.env` file with:
```
VITE_BASE44_API_ENDPOINT=https://your-app.base44.app/api/flag-control
```

Replace with your actual Base44 API endpoint.

### Running the App

**iOS:**
```bash
yarn ios
```

**Android:**
```bash
yarn android
```

**Development mode:**
```bash
yarn start
```

Then press `i` for iOS or `a` for Android.

## Features

### Main Screen (Flag Control)

- **Status Display**: Shows current enforced position and Arduino status
- **Control Buttons**:
  - Full Staff (green) - Raise flag to top
  - Half Staff (amber) - Lower to middle position
  - Down (red) - Fully lowered
  - Auto (blue) - Device automatic control
- **Test Mode Toggle**: Enable test mode for testing without affecting live operations
- **Real-time Updates**: Polls status every 5 seconds
- **Pull to Refresh**: Manual refresh of flag status

### Visual Indicators

- Color-coded position badges (green/amber/red/blue)
- Arduino status indicators
- Half-staff directive alerts
- Device explanation text boxes
- Loading and submission states

## API Integration

The app communicates with your Base44 backend endpoint:

- `GET /` - Fetch current flag status
- `POST /` - Submit flag position request

Request body:
```json
{
  "request": "full|half|down|auto",
  "testmode": true|false,
  "request_id": "unique_id"
}
```

## Project Structure

```
/src/mobile/
  /screens/
    FlagControlScreen.tsx    # Main flag control UI
  /services/
    flagApi.ts               # API service layer
```

## Customization

### Styling

All styles are in StyleSheet objects within each component. Colors and spacing can be adjusted in the `styles` constants.

### Polling Interval

Default is 5 seconds. Modify in `FlagControlScreen.tsx`:
```typescript
const interval = setInterval(loadFlagStatus, 5000); // Change 5000 to desired ms
```

### API Timeout

Configure fetch timeouts in `flagApi.ts` if needed for slow connections.

## Troubleshooting

**API Connection Issues:**
- Verify `VITE_BASE44_API_ENDPOINT` is set correctly
- Check network connectivity
- Ensure Base44 backend is running

**Build Errors:**
- Clear cache: `yarn start --clear`
- Reinstall: `rm -rf node_modules && yarn install`

**Simulator Issues:**
- Reset iOS Simulator: Device → Erase All Content and Settings
- Reset Android Emulator: AVD Manager → Wipe Data

## License

MIT
