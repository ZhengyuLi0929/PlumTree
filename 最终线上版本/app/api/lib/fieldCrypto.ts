// 字段级加密（AES-256-GCM）：kf_messages 内容、bot_users.requirements 等敏感个人信息。
// 密钥走环境变量 FIELD_ENCRYPTION_KEY（任意长字符串，内部 sha256 成 32 字节）。
// 未配置密钥时明文直通（本地开发）；密文带 "enc1:" 前缀，读取侧向后兼容旧明文。
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./env";

const PREFIX = "enc1:";

function key(): Buffer | null {
  const raw = process.env.FIELD_ENCRYPTION_KEY || env.fieldEncryptionKey;
  if (!raw) return null;
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptText(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === "") return plain ?? null;
  const k = key();
  if (!k) return plain;
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, nonce);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([nonce, tag, enc]).toString("base64");
}

export function decryptText(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined) return stored ?? null;
  if (!stored.startsWith(PREFIX)) return stored; // 旧明文数据兼容
  const k = key();
  if (!k) return "[已加密：缺少 FIELD_ENCRYPTION_KEY]";
  const buf = Buffer.from(stored.slice(PREFIX.length), "base64");
  const nonce = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", k, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
