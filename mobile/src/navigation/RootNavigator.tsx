import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../state/AuthContext';
import { LoadingView } from '../components';
import { colors, font } from '../theme';
import { linking } from './linking';
import type { RootStackParamList, TabParamList } from './types';

import { LoginScreen } from '../screens/LoginScreen';
import { ServerSettingsScreen } from '../screens/ServerSettingsScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { GamesScreen } from '../screens/GamesScreen';
import { GameDetailScreen } from '../screens/GameDetailScreen';
import { GameEditorScreen } from '../screens/GameEditorScreen';
import { AddExpenseScreen } from '../screens/AddExpenseScreen';
import { PlayersScreen } from '../screens/PlayersScreen';
import { PlayerDetailScreen } from '../screens/PlayerDetailScreen';
import { AddPlayerScreen } from '../screens/AddPlayerScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ChangePasswordScreen } from '../screens/ChangePasswordScreen';
import { ManageRosterScreen } from '../screens/ManageRosterScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.felt,
    background: colors.background,
    card: colors.surface,
    text: colors.ink,
    border: colors.line,
  },
};

const TAB_ICONS: Record<keyof TabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Home: { on: 'home', off: 'home-outline' },
  Games: { on: 'dice', off: 'dice-outline' },
  Players: { on: 'people', off: 'people-outline' },
  Profile: { on: 'person-circle', off: 'person-circle-outline' },
};

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerTitleStyle: styles.headerTitle,
        headerStyle: styles.header,
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.felt,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          return <Ionicons name={focused ? icons.on : icons.off} size={size - 2} color={color} />;
        },
      })}
    >
      <Tabs.Screen
        name="Home"
        component={DashboardScreen}
        // The header says the app name; the tab just says where you are.
        options={{ title: 'AadarBahar', tabBarLabel: 'Home' }}
      />
      <Tabs.Screen name="Games" component={GamesScreen} options={{ title: 'Games' }} />
      <Tabs.Screen name="Players" component={PlayersScreen} options={{ title: 'Players' }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: 'You' }} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.splash}>
        <LoadingView label="" />
      </View>
    );
  }

  // Someone signed in with a password an admin handed them has one job first.
  const mustChangePassword = status === 'signedIn' && user?.mustChangePassword;

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerTitleStyle: styles.headerTitle,
          headerStyle: styles.header,
          headerShadowVisible: false,
          headerTintColor: colors.felt,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: styles.screen,
        }}
      >
        {status === 'signedOut' ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="ServerSettings"
              component={ServerSettingsScreen}
              options={{ title: 'Server' }}
            />
          </>
        ) : mustChangePassword ? (
          <Stack.Screen
            name="ChangePassword"
            component={ChangePasswordScreen}
            initialParams={{ forced: true }}
            options={{ title: 'Set your password', headerBackVisible: false }}
          />
        ) : (
          <>
            <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="GameDetail" component={GameDetailScreen} options={{ title: 'Game' }} />
            <Stack.Screen name="GameEditor" component={GameEditorScreen} options={{ title: 'Record a game' }} />
            <Stack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: 'Add an expense' }} />
            <Stack.Screen name="PlayerDetail" component={PlayerDetailScreen} options={{ title: 'Player' }} />
            <Stack.Screen name="AddPlayer" component={AddPlayerScreen} options={{ title: 'New player' }} />
            <Stack.Screen name="ManageRoster" component={ManageRosterScreen} options={{ title: 'Roster' }} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Change password' }} />
            <Stack.Screen name="ServerSettings" component={ServerSettingsScreen} options={{ title: 'Server' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.background, justifyContent: 'center' },
  screen: { backgroundColor: colors.background },
  header: { backgroundColor: colors.background },
  headerTitle: { ...font.heading, color: colors.ink },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
  },
  tabLabel: { fontSize: 11, fontWeight: '600' },
});
