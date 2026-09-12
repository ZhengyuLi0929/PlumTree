import { createHash, randomInt } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

export const PHONE_RE = /^1[3-9]\d{9}$/;

export type EnrollClaims = {
  phone: string;
  wechat: string;
  sessionId: string;
};

function secretBytes() {
  return new TextEncoder().encode(env.appSecret || "dev-enroll-secret");
}

export function normalizeInvite(raw: string) {
  return raw.replace(/\s+/g, "").trim().toUpperCase();
}

export function isValidInvite(raw: string) {
  return normalizeInvite(raw) === env.inviteCode;
}

export function normalizePhone(raw: string) {
  return raw.replace(/\s+/g, "").trim();
}

export function normalizeWechat(raw: string) {
  return raw.replace(/\s+/g, "").trim();
}

export function hashOtp(phone: string, code: string) {
  return createHash("sha256")
    .update(`${env.appSecret || "dev-enroll-secret"}:${phone}:${code}`)
    .digest("hex");
}

export function randomOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function signEnroll(claims: EnrollClaims) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secretBytes());
}

export async function readEnroll(token: string): Promise<EnrollClaims> {
  const { payload } = await jwtVerify(token, secretBytes());
  const phone = typeof payload.phone === "string" ? payload.phone : "";
  const wechat = typeof payload.wechat === "string" ? payload.wechat : "";
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  if (wechat.length < 2 || sessionId.length < 8) {
    throw new Error("报名凭证无效，请重新填写邀请码和微信号");
  }
  return { phone, wechat, sessionId };
}

export function isoWeekKey(now = new Date()) {
  const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const date = new Date(Date.UTC(cst.getUTCFullYear(), cst.getUTCMonth(), cst.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
