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
    <Card className="w-full max-w-md max-h-[calc(100dvh-12rem)] overflow-y-auto overscroll-contain border-slate-700 bg-slate-900 text-slate-100 shadow-xl">
      <CardHeader>
        <CardTitle className="text-slate-50">Pair Your Device</CardTitle>
        <CardDescription className="text-slate-300">
          Enter the pairing code displayed on your HonorPole device
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-8">
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
            <Label htmlFor="pairingCode" className="text-slate-100">Pairing Code</Label>
            <Input
              id="pairingCode"
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              required
              maxLength={9}
              className="border-slate-600 bg-slate-950 text-slate-50 placeholder:text-slate-500 focus-visible:ring-blue-500"
            />
            <p className="text-xs text-slate-400">
              Find this code on your device's display or setup screen
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deviceName" className="text-slate-100">Device Name</Label>
            <Input
              id="deviceName"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="Front Yard Flag Pole"
              required
              maxLength={80}
              className="border-slate-600 bg-slate-950 text-slate-50 placeholder:text-slate-500 focus-visible:ring-blue-500"
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 text-white hover:bg-blue-500 disabled:text-slate-300"
            disabled={loading}
          >
            {loading ? 'Pairing...' : 'Pair Device'}
          </Button>
        </form>

        <div className="mt-6 rounded-lg border border-blue-800 bg-blue-950/70 p-4">
          <h3 className="mb-2 text-sm font-semibold text-blue-200">
            How to get your pairing code:
          </h3>
          <ol className="list-inside list-decimal space-y-1 text-sm text-blue-100">
            <li>Connect your device to WiFi using the WiFi setup</li>
            <li>The device will display a pairing code</li>
            <li>Enter the code above to link the device to your account</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
