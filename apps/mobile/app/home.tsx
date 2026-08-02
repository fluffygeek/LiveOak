import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/lib/auth-context';
import { useApiClient } from '../src/lib/api-client';
import type { JobDraft } from '../src/lib/types';

/**
 * Home / one-job gate. `POST /jobs/draft` is idempotent — it returns the
 * technician's existing in-progress draft if one exists, or creates a new
 * one. There is never more than one draft per technician (enforced by a DB
 * unique constraint on job_drafts.technician_id), so this screen either
 * resumes that draft or offers to start a fresh one.
 */
export default function Home() {
  const { user, signOut } = useAuth();
  const { apiFetch } = useApiClient();
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDraft = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/jobs/draft', { method: 'POST' });
      if (res.ok) {
        setDraft(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  const hasInProgressWork = draft && (draft.jobNumber || draft.addressLine1 || draft.workCodeId);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 16 }}>Signed in as {user?.email}</Text>

      {hasInProgressWork ? (
        <View style={{ gap: 8, padding: 16, backgroundColor: '#fff3cd', borderRadius: 8 }}>
          <Text style={{ fontWeight: '600' }}>Resume in-progress job</Text>
          <Text>
            You must submit this job — or discard it — before starting another. Only one job may be
            in progress at a time.
          </Text>
          <Button title="Resume" onPress={() => router.push('/new-job')} />
        </View>
      ) : (
        <Button title="Start New Job" onPress={() => router.push('/new-job')} />
      )}

      <Button title="My Weekly Jobs" onPress={() => router.push('/weekly')} />
      <Button title="Sign Out" color="crimson" onPress={() => signOut()} />
    </View>
  );
}
