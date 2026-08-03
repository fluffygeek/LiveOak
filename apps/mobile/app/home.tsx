import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/lib/auth-context';
import { useApiClient } from '../src/lib/api-client';
import type { JobDraft } from '../src/lib/types';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { colors, spacing } from '../src/theme';

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
  const [loadError, setLoadError] = useState(false);

  const loadDraft = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await apiFetch('/jobs/draft', { method: 'POST' });
      if (res.ok) {
        setDraft(await res.json());
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
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
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]}>
        <Text style={styles.muted}>Could not load your account. Check your connection and try again.</Text>
        <Button title="Retry" onPress={loadDraft} variant="secondary" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.signedInAs}>Signed in as {user?.email}</Text>

      {hasInProgressWork ? (
        <Card style={styles.resumeCard}>
          <Text style={styles.resumeTitle}>Resume in-progress job</Text>
          <Text style={styles.muted}>
            You must submit this job — or discard it — before starting another. Only one job may be in
            progress at a time.
          </Text>
          <Button title="Resume" onPress={() => router.push('/new-job')} />
        </Card>
      ) : (
        <Button title="Start New Job" onPress={() => router.push('/new-job')} />
      )}

      <Button title="My Weekly Jobs" onPress={() => router.push('/weekly')} variant="secondary" />
      <Button title="Sign Out" onPress={() => signOut()} variant="danger" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.lg,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  signedInAs: {
    fontSize: 15,
    color: colors.text,
  },
  muted: {
    color: colors.textMuted,
  },
  resumeCard: {
    gap: spacing.sm,
    backgroundColor: colors.warningBg,
    borderColor: colors.warning,
  },
  resumeTitle: {
    fontWeight: '600',
    color: colors.warning,
  },
});
