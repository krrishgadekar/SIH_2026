import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ScreeningProvider } from './src/context/ScreeningContext';
import { QueueProvider } from './src/context/QueueContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <QueueProvider>
        <ScreeningProvider>
          <AppNavigator />
        </ScreeningProvider>
      </QueueProvider>
    </SafeAreaProvider>
  );
}
