# Mobile App Setup Guide

This project now includes a mobile app that can be built for iOS and Android using React Native and Expo.

## Prerequisites

Before you can run the mobile app, you need to install the required dependencies:

```bash
yarn add expo expo-status-bar react-native react-native-web react-native-safe-area-context @react-navigation/native @react-navigation/native-stack react-native-screens react-native-gesture-handler
```

You also need to install dev dependencies:

```bash
yarn add -D @types/react-native babel-preset-expo
```

## Project Structure

The mobile app files are organized as follows:

- `App.native.tsx` - Main entry point for the mobile app
- `app.json` - Expo configuration
- `babel.config.js` - Babel configuration for React Native
- `metro.config.js` - Metro bundler configuration
- `src/mobile/` - Mobile-specific code
  - `screens/` - Screen components
    - `HomeScreen.tsx` - Home screen with feature list
    - `DetailsScreen.tsx` - Details screen for individual features
  - `components/` - Reusable mobile components (ready for your custom components)

## Running the Mobile App

### Development Mode

To start the Expo development server:

```bash
yarn start
```

This will open the Expo Developer Tools in your browser. From there you can:

- Press `i` to open iOS Simulator
- Press `a` to open Android Emulator
- Scan the QR code with the Expo Go app on your physical device

### iOS

To run on iOS Simulator (macOS only):

```bash
yarn ios
```

**Requirements:**
- macOS with Xcode installed
- iOS Simulator

### Android

To run on Android Emulator:

```bash
yarn android
```

**Requirements:**
- Android Studio installed
- Android Emulator configured

### Physical Devices

1. Install the Expo Go app on your device:
   - iOS: Download from the App Store
   - Android: Download from Google Play Store

2. Run `yarn start` on your computer

3. Scan the QR code with:
   - iOS: Use the Camera app
   - Android: Use the Expo Go app

## Building for Production

### iOS (macOS required)

```bash
# Build iOS app
expo build:ios
```

This will create a production build that can be submitted to the Apple App Store.

### Android

```bash
# Build Android APK
expo build:android -t apk

# Or build Android App Bundle (recommended for Play Store)
expo build:android -t app-bundle
```

## Configuration

### App Identity

Edit `app.json` to configure your app:

- `name`: The display name of your app
- `slug`: URL-friendly name
- `bundleIdentifier` (iOS): Unique identifier (e.g., com.yourcompany.appname)
- `package` (Android): Unique package name (e.g., com.yourcompany.appname)

### Icons and Splash Screen

Place your assets in the `public/` directory:

- `icon.png` - App icon (1024x1024px)
- `splash.png` - Splash screen image
- `favicon.ico` - Web favicon

## Environment Variables

Mobile apps can access environment variables prefixed with `VITE_`:

```
VITE_API_URL=https://api.example.com
VITE_APP_NAME=My Mobile App
```

Access them in your code:

```typescript
const apiUrl = import.meta.env.VITE_API_URL;
```

## Adding Native Modules

To add native functionality:

```bash
# Example: Add camera support
expo install expo-camera

# Example: Add location services
expo install expo-location
```

## Debugging

- Use React Native Debugger
- Enable Chrome DevTools via the Expo Developer Menu
- View logs with `yarn start` in the terminal

## Troubleshooting

### Metro Bundler Issues

```bash
# Clear cache and restart
expo start -c
```

### Build Errors

```bash
# Clean and reinstall dependencies
rm -rf node_modules
yarn install
```

### iOS Simulator Not Opening

- Make sure Xcode is installed
- Open Xcode and accept the license agreement
- Check that the iOS Simulator is properly configured

### Android Emulator Not Starting

- Open Android Studio
- Go to AVD Manager and ensure you have at least one virtual device configured
- Start the emulator before running `yarn android`

## Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [React Navigation Documentation](https://reactnavigation.org/)

## Next Steps

1. Install the required dependencies listed in the Prerequisites section
2. Customize the screens in `src/mobile/screens/`
3. Add your own components in `src/mobile/components/`
4. Update the app configuration in `app.json`
5. Replace the placeholder icons and splash screen
6. Add your business logic and API integrations
7. Test on both iOS and Android devices
8. Build and deploy to the App Store and Google Play Store
