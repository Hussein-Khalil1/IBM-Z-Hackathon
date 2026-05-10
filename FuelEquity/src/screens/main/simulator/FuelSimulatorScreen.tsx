/**
 * Fuel Cost Simulator Screen (S3-07)
 * Interactive tool to estimate fuel costs for hypothetical trips.
 * Features: sliders for distance, efficiency, terrain, traffic, gas price.
 * Shows solo vs carpool cost comparison.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Slider,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight } from '../../../theme';
import {
  calculateFuelConsumption,
  FuelConsumptionInput,
  getConsumptionColor,
  getConsumptionLevel,
} from '../../../services/fuelModel';

interface SimulatorState {
  distance: number; // km
  efficiency: number; // L/100km
  terrain: number; // percentage penalty (0-30)
  traffic: 'light' | 'moderate' | 'heavy';
  gasPrice: number; // cents per litre
  passengers: number; // Number of people splitting cost (1-5)
  acEnabled: boolean;
  temperature: number; // Celsius
}

export const FuelSimulatorScreen: React.FC = () => {
  const { colors, spacing } = useAppTheme();
  const [state, setState] = useState<SimulatorState>({
    distance: 100,
    efficiency: 8.5,
    terrain: 5,
    traffic: 'moderate',
    gasPrice: 15299,
    passengers: 4,
    acEnabled: false,
    temperature: 15,
  });

  // Calculate consumption
  const result = calculateFuelConsumption(
    {
      baseLPer100km: state.efficiency,
      distanceKm: state.distance,
      elevationGainM: (state.terrain / 5) * 100, // Convert penalty % to elevation
      weatherTemp: state.temperature,
      windSpeedKmh: state.traffic === 'heavy' ? 0 : 15,
      trafficCondition: state.traffic,
      acEnabled: state.acEnabled,
    },
    state.gasPrice,
  );

  const soloTotalCost = result.estimatedCostCAD;
  const groupTotalCost = soloTotalCost; // Same fuel consumption, just split
  const costPerPerson = groupTotalCost / state.passengers;
  const savingsPerPerson = soloTotalCost - costPerPerson;

  const consumptionLevel = getConsumptionLevel(result);
  const consumptionColor = getConsumptionColor(consumptionLevel);

  const CO2PerLitre = 2.31; // kg CO2 per litre of fuel
  const co2Emitted = result.adjustedFuelLitres * CO2PerLitre;

  const handleSliderChange = (key: keyof SimulatorState, value: number) => {
    setState((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleToggle = (key: keyof SimulatorState) => {
    setState((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleTraffic = () => {
    const nextTraffic = {
      light: 'moderate' as const,
      moderate: 'heavy' as const,
      heavy: 'light' as const,
    };
    setState((prev) => ({
      ...prev,
      traffic: nextTraffic[prev.traffic],
    }));
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Fuel Cost Calculator</Text>
        <Text style={[styles.subtitle, { color: colors.neutral }]}>
          Estimate trip costs before you go
        </Text>
      </View>

      {/* Live Summary Card */}
      <View
        style={[
          styles.summaryCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderLeftColor: consumptionColor,
          },
        ]}
      >
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Ionicons name="flash" size={24} color={consumptionColor} />
            <View style={styles.summaryData}>
              <Text style={[styles.summaryLabel, { color: colors.neutral }]}>
                Fuel needed
              </Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>
                {result.adjustedFuelLitres.toFixed(1)}L
              </Text>
            </View>
          </View>

          <View style={styles.summaryItem}>
            <Ionicons name="cash" size={24} color={colors.success} />
            <View style={styles.summaryData}>
              <Text style={[styles.summaryLabel, { color: colors.neutral }]}>Total cost</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                ${result.estimatedCostCAD.toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.summaryItem}>
            <Ionicons name="leaf" size={24} color={colors.primary} />
            <View style={styles.summaryData}>
              <Text style={[styles.summaryLabel, { color: colors.neutral }]}>CO₂</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>
                {co2Emitted.toFixed(1)} kg
              </Text>
            </View>
          </View>
        </View>

        {/* Consumption Gauge */}
        <View style={[styles.gaugeContainer, { marginTop: 12 }]}>
          <View
            style={[
              styles.consumptionGauge,
              {
                width: `${Math.min(100, Math.max(0, (state.terrain + 10) * 3))}%`,
                backgroundColor: consumptionColor,
              },
            ]}
          />
        </View>
        <Text style={[styles.gaugeLabel, { color: colors.neutral }]}>
          {consumptionLevel.charAt(0).toUpperCase() + consumptionLevel.slice(1)} fuel consumption
        </Text>
      </View>

      {/* Carpool Savings Comparison */}
      <View
        style={[
          styles.comparisonCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.comparisonTitle, { color: colors.text }]}>
          💰 Split the cost
        </Text>
        <View style={styles.comparisonRow}>
          <View style={styles.comparisonColumn}>
            <Ionicons name="person" size={20} color={colors.neutral} />
            <Text style={[styles.comparisonLabel, { color: colors.neutral }]}>Solo</Text>
            <Text style={[styles.comparisonCost, { color: colors.text }]}>
              ${soloTotalCost.toFixed(2)}
            </Text>
          </View>

          <View style={styles.comparisonDivider}>
            <Text style={[{ color: colors.mutedText }]}>→</Text>
          </View>

          <View style={styles.comparisonColumn}>
            <View style={styles.passengerGroup}>
              {Array.from({ length: state.passengers }).map((_, i) => (
                <Ionicons
                  key={i}
                  name="person"
                  size={14}
                  color={colors.primary}
                  style={{ marginLeft: i > 0 ? -6 : 0 }}
                />
              ))}
            </View>
            <Text style={[styles.comparisonLabel, { color: colors.neutral }]}>
              {state.passengers} people
            </Text>
            <Text style={[styles.comparisonCost, { color: colors.success }]}>
              ${costPerPerson.toFixed(2)} each
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.savingsBanner,
            { backgroundColor: colors.success + '15', borderColor: colors.success },
          ]}
        >
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={[styles.savingsText, { color: colors.success }]}>
            Save ${savingsPerPerson.toFixed(2)} per person!
          </Text>
        </View>
      </View>

      {/* Sliders */}
      <View style={styles.slidersSection}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Trip Parameters</Text>

        {/* Distance Slider */}
        <View style={styles.sliderRow}>
          <View style={styles.sliderLabel}>
            <Ionicons name="navigate-outline" size={18} color={colors.primary} />
            <View>
              <Text style={[styles.sliderTitle, { color: colors.text }]}>Distance</Text>
              <Text style={[styles.sliderValue, { color: colors.neutral }]}>
                {state.distance.toFixed(0)} km
              </Text>
            </View>
          </View>
          <Slider
            style={styles.slider}
            min={10}
            max={500}
            step={10}
            value={state.distance}
            onValueChange={(v) => handleSliderChange('distance', v)}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
          />
        </View>

        {/* Fuel Efficiency Slider */}
        <View style={styles.sliderRow}>
          <View style={styles.sliderLabel}>
            <Ionicons name="speedometer-outline" size={18} color={colors.primary} />
            <View>
              <Text style={[styles.sliderTitle, { color: colors.text }]}>Efficiency</Text>
              <Text style={[styles.sliderValue, { color: colors.neutral }]}>
                {state.efficiency.toFixed(1)} L/100km
              </Text>
            </View>
          </View>
          <Slider
            style={styles.slider}
            min={4}
            max={16}
            step={0.5}
            value={state.efficiency}
            onValueChange={(v) => handleSliderChange('efficiency', v)}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
          />
        </View>

        {/* Terrain Penalty Slider */}
        <View style={styles.sliderRow}>
          <View style={styles.sliderLabel}>
            <Ionicons name="mountain-outline" size={18} color={colors.primary} />
            <View>
              <Text style={[styles.sliderTitle, { color: colors.text }]}>Terrain Penalty</Text>
              <Text style={[styles.sliderValue, { color: colors.neutral }]}>
                +{state.terrain.toFixed(0)}%
              </Text>
            </View>
          </View>
          <Slider
            style={styles.slider}
            min={0}
            max={30}
            step={1}
            value={state.terrain}
            onValueChange={(v) => handleSliderChange('terrain', v)}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
          />
        </View>

        {/* Temperature Slider */}
        <View style={styles.sliderRow}>
          <View style={styles.sliderLabel}>
            <Ionicons name="thermometer-outline" size={18} color={colors.primary} />
            <View>
              <Text style={[styles.sliderTitle, { color: colors.text }]}>Temperature</Text>
              <Text style={[styles.sliderValue, { color: colors.neutral }]}>
                {state.temperature.toFixed(0)}°C
              </Text>
            </View>
          </View>
          <Slider
            style={styles.slider}
            min={-20}
            max={40}
            step={1}
            value={state.temperature}
            onValueChange={(v) => handleSliderChange('temperature', v)}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
          />
        </View>

        {/* Gas Price Slider */}
        <View style={styles.sliderRow}>
          <View style={styles.sliderLabel}>
            <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
            <View>
              <Text style={[styles.sliderTitle, { color: colors.text }]}>Gas Price</Text>
              <Text style={[styles.sliderValue, { color: colors.neutral }]}>
                {(state.gasPrice / 100).toFixed(2)} ¢/L
              </Text>
            </View>
          </View>
          <Slider
            style={styles.slider}
            min={10000}
            max={20000}
            step={100}
            value={state.gasPrice}
            onValueChange={(v) => handleSliderChange('gasPrice', v)}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
          />
        </View>

        {/* Passengers Counter */}
        <View style={styles.passengersRow}>
          <View style={styles.sliderLabel}>
            <Ionicons name="people-outline" size={18} color={colors.primary} />
            <Text style={[styles.sliderTitle, { color: colors.text }]}>Passengers</Text>
          </View>
          <View style={styles.counterControls}>
            <TouchableOpacity
              onPress={() =>
                setState((prev) => ({
                  ...prev,
                  passengers: Math.max(1, prev.passengers - 1),
                }))
              }
              style={[
                styles.counterButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Ionicons name="remove" size={16} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.counterValue, { color: colors.text }]}>
              {state.passengers}
            </Text>
            <TouchableOpacity
              onPress={() =>
                setState((prev) => ({
                  ...prev,
                  passengers: Math.min(5, prev.passengers + 1),
                }))
              }
              style={[
                styles.counterButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Ionicons name="add" size={16} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Traffic Toggle */}
        <TouchableOpacity
          onPress={toggleTraffic}
          style={[
            styles.toggleRow,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.sliderLabel}>
            <Ionicons
              name={
                state.traffic === 'light'
                  ? 'speedometer-outline'
                  : state.traffic === 'moderate'
                    ? 'swap-horizontal'
                    : 'warning-outline'
              }
              size={18}
              color={
                state.traffic === 'light'
                  ? colors.success
                  : state.traffic === 'moderate'
                    ? colors.neutral
                    : colors.error
              }
            />
            <View>
              <Text style={[styles.sliderTitle, { color: colors.text }]}>Traffic</Text>
              <Text
                style={[
                  styles.sliderValue,
                  {
                    color:
                      state.traffic === 'light'
                        ? colors.success
                        : state.traffic === 'moderate'
                          ? colors.neutral
                          : colors.error,
                  },
                ]}
              >
                {state.traffic.charAt(0).toUpperCase() + state.traffic.slice(1)}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.neutral} />
        </TouchableOpacity>

        {/* AC Toggle */}
        <TouchableOpacity
          onPress={() => handleToggle('acEnabled')}
          style={[
            styles.toggleRow,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.sliderLabel}>
            <Ionicons
              name="snow-outline"
              size={18}
              color={state.acEnabled ? colors.primary : colors.neutral}
            />
            <Text style={[styles.sliderTitle, { color: colors.text }]}>AC Enabled</Text>
          </View>
          <View
            style={[
              styles.toggle,
              {
                backgroundColor: state.acEnabled ? colors.success : colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.toggleHandle,
                {
                  transform: [{ translateX: state.acEnabled ? 20 : 2 }],
                },
              ]}
            />
          </View>
        </TouchableOpacity>
      </View>

      {/* Modifiers Breakdown */}
      {result.modifiers.length > 0 && (
        <View
          style={[
            styles.modifiersSection,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Consumption Factors</Text>
          {result.modifiers.map((mod, idx) => (
            <View key={idx} style={styles.modifierRow}>
              <Text style={[styles.modifierIcon]}>{mod.icon}</Text>
              <View style={styles.modifierInfo}>
                <Text style={[styles.modifierName, { color: colors.text }]}>{mod.name}</Text>
                <Text style={[styles.modifierDesc, { color: colors.neutral }]}>
                  {mod.description}
                </Text>
              </View>
              <Text
                style={[
                  styles.modifierValue,
                  { color: mod.percentageChange > 0 ? colors.error : colors.success },
                ]}
              >
                {mod.percentageChange > 0 ? '+' : ''}
                {mod.percentageChange.toFixed(1)}%
              </Text>
            </View>
          ))}
          <View
            style={[
              styles.modifierTotal,
              { backgroundColor: colors.background, borderTopColor: colors.border },
            ]}
          >
            <Text style={[styles.modifierTotalLabel, { color: colors.neutral }]}>
              Total penalty:
            </Text>
            <Text style={[styles.modifierTotalValue, { color: colors.text }]}>
              +{result.totalPenaltyPercent.toFixed(1)}%
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryData: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  gaugeContainer: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    opacity: 0.6,
  },
  consumptionGauge: {
    height: '100%',
    borderRadius: 3,
  },
  gaugeLabel: {
    fontSize: 12,
  },
  comparisonCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  comparisonTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  comparisonColumn: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  comparisonDivider: {
    alignItems: 'center',
  },
  comparisonLabel: {
    fontSize: 12,
  },
  comparisonCost: {
    fontSize: 16,
    fontWeight: '700',
  },
  passengerGroup: {
    flexDirection: 'row',
  },
  savingsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  savingsText: {
    fontSize: 13,
    fontWeight: '600',
  },
  slidersSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  sliderRow: {
    gap: 8,
  },
  sliderLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sliderTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  sliderValue: {
    fontSize: 12,
  },
  slider: {
    height: 36,
  },
  passengersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  counterButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterValue: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 20,
    textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  toggleHandle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  modifiersSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  modifierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  modifierIcon: {
    fontSize: 18,
    minWidth: 24,
    textAlign: 'center',
  },
  modifierInfo: {
    flex: 1,
  },
  modifierName: {
    fontSize: 12,
    fontWeight: '600',
  },
  modifierDesc: {
    fontSize: 11,
  },
  modifierValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  modifierTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    marginTop: 4,
  },
  modifierTotalLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  modifierTotalValue: {
    fontSize: 14,
    fontWeight: '700',
  },
});

export default FuelSimulatorScreen;
