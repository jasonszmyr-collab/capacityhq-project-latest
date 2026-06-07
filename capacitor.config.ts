import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.capacity.app',
  appName: 'HonorPole',
  webDir: 'dist',

  server: {
    cleartext: true
  },

  plugins: {
    Camera: {
      allowEditing: true,
      saveToGallery: false
    },
    Geolocation: {
      enableHighAccuracy: true
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;



