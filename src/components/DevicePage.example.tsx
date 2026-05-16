import { useParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useDeviceRealtimePage } from '../hooks/useDeviceRealtimePage';
import { heartbeatOnline } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';

/**
 * Example device page component demonstrating the optimized useDeviceRealtimePage hook
 *
 * Key improvements:
 * 1. Proper dependency arrays (no eslint-disable needed)
 * 2. Race condition prevention with AbortController
 * 3. Optimized updates - only reload changed tables
 * 4. Loading and error states
 * 5. Component unmount cleanup
 */
export default function DevicePageExample() {
  const { deviceId } = useParams<{ deviceId: string }>();

  // Use the optimized hook
  const {
    data,
    isLoading,
    error,
    reloadAll,
    // Individual reload functions available if needed
    reloadCommands,
    reloadHeartbeat,
  } = useDeviceRealtimePage(supabase, deviceId || '');

  if (!deviceId) {
    return (
      <Alert className="m-4">
        <AlertDescription>No device ID provided</AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert className="m-4 bg-red-50 border-red-200">
        <AlertDescription className="text-red-800">
          Error loading device data: {error.message}
        </AlertDescription>
        <Button onClick={reloadAll} className="mt-2">
          Retry
        </Button>
      </Alert>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading device data...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { device, directive, calibration, heartbeat, commands, results } = data;

  // Calculate online status from heartbeat
  const { online, ageSec } = heartbeatOnline(heartbeat?.created_at, 90);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Device Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Device Status</CardTitle>
              <Badge className={online ? 'bg-green-500' : 'bg-gray-400'}>
                {online ? 'Online' : 'Offline'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {device ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Device ID</p>
                  <p className="font-medium">{device.device_id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Connection Status</p>
                  <p className="font-medium">
                    {online ? (
                      <span className="text-green-600">
                        Connected ({ageSec !== null ? `${ageSec}s ago` : 'just now'})
                      </span>
                    ) : (
                      <span className="text-gray-600">
                        {ageSec !== null ? `Offline (${ageSec}s ago)` : 'No heartbeat'}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Last Heartbeat</p>
                  <p className="font-medium">
                    {heartbeat?.created_at ? new Date(heartbeat.created_at).toLocaleString() : 'Never'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">State</p>
                  <p className="font-medium">{device.state || 'Unknown'}</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">No device data available</p>
            )}
          </CardContent>
        </Card>

        {/* Current Directive Card */}
        <Card>
          <CardHeader>
            <CardTitle>Current Directive</CardTitle>
          </CardHeader>
          <CardContent>
            {directive ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Position</span>
                  <span className="font-medium">{directive.position || 'None'}</span>
                </div>
                {directive.federal_active && (
                  <Alert className="bg-purple-50 border-purple-200">
                    <AlertDescription className="text-purple-800">
                      <strong>Federal Directive:</strong> {directive.federal_reason}
                    </AlertDescription>
                  </Alert>
                )}
                {directive.state_active && (
                  <Alert className="bg-amber-50 border-amber-200">
                    <AlertDescription className="text-amber-800">
                      <strong>State Directive:</strong> {directive.state_reason}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <p className="text-gray-500">No active directive</p>
            )}
          </CardContent>
        </Card>

        {/* Calibration Card */}
        <Card>
          <CardHeader>
            <CardTitle>Calibration</CardTitle>
          </CardHeader>
          <CardContent>
            {calibration ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Travel Time (Full)</span>
                  <span className="font-medium">{calibration.travel_ms_full || 0} ms</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Last Calibrated</span>
                  <span className="font-medium">
                    {calibration.last_calibrated_at
                      ? new Date(calibration.last_calibrated_at).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">Not calibrated</p>
            )}
          </CardContent>
        </Card>

        {/* Latest Heartbeat Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Latest Heartbeat</CardTitle>
              <Button onClick={reloadHeartbeat} variant="outline" size="sm">
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {heartbeat ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Timestamp</span>
                  <span className="font-medium">
                    {new Date(heartbeat.created_at).toLocaleString()}
                  </span>
                </div>
                {heartbeat.data && (
                  <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">
                    {JSON.stringify(heartbeat.data, null, 2)}
                  </pre>
                )}
              </div>
            ) : (
              <p className="text-gray-500">No heartbeat received yet</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Commands Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Commands</CardTitle>
              <Button onClick={reloadCommands} variant="outline" size="sm">
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {commands && commands.length > 0 ? (
              <div className="space-y-2">
                {commands.slice(0, 10).map((cmd: any) => (
                  <div
                    key={cmd.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded"
                  >
                    <div>
                      <p className="font-medium">{cmd.command_type || 'Unknown'}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(cmd.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Badge
                      className={
                        cmd.status === 'completed'
                          ? 'bg-green-500'
                          : cmd.status === 'failed'
                          ? 'bg-red-500'
                          : 'bg-blue-500'
                      }
                    >
                      {cmd.status || 'pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No commands yet</p>
            )}
          </CardContent>
        </Card>

        {/* Command Results Card */}
        <Card>
          <CardHeader>
            <CardTitle>Command Results</CardTitle>
          </CardHeader>
          <CardContent>
            {results && results.length > 0 ? (
              <div className="space-y-2">
                {results.slice(0, 10).map((result: any) => (
                  <div key={result.id} className="p-3 bg-gray-50 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Command {result.command_id}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(result.created_at).toLocaleString()}
                      </span>
                    </div>
                    {result.result && (
                      <pre className="bg-white p-2 rounded text-xs overflow-auto">
                        {JSON.stringify(result.result, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No command results yet</p>
            )}
          </CardContent>
        </Card>

        {/* Manual Refresh Button */}
        <div className="flex justify-center">
          <Button onClick={reloadAll} disabled={isLoading}>
            {isLoading ? 'Reloading...' : 'Reload All Data'}
          </Button>
        </div>
      </div>
    </div>
  );
}
