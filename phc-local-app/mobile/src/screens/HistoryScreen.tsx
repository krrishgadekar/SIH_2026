import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Routes } from '../navigation/routes';
import { useScreening } from '../context/ScreeningContext';
import { useQueueActions } from '../hooks/useQueue';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { uploadImageForScreening } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import SyncBadge from '../components/SyncBadge';
import PatientProgressionTimeline from '../components/PatientProgressionTimeline';
import { getSeverityDisplay } from '../utils/severityHelpers';
import { getQualityStatusDisplay } from '../utils/qualityHelpers';
import { formatDateTime } from '../utils/dateHelpers';
import { Colors, Typography, Spacing, Shadows, TouchTarget } from '../theme';
import { QueueItem, SyncStatus } from '../types/queue';

type ViewMode = 'records' | 'progression';
type FilterTab = 'all' | 'pending' | 'synced' | 'error';

export default function HistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { restoreSession } = useScreening();
  const {
    allItems,
    pendingCount,
    lastSyncAt,
    isSyncing,
    updateItemStatus,
    removeItem,
    setSyncing,
    setSyncDone,
  } = useQueueActions();
  const { isOnline } = useNetworkStatus();

  const [viewMode, setViewMode] = useState<ViewMode>('records');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [syncingItemId, setSyncingItemId] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  // Filter and search
  const filteredItems = useMemo(() => {
    return allItems
      .filter((item) => {
        // Tab filter
        if (activeFilter === 'pending' && item.syncStatus !== 'pending') return false;
        if (activeFilter === 'synced' && item.syncStatus !== 'synced') return false;
        if (activeFilter === 'error' && item.syncStatus !== 'error') return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const nameMatch = item.session.patient.name.toLowerCase().includes(q);
          const refMatch = item.session.patient.referenceId.toLowerCase().includes(q);
          return nameMatch || refMatch;
        }
        return true;
      })
      .reverse(); // Most recent first
  }, [allItems, activeFilter, searchQuery]);

  const handleOpenItem = useCallback((item: QueueItem) => {
    restoreSession(item.session);
    if (item.session.result) {
      navigation.navigate(Routes.Result);
    } else {
      Alert.alert(
        'Incomplete Screening',
        'This screening session has not completed AI analysis.',
        [{ text: 'OK' }]
      );
    }
  }, [navigation, restoreSession]);

  const handleSyncItem = useCallback(async (item: QueueItem) => {
    if (!isOnline) {
      Alert.alert('Offline', 'Internet connection required to sync records to the server.');
      return;
    }

    if (!item.session.imageUri) {
      Alert.alert('Sync Error', 'No image file associated with this screening.');
      return;
    }

    setSyncingItemId(item.id);
    await updateItemStatus(item.id, { syncStatus: 'uploading' });

    try {
      await uploadImageForScreening(
        item.session.imageUri,
        'retina.jpg',
        'image/jpeg'
      );

      const now = new Date().toISOString();
      await updateItemStatus(item.id, {
        syncStatus: 'synced',
        lastAttemptAt: now,
        errorMessage: null,
      });
      setSyncDone(now);

      Alert.alert('Success', 'Record synced successfully to server.');
    } catch (err: any) {
      await updateItemStatus(item.id, {
        syncStatus: 'error',
        lastAttemptAt: new Date().toISOString(),
        errorMessage: err.message || 'Sync failed',
        retryCount: (item.retryCount || 0) + 1,
      });
      Alert.alert('Sync Failed', err.message || 'Could not sync record. Please retry.');
    } finally {
      setSyncingItemId(null);
    }
  }, [isOnline, updateItemStatus, setSyncDone]);

  const handleSyncAllPending = useCallback(async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Internet connection required to sync records.');
      return;
    }

    const pending = allItems.filter((i) => i.syncStatus === 'pending' || i.syncStatus === 'error');
    if (pending.length === 0) return;

    setIsSyncingAll(true);
    setSyncing(true);
    let successCount = 0;
    let failCount = 0;

    for (const item of pending) {
      if (!item.session.imageUri) {
        failCount++;
        continue;
      }
      try {
        await updateItemStatus(item.id, { syncStatus: 'uploading' });
        await uploadImageForScreening(item.session.imageUri, 'retina.jpg', 'image/jpeg');
        const now = new Date().toISOString();
        await updateItemStatus(item.id, {
          syncStatus: 'synced',
          lastAttemptAt: now,
          errorMessage: null,
        });
        successCount++;
      } catch (err: any) {
        failCount++;
        await updateItemStatus(item.id, {
          syncStatus: 'error',
          lastAttemptAt: new Date().toISOString(),
          errorMessage: err.message || 'Upload failed',
          retryCount: (item.retryCount || 0) + 1,
        });
      }
    }

    const now = new Date().toISOString();
    setSyncDone(now);
    setIsSyncingAll(false);
    setSyncing(false);

    Alert.alert(
      'Sync Complete',
      `Synced: ${successCount}, Failed: ${failCount}`
    );
  }, [allItems, isOnline, updateItemStatus, setSyncing, setSyncDone]);

  const handleDeleteItem = useCallback((item: QueueItem) => {
    Alert.alert(
      'Remove Record',
      `Are you sure you want to remove the record for ${item.session.patient.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeItem(item.id),
        },
      ]
    );
  }, [removeItem]);

  const renderFilterButton = (label: string, filterKey: FilterTab, count?: number) => {
    const isActive = activeFilter === filterKey;
    return (
      <TouchableOpacity
        style={[styles.filterChip, isActive && styles.filterChipActive]}
        onPress={() => setActiveFilter(filterKey)}
        activeOpacity={0.7}
      >
        <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
          {label.toUpperCase()} {count !== undefined && count > 0 ? `(${count})` : ''}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }: { item: QueueItem }) => {
    const patient = item.session.patient;
    const result = item.session.result;
    const level = result?.severity?.level;
    const isReferable = result?.referableDR?.isReferable;
    const qualityStatus = result?.imageQuality?.status;
    const qualityInfo = qualityStatus ? getQualityStatusDisplay(qualityStatus) : null;
    const severityInfo = level !== undefined ? getSeverityDisplay(level) : null;
    const isItemSyncing = syncingItemId === item.id;

    const syncBadgeVariant =
      item.syncStatus === 'synced' ? 'success' :
      item.syncStatus === 'pending' ? 'warning' :
      item.syncStatus === 'uploading' ? 'info' : 'danger';

    return (
      <TouchableOpacity
        style={[styles.itemCard, Shadows.sm]}
        onPress={() => handleOpenItem(item)}
        activeOpacity={0.8}
      >
        {/* Header row */}
        <View style={styles.itemHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.patientName}>{patient.name}</Text>
            <Text style={styles.patientMeta}>
              AGE: {patient.age} · ID: {patient.referenceId}
            </Text>
          </View>
          <StatusBadge
            label={item.syncStatus}
            variant={syncBadgeVariant}
            size="sm"
          />
        </View>

        {/* Clinical Summary */}
        <View style={styles.badgeRow}>
          {severityInfo && (
            <StatusBadge
              label={`Grade ${level}: ${severityInfo.shortLabel}`}
              variant={level! >= 3 ? 'danger' : level! >= 2 ? 'warning' : 'success'}
              size="sm"
            />
          )}
          {isReferable && (
            <StatusBadge
              label="REFERRAL REQUIRED"
              variant="danger"
              size="sm"
            />
          )}
          {qualityInfo && (
            <StatusBadge
              label={`Quality: ${qualityInfo.badgeText}`}
              variant={qualityStatus === 'pass' ? 'success' : qualityStatus === 'borderline' ? 'warning' : 'danger'}
              size="sm"
            />
          )}
        </View>

        {/* Error notification if failed */}
        {item.syncStatus === 'error' && item.errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠ SYNC ERROR: {item.errorMessage}</Text>
          </View>
        )}

        {/* Footer info & actions */}
        <View style={styles.itemFooter}>
          <Text style={styles.dateText}>{formatDateTime(item.session.createdAt)}</Text>
          <View style={styles.actionRow}>
            {item.syncStatus !== 'synced' && (
              <TouchableOpacity
                style={styles.syncButton}
                onPress={() => handleSyncItem(item)}
                disabled={isItemSyncing || isSyncingAll}
                activeOpacity={0.7}
              >
                {isItemSyncing ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={styles.syncButtonText}>SYNC</Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteItem(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Sync state descriptor
  const syncStateDescriptor = isSyncingAll || isSyncing
    ? 'SYNCING IN PROGRESS'
    : pendingCount === 0
    ? 'ALL RECORDS SYNCHRONIZED'
    : `${pendingCount} PENDING SYNCHRONIZATION`;

  return (
    <SafeAreaView style={styles.safe}>
      {/* App Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>SCREENING REGISTRY</Text>
          <Text style={styles.headerSubtitle}>
            {allItems.length} total cases · {pendingCount} pending upload
          </Text>
        </View>
        <SyncBadge isOnline={isOnline} pendingCount={pendingCount} />
      </View>

      {/* Feature 7: Offline-First Status Dashboard Panel */}
      <View style={styles.offlineStatusCard}>
        <View style={styles.statusRow}>
          {/* Current connectivity */}
          <View style={styles.statusCol}>
            <Text style={styles.statusColLabel}>CONNECTIVITY</Text>
            <View style={styles.statusInline}>
              <View
                style={[
                  styles.statusIndicatorDot,
                  { backgroundColor: isOnline ? Colors.success : Colors.warning },
                ]}
              />
              <Text
                style={[
                  styles.statusColValue,
                  { color: isOnline ? Colors.success : Colors.warning },
                ]}
              >
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>

          {/* Pending cases */}
          <View style={styles.statusCol}>
            <Text style={styles.statusColLabel}>PENDING</Text>
            <Text
              style={[
                styles.statusColValue,
                { color: pendingCount > 0 ? Colors.primary : Colors.textPrimary },
              ]}
            >
              {pendingCount} {pendingCount === 1 ? 'CASE' : 'CASES'}
            </Text>
          </View>

          {/* Last sync */}
          <View style={[styles.statusCol, { flex: 1.2 }]}>
            <Text style={styles.statusColLabel}>LAST SYNC</Text>
            <Text style={styles.statusColValueSmall}>
              {lastSyncAt ? formatDateTime(lastSyncAt) : 'Not synced yet'}
            </Text>
          </View>
        </View>

        {/* Sync status & Sync All button */}
        <View style={styles.syncActionBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.syncStateText}>STATUS: {syncStateDescriptor}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.syncAllButton,
              (!isOnline || isSyncingAll || pendingCount === 0) && styles.syncAllButtonDisabled,
            ]}
            onPress={handleSyncAllPending}
            disabled={!isOnline || isSyncingAll || pendingCount === 0}
            activeOpacity={0.8}
            id="btn-sync-all"
          >
            {isSyncingAll ? (
              <ActivityIndicator size="small" color={Colors.textInverse} />
            ) : (
              <Text style={styles.syncAllButtonText}>SYNC ALL ({pendingCount})</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Feature 6: View Mode Switcher [Records | Patient Progression] */}
      <View style={styles.viewModeBar}>
        <TouchableOpacity
          style={[styles.viewModeTab, viewMode === 'records' && styles.viewModeTabActive]}
          onPress={() => setViewMode('records')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.viewModeText,
              viewMode === 'records' && styles.viewModeTextActive,
            ]}
          >
            ALL SCREENING RECORDS ({allItems.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewModeTab, viewMode === 'progression' && styles.viewModeTabActive]}
          onPress={() => setViewMode('progression')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.viewModeText,
              viewMode === 'progression' && styles.viewModeTextActive,
            ]}
          >
            PATIENT PROGRESSION
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search patient name or reference ID..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clearSearch}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* View Mode: Patient Progression Timeline */}
      {viewMode === 'progression' ? (
        <View style={styles.progressionContainer}>
          <PatientProgressionTimeline
            items={filteredItems}
            onSelectRecord={handleOpenItem}
          />
        </View>
      ) : (
        <>
          {/* Filter Tabs */}
          <View style={styles.filterRow}>
            {renderFilterButton('All', 'all', allItems.length)}
            {renderFilterButton('Pending', 'pending', pendingCount)}
            {renderFilterButton(
              'Synced',
              'synced',
              allItems.filter((i) => i.syncStatus === 'synced').length
            )}
            {renderFilterButton(
              'Errors',
              'error',
              allItems.filter((i) => i.syncStatus === 'error').length
            )}
          </View>

          {/* Case List */}
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>—</Text>
                <Text style={styles.emptyTitle}>No records found</Text>
                <Text style={styles.emptyText}>
                  {searchQuery
                    ? 'Try adjusting your search query or filter.'
                    : 'Completed screenings will appear here for local review and syncing.'}
                </Text>
              </View>
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.heavy,
    color: Colors.textPrimary,
    letterSpacing: Typography.trackWide,
  },
  headerSubtitle: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: Typography.trackWide,
  },

  offlineStatusCard: {
    backgroundColor: Colors.surfaceDark,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statusRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  statusCol: {
    flex: 1,
  },
  statusColLabel: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackWide,
    marginBottom: 2,
  },
  statusInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 0,
  },
  statusColValue: {
    fontSize: Typography.xs,
    fontWeight: Typography.heavy,
    letterSpacing: 0.5,
  },
  statusColValueSmall: {
    fontSize: 9,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  syncActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  syncStateText: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackWide,
  },
  syncAllButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncAllButtonDisabled: {
    backgroundColor: Colors.neutral400,
    borderColor: Colors.neutral400,
  },
  syncAllButtonText: {
    color: Colors.textInverse,
    fontSize: 10,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
  },

  viewModeBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  viewModeTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  viewModeTabActive: {
    borderBottomColor: Colors.primary,
    backgroundColor: Colors.primaryFaded,
  },
  viewModeText: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    letterSpacing: Typography.trackWide,
  },
  viewModeTextActive: {
    color: Colors.primary,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 40,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: Spacing.sm,
    color: Colors.textMuted,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.textPrimary,
  },
  clearSearch: {
    fontSize: 14,
    color: Colors.textMuted,
    padding: Spacing.xs,
  },

  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 0,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  filterChipText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textSecondary,
    letterSpacing: Typography.trackWide,
  },
  filterChipTextActive: {
    color: Colors.textInverse,
  },

  listContent: {
    padding: Spacing.base,
    paddingBottom: Spacing['3xl'],
  },
  progressionContainer: {
    padding: Spacing.base,
  },

  itemCard: {
    backgroundColor: Colors.surface,
    borderRadius: 0,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  patientName: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  patientMeta: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: Typography.trackWide,
    fontWeight: Typography.semibold,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  errorBox: {
    backgroundColor: Colors.dangerLight,
    padding: Spacing.sm,
    borderRadius: 0,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  errorText: {
    fontSize: Typography.xs,
    color: Colors.danger,
    fontWeight: Typography.bold,
    letterSpacing: Typography.trackWide,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  dateText: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  syncButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaded,
  },
  syncButtonText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.primary,
    letterSpacing: Typography.trackWide,
  },
  deleteButton: {
    padding: Spacing.xs,
    borderRadius: 0,
  },
  deleteButtonText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: Spacing.md,
    color: Colors.textMuted,
    fontWeight: Typography.bold,
  },
  emptyTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  emptyText: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
