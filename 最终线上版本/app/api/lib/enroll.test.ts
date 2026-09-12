import { describe, expect, it } from "vitest";
import {
  PHONE_RE,
  hashOtp,
  isValidInvite,
  normalizeInvite,
  normalizePhone,
  normalizeWechat,
  readEnroll,
  signEnroll,
} from "./enroll";

describe("invite and contact", () => {
  it("accepts the RDFZNB invite code, ignoring case and spaces", () => {
    expect(isValidInvite("RDFZNB")).toBe(true);
    expect(isValidInvite(" rdfznb ")).toBe(true);
    expect(isValidInvite("WRONG")).toBe(false);
    expect(normalizeInvite(" rdfz nb ")).toBe("RDFZNB");
  });

  it("accepts mainland mobile numbers", () => {
    expect(PHONE_RE.test(normalizePhone("13800138000"))).toBe(true);
    expect(PHONE_RE.test(normalizePhone("12800138000"))).toBe(false);
  });

  it("strips spaces from wechat ids", () => {
    expect(normalizeWechat(" foo_bar ")).toBe("foo_bar");
  });
});

describe("enroll token", () => {
  it("round-trips a verified enrollment", async () => {
    const token = await signEnroll({
      phone: "13800138000",
      wechat: "wx_demo",
      sessionId: "session-1234",
    });
    await expect(readEnroll(token)).resolves.toEqual({
      phone: "13800138000",
      wechat: "wx_demo",
      sessionId: "session-1234",
    });
  });

  it("hashes the same otp consistently", () => {
    expect(hashOtp("13800138000", "123456")).toBe(hashOtp("13800138000", "123456"));
    expect(hashOtp("13800138000", "123456")).not.toBe(hashOtp("13800138000", "654321"));
  });
});
