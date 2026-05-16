# Arduino Cloud Integration Guide

This guide explains how to modify your Arduino firmware to connect to the cloud service for remote flag control.

## Overview

The cloud integration allows your HonorPole device to:
- Connect to the internet via WiFi
- Register with the cloud service
- Receive commands from anywhere in the world
- Report status back to the cloud
- Work offline and sync when connection is restored

## Architecture

```
Mobile App -> Cloud API -> Arduino Device
                ^              |
                |______________|
                  (bidirectional)
```

## Required Arduino Libraries

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
```

## Implementation Steps

### 1. WiFi Connection with Saved Credentials

```cpp
#include <Preferences.h>

Preferences preferences;

void setupWiFi() {
  preferences.begin("honorpole", false);

  String ssid = preferences.getString("wifi_ssid", "");
  String password = preferences.getString("wifi_password", "");

  if (ssid.length() > 0) {
    WiFi.begin(ssid.c_str(), password.c_str());

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
      delay(500);
      Serial.print(".");
      attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("WiFi connected!");
      Serial.println(WiFi.localIP());
    }
  }
}

void saveWiFiCredentials(String ssid, String password) {
  preferences.begin("honorpole", false);
  preferences.putString("wifi_ssid", ssid);
  preferences.putString("wifi_password", password);
  preferences.end();
}
```

### 2. Cloud Service Registration

```cpp
const char* CLOUD_API_ENDPOINT = "https://api.honorpole.cloud";
String deviceId = "";
String deviceToken = "";

void generatePairingCode() {
  // Generate a unique pairing code for the user
  String pairingCode = "";
  for (int i = 0; i < 4; i++) {
    pairingCode += String(random(0, 10));
  }
  pairingCode += "-";
  for (int i = 0; i < 4; i++) {
    pairingCode += String(random(0, 10));
  }

  // Display on OLED/LCD or Serial
  Serial.println("Pairing Code: " + pairingCode);

  // Store for registration
  preferences.putString("pairing_code", pairingCode);
}

bool registerWithCloud() {
  HTTPClient http;
  String pairingCode = preferences.getString("pairing_code", "");

  http.begin(String(CLOUD_API_ENDPOINT) + "/devices/pair");
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<200> doc;
  doc["pairingCode"] = pairingCode;
  doc["firmware"] = "1.0.0";
  doc["deviceType"] = "HonorPole";

  String requestBody;
  serializeJson(doc, requestBody);

  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode == 200) {
    String response = http.getString();

    StaticJsonDocument<512> responseDoc;
    deserializeJson(responseDoc, response);

    deviceId = responseDoc["deviceId"].as<String>();
    deviceToken = responseDoc["token"].as<String>();

    // Save credentials
    preferences.putString("device_id", deviceId);
    preferences.putString("device_token", deviceToken);

    http.end();
    return true;
  }

  http.end();
  return false;
}
```

### 3. Polling for Commands

```cpp
unsigned long lastCommandCheck = 0;
const unsigned long COMMAND_CHECK_INTERVAL = 5000; // 5 seconds

void checkForCommands() {
  if (millis() - lastCommandCheck < COMMAND_CHECK_INTERVAL) {
    return;
  }
  lastCommandCheck = millis();

  if (WiFi.status() != WL_CONNECTED) {
    return; // Skip if not connected
  }

  HTTPClient http;
  deviceId = preferences.getString("device_id", "");
  deviceToken = preferences.getString("device_token", "");

  http.begin(String(CLOUD_API_ENDPOINT) + "/devices/" + deviceId + "/commands/pending");
  http.addHeader("Authorization", "Bearer " + deviceToken);

  int httpResponseCode = http.GET();

  if (httpResponseCode == 200) {
    String response = http.getString();

    StaticJsonDocument<1024> doc;
    deserializeJson(doc, response);

    if (doc["hasCommand"].as<bool>()) {
      String command = doc["command"].as<String>();
      String commandId = doc["commandId"].as<String>();

      // Execute command
      executeCommand(command);

      // Acknowledge command execution
      acknowledgeCommand(commandId);
    }
  }

  http.end();
}

