import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Allowed content types
// ---------------------------------------------------------------------------

const ALLOWED_CONTENT_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/flac',
  'audio/x-flac',
  'audio/ogg',
  'audio/aac',
  'audio/x-aiff',
  'audio/aiff',
]);

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  // ── 1. Server-side Syndicate Key authentication ──────────────────────────
  // Uses VAULT_KEY (no NEXT_PUBLIC_ prefix) so the secret is never embedded
  // in the browser bundle.
  const vaultKey = process.env.VAULT_KEY;
  if (vaultKey) {
    const providedKey = req.headers.get('x-syndicate-key');
    if (!providedKey || providedKey !== vaultKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // ── 2. Parse & validate input ────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { filename, contentType } = body as Record<string, unknown>;

  if (!filename || typeof filename !== 'string' || !filename.trim()) {
    return NextResponse.json(
      { error: '"filename" must be a non-empty string' },
      { status: 400 },
    );
  }
  if (!contentType || typeof contentType !== 'string' || !contentType.trim()) {
    return NextResponse.json(
      { error: '"contentType" must be a non-empty string' },
      { status: 400 },
    );
  }

  // Validate content type against allow-list
  const normalizedCT = contentType.toLowerCase().split(';')[0].trim();
  if (!ALLOWED_CONTENT_TYPES.has(normalizedCT)) {
    return NextResponse.json(
      { error: `Unsupported content type: ${contentType}` },
      { status: 400 },
    );
  }

  // Sanitize filename: strip directory components, keep only safe chars,
  // and explicitly reject ".." sequences to block path traversal.
  const basename = filename.split(/[\\/]/).pop() ?? filename;
  const safeFilename = basename
    .replace(/[^a-zA-Z0-9._\-]/g, '_') // replace unsafe chars
    .replace(/^\.+/, '')                 // no leading dots
    .slice(0, 255);                      // length cap

  if (!safeFilename || safeFilename.includes('..')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  // ── 3. Read environment config ───────────────────────────────────────────
  // R2_ENDPOINT: the Cloudflare R2 S3-compatible API base URL
  //   Format: https://<account_id>.r2.cloudflarestorage.com
  const endpoint = process.env.R2_ENDPOINT;
  const bucketName = process.env.R2_BUCKET_NAME ?? 'audio';
  // R2_KEY_PREFIX: object-key prefix (folder) inside the bucket.
  //   Kept separate from R2_BUCKET_NAME to avoid double-prefix paths.
  //   Defaults to 'audio'. Must be non-empty.
  const keyPrefix = (process.env.R2_KEY_PREFIX ?? 'audio').replace(/^\/|\/$/g, '') || 'audio';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.error('[vault] Missing R2 environment variables');
    return NextResponse.json(
      { error: 'Storage configuration error — contact admin' },
      { status: 500 },
    );
  }

  // ── 4. Generate presigned PUT URL via AWS SDK ─────────────────────────────
  try {
    const client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      // Cloudflare R2 requires path-style URLs
      forcePathStyle: true,
    });

    const objectKey = `${keyPrefix}/${safeFilename}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: normalizedCT,
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });

    return NextResponse.json({ uploadUrl, key: objectKey });
  } catch (err) {
    console.error('[vault] Presigned URL generation failed:', err);
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 },
    );
  }
}
