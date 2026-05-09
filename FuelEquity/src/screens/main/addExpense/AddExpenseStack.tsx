import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../../../theme';
import AddExpenseScreen from './AddExpenseScreen';
import type { AddExpenseStackParamList } from '../types';

const Stack = createNativeStackNavigator<AddExpenseStackParamList>();

export default function AddExpenseStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="AddExpenseScreen" component={AddExpenseScreen} />
    </Stack.Navigator>
  );
}
