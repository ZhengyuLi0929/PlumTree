import { parse, serialize } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

export const MEMBER_COOKIE = "member_session";
const MAX_AGE = 30 * 24 * 60 * 60;

function secretBytes() {
  return new TextEncoder().encode(env.appSecret || "dev-enroll-secret");
}

export async function signMember(phone: string) {
  return new SignJWT({ role: "member", phone })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretBytes());
}

export async function readMemberToken(token: string) {
  const { payload } = await jwtVerify(token, secretBytes());
  if (payload.role !== "member" || typeof payload.phone !== "string" || !payload.phone) {
    throw new Error("not member");
  }
  return payload.phone;
}

export function memberTokenFromRequest(req: Request) {
  const cookies = parse(req.headers.get("cookie") ?? "");
  return cookies[MEMBER_COOKIE] ?? "";
}

export function memberCookieHeader(token: string) {
  return serialize(MEMBER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: env.isProduction,
  });
}

export function clearMemberCookieHeader() {
  return serialize(MEMBER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: env.isProduction,
  });
}
