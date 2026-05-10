import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../../../theme';
import HomeScreen from './HomeScreen';
import ProfileScreen from './ProfileScreen';
import CreateTripScreen from './CreateTripScreen';
import TripLobbyScreen from './TripLobbyScreen';
import TripDetailScreen from './TripDetailScreen';
import JoinTripScreen from './JoinTripScreen';
import GasPricesScreen from './gasPrices/GasPricesScreen';
import RoutePickerScreen from './routePicker/RoutePickerScreen';
import FuelSimulatorScreen from './fuelSimulator/FuelSimulatorScreen';
import type { HomeStackParamList } from '../types';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="HomeScreen" component={HomeScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="CreateTrip" component={CreateTripScreen} />
      <Stack.Screen name="TripLobby" component={TripLobbyScreen} />
      <Stack.Screen name="TripDetail" component={TripDetailScreen} />
      <Stack.Screen name="JoinTrip" component={JoinTripScreen} />
      <Stack.Screen name="GasPrices" component={GasPricesScreen} />
      <Stack.Screen name="RoutePicker" component={RoutePickerScreen} />
      <Stack.Screen name="FuelSimulator" component={FuelSimulatorScreen} />
    </Stack.Navigator>
  );
}
