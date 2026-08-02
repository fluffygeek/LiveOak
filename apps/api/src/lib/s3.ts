import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../env.js';

const UPLOAD_URL_TTL_SECONDS = 300;
const DOWNLOAD_URL_TTL_SECONDS = 300;

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
