import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default R2 bucket name — must match R2_BUCKET_NAME env var (see .env.example). */
const DEFAULT_BUCKET = 'audio';

/** Object key for the track manifest file inside the bucket. */
const MANIFEST_KEY = 'library.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrackEntry {
  title: string;
  artist: string;
  bpm: string;
  key: string;
  audioUrl: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the AWS SDK error signals that the object doesn't exist.
 * R2 surfaces this as either `NoSuchKey` (S3 code) or `NotFound` (HTTP 404).
 */
function isNotFoundError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  const code = e.Code ?? e.name;
  return code === 'NoSuchKey' || code === 'NotFound' || code === '404';
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  // ── 1. Server-side Syndicate Key authentication ──────────────────────────
  // Identical check to the upload route — uses VAULT_KEY (no NEXT_PUBLIC_
  // prefix) so the secret is never embedded in the browser bundle.
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

  const { title, artist, bpm, key, audioUrl } = body as Record<string, unknown>;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json(
      { error: '"title" must be a non-empty string' },
      { status: 400 },
    );
  }
  if (!audioUrl || typeof audioUrl !== 'string' || !audioUrl.trim()) {
    return NextResponse.json(
      { error: '"audioUrl" must be a non-empty string' },
      { status: 400 },
    );
  }

  // ── 3. Read environment config ───────────────────────────────────────────
  const endpoint = process.env.R2_ENDPOINT;
  const bucketName = process.env.R2_BUCKET_NAME ?? DEFAULT_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.error('[vault/sync] Missing R2 environment variables');
    return NextResponse.json(
      { error: 'Storage configuration error — contact admin' },
      { status: 500 },
    );
  }

  // ── 4. Read → update → write library.json ────────────────────────────────
  try {
    const client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });

    // Fetch existing manifest, gracefully handling a missing file.
    let tracks: TrackEntry[] = [];
    try {
      const getResult = await client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: MANIFEST_KEY }),
      );
      const bodyStr = await getResult.Body?.transformToString();
      if (bodyStr) {
        const parsed: unknown = JSON.parse(bodyStr);
        if (Array.isArray(parsed)) {
          tracks = parsed as TrackEntry[];
        }
      }
    } catch (err: unknown) {
      // NoSuchKey / 404 means no manifest exists yet — start with empty array.
      if (!isNotFoundError(err)) {
        throw err;
      }
    }

    // Append the new track entry.
    const newTrack: TrackEntry = {
      title: String(title).trim(),
      artist: artist && typeof artist === 'string' ? artist.trim() : '',
      bpm: bpm && typeof bpm === 'string' ? bpm.trim() : '',
      key: key && typeof key === 'string' ? key.trim() : '',
      audioUrl: String(audioUrl).trim(),
      createdAt: Date.now(),
    };
    tracks.push(newTrack);

    // Persist the updated manifest back to R2.
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: MANIFEST_KEY,
        Body: JSON.stringify(tracks, null, 2),
        ContentType: 'application/json',
      }),
    );

    return NextResponse.json({ ok: true, trackCount: tracks.length });
  } catch (err) {
    console.error('[vault/sync] Manifest update failed:', err);
    return NextResponse.json(
      { error: 'Failed to update library manifest' },
      { status: 500 },
    );
  }
}
