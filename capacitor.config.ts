import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.capacity.app',
  appName: 'HonorPole',
  webDir: 'dist',

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


