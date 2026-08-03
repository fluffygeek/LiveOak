import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useApiClient } from '../src/lib/api-client';
import type { SubmittedJob } from '../src/lib/types';
import { Button } from '../src/components/Button';
import { Badge } from '../src/components/Badge';
import { EmptyState } from '../src/components/EmptyState';
import { colors, spacing } from '../src/theme';

/**
 * Read-only. No edit/delete affordances anywhere on this screen — submitted
 * jobs are immutable from the technician's perspective (design plan §4).
 * The list resets every Sunday at midnight America/New_York; the window is
 * computed server-side on every request, so there's nothing to "refresh"
 * client-side beyond a normal pull-to-refresh for new submissions.
 */
export default function Weekly() {
  const { apiFetch } = useApiClient();
  const [jobs, setJobs] = useState<SubmittedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await apiFetch('/jobs/mine');
      if (res.ok) {
        setJobs(await res.json());
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    }
  }, [apiFetch]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>This week's submissions — resets Sunday midnight Eastern.</Text>
      {loadError ? (
        <View style={[styles.center, { gap: spacing.md, marginTop: spacing.xl }]}>
          <Text style={styles.muted}>Could not load your submissions. Check your connection and try again.</Text>
          <Button title="Retry" onPress={load} variant="secondary" />
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(job) => job.id}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            try {
              await load();
            } finally {
              setRefreshing(false);
            }
          }}
          ListEmptyComponent={<EmptyState label="No jobs submitted this week yet." />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.jobNumber}>{item.jobNumber}</Text>
              <Text style={styles.address}>
                {item.addressLine1}, {item.city} {item.zip}
              </Text>
              <Text style={styles.muted}>
                {new Date(item.submittedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
              </Text>
              {item.isDiscrepancy && <Badge label="Discrepancy" variant="warning" />}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    marginBottom: spacing.md,
    color: colors.textMuted,
  },
  muted: {
    color: colors.textMuted,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  row: {
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  jobNumber: {
    fontWeight: '600',
    color: colors.text,
  },
  address: {
    color: colors.text,
  },
});
