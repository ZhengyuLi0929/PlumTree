// 用户照片存储：文件落 data/photos/，库里 photos 表只存文件名。每个报名档案最多 9 张。
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { photos } from "../../db/schema";
import { ensureTable, getDb } from "../queries/connection";

export const MAX_PHOTOS = 9;
const MAX_BYTES = 8 * 1024 * 1024; // 单张 8MB
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export function photosDir() {
  const dir = path.resolve(process.cwd(), "data", "photos");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function listPhotos(profileId: number) {
  await ensureTable();
  const rows = await getDb().select().from(photos).where(eq(photos.profileId, profileId)).orderBy(photos.id);
  return rows.map((r) => ({ id: r.id, url: `/api/photos/${r.file}`, size: r.size, mime: r.mime, createdAt: r.createdAt }));
}

/** base64 上传。返回新照片行；超限/类型不符抛错。 */
export async function addPhoto(profileId: number, mime: string, dataBase64: string) {
  const ext = MIME_EXT[mime];
  if (!ext) throw new Error("只支持 jpg / png / webp / heic 图片");
  const buf = Buffer.from(dataBase64, "base64");
  if (!buf.length) throw new Error("图片为空");
  if (buf.length > MAX_BYTES) throw new Error("单张图片不能超过 8MB");

  await ensureTable();
  const db = getDb();
  const existing = await db.select().from(photos).where(eq(photos.profileId, profileId));
  if (existing.length >= MAX_PHOTOS) throw new Error(`最多上传 ${MAX_PHOTOS} 张照片`);

  const file = `${profileId}_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(photosDir(), file), buf);
  await db.insert(photos).values({ profileId, file, mime, size: buf.length });
  const [row] = await db.select().from(photos).where(eq(photos.file, file)).orderBy(desc(photos.id)).limit(1);
  return { id: row.id, url: `/api/photos/${file}` };
}

/** 删除照片（仅本人）。返回是否删除成功。 */
export async function removePhoto(profileId: number, photoId: number) {
  await ensureTable();
  const db = getDb();
  const [row] = await db.select().from(photos).where(eq(photos.id, photoId));
  if (!row || row.profileId !== profileId) return false;
  await db.delete(photos).where(eq(photos.id, photoId));
  fs.rmSync(path.join(photosDir(), row.file), { force: true });
  return true;
}

/** 按文件名读照片（路由用）。文件名只允许安全字符，防目录穿越。 */
export function readPhoto(file: string): { buf: Buffer; mime: string } | null {
  if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp|heic)$/.test(file)) return null;
  const full = path.join(photosDir(), file);
  if (!full.startsWith(photosDir())) return null;
  try {
    const buf = fs.readFileSync(full);
    const mime = Object.entries(MIME_EXT).find(([, ext]) => file.endsWith(`.${ext}`))?.[0] ?? "application/octet-stream";
    return { buf, mime };
  } catch {
    return null;
  }
}
