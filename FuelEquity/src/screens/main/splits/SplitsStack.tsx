import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../../../theme';
import SplitsScreen from './SplitsScreen';
import type { SplitsStackParamList } from '../types';

const Stack = createNativeStackNavigator<SplitsStackParamList>();

export default function SplitsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="SplitsScreen" component={SplitsScreen} />
    </Stack.Navigator>
  );
}
