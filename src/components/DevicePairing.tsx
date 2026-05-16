import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { cloudService } from '../services/cloudService';

interface DevicePairingProps {
  onPairingSuccess: (deviceId: string) => void;
}

export default function DevicePairing({ onPairingSuccess }: DevicePairingProps) {
  const [pairingCode, setPairingCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handlePairing = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await cloudService.registerDevice(pairingCode, deviceName);
      setSuccess(`Device "${result.deviceName}" paired successfully!`);

      setTimeout(() => {
        onPairingSuccess(result.deviceId);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pair device');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Pair Your Device</CardTitle>
        <CardDescription>
          Enter the pairing code displayed on your HonorPole device
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert className="mb-4 bg-red-50 border-red-200">
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-4 bg-green-50 border-green-200">
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handlePairing} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pairingCode">Pairing Code</Label>
            <Input
              id="pairingCode"
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              required
              maxLength={9}
            />
            <p className="text-xs text-gray-500">
              Find this code on your device's display or setup screen
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deviceName">Device Name</Label>
            <Input
              id="deviceName"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="Front Yard Flag Pole"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Pairing...' : 'Pair Device'}
          </Button>
        </form>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            How to get your pairing code:
          </h3>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Connect your device to WiFi using the WiFi setup</li>
            <li>The device will display a pairing code</li>
            <li>Enter the code above to link the device to your account</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
