/**
 * Location Service
 * Provides device location information (state, city, coordinates)
 * This data is sent to the backend/Arduino for compliance decision-making
 */

export interface LocationData {
  latitude: number;
  longitude: number;
  state: string | null;
  city: string | null;
  accuracy: number | null;
  timestamp: string;
}

export interface LocationServiceState {
  location: LocationData | null;
  loading: boolean;
  error: string | null;
}

/**
 * Get current device location
 * In a production app, this would use native geolocation APIs
 * For now, returns mock data that can be configured
 */
export async function getCurrentLocation(): Promise<LocationData> {
  // Mock implementation - replace with actual geolocation in production
  // Use expo-location or React Native Geolocation API

  // Simulating location fetch delay
  await new Promise(resolve => setTimeout(resolve, 500));

  return {
    latitude: 38.9072,
    longitude: -77.0369,
    state: 'DC',
    city: 'Washington',
    accuracy: 10,
    timestamp: new Date().toISOString()
  };
}

/**
 * Reverse geocode coordinates to get state/city
 * In production, use a geocoding service like Google Maps API
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<{ state: string | null; city: string | null }> {
  // Mock implementation - replace with actual reverse geocoding service

  await new Promise(resolve => setTimeout(resolve, 300));

  // Example mapping (in production, use real geocoding service)
  return {
    state: 'DC',
    city: 'Washington'
  };
}

/**
 * Watch location changes
 * Returns a cleanup function to stop watching
 */
export function watchLocation(
  callback: (location: LocationData) => void,
  errorCallback?: (error: Error) => void
): () => void {
  // Mock implementation - replace with actual location watching
  // Use expo-location's watchPositionAsync or similar

  const interval = setInterval(async () => {
    try {
      const location = await getCurrentLocation();
      callback(location);
    } catch (error) {
      if (errorCallback) {
        errorCallback(error as Error);
      }
    }
  }, 30000); // Update every 30 seconds

  // Return cleanup function
  return () => clearInterval(interval);
}
