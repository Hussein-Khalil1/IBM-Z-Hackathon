import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Shadow } from '../../theme';
import HomeStack from './home/HomeStack';
import SplitsStack from './splits/SplitsStack';
import AddExpenseStack from './addExpense/AddExpenseStack';
import GreenMilesStack from './greenMiles/GreenMilesStack';
import MapsStack from './maps/MapsStack';
import { GasPricesStack } from './gasPrices';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

function AddExpenseButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.addBtn} activeOpacity={0.85}>
      <Ionicons name="add" size={30} color={Colors.textInverse} />
    </TouchableOpacity>
  );
}

export default function MainNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.tabActive,
        tabBarInactiveTintColor: Colors.tabInactive,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Splits"
        component={SplitsStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AddExpense"
        component={AddExpenseStack}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => <View />,
          tabBarButton: (props) => (
            <AddExpenseButton onPress={props.onPress as () => void} />
          ),
        }}
      />
      <Tab.Screen
        name="GreenMiles"
        component={GreenMilesStack}
        options={{
          tabBarLabel: 'Green',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="leaf-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="GasPrices"
        component={GasPricesStack}
        options={{
          tabBarLabel: 'Gas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flame-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Maps"
        component={MapsStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.tabBar,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 60,
    paddingBottom: 8,
    paddingTop: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
  addBtn: {
    top: -20,
    width: 58,
    height: 58,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.green,
  },
});