void executeCommand(String command) {
  if (command == "full") {
    moveFlagToPosition(FULL_STAFF);
  } else if (command == "half") {
    moveFlagToPosition(HALF_STAFF);
  } else if (command == "down") {
    moveFlagToPosition(DOWN);
  } else if (command == "auto") {
    enableAutoMode();
  }
}

void acknowledgeCommand(String commandId) {
  HTTPClient http;

  http.begin(String(CLOUD_API_ENDPOINT) + "/devices/" + deviceId + "/commands/" + commandId + "/ack");
  http.addHeader("Authorization", "Bearer " + deviceToken);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<200> doc;
  doc["status"] = "executed";
  doc["timestamp"] = millis();

  String requestBody;
  serializeJson(doc, requestBody);

  http.POST(requestBody);
  http.end();
}
```

### 4. Status Reporting

```cpp
unsigned long lastStatusUpdate = 0;
const unsigned long STATUS_UPDATE_INTERVAL = 10000; // 10 seconds

void reportStatus() {
  if (millis() - lastStatusUpdate < STATUS_UPDATE_INTERVAL) {
    return;
  }
  lastStatusUpdate = millis();

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  HTTPClient http;

  http.begin(String(CLOUD_API_ENDPOINT) + "/devices/" + deviceId + "/status");
  http.addHeader("Authorization", "Bearer " + deviceToken);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<512> doc;
  doc["currentPosition"] = getCurrentPositionString();
  doc["arduinoStatus"] = getArduinoStatus();
  doc["online"] = true;
  doc["timestamp"] = millis();

  // Add directive info if applicable
  if (federalDirectiveActive) {
    JsonObject federal = doc.createNestedObject("federalDirective");
    federal["active"] = true;
    federal["expiresAt"] = federalDirectiveExpires;
    federal["reason"] = federalDirectiveReason;
  }

  String requestBody;
  serializeJson(doc, requestBody);

  http.POST(requestBody);
  http.end();
}
```

### 5. Main Loop Integration

```cpp
void setup() {
  Serial.begin(115200);

  // Initialize preferences
  preferences.begin("honorpole", false);

  // Setup WiFi
  setupWiFi();

  // Check if already registered
  deviceId = preferences.getString("device_id", "");

  if (deviceId.length() == 0) {
    // Generate pairing code for first-time setup
    generatePairingCode();

    // Wait for registration (check periodically)
    while (!registerWithCloud()) {
      delay(5000);
    }
  }

  // Initialize motor, sensors, etc.
  setupMotor();
}

void loop() {
  // Check for cloud commands
  checkForCommands();

  // Report status to cloud
  reportStatus();

  // Handle local operations
  handleMotor();
  handleSensors();

  delay(100);
}
```

## Environment Variables

The cloud service requires the following environment variable:

- `VITE_CLOUD_API_ENDPOINT` - The cloud API endpoint URL (default: https://api.honorpole.cloud)

## Security Considerations

1. **Device Token**: Store the device token securely in Arduino preferences/EEPROM
2. **HTTPS**: Always use HTTPS for cloud communication
3. **Token Refresh**: Implement token refresh mechanism for long-term deployments
4. **Command Validation**: Always validate commands before execution

## Offline Operation

The device should:
- Continue operating in auto mode when offline
- Queue status updates and send when connection is restored
- Cache the last known directives

## Testing

1. Test WiFi connection with saved credentials
2. Verify pairing code generation and display
3. Test command reception and execution
4. Verify status reporting
5. Test offline/online transitions

## Troubleshooting

### Device Not Connecting to WiFi
- Verify WiFi credentials are saved correctly
- Check signal strength
- Ensure 2.4GHz network (ESP32 doesn't support 5GHz)

### Commands Not Received
- Verify device is registered with cloud
- Check device token validity
- Ensure internet connectivity
- Verify cloud API endpoint is correct

### Status Not Updating
- Check status reporting interval
- Verify internet connection
- Check device token authentication
