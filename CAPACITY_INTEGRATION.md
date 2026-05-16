# Capacity AI Integration

This document describes the Capacity AI integration for natural language device control.

## Overview

The Capacity integration allows users to control devices using natural language commands through the Capacity.com AI API. Users can type commands like "raise the flag to full staff" or "lower the flag halfway" instead of clicking buttons.

## Files Created

### 1. `/src/services/capacityService.ts`
The core service that handles communication with the Capacity API.

**Key Features:**
- API configuration check
- Natural language command processing
- Response parsing to extract command intent
- Error handling with descriptive messages
- TypeScript types for request/response data

**Main Functions:**
- `sendCommand()` - Send natural language command to Capacity API
- `parseCommandIntent()` - Parse AI response to extract action (full/half/down/auto)
- `interpretCommand()` - Combined function that sends and parses in one call

### 2. `/src/components/CapacityCommandInput.tsx`
React component providing the UI for natural language command input.

**Key Features:**
- Text input for natural language commands
- Real-time feedback on command interpretation
- Loading states during API calls
- Error handling and display
- Device context awareness (online status, current position)
- Example commands to guide users
- Integration with device control callbacks

**Props:**
- `deviceId` - Current device identifier
- `deviceName` - Human-readable device name
- `currentPosition` - Current flag position
- `online` - Device online status
- `onCommandParsed` - Callback when command is successfully interpreted
- `onError` - Callback for error handling
- `disabled` - Disable input when needed

### 3. Updated `/src/components/CloudDeviceControl.tsx`
Integrated the Capacity command input into the existing cloud control interface.

## Configuration

The integration requires the `VITE_CAPACITY_API_KEY` environment variable to be set.

```bash
VITE_CAPACITY_API_KEY=your_api_key_here
```

Get your API key from https://capacity.com

## Usage Example

```typescript
import { capacityService } from '../services/capacityService';

// Send a natural language command
const { intent, response } = await capacityService.interpretCommand(
  'raise the flag to full staff',
  {
    device_id: 'device-123',
    device_name: 'Main Flagpole',
    current_position: 'half'
  }
);

if (intent) {
  // Execute the command: 'full', 'half', 'down', or 'auto'
  executeCommand(intent);
}
```

## Component Integration

```tsx
import CapacityCommandInput from './CapacityCommandInput';

<CapacityCommandInput
  deviceId={deviceId}
  deviceName={deviceName}
  currentPosition={currentPosition}
  online={isOnline}
  onCommandParsed={(command) => {
    // Handle the parsed command
    handleDeviceCommand(command);
  }}
  onError={(error) => {
    // Handle errors
    console.error(error);
  }}
/>
```

## Supported Commands

The AI can interpret various natural language phrases:

- **Full Staff**: "raise the flag", "full staff", "raise to full", "put flag up"
- **Half Staff**: "half staff", "half mast", "lower halfway", "middle position"
- **Down**: "lower the flag", "put flag down", "bring it down"
- **Auto**: "automatic mode", "auto", "switch to auto"

## Error Handling

The integration includes comprehensive error handling:

1. **Missing API Key**: Displays configuration message
2. **Network Errors**: Shows user-friendly error messages
3. **Unrecognized Commands**: Provides suggestions for valid commands
4. **Device Offline**: Prevents command submission with clear notification

## Security Considerations

- API key is stored in environment variables (not in code)
- All API requests use Bearer token authentication
- Input validation prevents empty commands
- Error messages don't expose sensitive information

## Testing

TypeScript compilation has been verified with no errors in the integration files:
- `src/services/capacityService.ts`
- `src/components/CapacityCommandInput.tsx`
- `src/components/CloudDeviceControl.tsx`

## Future Enhancements

Potential improvements for future development:

1. Command history and suggestions
2. Voice input integration
3. Multi-language support
4. Advanced command scheduling ("raise flag at sunrise")
5. Batch commands ("raise all flags to half staff")
6. Command confirmation for critical actions
