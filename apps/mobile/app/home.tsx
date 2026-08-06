import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { useAuth } from '../src/lib/auth-context';
import { useApiClient } from '../src/lib/api-client';
import type { JobDraft } from '../src/lib/types';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Banner } from '../src/components/Banner';
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
  const navigation = useNavigation();
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  function confirmSignOut() {
    Alert.alert('Sign out?', "You'll need to sign in again to log jobs.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button title="Sign Out" onPress={confirmSignOut} variant="ghost" size="compact" />
      ),
    });
  }, [navigation]);

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
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingLabel}>Loading your account…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]}>
        <Banner tone="danger" message="Could not load your account. Check your connection and try again." />
        <Button title="Retry" onPress={loadDraft} variant="secondary" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.signedInAs}>Signed in as {user?.email}</Text>

      {hasInProgressWork ? (
        <Card style={styles.resumeCard}>
          <Text style={styles.resumeTitle}>🕐 Resume in-progress job</Text>
          <Text style={styles.resumeBody}>
            You must submit this job — or discard it — before starting another. Only one job may be in
            progress at a time.
          </Text>
          <Button title="Resume" onPress={() => router.push('/new-job')} />
        </Card>
      ) : (
        <Button title="Start New Job" onPress={() => router.push('/new-job')} />
      )}

      <Button title="My Weekly Jobs" onPress={() => router.push('/weekly')} variant="secondary" />
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
    gap: spacing.md,
  },
  loadingLabel: {
    color: colors.textMuted,
    fontSize: 15,
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
    borderWidth: 1.5,
  },
  resumeTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: colors.warning,
  },
  resumeBody: {
    color: colors.text,
  },
});
