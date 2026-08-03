import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useApiClient } from '../src/lib/api-client';
import type { JobDraft, JobDraftPhoto, WorkCode } from '../src/lib/types';
import { Button } from '../src/components/Button';
import { TextField } from '../src/components/TextField';
import { colors, radius, spacing } from '../src/theme';

export default function NewJob() {
  const { apiFetch } = useApiClient();
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [workCodes, setWorkCodes] = useState<WorkCode[]>([]);
  const [photos, setPhotos] = useState<JobDraftPhoto[]>([]);
  // Local capture previews, keyed by photo id — only available for photos
  // added this session (we have the on-device URI right after capture).
  // Photos loaded from a resumed draft have no download endpoint, so they
  // fall back to a placeholder tile.
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const loadDraftAndPhotos = useCallback(
    async (draftId: string) => {
      const res = await apiFetch(`/jobs/draft/${draftId}/photos`);
      if (res.ok) setPhotos(await res.json());
    },
    [apiFetch],
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
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
        }
        if (workCodesRes.ok) setWorkCodes(await workCodesRes.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveDraft(): Promise<JobDraft | null> {
    if (!draft) return null;

    // Validate locally so a stray non-numeric footage value doesn't silently
    // turn into `undefined` (dropped from the request) or a rejected `null`.
    let footageValue: number | null;
    if (footage.trim() === '') {
      footageValue = null;
    } else {
      const parsed = Number(footage);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Footage must be a positive number.');
        return null;
      }
      footageValue = parsed;
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
        setError('Photo upload to storage failed.');
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
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDiscard() {
    if (!draft) return;
    Alert.alert('Discard job?', 'This will permanently delete this in-progress job and its photos.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await apiFetch(`/jobs/draft/${draft.id}`, { method: 'DELETE' });
            if (!res.ok) {
              setError('Could not discard this job. Try again.');
              return;
            }
          } catch {
            setError('Could not discard this job. Check your connection.');
            return;
          }
          router.replace('/home');
        },
      },
    ]);
  }

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
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !draft) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  const canSubmit =
    ['verified', 'skipped_new_build', 'unavailable'].includes(draft.addressVerificationStatus) &&
    photos.length >= requiredPhotoCount;

  return (
    <ScrollView contentContainerStyle={styles.container} style={{ backgroundColor: colors.bg }}>
      <TextField label="Job ID" value={jobNumber} onChangeText={setJobNumber} placeholder="Job number" />

      <View>
        <Text style={styles.sectionLabel}>Work Code</Text>
        <View style={styles.chipRow}>
          {workCodes.map((wc) => (
            <Pressable
              key={wc.id}
              onPress={() => setWorkCodeId(wc.id)}
              style={[styles.chip, wc.id === workCodeId && styles.chipSelected]}
            >
              <Text style={[styles.chipLabel, wc.id === workCodeId && styles.chipLabelSelected]}>{wc.code}</Text>
            </Pressable>
          ))}
        </View>
        {selectedWorkCode && (
          <Text style={styles.muted}>
            {photos.length} of {selectedWorkCode.requiredPhotoCount} photos required
          </Text>
        )}
      </View>

      <TextField label="Footage" value={footage} onChangeText={setFootage} keyboardType="numeric" />

      <View style={styles.row}>
        <Text style={styles.sectionLabel}>New build (skip USPS verification)</Text>
        <Switch value={isNewBuild} onValueChange={setIsNewBuild} trackColor={{ true: colors.primary }} />
      </View>

      <View style={styles.addressGroup}>
        <Text style={styles.sectionLabel}>Address</Text>
        <TextField label="Line 1" value={addressLine1} onChangeText={setAddressLine1} />
        <TextField label="Line 2 (optional)" value={addressLine2} onChangeText={setAddressLine2} />
        <TextField label="City" value={city} onChangeText={setCity} />
        <TextField label="State" value={state} onChangeText={setState} maxLength={2} />
        <TextField label="ZIP" value={zip} onChangeText={setZip} keyboardType="numeric" />
      </View>

      <Button title={verifying ? 'Verifying…' : 'Verify Address'} onPress={handleVerifyAddress} loading={verifying} variant="secondary" />
      <AddressVerificationStatus draft={draft} />

      <TextField label="Notes" value={notes} onChangeText={setNotes} style={styles.notesInput} multiline />

      <Button title="Save" onPress={saveDraft} loading={saving} variant="secondary" />

      <View>
        <Text style={styles.sectionLabel}>Photos ({photos.length})</Text>
        <View style={styles.chipRow}>
          {photos.map((p) =>
            photoPreviews[p.id] ? (
              <Image key={p.id} source={{ uri: photoPreviews[p.id] }} style={styles.photoThumb} />
            ) : (
              <View key={p.id} style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderLabel}>Photo</Text>
              </View>
            ),
          )}
        </View>
      </View>
      <Button title={uploading ? 'Uploading…' : 'Add Photo'} onPress={handleAddPhoto} loading={uploading} variant="secondary" />

      {error && <Text style={styles.error}>{error}</Text>}

      <Button title={submitting ? 'Submitting…' : 'Submit Job'} onPress={handleSubmit} disabled={!canSubmit} loading={submitting} />
      <Button title="Discard Job" onPress={handleDiscard} variant="danger" />
    </ScrollView>
  );
}

function AddressVerificationStatus({ draft }: { draft: JobDraft }) {
  const label: Record<JobDraft['addressVerificationStatus'], string> = {
    pending: 'Not yet verified',
    verified: `✅ Verified: ${draft.verifiedAddressLine1}, ${draft.verifiedCity}, ${draft.verifiedState} ${draft.verifiedZip}`,
    failed: '⚠️ USPS could not match this address — please correct it.',
    skipped_new_build: '⏭️ Skipped (new build)',
    unavailable: '⚫ USPS unavailable — flagged for payroll admin follow-up.',
  };
  return <Text style={styles.muted}>{label[draft.addressVerificationStatus]}</Text>;
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  muted: {
    color: colors.textMuted,
  },
  error: {
    color: colors.danger,
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
  },
  addressGroup: {
    gap: spacing.sm,
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: '#eef2fd',
  },
  chipLabel: {
    color: colors.text,
  },
  chipLabelSelected: {
    color: colors.primary,
    fontWeight: '600',
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
    fontSize: 11,
    color: colors.textMuted,
  },
});
