import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { useApiClient } from '../src/lib/api-client';
import type { SubmittedJob } from '../src/lib/types';

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

  const load = useCallback(async () => {
    const res = await apiFetch('/jobs/mine');
    if (res.ok) setJobs(await res.json());
  }, [apiFetch]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ marginBottom: 12, color: '#666' }}>
        This week's submissions — resets Sunday midnight Eastern.
      </Text>
      <FlatList
        data={jobs}
        keyExtractor={(job) => job.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={<Text>No jobs submitted this week yet.</Text>}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontWeight: '600' }}>{item.jobNumber}</Text>
            <Text>
              {item.addressLine1}, {item.city} {item.zip}
            </Text>
            <Text style={{ color: '#666' }}>
              {new Date(item.submittedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
            </Text>
            {item.isDiscrepancy && <Text style={{ color: '#b45309' }}>⚠️ Flagged for discrepancy</Text>}
          </View>
        )}
      />
    </View>
  );
}
