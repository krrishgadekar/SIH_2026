import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { Routes } from './routes';
import { Colors, Typography, Spacing } from '../theme';

// Screens
import HomeScreen               from '../screens/HomeScreen';
import PatientRegistrationScreen from '../screens/PatientRegistrationScreen';
import CaptureScreen            from '../screens/CaptureScreen';
import QualityResultScreen      from '../screens/QualityResultScreen';
import CaptureMetadataScreen    from '../screens/CaptureMetadataScreen';
import QuestionnaireScreen      from '../screens/QuestionnaireScreen';
import ProcessingScreen         from '../screens/ProcessingScreen';
import ResultScreen             from '../screens/ResultScreen';
import ExplainabilityScreen     from '../screens/ExplainabilityScreen';
import ReportScreen             from '../screens/ReportScreen';
import HistoryScreen            from '../screens/HistoryScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '◉',
    History: '☰',
  };
  return (
    <View style={[styles.tabIconBox, focused && styles.tabIconBoxActive]}>
      <Text style={[styles.tabIconText, focused && styles.tabIconTextActive]}>
        {icons[name] ?? '·'}
      </Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused }) => (
          <TabIcon name={route.name} focused={focused} />
        ),
      })}
    >
      <Tab.Screen name={Routes.Home}    component={HomeScreen}    options={{ title: 'HOME' }} />
      <Tab.Screen name={Routes.History} component={HistoryScreen} options={{ title: 'HISTORY' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: Colors.surface,
          },
          headerTintColor: Colors.textPrimary,
          headerTitleStyle: {
            fontSize: Typography.sm,
            fontWeight: Typography.bold,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: Colors.background },
          headerBackTitleVisible: false,
        }}
      >
        {/* Tab root */}
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ headerShown: false }}
        />

        {/* Screening flow */}
        <Stack.Screen
          name={Routes.PatientRegistration}
          component={PatientRegistrationScreen}
          options={{ title: 'PATIENT DETAILS' }}
        />
        <Stack.Screen
          name={Routes.Capture}
          component={CaptureScreen}
          options={{ title: 'CAPTURE IMAGE' }}
        />
        <Stack.Screen
          name={Routes.QualityResult}
          component={QualityResultScreen}
          options={{ title: 'IMAGE QUALITY' }}
        />
        <Stack.Screen
          name={Routes.CaptureMetadata}
          component={CaptureMetadataScreen}
          options={{ title: 'CAPTURE METADATA' }}
        />
        <Stack.Screen
          name={Routes.Questionnaire}
          component={QuestionnaireScreen}
          options={{ title: 'CLINICAL QUESTIONS' }}
        />
        <Stack.Screen
          name={Routes.Processing}
          component={ProcessingScreen}
          options={{ title: 'ANALYSING…', headerBackVisible: false }}
        />
        <Stack.Screen
          name={Routes.Result}
          component={ResultScreen}
          options={{ title: 'SCREENING RESULT', headerBackVisible: false }}
        />
        <Stack.Screen
          name={Routes.Explainability}
          component={ExplainabilityScreen}
          options={{ title: 'IMAGE ANALYSIS' }}
        />
        <Stack.Screen
          name={Routes.Report}
          component={ReportScreen}
          options={{ title: 'SCREENING REPORT' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 60,
    paddingBottom: 8,
  },
  tabLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: 2,
  },
  tabIconBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 0,
  },
  tabIconBoxActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaded,
  },
  tabIconText: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  tabIconTextActive: {
    color: Colors.primary,
  },
});
