import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { cloudService } from '../services/cloudService';

function pairingErrorMessage(err: unknown, kind: 'pairing' | 'sharing'): string {
  const message = err instanceof Error ? err.message : '';
  const idGuidance = 'Enter the number on the device label, for example HP-002 or 2.';
  if (kind === 'pairing' && message === idGuidance) return idGuidance;

  const reportedStatus = err && typeof err === 'object' && 'status' in err
    ? Number(err.status) : 0;
  const status = reportedStatus || Number(message.match(/^\s*(\d{3})(?:\s|:)/)?.[1]);
  if (status === 401) return 'Please sign in again before trying this code.';
  if (status === 403) return 'Your account does not have permission to add this HonorPole.';
  if (status === 429) return 'Too many attempts. Please wait before trying again.';
  if (status >= 500 && status <= 599) {
    return 'The HonorPole service is temporarily unavailable. Please try again later.';
  }
  if (kind === 'sharing') {
    if ([400, 404, 409, 410].includes(status)) {
      return 'This share code is invalid, expired, already used, or belongs to your own account. Ask the owner for a new share code.';
    }
    return 'Unable to confirm shared access. Check your HonorPole list and connection before trying again.';
  }
  if (status === 400) return 'Check the device ID and pairing code, then try again.';
  if (status === 404) return 'Pairing code not recognized for this device. Check the ID and use the latest code from your installer.';
  if (status === 409) return 'This HonorPole has already been paired. Check your HonorPole list, or ask its owner to share access.';
  if (status === 410) return 'This pairing code has expired. Ask Honor Pole Innovations or your installer for a new code.';
  return 'Unable to confirm pairing. Check your HonorPole list and connection before trying again.';
}

interface DevicePairingProps {
  onPairingSuccess: (deviceId: string) => void;
}

export default function DevicePairing({ onPairingSuccess }: DevicePairingProps) {
  const [deviceIdInput, setDeviceIdInput] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [shareCode, setShareCode] = useState('');

  const handlePairing = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const digits = deviceIdInput.trim().toUpperCase().replace(/^HP-?/, '');
      if (!/^[0-9]{1,6}$/.test(digits) || Number(digits) < 1) {
        throw new Error('Enter the number on the device label, for example HP-002 or 2.');
      }
      const deviceId = `HP-${digits.padStart(3, '0')}`;
      const result = await cloudService.registerDevice(pairingCode.trim().toUpperCase(), deviceName, deviceId);
      setSuccess(`Device "${result.deviceName}" paired successfully!`);

      setTimeout(() => {
        onPairingSuccess(result.deviceId);
      }, 1500);
    } catch (err) {
      setError(pairingErrorMessage(err, 'pairing'));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const deviceId = await cloudService.joinSharedDevice(shareCode);
      setSuccess(`You can now control ${deviceId}.`);
      onPairingSuccess(deviceId);
    } catch (err) {
      setError(pairingErrorMessage(err, 'sharing'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md max-h-[calc(100dvh-12rem)] overflow-y-auto overscroll-contain border-slate-700 bg-slate-900 text-slate-100 shadow-xl">
      <CardHeader>
        <CardTitle className="text-slate-50">Pair Your Device</CardTitle>
        <CardDescription className="text-slate-300">
          Enter the ID on the device label and its pairing code. Repeat to add more devices.
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-8">
        {error && (
          <Alert className="mb-4 min-w-0 max-w-full bg-red-50 border-red-200">
            <AlertDescription className="min-w-0 whitespace-normal text-left text-red-800 [overflow-wrap:anywhere]">{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-4 min-w-0 max-w-full bg-green-50 border-green-200">
            <AlertDescription className="min-w-0 whitespace-normal text-left text-green-800 [overflow-wrap:anywhere]">{success}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handlePairing} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="deviceId" className="text-slate-100">Device ID</Label>
            <Input id="deviceId" value={deviceIdInput} onChange={(e) => setDeviceIdInput(e.target.value.toUpperCase())}
              placeholder="HP-002 (or 2)" required maxLength={9}
              className="border-slate-600 bg-slate-950 text-slate-50 placeholder:text-slate-500 focus-visible:ring-blue-500" />
          </div>
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
              Use the private pairing code supplied by Honor Pole Innovations or your installer. If it is missing or expired, contact them for assistance.
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

        <form onSubmit={handleJoin} className="mt-6 space-y-3 border-t border-slate-700 pt-5">
          <h3 className="font-semibold text-slate-100">Join a shared HonorPole</h3>
          <p className="text-sm text-slate-300">Already have a share code from the owner? Sign in with your own account and enter it here.</p>
          <Label htmlFor="shareCode" className="text-slate-100">Share code</Label>
          <Input id="shareCode" value={shareCode} onChange={e => setShareCode(e.target.value.toUpperCase())}
            placeholder="XXXXXX-XXXXXX-XXXXXX" maxLength={20} required
            className="border-slate-600 bg-slate-950 text-slate-50 placeholder:text-slate-500" />
          <Button type="submit" disabled={loading} className="w-full bg-slate-700 text-white hover:bg-slate-600">
            {loading ? 'Joining...' : 'Join HonorPole'}
          </Button>
        </form>

        <div className="mt-6 rounded-lg border border-blue-800 bg-blue-950/70 p-4">
          <h3 className="mb-2 text-sm font-semibold text-blue-200">
            Pair a new HonorPole with your account:
          </h3>
          <ol className="list-inside list-decimal space-y-1 text-sm text-blue-100">
            <li>Connect your pole to Wi-Fi using its private setup card</li>
            <li>Sign in to your own HonorPole account</li>
            <li>Manually enter the device ID from the label, the current private pairing code, and a name for your pole</li>
          </ol>
          <p className="mt-3 text-sm text-blue-100">
            The pairing code is different from the Wi-Fi setup-card password.
            For a pole that already belongs to someone else, arrange the account
            handover with the current owner. To use a share code, choose
            Join a shared HonorPole above.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
