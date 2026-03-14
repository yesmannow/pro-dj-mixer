import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';

export async function DELETE(req: Request) {
  const vaultKey = process.env.VAULT_KEY;
  if (vaultKey) {
    const providedKey = req.headers.get('x-syndicate-key');
    if (providedKey !== vaultKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { audioUrl } = await req.json();
  if (!audioUrl) return NextResponse.json({ error: 'Missing audioUrl' }, { status: 400 });

  const endpoint = process.env.R2_ENDPOINT;
  const bucketName = process.env.R2_BUCKET_NAME ?? 'audio';

  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  });

  // Extract the object key from the Cloudflare dev URL (e.g., "audio/filename.mp3")
  const objectKey = audioUrl.split('.dev/')[1];
  if (!objectKey) return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });

  try {
    // 1. Delete Audio File
    await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey }));

    // 2. Fetch, Filter, and Update library.json
    let tracks: { audioUrl: string }[] = [];
    try {
      const getRes = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: 'library.json' }));
      const str = await getRes.Body?.transformToString();
      if (str) tracks = JSON.parse(str);
    } catch (e) { /* Ignore if file doesn't exist */ }

    const updatedTracks = tracks.filter((t: { audioUrl: string }) => t.audioUrl !== audioUrl);

    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: 'library.json',
      Body: JSON.stringify(updatedTracks, null, 2),
      ContentType: 'application/json',
    }));

    return NextResponse.json({ success: true, remaining: updatedTracks.length });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
