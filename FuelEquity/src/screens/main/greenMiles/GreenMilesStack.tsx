import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../../../theme';
import GreenMilesScreen from './GreenMilesScreen';
import { GreenMilesRedemptionScreen } from './GreenMilesRedemptionScreen';
import type { GreenMilesStackParamList } from '../types';

const Stack = createNativeStackNavigator<GreenMilesStackParamList>();

export default function GreenMilesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="GreenMilesScreen" component={GreenMilesScreen} />
      <Stack.Screen name="GreenMilesRedeem" component={GreenMilesRedemptionScreen} />
    </Stack.Navigator>
  );
}
