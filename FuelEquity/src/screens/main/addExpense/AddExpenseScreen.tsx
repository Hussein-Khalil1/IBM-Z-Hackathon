import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight } from '../../../theme';

export default function AddExpenseScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.center}>
        <Text style={styles.label}>Add Expense</Text>
        <Text style={styles.sub}>Expense form coming in S2</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  sub: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 8 },
});
