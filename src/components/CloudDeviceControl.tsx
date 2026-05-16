import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { cloudService, type DeviceInfo, type DeviceStatus } from '../services/cloudService';
import { supabase } from '../services/supabaseClient';
import { subscribeDevicePageRealtime } from '../services/subscribeDevicePageRealtime';
import CapacityCommandInput from './CapacityCommandInput';

export default function CloudDeviceControl() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    if (!selectedDevice) return;

    // Load initial device status
    loadDeviceStatus(selectedDevice);

    // Set up real-time subscription for the selected device
    const { unsubscribe } = subscribeDevicePageRealtime({
      supabase,
      deviceId: selectedDevice,
      onDevices: () => {
        // Reload device info when device status changes
        loadDevices();
      },
      onDirective: () => {
        // Reload device status when directives change
        loadDeviceStatus(selectedDevice);
      },
      onCommands: () => {
        // Reload device status when commands change
        loadDeviceStatus(selectedDevice);
      },
      onResults: () => {
        // Reload device status when command results change
        loadDeviceStatus(selectedDevice);
      },
      onHeartbeat: () => {
        // Reload device status on heartbeat
        loadDeviceStatus(selectedDevice);
      },
      onCalibration: () => {
        // Reload device status when calibration changes
        loadDeviceStatus(selectedDevice);
      },
    });

    // Clean up subscription when device changes or component unmounts
    return () => {
      unsubscribe();
    };
    // Note: loadDeviceStatus and loadDevices are stable functions defined in this component
    // If they were useCallback, we'd need to include them in deps
  }, [selectedDevice]);

  const loadDevices = async () => {
    try {
      const deviceList = await cloudService.getDevices();
      setDevices(deviceList);

      if (deviceList.length > 0 && !selectedDevice) {
        setSelectedDevice(deviceList[0].deviceId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    }
  };

  const loadDeviceStatus = async (deviceId: string) => {
    try {
      const status = await cloudService.getDeviceStatus(deviceId);
      setDeviceStatus(status);
    } catch (err) {
      console.error('Failed to load device status:', err);
    }
  };

  const handleCommand = async (command: 'full' | 'half' | 'down' | 'auto') => {
    if (!selectedDevice) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await cloudService.sendCommand(selectedDevice, command);
      setSuccess(`Command "${command}" sent successfully!`);
      await loadDeviceStatus(selectedDevice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send command');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    cloudService.clearAuth();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Cloud Control</h1>
            <p className="text-gray-600">Control your flag pole from anywhere in the world</p>
          </div>
          <Button onClick={handleLogout} variant="outline">
            Logout
          </Button>
        </div>

        {error && (
          <Alert className="mb-6 bg-red-50 border-red-200">
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Device List */}
          <Card>
            <CardHeader>
              <CardTitle>My Devices</CardTitle>
              <CardDescription>Select a device to control</CardDescription>
            </CardHeader>
            <CardContent>
              {devices.length === 0 ? (
                <p className="text-sm text-gray-500">No devices paired yet</p>
              ) : (
                <div className="space-y-2">
                  {devices.map((device) => (
                    <button
                      key={device.deviceId}
                      onClick={() => setSelectedDevice(device.deviceId)}
                      className={`w-full p-3 rounded-lg border text-left transition-colors ${
                        selectedDevice === device.deviceId
                          ? 'bg-blue-50 border-blue-500'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{device.deviceName}</span>
                        <Badge className={device.online ? 'bg-green-500' : 'bg-gray-400'}>
                          {device.online ? 'Online' : 'Offline'}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500">
                        Last seen: {new Date(device.lastSeen).toLocaleString()}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Control Panel */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Device Control</CardTitle>
              <CardDescription>
                {selectedDevice
                  ? `Control ${devices.find((d) => d.deviceId === selectedDevice)?.deviceName}`
                  : 'Select a device to begin'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedDevice ? (
                <div className="space-y-6">
                  {/* Status Display */}
                  {deviceStatus && (
                    <div className="p-4 bg-gray-100 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status:</span>
                        <Badge className={deviceStatus.online ? 'bg-green-500' : 'bg-gray-400'}>
                          {deviceStatus.arduinoStatus}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Current Position:</span>
                        <span className="text-sm font-semibold">{deviceStatus.currentPosition}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Last update: {new Date(deviceStatus.lastUpdate).toLocaleString()}
                      </div>

                      {deviceStatus.federalDirective?.active && (
                        <div className="mt-3 p-3 bg-purple-50 rounded-md">
                          <p className="text-xs font-semibold text-purple-900">Federal Directive Active</p>
                          <p className="text-sm text-purple-800">{deviceStatus.federalDirective.reason}</p>
                        </div>
                      )}

                      {deviceStatus.stateDirective?.active && (
                        <div className="mt-3 p-3 bg-amber-50 rounded-md">
                          <p className="text-xs font-semibold text-amber-900">State Directive Active</p>
                          <p className="text-sm text-amber-800">{deviceStatus.stateDirective.reason}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI Command Input */}
                  <CapacityCommandInput
                    deviceId={selectedDevice}
                    deviceName={devices.find((d) => d.deviceId === selectedDevice)?.deviceName}
                    currentPosition={deviceStatus.currentPosition}
                    online={deviceStatus.online}
                    onCommandParsed={(command) => {
                      handleCommand(command);
                    }}
                    onError={(error) => {
                      setError(error);
                    }}
                    disabled={loading}
                  />

                  {/* Control Buttons */}
                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      onClick={() => handleCommand('full')}
                      disabled={loading || !deviceStatus?.online}
                      className="h-20 text-lg bg-green-600 hover:bg-green-700"
                    >
                      Full Staff
                    </Button>
                    <Button
                      onClick={() => handleCommand('half')}
                      disabled={loading || !deviceStatus?.online}
                      className="h-20 text-lg bg-amber-600 hover:bg-amber-700"
                    >
                      Half Staff
                    </Button>
                    <Button
                      onClick={() => handleCommand('down')}
                      disabled={loading || !deviceStatus?.online}
                      className="h-20 text-lg bg-red-600 hover:bg-red-700"
                    >
                      Down
                    </Button>
                    <Button
                      onClick={() => handleCommand('auto')}
                      disabled={loading || !deviceStatus?.online}
                      className="h-20 text-lg bg-blue-600 hover:bg-blue-700"
                    >
                      Auto Mode
                    </Button>
                  </div>

                  {!deviceStatus?.online && (
                    <Alert className="bg-yellow-50 border-yellow-200">
                      <AlertDescription className="text-yellow-800">
                        Device is offline. Commands will be queued and executed when device comes online.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="text-center text-sm text-gray-500">
                    Real-time updates via Supabase
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <p>Select a device from the list to begin controlling it</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
