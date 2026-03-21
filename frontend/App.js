import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LoginScreen from './src/screens/LoginScreen';
import { initDatabase } from './src/db/database';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { Home, Calendar, Settings } from 'lucide-react-native';

const Tab = createBottomTabNavigator();

function MainNavigator() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (user) initDatabase();
  }, [user]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            if (route.name === 'Home') return <Home size={size} color={color} />;
            if (route.name === 'History') return <Calendar size={size} color={color} />;
            if (route.name === 'Settings') return <Settings size={size} color={color} />;
          },
          tabBarActiveTintColor: '#007bff',
          tabBarInactiveTintColor: 'gray',
          headerStyle: { backgroundColor: '#007bff' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ title: '홈' }} />
        <Tab.Screen name="History" component={HistoryScreen} options={{ title: '기록' }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: '설정' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainNavigator />
    </AuthProvider>
  );
}
