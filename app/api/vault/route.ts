import { createHmac, createHash } from 'crypto';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers — AWS Signature V4
// ---------------------------------------------------------------------------

/** URI-encode a string per AWS SigV4 spec (encodes everything except unreserved chars). */
function awsUriEncode(str: string): string {
  // encodeURIComponent leaves ! * ' ( ) unencoded; AWS requires them encoded too.
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/** SHA-256 hex digest. */
function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/** HMAC-SHA256 returning a Buffer. */
function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/**
 * Derive the SigV4 signing key:
 *   HMAC("AWS4" + secret, date) → HMAC(_, region) → HMAC(_, service) → HMAC(_, "aws4_request")
 */
function deriveSigningKey(
  secretKey: string,
  date: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmacSha256('AWS4' + secretKey, date);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

/** Format a Date as "YYYYMMDDTHHmmssZ" (no separators). */
function formatDatetime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Format a Date as "YYYYMMDD". */
function formatDate(d: Date): string {
  return formatDatetime(d).slice(0, 8);
}

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
  // ── 1. Parse & validate input ────────────────────────────────────────────
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

  // Sanitize filename: strip directory components, keep only safe chars
  const basename = filename.split(/[\\/]/).pop() ?? filename;
  const safeFilename = basename
    .replace(/[^a-zA-Z0-9._\-]/g, '_') // replace unsafe chars
    .replace(/^\.+/, '')                 // no leading dots
    .slice(0, 255);                      // length cap

  if (!safeFilename) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  // ── 2. Read environment config ───────────────────────────────────────────
  const endpoint = process.env.R2_ENDPOINT;
  // R2_BUCKET_NAME: the S3/R2 bucket name used in path-style URLs
  //   e.g. https://<accountid>.r2.cloudflarestorage.com/<bucketName>/<key>
  const bucketName = process.env.R2_BUCKET_NAME ?? 'audio';
  // R2_KEY_PREFIX: the object-key prefix (folder) inside the bucket.
  //   Intentionally separate from R2_BUCKET_NAME so the two can be configured
  //   independently without creating paths like "audio/audio/<file>".
  const keyPrefix = process.env.R2_KEY_PREFIX ?? 'audio';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.error('[vault] Missing R2 environment variables');
    return NextResponse.json(
      { error: 'Storage configuration error — contact admin' },
      { status: 500 },
    );
  }

  // ── 3. Build presigned PUT URL ────────────────────────────────────────────
  try {
    const region = 'auto'; // Cloudflare R2 uses the "auto" region
    const service = 's3';
    const expiresIn = 3600;

    const now = new Date();
    const datetime = formatDatetime(now);
    const date = formatDate(now);

    // Object key inside the bucket (uses configurable prefix, not a hardcoded one)
    const objectKey = `${keyPrefix}/${safeFilename}`;

    // Parse the R2 endpoint to extract the hostname
    const endpointUrl = new URL(endpoint);
    const hostname = endpointUrl.hostname;

    // Credential scope & credential string
    const credentialScope = `${date}/${region}/${service}/aws4_request`;
    const credentialString = `${accessKeyId}/${credentialScope}`;

    // ── Canonical query string (params MUST be sorted by key) ──────────────
    const rawParams: [string, string][] = [
      ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
      ['X-Amz-Credential', credentialString],
      ['X-Amz-Date', datetime],
      ['X-Amz-Expires', String(expiresIn)],
      ['X-Amz-SignedHeaders', 'host'],
    ];
    rawParams.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const canonicalQueryString = rawParams
      .map(([k, v]) => `${awsUriEncode(k)}=${awsUriEncode(v)}`)
      .join('&');

    // ── Canonical URI: /{bucket}/{key}, each segment encoded ───────────────
    const pathSegments = ['', bucketName, ...objectKey.split('/')];
    const canonicalUri = pathSegments.map(awsUriEncode).join('/');

    // ── Canonical headers & signed headers ────────────────────────────────
    const canonicalHeaders = `host:${hostname}\n`;
    const signedHeaders = 'host';

    // ── Canonical request ─────────────────────────────────────────────────
    const canonicalRequest = [
      'PUT',
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    // ── String to sign ────────────────────────────────────────────────────
    const canonicalRequestHash = sha256Hex(canonicalRequest);
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      datetime,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    // ── Signing key & signature ───────────────────────────────────────────
    const signingKey = deriveSigningKey(secretAccessKey, date, region, service);
    const signature = createHmac('sha256', signingKey)
      .update(stringToSign, 'utf8')
      .digest('hex');

    // ── Assemble final presigned URL ──────────────────────────────────────
    const uploadUrl =
      `${endpointUrl.origin}/${bucketName}/${objectKey}` +
      `?${canonicalQueryString}&X-Amz-Signature=${signature}`;

    return NextResponse.json({ uploadUrl, key: objectKey });
  } catch (err) {
    console.error('[vault] Presigned URL generation failed:', err);
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 },
    );
  }
}
