import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useNavigation } from 'expo-router';
import { useApiClient } from '../src/lib/api-client';
import type { JobDraft, JobDraftPhoto, WorkCode } from '../src/lib/types';
import { Button } from '../src/components/Button';
import { TextField } from '../src/components/TextField';
import { Banner } from '../src/components/Banner';
import { Card } from '../src/components/Card';
import { HeaderButton } from '../src/components/HeaderButton';
import { colors, minTouchTarget, radius, spacing } from '../src/theme';

export default function NewJob() {
  const { apiFetch } = useApiClient();
  const navigation = useNavigation();
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [workCodes, setWorkCodes] = useState<WorkCode[]>([]);
  const [photos, setPhotos] = useState<JobDraftPhoto[]>([]);
  // Local capture previews, keyed by photo id — only available for photos
  // added this session (we have the on-device URI right after capture).
  // Photos loaded from a resumed draft have no download endpoint, so they
  // fall back to a placeholder tile.
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [footageError, setFootageError] = useState<string | null>(null);

  // Local editable copies of the form fields.
  const [jobNumber, setJobNumber] = useState('');
  const [workCodeId, setWorkCodeId] = useState<string | null>(null);
  const [footage, setFootage] = useState('');
  const [notes, setNotes] = useState('');
  const [isNewBuild, setIsNewBuild] = useState(false);
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');

  const selectedWorkCode = workCodes.find((wc) => wc.id === workCodeId);
  const requiredPhotoCount = selectedWorkCode?.requiredPhotoCount ?? 3;
  const photosRemaining = Math.max(requiredPhotoCount - photos.length, 0);

  const loadDraftAndPhotos = useCallback(
    async (draftId: string) => {
      const res = await apiFetch(`/jobs/draft/${draftId}/photos`);
      if (res.ok) setPhotos(await res.json());
    },
    [apiFetch],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [draftRes, workCodesRes] = await Promise.all([
        apiFetch('/jobs/draft', { method: 'POST' }),
        apiFetch('/work-codes'),
      ]);
      if (draftRes.ok) {
        const d: JobDraft = await draftRes.json();
        setDraft(d);
        setJobNumber(d.jobNumber ?? '');
        setWorkCodeId(d.workCodeId);
        setFootage(d.footage ?? '');
        setNotes(d.notes ?? '');
        setIsNewBuild(d.isNewBuild);
        setAddressLine1(d.addressLine1 ?? '');
        setAddressLine2(d.addressLine2 ?? '');
        setCity(d.city ?? '');
        setState(d.state ?? '');
        setZip(d.zip ?? '');
        await loadDraftAndPhotos(d.id);
      } else {
        setLoadError(true);
      }
      if (workCodesRes.ok) setWorkCodes(await workCodesRes.json());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, loadDraftAndPhotos]);

  useEffect(() => {
    // Intentionally run once on mount only — loadAll's identity changes with apiFetch,
    // and re-running it would clobber in-progress edits with the server's copy.
    loadAll();
  }, []);

  async function saveDraft(): Promise<JobDraft | null> {
    if (!draft) return null;

    // Validate locally so a stray non-numeric footage value doesn't silently
    // turn into `undefined` (dropped from the request) or a rejected `null`.
    let footageValue: number | null;
    if (footage.trim() === '') {
      footageValue = null;
      setFootageError(null);
    } else {
      const parsed = Number(footage);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setFootageError('Enter a positive number.');
        return null;
      }
      footageValue = parsed;
      setFootageError(null);
    }

    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/jobs/draft/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobNumber: jobNumber || undefined,
          workCodeId: workCodeId || undefined,
          footage: footageValue,
          // null (not omitted) so a technician can clear a previously-set
          // value — the API distinguishes "clear" (null) from "leave
          // untouched" (omitted).
          notes: notes || null,
          isNewBuild,
          addressLine1: addressLine1 || undefined,
          addressLine2: addressLine2 || null,
          city: city || undefined,
          state: state || undefined,
          zip: zip || undefined,
        }),
      });
      if (!res.ok) {
        setError('Could not save — check the form for missing/invalid fields.');
        return null;
      }
      const updated: JobDraft = await res.json();
      setDraft(updated);
      return updated;
    } catch {
      setError('Could not save. Check your connection and try again.');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleVerifyAddress() {
    const saved = await saveDraft();
    if (!saved) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await apiFetch(`/jobs/draft/${saved.id}/verify-address`, { method: 'POST' });
      if (!res.ok) {
        setError('Address verification failed to run — fill in the full address first.');
        return;
      }
      setDraft(await res.json());
    } catch {
      setError('Could not reach the address verification service. Check your connection.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleAddPhoto() {
    if (!draft) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission required', 'Enable camera access to attach job photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const contentType = asset.mimeType ?? 'image/jpeg';
    setUploading(true);
    setError(null);
    try {
      const presignRes = await apiFetch(`/jobs/draft/${draft.id}/photos/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType }),
      });
      if (!presignRes.ok) {
        setError('Could not start photo upload.');
        return;
      }
      const { key, uploadUrl } = await presignRes.json();

      const fileRes = await fetch(asset.uri);
      const blob = await fileRes.blob();
      const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
      if (!putRes.ok) {
        setError('Photo upload to storage failed. Try again.');
        return;
      }

      const confirmRes = await apiFetch(`/jobs/draft/${draft.id}/photos/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, contentType }),
      });
      if (confirmRes.ok) {
        const confirmed: JobDraftPhoto = await confirmRes.json();
        setPhotos((prev) => [...prev, confirmed]);
        setPhotoPreviews((prev) => ({ ...prev, [confirmed.id]: asset.uri }));
      } else {
        setError('Photo uploaded but could not be confirmed. Try adding it again.');
      }
    } catch {
      setError('Photo upload failed. Check your connection and try again.');
    } finally {
      setUploading(false);
    }
  }

  const handleDiscard = useCallback(() => {
    if (!draft) return;
    Alert.alert('Discard job?', 'This will permanently delete this in-progress job and its photos.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          setDiscarding(true);
          try {
            const res = await apiFetch(`/jobs/draft/${draft.id}`, { method: 'DELETE' });
            if (!res.ok) {
              setError('Could not discard this job. Try again.');
              return;
            }
          } catch {
            setError('Could not discard this job. Check your connection.');
            return;
          } finally {
            setDiscarding(false);
          }
          router.replace('/home');
        },
      },
    ]);
  }, [apiFetch, draft]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => <HeaderButton title="Discard" onPress={handleDiscard} tone="danger" loading={discarding} />,
    });
  }, [navigation, handleDiscard, discarding]);

  async function handleSubmit() {
    const saved = await saveDraft();
    if (!saved) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/jobs/draft/${saved.id}/submit`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(`Could not submit: ${body.error ?? 'unknown error'}`);
        return;
      }
      Alert.alert('Job submitted', 'Your job has been recorded.');
      router.replace('/home');
    } catch {
      setError('Could not submit. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingLabel}>Loading job…</Text>
      </View>
    );
  }

  if (loadError || !draft) {
    return (
      <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]}>
        <Banner tone="danger" message="Could not load this job. Check your connection and try again." />
        <Button title="Retry" onPress={loadAll} variant="secondary" />
      </View>
    );
  }

  const addressVerified = ['verified', 'skipped_new_build', 'unavailable'].includes(draft.addressVerificationStatus);
  const photosComplete = photos.length >= requiredPhotoCount;
  const canSubmit = addressVerified && photosComplete;

  const blockers: string[] = [];
  if (!addressVerified) blockers.push('Verify the address');
  if (!photosComplete) blockers.push(`Add ${photosRemaining} more photo${photosRemaining === 1 ? '' : 's'}`);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {error && <Banner tone="danger" message={error} />}

        <ChecklistSummary addressVerified={addressVerified} photosComplete={photosComplete} photosLabel={`${photos.length}/${requiredPhotoCount}`} />

        <Card style={styles.section}>
          <TextField label="Job ID" value={jobNumber} onChangeText={setJobNumber} placeholder="Job number" />

          <View>
            <Text style={styles.sectionLabel}>Work Code</Text>
            <View style={styles.chipRow}>
              {workCodes.map((wc) => {
                const selected = wc.id === workCodeId;
                return (
                  <Pressable
                    key={wc.id}
                    onPress={() => setWorkCodeId(wc.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    {selected && <Text style={styles.chipCheck}>✓ </Text>}
                    <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{wc.code}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <TextField
            label="Footage"
            value={footage}
            onChangeText={(v) => {
              setFootage(v);
              if (footageError) setFootageError(null);
            }}
            keyboardType="numeric"
            error={footageError}
          />

          <View style={styles.row}>
            <Text style={styles.sectionLabel}>New build (skip USPS verification)</Text>
            <Switch value={isNewBuild} onValueChange={setIsNewBuild} trackColor={{ true: colors.primary }} />
          </View>

          <TextField label="Notes" value={notes} onChangeText={setNotes} style={styles.notesInput} multiline />

          <Button title="Save Draft" onPress={saveDraft} loading={saving} variant="secondary" />
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionLabel}>Address</Text>
          <TextField label="Line 1" value={addressLine1} onChangeText={setAddressLine1} required />
          <TextField label="Line 2 (optional)" value={addressLine2} onChangeText={setAddressLine2} />
          <TextField label="City" value={city} onChangeText={setCity} required />
          <TextField label="State" value={state} onChangeText={setState} maxLength={2} required />
          <TextField label="ZIP" value={zip} onChangeText={setZip} keyboardType="numeric" required />

          <Button
            title={verifying ? 'Verifying…' : 'Verify Address'}
            onPress={handleVerifyAddress}
            loading={verifying}
            variant="secondary"
          />
          <AddressVerificationStatus draft={draft} />
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionLabel}>Photos ({photos.length} of {requiredPhotoCount} required)</Text>
          <View style={styles.chipRow}>
            {photos.map((p) =>
              photoPreviews[p.id] ? (
                <Image key={p.id} source={{ uri: photoPreviews[p.id] }} style={styles.photoThumb} />
              ) : (
                <View key={p.id} style={styles.photoPlaceholder}>
                  <Text style={styles.photoPlaceholderLabel}>📷</Text>
                </View>
              ),
            )}
            <Pressable
              onPress={handleAddPhoto}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Add photo"
              style={[styles.photoAddTile, uploading && styles.disabled]}
            >
              <Text style={styles.photoAddIcon}>{uploading ? '…' : '＋'}</Text>
              <Text style={styles.photoAddLabel}>{uploading ? 'Uploading' : 'Add Photo'}</Text>
            </Pressable>
          </View>
          {!photosComplete && (
            <Text style={styles.photoHint}>
              {photosRemaining} more photo{photosRemaining === 1 ? '' : 's'} required before you can submit.
            </Text>
          )}
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        {blockers.length > 0 && (
          <Text style={styles.footerBlockers} numberOfLines={2}>
            Before you submit: {blockers.join(' · ')}
          </Text>
        )}
        <Button
          title={submitting ? 'Submitting…' : 'Submit Job'}
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={submitting}
        />
      </View>
    </View>
  );
}

function ChecklistSummary({
  addressVerified,
  photosComplete,
  photosLabel,
}: {
  addressVerified: boolean;
  photosComplete: boolean;
  photosLabel: string;
}) {
  return (
    <View style={styles.checklist}>
      <ChecklistItem done={addressVerified} label="Address verified" />
      <ChecklistItem done={photosComplete} label={`Photos ${photosLabel}`} />
    </View>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={[styles.checklistItem, done ? styles.checklistItemDone : styles.checklistItemPending]}>
      <Text style={[styles.checklistIcon, { color: done ? colors.success : colors.warning }]}>{done ? '✓' : '○'}</Text>
      <Text style={[styles.checklistLabel, { color: done ? colors.success : colors.warning }]}>{label}</Text>
    </View>
  );
}

function AddressVerificationStatus({ draft }: { draft: JobDraft }) {
  const config: Record<JobDraft['addressVerificationStatus'], { text: string; color: string; icon: string }> = {
    pending: { text: 'Not yet verified', color: colors.textMuted, icon: '○' },
    verified: {
      text: `Verified: ${draft.verifiedAddressLine1}, ${draft.verifiedCity}, ${draft.verifiedState} ${draft.verifiedZip}`,
      color: colors.success,
      icon: '✓',
    },
    failed: { text: 'USPS could not match this address — please correct it.', color: colors.danger, icon: '✕' },
    skipped_new_build: { text: 'Skipped (new build)', color: colors.textMuted, icon: '⏭' },
    unavailable: { text: 'USPS unavailable — flagged for payroll admin follow-up.', color: colors.warning, icon: '⚠' },
  };
  const { text, color, icon } = config[draft.addressVerificationStatus];
  return (
    <View style={styles.verifyStatusRow}>
      <Text style={[styles.verifyStatusIcon, { color }]}>{icon}</Text>
      <Text style={[styles.verifyStatusText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    // Leave room so the last field isn't hidden behind the sticky submit footer.
    paddingBottom: spacing.xxl,
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
  muted: {
    color: colors.textMuted,
  },
  disabled: {
    opacity: 0.5,
  },
  sectionLabel: {
    fontWeight: '600',
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: minTouchTarget,
  },
  section: {
    gap: spacing.md,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.infoBg,
  },
  chipCheck: {
    color: colors.primary,
    fontWeight: '700',
  },
  chipLabel: {
    color: colors.text,
    fontSize: 15,
  },
  chipLabelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: radius,
    backgroundColor: colors.border,
  },
  photoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: radius,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderLabel: {
    fontSize: 22,
  },
  photoAddTile: {
    width: 72,
    height: 72,
    borderRadius: radius,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  photoAddIcon: {
    fontSize: 20,
    color: colors.primary,
    fontWeight: '700',
  },
  photoAddLabel: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '600',
  },
  photoHint: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  checklist: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
  },
  checklistItemDone: {
    backgroundColor: colors.successBg,
    borderColor: colors.success,
  },
  checklistItemPending: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warning,
  },
  checklistIcon: {
    fontWeight: '700',
    fontSize: 13,
  },
  checklistLabel: {
    fontWeight: '600',
    fontSize: 13,
  },
  verifyStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  verifyStatusIcon: {
    fontWeight: '700',
  },
  verifyStatusText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerBlockers: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.warning,
    textAlign: 'center',
  },
});
