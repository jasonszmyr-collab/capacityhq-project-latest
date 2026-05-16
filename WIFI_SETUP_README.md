# WiFi Provisioning App

This application has been rewritten to handle WiFi connectivity and provisioning for devices like HonorPole-Setup. It provides a complete solution for connecting to WiFi networks, loading local network addresses, and submitting SSID/password credentials.

## Features

### 1. WiFi Network Management
- **Network Scanning**: Scan for available WiFi networks
- **Network Status**: Real-time monitoring of current WiFi connection
- **Network Selection**: Choose from available networks or enter custom SSID
- **Signal Strength**: View network signal strength and security status

### 2. HonorPole Device Configuration
- **HonorPole-Setup Detection**: Automatically detect when connected to HonorPole-Setup network
- **Setup Interface Access**: Load and access http://192.168.4.1 setup interface
- **Credential Submission**: Submit WiFi SSID and password to HonorPole device
- **Connection Testing**: Test connectivity to HonorPole setup interface

### 3. WiFi Provisioning
- **Automatic Provisioning**: Submit credentials directly to devices
- **Local Storage**: Save WiFi credentials securely
- **Network Change Detection**: Listen for network status changes in real-time

## Application Routes

The app includes the following pages:

- `/` - **Home Page**: Landing page with navigation to all features
- `/honorpole` - **HonorPole Setup**: Dedicated page for HonorPole device configuration
- `/wifi` - **WiFi Manager**: General WiFi network management and provisioning
- `/test` - **Flag Control Test**: Original flag position control functionality

## How It Works

### HonorPole Setup Workflow

1. **Connect to HonorPole-Setup Network**
   - User manually connects their device to the "HonorPole-Setup" WiFi network
   - App automatically detects the connection

2. **Access Setup Interface**
   - App provides direct link to http://192.168.4.1
   - User can open the interface in a new tab or load it directly

3. **Submit WiFi Credentials**
   - User enters target WiFi network SSID and password
   - App submits credentials to HonorPole device via POST request to http://192.168.4.1/wifi
   - Credentials are sent as form data: `ssid` and `password`

4. **Device Configuration**
   - HonorPole device receives credentials
   - Device restarts and connects to the target WiFi network
   - User can then access the device through their home network

## Technical Implementation

### Services

**`src/services/wifiService.ts`**
- WiFi network management service
- Handles network status monitoring using Capacitor Network API
- Manages WiFi credentials storage using Capacitor Preferences
- Provides methods for:
  - Network status checking
  - HonorPole connection detection
  - Credential submission
  - Setup interface access
  - Connection testing

### Components

**`src/components/HonorPoleConfig.tsx`**
- Dedicated HonorPole configuration interface
- Features:
  - Connection status display
  - Setup interface access (http://192.168.4.1)
  - WiFi credential submission form
  - Connection testing
  - Step-by-step instructions

**`src/components/WiFiSetup.tsx`**
- General WiFi management interface
- Features:
  - Network scanning and selection
  - Signal strength indicators
  - Custom SSID entry
  - Credential storage
  - Real-time network status updates

**`src/components/HomePage.tsx`**
- Updated landing page with navigation to:
  - HonorPole Setup
  - WiFi Manager
  - Flag Control Test (legacy)

## Dependencies

The app uses these Capacitor plugins:

- `@capacitor/core` (^6.2.0) - Core Capacitor functionality
- `@capacitor/network` (^6.0.2) - Network status and monitoring
- `@capacitor/preferences` (^6.0.2) - Secure local storage

## API Endpoints

### HonorPole Device API

**POST http://192.168.4.1/wifi**
- Content-Type: `application/x-www-form-urlencoded`
- Body parameters:
  - `ssid` - Target WiFi network name
  - `password` - WiFi network password
- Response: Success/failure indication

**GET http://192.168.4.1**
- Access the HonorPole web-based setup interface
- Returns HTML configuration portal

## Usage Instructions

### For End Users

1. **To Configure HonorPole Device:**
   - Go to WiFi settings on your phone/device
   - Connect to "HonorPole-Setup" network
   - Open the app and navigate to "HonorPole Setup"
   - Test connection to verify connectivity
   - Enter your home WiFi credentials
   - Submit the credentials
   - Wait for device to restart and connect to your network

2. **To Manage WiFi Networks:**
   - Open the app and navigate to "WiFi Manager"
   - Scan for available networks
   - Select a network or enter custom SSID
   - Enter password
   - Save configuration

### For Developers

#### Building the App

```bash
# Install dependencies
npm install

# Build for web
npm run build

# Build with Docker
docker build -t wifi-provisioning-app .
docker run -p 80:80 wifi-provisioning-app
```

#### Deploying to Mobile

The app is built with Capacitor and can be deployed to iOS and Android:

```bash
# Initialize Capacitor (if not already done)
npx cap init

# Add platforms
npx cap add ios
npx cap add android

# Sync web assets to native platforms
npx cap sync

# Open in native IDE
npx cap open ios
npx cap open android
```

## Network Requirements

- For HonorPole setup, the device must be connected to "HonorPole-Setup" network
- The setup interface is accessible at the default gateway (192.168.4.1)
- No internet connection is required during provisioning
- The HonorPole device creates an access point during setup mode

## Security Considerations

- WiFi passwords are transmitted over local network only (no internet)
- Credentials are stored locally using Capacitor Preferences (encrypted on native platforms)
- HonorPole-Setup network is typically unencrypted for easy initial connection
- After provisioning, device connects to secured home network

## Browser Compatibility

The web version works in modern browsers but has limitations:
- Cannot directly connect to WiFi networks (browser security restriction)
- Cannot scan for networks (requires native implementation)
- Can load setup interfaces and submit credentials via HTTP

For full functionality, deploy to native mobile platforms using Capacitor.

## Troubleshooting

**Cannot connect to HonorPole-Setup:**
- Verify you're connected to the correct network in system WiFi settings
- Check that the device is in setup mode
- Try refreshing the network status in the app

**Cannot access http://192.168.4.1:**
- Ensure you're connected to HonorPole-Setup network
- Try opening the URL directly in a browser
- Check that the device is powered on and in setup mode
- Verify there are no VPN or proxy settings interfering

**Credential submission fails:**
- Verify you're connected to HonorPole-Setup
- Check that SSID and password are correct
- Ensure target network is available in the area
- Try accessing the setup interface directly to verify device is responsive

## Future Enhancements

Potential improvements for the app:

- Native WiFi scanning implementation for mobile platforms
- Direct WiFi connection capability (requires native plugins)
- Bluetooth provisioning as alternative to WiFi setup
- QR code scanning for credential entry
- Network diagnostics and troubleshooting tools
- Multi-device management
- Saved network profiles
- Automatic device discovery on home network after provisioning

## Support

For issues or questions:
- Check the HonorPole firmware documentation
- Verify network connectivity
- Review browser console for error messages
- Ensure Capacitor plugins are properly installed for native builds
