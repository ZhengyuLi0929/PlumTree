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

export async function getOtp(phone: string): Promise<OtpRow | undefined> {
  if (!hasDatabase()) return memory.get(phone);
  await ensureTable();
  const [row] = await getDb().select().from(otpCodes).where(eq(otpCodes.phone, phone));
  return row;
}

export async function putOtp(row: OtpRow) {
  if (!hasDatabase()) {
    memory.set(row.phone, row);
    return;
  }
  await ensureTable();
  await getDb().insert(otpCodes).values(row).onDuplicateKeyUpdate({
    set: {
      codeHash: row.codeHash,
      expiresAt: row.expiresAt,
      sentAt: row.sentAt,
      hourStarted: row.hourStarted,
      hourCount: row.hourCount,
    },
  });
}

export async function clearOtp(phone: string) {
  if (!hasDatabase()) {
    memory.delete(phone);
    return;
  }
  await ensureTable();
  await getDb().delete(otpCodes).where(eq(otpCodes.phone, phone));
}
