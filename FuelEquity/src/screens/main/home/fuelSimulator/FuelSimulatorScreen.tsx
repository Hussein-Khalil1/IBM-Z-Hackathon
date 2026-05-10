import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Slider,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, Radius, Shadow } from '../../../theme';

interface SimulatorState {
  distance: number; // km
  efficiency: number; // L/100km
  terrainPenalty: number; // %
  trafficPenalty: number; // %
  gasPrice: number; // ¢/L
  riderCount: number; // for split calculation
}

export default function FuelSimulatorScreen() {
  const [state, setState] = useState<SimulatorState>({
    distance: 100,
    efficiency: 8,
    terrainPenalty: 0,
    trafficPenalty: 0,
    gasPrice: 152,
    riderCount: 1,
  });

  // Calculate fuel consumption and costs
  const calculations = useMemo(() => {
    const baseFuel = (state.distance / 100) * state.efficiency;
    const adjustedFuel =
      baseFuel * (1 + (state.terrainPenalty + state.trafficPenalty) / 100);
    const totalCostCents = adjustedFuel * state.gasPrice;
    const totalCostCAD = totalCostCents / 100;
    const costPerPerson = totalCostCAD / state.riderCount;
    const co2Emitted = adjustedFuel * 2.31; // kg CO2
    const treesEquivalent = co2Emitted / 21; // 1 tree = 21kg CO2

    // Solo vs carpool comparison
    const soloCost = (baseFuel * state.gasPrice) / 100;
    const carpoolSavings = soloCost * state.riderCount - totalCostCAD;

    return {
      baseFuel,
      adjustedFuel,
      totalCostCAD,
      costPerPerson,
      co2Emitted,
      treesEquivalent,
      soloCost,
      carpoolSavings,
      highConsumption: adjustedFuel > baseFuel * 0.6,
    };
  }, [state]);

  const handleValueChange = (key: keyof SimulatorState, value: number) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const SliderComponent = ({
    label,
    min,
    max,
    step,
    value,
    unit,
    onChange,
  }: {
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    unit: string;
    onChange: (v: number) => void;
  }) => (
    <View style={styles.sliderContainer}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {value.toFixed(1)} {unit}
        </Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={Colors.primary}
        maximumTrackTintColor={Colors.border}
        thumbTintColor={Colors.primary}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Fuel Cost Simulator</Text>
        <Text style={styles.subtitle}>
          Estimate your trip costs with different scenarios
        </Text>

        {/* Input Sliders */}
        <View style={[styles.card, Shadow.md]}>
          <Text style={styles.sectionTitle}>Trip Parameters</Text>

          <SliderComponent
            label="Distance"
            min={10}
            max={500}
            step={5}
            value={state.distance}
            unit="km"
            onChange={(v) => handleValueChange('distance', v)}
          />

          <SliderComponent
            label="Fuel Efficiency"
            min={4}
            max={15}
            step={0.5}
            value={state.efficiency}
            unit="L/100km"
            onChange={(v) => handleValueChange('efficiency', v)}
          />

          <SliderComponent
            label="Terrain Penalty"
            min={0}
            max={15}
            step={1}
            value={state.terrainPenalty}
            unit="%"
            onChange={(v) => handleValueChange('terrainPenalty', v)}
          />

          <SliderComponent
            label="Traffic Penalty"
            min={0}
            max={10}
            step={1}
            value={state.trafficPenalty}
            unit="%"
            onChange={(v) => handleValueChange('trafficPenalty', v)}
          />

          <SliderComponent
            label="Gas Price"
            min={100}
            max={200}
            step={1}
            value={state.gasPrice}
            unit="¢/L"
            onChange={(v) => handleValueChange('gasPrice', v)}
          />

          <SliderComponent
            label="Number of Riders"
            min={1}
            max={6}
            step={1}
            value={state.riderCount}
            unit="people"
            onChange={(v) => handleValueChange('riderCount', v)}
          />
        </View>

        {/* Fuel Gauge */}
        <View style={[styles.card, Shadow.md]}>
          <Text style={styles.sectionTitle}>Consumption Gauge</Text>
          <View style={styles.gaugeContainer}>
            <View style={styles.gaugeBackground}>
              <View
                style={[
                  styles.gaugeFill,
                  {
                    width: `${(calculations.adjustedFuel / (state.efficiency * 6)) * 100}%`,
                    backgroundColor: calculations.highConsumption ? '#ef4444' : Colors.primary,
                  },
                ]}
              />
            </View>
            <Text
              style={[
                styles.gaugeLabel,
                calculations.highConsumption && styles.highConsumptionWarning,
              ]}
            >
              {calculations.highConsumption ? '⚠️ High Consumption' : '✓ Optimal'}
            </Text>
          </View>
        </View>

        {/* Results */}
        <View style={[styles.card, Shadow.md]}>
          <Text style={styles.sectionTitle}>Trip Estimate</Text>

          <View style={styles.resultRow}>
            <View style={styles.resultItem}>
              <Ionicons name="water" size={24} color={Colors.primary} />
              <Text style={styles.resultLabel}>Fuel Needed</Text>
              <Text style={styles.resultValue}>{calculations.adjustedFuel.toFixed(1)}L</Text>
            </View>

            <View style={styles.resultItem}>
              <Ionicons name="cash" size={24} color={Colors.primary} />
              <Text style={styles.resultLabel}>Total Cost</Text>
              <Text style={styles.resultValue}>${calculations.totalCostCAD.toFixed(2)}</Text>
            </View>

            <View style={styles.resultItem}>
              <Ionicons name="leaf" size={24} color={Colors.primary} />
              <Text style={styles.resultLabel}>CO₂ Emitted</Text>
              <Text style={styles.resultValue}>{calculations.co2Emitted.toFixed(1)}kg</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.resultRow}>
            <View style={styles.resultItem}>
              <Ionicons name="person" size={24} color={Colors.primary} />
              <Text style={styles.resultLabel}>Cost Per Person</Text>
              <Text style={styles.resultValue}>${calculations.costPerPerson.toFixed(2)}</Text>
            </View>

            <View style={styles.resultItem}>
              <Ionicons name="tree" size={24} color={Colors.primary} />
              <Text style={styles.resultLabel}>Trees Equiv.</Text>
              <Text style={styles.resultValue}>
                {calculations.treesEquivalent.toFixed(1)} trees
              </Text>
            </View>
          </View>
        </View>

        {/* Carpool Savings */}
        <View style={[styles.card, styles.savingsCard, Shadow.md]}>
          <View style={styles.savingsHeader}>
            <Ionicons name="star" size={24} color="#fbbf24" />
            <Text style={styles.savingsTitle}>Carpool Savings</Text>
          </View>

          <View style={styles.savingsComparison}>
            <View style={styles.comparisonItem}>
              <Text style={styles.comparisonLabel}>Solo Trip</Text>
              <Text style={styles.comparisonValue}>${(calculations.soloCost * state.riderCount).toFixed(2)}</Text>
            </View>

            <View style={styles.comparisonArrow}>
              <Ionicons name="arrow-forward" size={20} color={Colors.textMuted} />
            </View>

            <View style={styles.comparisonItem}>
              <Text style={styles.comparisonLabel}>With Carpool</Text>
              <Text style={styles.comparisonValue}>${calculations.totalCostCAD.toFixed(2)}</Text>
            </View>
          </View>

          <View style={styles.savingsAmount}>
            <Text style={styles.savingsLabel}>Your Group Saves</Text>
            <Text style={styles.savingsValue}>${calculations.carpoolSavings.toFixed(2)}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  sliderContainer: {
    marginBottom: Spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  value: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  slider: {
    height: 40,
  },
  gaugeContainer: {
    marginBottom: Spacing.md,
  },
  gaugeBackground: {
    height: 24,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  gaugeFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  gaugeLabel: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  highConsumptionWarning: {
    color: '#ef4444',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.md,
  },
  resultItem: {
    alignItems: 'center',
    flex: 1,
  },
  resultLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginVertical: Spacing.xs,
  },
  resultValue: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  savingsCard: {
    backgroundColor: '#fbbf2410',
    borderLeftWidth: 4,
    borderLeftColor: '#fbbf24',
  },
  savingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  savingsTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginLeft: Spacing.sm,
  },
  savingsComparison: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: Spacing.md,
  },
  comparisonItem: {
    alignItems: 'center',
  },
  comparisonLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  comparisonValue: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  comparisonArrow: {
    marginHorizontal: Spacing.md,
  },
  savingsAmount: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  savingsLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  savingsValue: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: '#4ade80',
  },
});
