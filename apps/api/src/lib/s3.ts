import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../env.js';

const UPLOAD_URL_TTL_SECONDS = 300;
const DOWNLOAD_URL_TTL_SECONDS = 300;

const ALLOWED_PHOTO_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/webp']);

export function isAllowedPhotoContentType(contentType: string): boolean {
  return ALLOWED_PHOTO_CONTENT_TYPES.has(contentType.toLowerCase());
}

export function createS3Client(env: Env): S3Client {
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    // Path-style addressing is required by most S3-compatible providers
    // (R2, MinIO) when a custom endpoint is set; real AWS S3 works either way.
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
}

/** Signed PUT URL for a technician's client to upload a draft job photo directly to S3. */
export async function createPhotoUploadUrl(
  s3: S3Client,
  bucket: string,
  draftId: string,
  contentType: string,
): Promise<{ key: string; uploadUrl: string }> {
  const key = `job-photos/${draftId}/${randomUUID()}`;
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  return { key, uploadUrl };
}

/** Signed GET URL for an admin to view/download a submitted job's photo. */
export function createPhotoDownloadUrl(s3: S3Client, bucket: string, key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
}

/**
 * Confirms a photo was actually uploaded before the API trusts a
 * client-reported key — otherwise a technician could report a fabricated or
 * someone-else's-draft key to satisfy the required-photo-count gate without
 * uploading anything. See routes/jobDrafts.ts's photos/confirm handler.
 */
export async function objectExists(s3: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}
