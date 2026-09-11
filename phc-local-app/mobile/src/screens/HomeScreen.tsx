import React, { useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, ScrollView, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Routes } from '../navigation/routes';
import { useScreening } from '../context/ScreeningContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useQueueActions } from '../hooks/useQueue';
import SyncBadge from '../components/SyncBadge';
import StatusBadge from '../components/StatusBadge';
import { getSeverityDisplay } from '../utils/severityHelpers';
import { formatDateTime } from '../utils/dateHelpers';
import { Colors, Typography, Spacing, Shadows, TouchTarget, Animations } from '../theme';
import { QueueItem } from '../types/queue';

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { resetSession, restoreSession } = useScreening();
  const { isOnline } = useNetworkStatus();
  const { allItems, pendingCount } = useQueueActions();

  const recentItems = allItems.slice(-5).reverse();

  // Pulse glow animation for CTA
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: Animations.pulseGlowDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: Animations.pulseGlowDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  const ctaGlowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, 0.45],
  });

  // Staggered entry animation for case rows
  const fadeAnims = useRef(recentItems.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const anims = recentItems.map((_, i) =>
      Animated.timing(fadeAnims[i] || new Animated.Value(0), {
        toValue: 1,
        duration: Animations.fadeInDuration,
        delay: i * Animations.staggerDelay,
        useNativeDriver: true,
      }),
    );
    Animated.stagger(Animations.staggerDelay, anims).start();
  }, [recentItems.length]);

  const handleStartScreening = useCallback(() => {
    resetSession();
    navigation.navigate(Routes.PatientRegistration);
  }, [navigation, resetSession]);

  const handleOpenCase = useCallback((item: QueueItem) => {
    restoreSession(item.session);
    if (item.session.result) {
      navigation.navigate(Routes.Result);
    }
  }, [navigation, restoreSession]);

  const renderCaseRow = ({ item, index }: { item: QueueItem; index: number }) => {
    const patient = item.session.patient;
    const result = item.session.result;
    const level = result?.severity?.level;
    const display = level !== undefined ? getSeverityDisplay(level) : null;

    const syncVariant =
      item.syncStatus === 'synced' ? 'success' :
        item.syncStatus === 'pending' ? 'warning' :
          item.syncStatus === 'error' ? 'danger' : 'neutral';

    return (
      <Animated.View style={{ opacity: fadeAnims[index] || 1 }}>
        <TouchableOpacity
          style={[styles.caseRow, Shadows.sm]}
          onPress={() => handleOpenCase(item)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`Case for ${patient.name}`}
        >
          <View style={styles.caseInfo}>
            <Text style={styles.caseName}>{patient.name}</Text>
            <Text style={styles.caseDate}>{formatDateTime(item.session.createdAt)}</Text>
          </View>
          <View style={styles.caseBadges}>
            {display && (
              <StatusBadge
                label={`Grade ${level}`}
                variant={level! >= 3 ? 'danger' : level! >= 2 ? 'warning' : 'success'}
                size="sm"
              />
            )}
            <StatusBadge label={item.syncStatus} variant={syncVariant} size="sm" />
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* App header — editorial */}
        <View style={styles.appHeader}>
          <View>
            <Text style={styles.appName}>NetraSetu</Text>
            <View style={styles.headerUnderline} />
            <Text style={styles.appSubtitle}>DIABETIC RETINOPATHY SCREENING</Text>
          </View>
          <SyncBadge isOnline={isOnline} pendingCount={pendingCount} />
        </View>

        {/* Primary CTA with pulse glow */}
        <Animated.View style={[styles.ctaGlow, { shadowOpacity: ctaGlowOpacity }]}>
          <TouchableOpacity
            style={[styles.ctaButton]}
            onPress={handleStartScreening}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Start a new screening"
            id="btn-start-screening"
          >
            <View style={styles.ctaContent}>
              <Text style={styles.ctaLabel}>NEW SCREENING</Text>
              <Text style={styles.ctaText}>Start Retinal Analysis</Text>
            </View>
            <Text style={styles.ctaArrow}>→</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Offline notice */}
        {!isOnline && (
          <View style={styles.offlineNotice}>
            <View style={styles.offlineAccent} />
            <View style={styles.offlineContent}>
              <Text style={styles.offlineLabel}>OFFLINE MODE</Text>
              <Text style={styles.offlineText}>
                Screenings will be saved locally and synced when connected.
              </Text>
            </View>
          </View>
        )}

        {/* Recent cases */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RECENT CASES</Text>
          {recentItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>—</Text>
              <Text style={styles.emptyText}>No screenings yet</Text>
              <Text style={styles.emptySubtext}>Start a new screening above</Text>
            </View>
          ) : (
            <FlatList
              data={recentItems}
              keyExtractor={(item) => item.id}
              renderItem={renderCaseRow}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
            />
          )}
        </View>

        {/* Footer disclaimer */}
        <View style={styles.footerLine} />
        <Text style={styles.disclaimer}>
          ⚕ This tool supports screening and does not replace clinical diagnosis.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },

  appHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing['2xl'],
    paddingTop: Spacing.md,
  },
  appName: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.heavy,
    color: Colors.primary,
    letterSpacing: Typography.trackUltraWide,
  },
  headerUnderline: {
    height: 1,
    backgroundColor: Colors.primary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
    width: 60,
  },
  appSubtitle: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    letterSpacing: Typography.trackWide,
    fontWeight: Typography.semibold,
  },

  ctaGlow: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    elevation: 10,
    marginBottom: Spacing.base,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 0,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    minHeight: 72,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
  },
  ctaContent: { flex: 1 },
  ctaLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textInverse,
    letterSpacing: Typography.trackUltraWide,
    opacity: 0.7,
    marginBottom: 2,
  },
  ctaText: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.textInverse,
  },
  ctaArrow: {
    fontSize: Typography['2xl'],
    color: Colors.textInverse,
    opacity: 0.7,
    fontWeight: Typography.bold,
  },

  offlineNotice: {
    flexDirection: 'row',
    backgroundColor: Colors.warningLight,
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 0,
    marginBottom: Spacing.base,
    overflow: 'hidden',
  },
  offlineAccent: {
    width: 3,
    backgroundColor: Colors.warning,
  },
  offlineContent: {
    flex: 1,
    padding: Spacing.md,
  },
  offlineLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.warning,
    letterSpacing: Typography.trackWide,
    marginBottom: 2,
  },
  offlineText: {
    fontSize: Typography.sm,
    color: Colors.warning,
    lineHeight: 18,
    fontWeight: Typography.medium,
  },

  section: { marginTop: Spacing.base },
  sectionTitle: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackUltraWide,
    marginBottom: Spacing.md,
  },

  caseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 0,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: TouchTarget.minHeight,
  },
  caseInfo: { flex: 1, marginRight: Spacing.md },
  caseName: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  caseDate: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: Typography.trackNormal,
  },
  caseBadges: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
    backgroundColor: Colors.surface,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: Spacing.sm,
    color: Colors.textMuted,
    fontWeight: Typography.bold,
  },
  emptyText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },

  footerLine: {
    height: 1,
    backgroundColor: Colors.border,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  disclaimer: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
