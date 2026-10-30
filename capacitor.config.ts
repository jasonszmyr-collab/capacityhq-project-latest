import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.capacity.app',
  appName: 'HonorPole',
  webDir: 'dist',
  // Native bridge arguments can contain setup/recovery credentials.
  loggingBehavior: 'none',

  server: {
    androidScheme: 'https',
    cleartext: true
  },

  plugins: {
    Camera: {
      allowEditing: true,
      saveToGallery: false
    },
    Geolocation: {
      enableHighAccuracy: true
    }
  }
};

export default config;


