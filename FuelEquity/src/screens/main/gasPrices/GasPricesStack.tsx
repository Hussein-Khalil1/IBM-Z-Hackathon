/**
 * Gas Prices Stack Navigator (S3-02)
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppTheme } from '../../../theme';
import { GasPricesScreen } from './GasPricesScreen';

export type GasPricesStackParamList = {
  GasPrices: undefined;
};

const Stack = createNativeStackNavigator<GasPricesStackParamList>();

export const GasPricesStack: React.FC = () => {
  const { colors } = useAppTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="GasPrices" component={GasPricesScreen} />
    </Stack.Navigator>
  );
};

export default GasPricesStack;
