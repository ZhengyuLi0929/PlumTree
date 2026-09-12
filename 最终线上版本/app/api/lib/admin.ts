import { timingSafeEqual } from "node:crypto";
import { parse, serialize } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

export const ADMIN_COOKIE = "admin_session";
const MAX_AGE = 12 * 60 * 60;

function secretBytes() {
  return new TextEncoder().encode(env.appSecret || "dev-enroll-secret");
}

export function adminPasswordConfigured() {
  return Boolean(env.adminPassword);
}

export function adminPasswordMatches(input: string) {
  const expected = env.adminPassword;
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function signAdmin() {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secretBytes());
}

export async function readAdminToken(token: string) {
  const { payload } = await jwtVerify(token, secretBytes());
  if (payload.role !== "admin") throw new Error("not admin");
}

export function tokenFromRequest(req: Request) {
  const cookies = parse(req.headers.get("cookie") ?? "");
  if (cookies[ADMIN_COOKIE]) return cookies[ADMIN_COOKIE];
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

export function adminCookieHeader(token: string) {
  return serialize(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: env.isProduction,
  });
}

export function clearAdminCookieHeader() {
  return serialize(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: env.isProduction,
  });
}
