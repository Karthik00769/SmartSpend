/**
 * app/api/settings/avatar/route.ts
 * Accepts a multipart form upload (field: "avatar"), saves to
 * public/uploads/avatars/<userId>.<ext>, updates users.avatar_url.
 */
import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api-response';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/authOptions';
import { query } from '@/lib/db';
import { ResultSetHeader } from 'mysql2';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return fail('Unauthorized', 401);

  const userId = (session.user as any).id as string;
  if (!userId) return fail('User ID missing', 400);

  try {
    const formData = await req.formData();
    const file = formData.get('avatar') as File | null;

    if (!file) return fail('No file provided', 400);
    if (!ALLOWED_TYPES.includes(file.type)) {
      return fail('Only JPEG, PNG, WebP, or GIF images are allowed', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) {
      return fail('Image must be under 2 MB', 400);
    }

    const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
    const filename = `${userId}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');

    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    const avatarUrl = `/uploads/avatars/${filename}`;

    await query<ResultSetHeader>(
      'UPDATE users SET avatar_url = ? WHERE id = ?',
      [avatarUrl, userId]
    );

    return ok({ avatarUrl });
  } catch (err: any) {
    console.error('[POST /api/settings/avatar]', err);
    return fail('Failed to upload avatar', 500);
  }
}
