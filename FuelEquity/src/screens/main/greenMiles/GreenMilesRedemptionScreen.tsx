import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../services/firebase';
import { authStore } from '../../../store/authStore';
import { theme } from '../../../theme';

type RewardType = 'gas_discount' | 'transit_credit' | 'donation';

interface RewardOption {
  type: RewardType;
  title: string;
  description: string;
  cost: number;
  icon: string;
  color: string;
}

const REWARD_OPTIONS: RewardOption[] = [
  {
    type: 'gas_discount',
    title: '$10 Gas Discount',
    description: 'Use at any fuel station in Canada',
    cost: 500,
    icon: '⛽',
    color: '#ff6b6b',
  },
  {
    type: 'transit_credit',
    title: '$5 Transit Credit',
    description: 'TTC, GO Transit, or local provider',
    cost: 300,
    icon: '🚌',
    color: '#4ecdc4',
  },
  {
    type: 'donation',
    title: '$5 Community Donation',
    description: 'Fuel assistance fund for low-income drivers',
    cost: 300,
    icon: '❤️',
    color: '#95e1d3',
  },
];

interface RedemptionState {
  selectedReward: RewardOption | null;
  loading: boolean;
  balance: number;
  error: string | null;
  success: boolean;
  successData: {
    rewardCode: string;
    message: string;
    newBalance: number;
  } | null;
}

