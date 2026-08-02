import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useApiClient } from '../src/lib/api-client';
import type { JobDraft, JobDraftPhoto, WorkCode } from '../src/lib/types';

export default function NewJob() {
  const { apiFetch } = useApiClient();
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [workCodes, setWorkCodes] = useState<WorkCode[]>([]);
  const [photos, setPhotos] = useState<JobDraftPhoto[]>([]);
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
        const confirmed = await confirmRes.json();
        setPhotos((prev) => [...prev, confirmed]);
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const canSubmit =
    ['verified', 'skipped_new_build', 'unavailable'].includes(draft.addressVerificationStatus) &&
    photos.length >= requiredPhotoCount;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontWeight: '600' }}>Job ID</Text>
      <TextInput value={jobNumber} onChangeText={setJobNumber} style={inputStyle} placeholder="Job number" />

      <Text style={{ fontWeight: '600' }}>Work Code</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {workCodes.map((wc) => (
          <Pressable
            key={wc.id}
            onPress={() => setWorkCodeId(wc.id)}
            style={{
              padding: 8,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: wc.id === workCodeId ? '#0a7' : '#ccc',
              backgroundColor: wc.id === workCodeId ? '#e6fff5' : 'white',
            }}
          >
            <Text>{wc.code}</Text>
          </Pressable>
        ))}
      </View>
      {selectedWorkCode && (
        <Text style={{ color: '#666' }}>
          {photos.length} of {selectedWorkCode.requiredPhotoCount} photos required
        </Text>
      )}

      <Text style={{ fontWeight: '600' }}>Footage</Text>
      <TextInput value={footage} onChangeText={setFootage} keyboardType="numeric" style={inputStyle} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontWeight: '600' }}>New build (skip USPS verification)</Text>
        <Switch value={isNewBuild} onValueChange={setIsNewBuild} />
      </View>

      <Text style={{ fontWeight: '600' }}>Address</Text>
      <TextInput value={addressLine1} onChangeText={setAddressLine1} style={inputStyle} placeholder="Line 1" />
      <TextInput value={addressLine2} onChangeText={setAddressLine2} style={inputStyle} placeholder="Line 2 (optional)" />
      <TextInput value={city} onChangeText={setCity} style={inputStyle} placeholder="City" />
      <TextInput value={state} onChangeText={setState} style={inputStyle} placeholder="State (2-letter)" maxLength={2} />
      <TextInput value={zip} onChangeText={setZip} style={inputStyle} placeholder="ZIP" keyboardType="numeric" />

      <Button title={verifying ? 'Verifying…' : 'Verify Address'} onPress={handleVerifyAddress} disabled={verifying} />
      <AddressVerificationStatus draft={draft} />

      <Text style={{ fontWeight: '600' }}>Notes</Text>
      <TextInput value={notes} onChangeText={setNotes} style={[inputStyle, { height: 80 }]} multiline />

      <Button title={saving ? 'Saving…' : 'Save'} onPress={saveDraft} disabled={saving} />

      <Text style={{ fontWeight: '600' }}>Photos ({photos.length})</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((p) => (
          <View key={p.id} style={{ width: 64, height: 64, backgroundColor: '#eee', borderRadius: 6 }} />
        ))}
      </View>
      <Button title={uploading ? 'Uploading…' : 'Add Photo'} onPress={handleAddPhoto} disabled={uploading} />

      {error && <Text style={{ color: 'crimson' }}>{error}</Text>}

      <Button title={submitting ? 'Submitting…' : 'Submit Job'} onPress={handleSubmit} disabled={!canSubmit || submitting} />
      <Button title="Discard Job" color="crimson" onPress={handleDiscard} />
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
  return <Text>{label[draft.addressVerificationStatus]}</Text>;
}

const inputStyle = {
  borderWidth: 1,
  borderColor: '#ccc',
  borderRadius: 6,
  padding: 8,
} as const;
