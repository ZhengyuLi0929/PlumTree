import { eq } from "drizzle-orm";
import { otpCodes } from "../../db/schema";
import { ensureTable, getDb, hasDatabase } from "../queries/connection";

export type OtpRow = {
  phone: string;
  codeHash: string;
  expiresAt: number;
  sentAt: number;
  hourStarted: number;
  hourCount: number;
};

const memory = new Map<string, OtpRow>();

export async function getOtpRow(phone: string): Promise<OtpRow | undefined> {
  if (!hasDatabase()) return memory.get(phone);
  await ensureTable();
  const db = getDb();
  const [row] = await db.select().from(otpCodes).where(eq(otpCodes.phone, phone));
  return row;
}

export async function saveOtpRow(row: OtpRow) {
  if (!hasDatabase()) {
    memory.set(row.phone, row);
    return;
  }
  await ensureTable();
  const db = getDb();
  await db.insert(otpCodes).values(row).onDuplicateKeyUpdate({
    set: {
      codeHash: row.codeHash,
      expiresAt: row.expiresAt,
      sentAt: row.sentAt,
      hourStarted: row.hourStarted,
      hourCount: row.hourCount,
    },
  });
}

export async function deleteOtpRow(phone: string) {
  if (!hasDatabase()) {
    memory.delete(phone);
    return;
  }
  await ensureTable();
  const db = getDb();
  await db.delete(otpCodes).where(eq(otpCodes.phone, phone));
}
