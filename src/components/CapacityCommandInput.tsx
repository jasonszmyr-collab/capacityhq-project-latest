import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { capacityService, type CapacityCommandMetadata } from '../services/capacityService';

export interface CapacityCommandInputProps {
  deviceId?: string;
  deviceName?: string;
  currentPosition?: string;
  online?: boolean;
  onCommandParsed?: (command: 'full' | 'half' | 'down' | 'auto') => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

/**
 * Natural Language Command Input Component
 * Allows users to control devices using natural language via Capacity AI
 */
export default function CapacityCommandInput({
  deviceId,
  deviceName,
  currentPosition,
  online = true,
  onCommandParsed,
  onError,
  disabled = false,
}: CapacityCommandInputProps) {
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsedIntent, setParsedIntent] = useState<'full' | 'half' | 'down' | 'auto' | null>(null);

  const isConfigured = capacityService.isConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!command.trim()) {
      setError('Please enter a command');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setParsedIntent(null);

    try {
      const metadata: CapacityCommandMetadata = {
        device_id: deviceId,
        device_name: deviceName,
        current_position: currentPosition,
        online,
      };

      const { intent, response } = await capacityService.interpretCommand(command, metadata);

      setParsedIntent(intent);

      if (response.answer) {
        setResult(response.answer);
      }

      if (intent && onCommandParsed) {
        onCommandParsed(intent);
      } else if (!intent) {
        setError('Could not interpret command. Try phrases like "raise flag to full staff" or "lower flag halfway"');
        if (onError) {
          onError('Command not recognized');
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process command';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Command Control</CardTitle>
          <CardDescription>Natural language control powered by Capacity AI</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="bg-amber-50 border-amber-200">
            <AlertDescription className="text-amber-800">
              Capacity AI is not configured. Please set your VITE_CAPACITY_API_KEY environment variable to enable natural language commands.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>AI Command Control</CardTitle>
            <CardDescription>
              Tell the system what to do in natural language
            </CardDescription>
          </div>
          <Badge className="bg-purple-500">AI Powered</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="e.g., 'raise the flag to full staff' or 'lower flag halfway'"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={loading || disabled || !online}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={loading || disabled || !online || !command.trim()}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {loading ? 'Processing...' : 'Send'}
            </Button>
          </div>

          {!online && (
            <Alert className="bg-yellow-50 border-yellow-200">
              <AlertDescription className="text-yellow-800">
                Device is offline. Please wait for device to reconnect before sending commands.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert className="bg-red-50 border-red-200">
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-blue-800">
                <strong>AI Response:</strong> {result}
              </AlertDescription>
            </Alert>
          )}

          {parsedIntent && (
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">
                <strong>Command Interpreted:</strong> {parsedIntent.toUpperCase()}
                {onCommandParsed && ' - Executing...'}
              </AlertDescription>
            </Alert>
          )}

          <div className="text-xs text-gray-500">
            <p className="font-medium mb-1">Example commands:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Raise the flag to full staff</li>
              <li>Lower the flag to half mast</li>
              <li>Put the flag down</li>
              <li>Switch to automatic mode</li>
            </ul>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