export function GreenMilesRedemptionScreen({ navigation }: any) {
  const user = authStore((s) => s.user);
  const [state, setState] = useState<RedemptionState>({
    selectedReward: null,
    loading: false,
    balance: 0,
    error: null,
    success: false,
    successData: null,
  });

  useEffect(() => {
    loadBalance();
  }, [user?.uid]);

  const loadBalance = async () => {
    if (!user) return;
    try {
      // In a real app, fetch user's current GreenMiles balance from Firestore
      // For demo, we'll use a mock value
      setState((prev) => ({ ...prev, balance: 1250 })); // Mock balance
    } catch (error) {
      console.error('Error loading balance:', error);
    }
  };

  const handleRewardSelect = (reward: RewardOption) => {
    setState((prev) => ({ ...prev, selectedReward: reward, error: null }));
  };

  const handleRedeem = async () => {
    if (!state.selectedReward || !user) {
      setState((prev) => ({
        ...prev,
        error: 'Please select a reward',
      }));
      return;
    }

    if (state.balance < state.selectedReward.cost) {
      setState((prev) => ({
        ...prev,
        error: `Insufficient balance. You need ${state.selectedReward.cost} points.`,
      }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const redeemGreenMiles = httpsCallable(functions, 'redeemGreenMiles');
      const result = await redeemGreenMiles({
        userId: user.uid,
        rewardType: state.selectedReward.type,
      });

      const data = result.data as any;

      setState((prev) => ({
        ...prev,
        loading: false,
        success: true,
        successData: {
          rewardCode: data.rewardCode,
          message: data.message,
          newBalance: data.newBalance,
        },
        balance: data.newBalance,
      }));

      // Show success alert
      Alert.alert('Redemption Successful!', `Code: ${data.rewardCode}\n\n${data.message}`);
    } catch (error: any) {
      console.error('Redemption error:', error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error.message || 'Redemption failed. Please try again.',
      }));
      Alert.alert('Redemption Failed', error.message || 'An error occurred');
    }
  };

  if (state.success && state.successData) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={styles.successTitle}>Redemption Complete!</Text>
          <Text style={styles.successMessage}>{state.successData.message}</Text>

          <View style={styles.codeContainer}>
            <Text style={styles.codeLabel}>Your Reward Code</Text>
            <Text style={styles.code}>{state.successData.rewardCode}</Text>
          </View>

          <View style={styles.balanceContainer}>
            <Text style={styles.balanceLabel}>Remaining GreenMiles</Text>
            <Text style={styles.balanceValue}>{state.successData.newBalance}</Text>
          </View>

          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => {
              setState((prev) => ({
                ...prev,
                success: false,
                successData: null,
                selectedReward: null,
              }));
            }}
          >
            <Text style={styles.doneButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Redeem GreenMiles</Text>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceCardLabel}>Available Balance</Text>
            <Text style={styles.balanceCardValue}>{state.balance}</Text>
          </View>
        </View>

        {/* Error Message */}
        {state.error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{state.error}</Text>
          </View>
        )}

        {/* Reward Options */}
        <View style={styles.optionsContainer}>
          <Text style={styles.sectionTitle}>Choose Your Reward</Text>

          {REWARD_OPTIONS.map((reward) => {
            const isSelected = state.selectedReward?.type === reward.type;
            const canAfford = state.balance >= reward.cost;

            return (
              <TouchableOpacity
                key={reward.type}
                style={[
                  styles.rewardCard,
                  isSelected && styles.rewardCardSelected,
                  !canAfford && styles.rewardCardDisabled,
                ]}
                onPress={() => canAfford && handleRewardSelect(reward)}
                disabled={!canAfford}
              >
                <View style={styles.rewardCardContent}>
                  <Text style={styles.rewardIcon}>{reward.icon}</Text>
                  <View style={styles.rewardInfo}>
                    <Text style={styles.rewardTitle}>{reward.title}</Text>
                    <Text style={styles.rewardDescription}>{reward.description}</Text>
                  </View>
                </View>

                <View style={styles.rewardCostContainer}>
                  <Text style={styles.rewardCost}>{reward.cost}</Text>
                  <View
                    style={[
                      styles.radioButton,
                      isSelected && styles.radioButtonSelected,
                    ]}
                  >
                    {isSelected && <View style={styles.radioButtonInner} />}
                  </View>
                </View>

                {!canAfford && (
                  <Text style={styles.insufficientText}>
                    Need {reward.cost - state.balance} more
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Redemption Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How It Works</Text>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>1️⃣</Text>
            <Text style={styles.infoText}>Select your reward above</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>2️⃣</Text>
            <Text style={styles.infoText}>You'll get a unique code instantly</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>3️⃣</Text>
            <Text style={styles.infoText}>Use it at participating retailers</Text>
          </View>
        </View>

        <View style={styles.spacer} />
      </ScrollView>

      {/* Redeem Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.redeemButton,
            (!state.selectedReward || state.loading) && styles.redeemButtonDisabled,
          ]}
          onPress={handleRedeem}
          disabled={!state.selectedReward || state.loading}
        >
          {state.loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.redeemButtonText}>
              Redeem {state.selectedReward ? `(${state.selectedReward.cost} pts)` : ''}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  balanceCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  balanceCardLabel: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.8,
  },
  balanceCardValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 4,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    backgroundColor: '#ffebee',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.error,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 13,
    fontWeight: '500',
  },
  optionsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  rewardCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rewardCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '10',
  },
  rewardCardDisabled: {
    opacity: 0.5,
  },
  rewardCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rewardIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  rewardInfo: {
    flex: 1,
  },
  rewardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  rewardDescription: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  rewardCostContainer: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  rewardCost: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 8,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.colors.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  radioButtonInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  insufficientText: {
    fontSize: 11,
    color: theme.colors.warning,
    fontStyle: 'italic',
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  infoCard: {
    marginHorizontal: 16,
    marginVertical: 16,
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  infoBullet: {
    fontSize: 16,
    marginRight: 12,
    minWidth: 20,
  },
  infoText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  spacer: {
    height: 100,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surface,
  },
  redeemButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  redeemButtonDisabled: {
    opacity: 0.5,
  },
  redeemButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  successEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  codeContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  codeLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  code: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.primary,
    letterSpacing: 2,
  },
  balanceContainer: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  doneButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    padding: 16,
    width: '100%',
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
